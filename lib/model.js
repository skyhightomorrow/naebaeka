// 수집 원본 → 서비스 모델 (분류·정규화·중복정리·랭킹·집계)
const fs = require('fs');
const path = require('path');
const { categorize, CATEGORIES, CAT_MAP } = require('./categorize');
const { sidoOf, guOf, decode } = require('./normalize');
const { CERT_RANK } = require('./cert');

// 등급 서열의 정본은 lib/cert.js. '5년인증'은 옛 수집분 호환 별칭(= 우수훈련기관, 같은 등급).
const gradeRank = { ...CERT_RANK, '5년인증': CERT_RANK['우수훈련기관'] };

// 랭킹·상세·sitemap 공통 기준: 취업률 보유 + 비원격 + 모집중 (마감·데이터없음 thin 페이지 제외)
const isMeaningful = c => c.emplRate != null && !c.remote && c.status === '모집중';

// 신뢰 점수 = 취업률 + 인증 보너스 − 완벽점수 패널티(소표본 의심).
// 표시는 실제 취업률 그대로, 정렬만 이 점수로. 목록 스크래핑엔 수료인원이 없어
// 100%가 소표본(10/10)에 지배되는 문제를 인증등급(track record)과 완벽점수 할인으로 보정.
// (근본 해결: API 전환 후 수료인원으로 Wilson 하한 — 그때 교체)
// 등급명은 lib/cert.js 가 정규화한 값('BHA' | '우수훈련기관' | '3년인증' | '1년인증' | null).
// '5년인증'은 별도 등급이 아니라 우수훈련기관의 유효기간 표기라 '우수훈련기관'으로 합쳐진다
// (고용24 목록 도움말 원문 근거 — lib/cert.js 주석). 옛 수집분 호환용으로 키만 남겨 둔다.
// ⚠️ 2026-08-11 이전 수집분(raw/courses-all.json)은 파서 버그로 우수훈련기관이 전부 null 이다.
//    재수집 전까지 이 보너스는 사실상 3년인증 유무로만 작동한다 — 등급 축 분석 금지.
const certBonus = { 'BHA': 12, '우수훈련기관': 10, '5년인증': 10, '3년인증': 8, '1년인증': 2 };
function trustScore(c) {
  let s = c.emplRate == null ? -1 : c.emplRate;
  s += certBonus[c.certGrade] || 0;
  if (c.emplRate >= 100) s -= 14;
  else if (c.emplRate >= 97) s -= 7;
  else if (c.emplRate >= 95) s -= 3;
  return s;
}

// 학원 단위 집계 키. 예전에는 학원 «이름»으로 묶어, 이름만 같은 서로 다른 기관(지점)의 공시 취업률이 한 학원의
// 수치처럼 섞였다(2026-10-01 점검: 같은 이름에 기관 ID가 2개 이상 43건). 고용24 공시는 기관(ID) 단위다.
const orgKey = c => c.instId || c.org;

function load() {
  // 🔴 수집은 «개강일이 오늘 이후»인 목록만 받는다. 그래서 개강일이 지난 레코드는 다시 목록에 나타나지
  //    않고, 수집이 끝까지 돌지 못한 날에는 정리도 되지 않아 '모집중'으로 남는다
  //    (2026-10-01 점검: 색인 10,861개 중 6,229개가 이미 개강한 과정이었다).
  //    수집 상태와 무관하게, 빌드 시점에 개강일이 지난 회차는 버린다.
  const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'raw', 'courses-all.json'), 'utf8'))
    .filter((r) => !r.startDate || r.startDate >= todayKST);
  // 학원 지점 주소·전화·홈페이지 캐시 (scripts/collect-inst.js). 없으면 주소 없이 빌드된다.
  const instFile = path.join(__dirname, '..', 'data', 'inst.json');
  const inst = fs.existsSync(instFile) ? JSON.parse(fs.readFileSync(instFile, 'utf8')) : {};

  // courseId 단위 병합 (여러 회차 → 가장 빠른 개강 회차 대표 + 회차 목록)
  const byId = new Map();
  for (const r of raw) {
    const info = inst[`${r.instId}|${r.region || ''}`];
    const c = {
      ...r, title: decode(r.title), org: decode(r.org), cat: categorize(r.title), sido: sidoOf(r.region), gu: guOf(r.region),
      addr: info && info.addr ? info : null,
      tel: r.tel || (info && info.tel) || null, // 목록 전화(매일 갱신)가 우선, 없으면 상세 캐시
    };
    const prev = byId.get(c.courseId);
    if (!prev) byId.set(c.courseId, { ...c, rounds: [{ round: c.round, startDate: c.startDate, endDate: c.endDate }] });
    else {
      prev.rounds.push({ round: c.round, startDate: c.startDate, endDate: c.endDate });
      if (c.startDate && (!prev.startDate || c.startDate < prev.startDate)) Object.assign(prev, { startDate: c.startDate, endDate: c.endDate, round: c.round });
      prev.emplRate = prev.emplRate ?? c.emplRate;
      prev.certGrade = prev.certGrade || c.certGrade;
    }
  }
  const courses = [...byId.values()];

  // 랭킹: 취업률 보유·비원격, 동일 기관·유사 과정명 1건 대표
  function rankable(list) {
    const filtered = list.filter(isMeaningful);
    const seen = new Map();
    for (const c of filtered) {
      const key = orgKey(c) + '|' + (c.title || '').replace(/[\s\d()\[\]『』]/g, '');
      const prev = seen.get(key);
      if (!prev || c.emplRate > prev.emplRate) seen.set(key, c);
    }
    return [...seen.values()].sort((a, b) => trustScore(b) - trustScore(a)
      || b.emplRate - a.emplRate
      || (a.costWon || 9e9) - (b.costWon || 9e9));
  }

  // 분야별
  const cats = CATEGORIES.concat([{ slug: 'etc', name: '기타' }]).map(cat => {
    const list = courses.filter(c => c.cat === cat.slug);
    const ranked = rankable(list);
    return {
      slug: cat.slug, name: cat.name, total: list.length, ranked,
      avgRate: ranked.length ? +(ranked.reduce((s, c) => s + c.emplRate, 0) / ranked.length).toFixed(1) : null,
    };
  }).filter(c => c.total > 0).sort((a, b) => b.ranked.length - a.ranked.length);

  // 전체(학원×분야 그룹)
  const groups = new Map();
  for (const cat of cats) {
    if (cat.slug === 'etc') continue;
    for (const c of cat.ranked) {
      const key = orgKey(c) + '|' + cat.slug;
      const g = groups.get(key);
      if (!g) groups.set(key, { org: c.org, okey: orgKey(c), catSlug: cat.slug, catName: cat.name, rate: c.emplRate, best: c, count: 1, certGrade: c.certGrade });
      else { g.count++; if (c.emplRate > g.rate) { g.rate = c.emplRate; g.best = c; } if (!g.certGrade) g.certGrade = c.certGrade; }
    }
  }
  const ts = g => trustScore({ emplRate: g.rate, certGrade: g.certGrade });
  // 전체 랭킹: 학원당 대표 1건(신뢰점수 최고 분야)만 — 한 브랜드 도배 방지
  const bestPerOrg = new Map();
  for (const g of groups.values()) {
    const prev = bestPerOrg.get(g.okey);
    if (!prev || ts(g) > ts(prev)) bestPerOrg.set(g.okey, g);
  }
  const overall = [...bestPerOrg.values()].sort((a, b) => ts(b) - ts(a) || b.rate - a.rate);

  // 지역×분야 (시도별, 랭킹 3개 이상만 페이지 생성 대상)
  const regionCats = [];
  const sidos = [...new Set(courses.map(c => c.sido).filter(Boolean))];
  for (const sido of sidos) {
    for (const cat of cats) {
      if (cat.slug === 'etc') continue;
      const list = courses.filter(c => c.sido === sido && c.cat === cat.slug);
      const ranked = rankable(list);
      if (ranked.length >= 3) regionCats.push({
        sido, catSlug: cat.slug, catName: cat.name, total: list.length, ranked,
        avgRate: +(ranked.reduce((s, c) => s + c.emplRate, 0) / ranked.length).toFixed(1),
      });
    }
  }

  // 학원(기관 ID)별·분야별 공시 취업률 «범위».
  // 🔴 고용24는 취업률을 «기관 × NCS 직종»으로 공시하는데, 이 사이트의 분야는 과정명 키워드로 나눈 자체 분류다.
  //    그래서 한 분야 안에 서로 다른 NCS 직종의 공시값이 여럿 들어올 수 있다. 예전에는 분야당 값 하나(마지막에
  //    읽은 값)만 남겨 «○○ 분야 69%»처럼 단정했다(2026-10-01 점검: 2,652개 묶음 중 635개가 공시값 2개 이상).
  //    지금은 공시된 값들을 그대로 모아 최소~최대로 보여 준다 — 값을 고르거나 평균 내지 않는다.
  const orgRates = new Map();
  for (const c of courses) {
    if (c.emplRate == null || !c.org) continue;
    const k = orgKey(c);
    if (!orgRates.has(k)) orgRates.set(k, new Map());
    const name = CAT_MAP[c.cat] || c.cat;
    const cur = orgRates.get(k).get(name) || { min: c.emplRate, max: c.emplRate };
    cur.min = Math.min(cur.min, c.emplRate); cur.max = Math.max(cur.max, c.emplRate);
    orgRates.get(k).set(name, cur);
  }

  // 기준일은 KST (Actions 러너는 UTC — 05:50 KST 실행 시 UTC 날짜는 전날이라 하루 밀림)
  const generatedAt = process.env.BUILD_DATE || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return { courses, cats, overall, regionCats, orgRates, generatedAt };
}

module.exports = { load, gradeRank, isMeaningful, trustScore, orgKey };
