// 수집 원본 → 서비스 모델 (분류·정규화·중복정리·랭킹·집계)
const fs = require('fs');
const path = require('path');
const { categorize, CATEGORIES, CAT_MAP } = require('./categorize');
const { sidoOf, decode } = require('./normalize');

const gradeRank = { 'BHA': 5, '우수훈련기관': 4, '5년인증': 3, '3년인증': 2, '1년인증': 1 };

// 신뢰 점수 = 취업률 + 인증 보너스 − 완벽점수 패널티(소표본 의심).
// 표시는 실제 취업률 그대로, 정렬만 이 점수로. 목록 스크래핑엔 수료인원이 없어
// 100%가 소표본(10/10)에 지배되는 문제를 인증등급(track record)과 완벽점수 할인으로 보정.
// (근본 해결: API 전환 후 수료인원으로 Wilson 하한 — 그때 교체)
const certBonus = { 'BHA': 12, '우수훈련기관': 10, '5년인증': 9, '3년인증': 8, '1년인증': 2 };
function trustScore(c) {
  let s = c.emplRate == null ? -1 : c.emplRate;
  s += certBonus[c.certGrade] || 0;
  if (c.emplRate >= 100) s -= 14;
  else if (c.emplRate >= 97) s -= 7;
  else if (c.emplRate >= 95) s -= 3;
  return s;
}

function load() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'raw', 'courses-all.json'), 'utf8'));

  // courseId 단위 병합 (여러 회차 → 가장 빠른 개강 회차 대표 + 회차 목록)
  const byId = new Map();
  for (const r of raw) {
    const c = { ...r, title: decode(r.title), org: decode(r.org), cat: categorize(r.title), sido: sidoOf(r.region) };
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
    const filtered = list.filter(c => c.emplRate != null && !c.remote);
    const seen = new Map();
    for (const c of filtered) {
      const key = c.org + '|' + (c.title || '').replace(/[\s\d()\[\]『』]/g, '');
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
      const key = c.org + '|' + cat.slug;
      const g = groups.get(key);
      if (!g) groups.set(key, { org: c.org, catSlug: cat.slug, catName: cat.name, rate: c.emplRate, best: c, count: 1, certGrade: c.certGrade });
      else { g.count++; if (c.emplRate > g.rate) { g.rate = c.emplRate; g.best = c; } if (!g.certGrade) g.certGrade = c.certGrade; }
    }
  }
  const ts = g => trustScore({ emplRate: g.rate, certGrade: g.certGrade });
  // 전체 랭킹: 학원당 대표 1건(신뢰점수 최고 분야)만 — 한 브랜드 도배 방지
  const bestPerOrg = new Map();
  for (const g of groups.values()) {
    const prev = bestPerOrg.get(g.org);
    if (!prev || ts(g) > ts(prev)) bestPerOrg.set(g.org, g);
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

  // 학원별 직종 취업률 맵 (상세 페이지 "이 학원의 다른 직종" 모듈)
  const orgRates = new Map();
  for (const c of courses) {
    if (c.emplRate == null || !c.org) continue;
    if (!orgRates.has(c.org)) orgRates.set(c.org, new Map());
    orgRates.get(c.org).set(CAT_MAP[c.cat] || c.cat, c.emplRate);
  }

  return { courses, cats, overall, regionCats, orgRates, generatedAt: new Date().toISOString().slice(0, 10) };
}

module.exports = { load, gradeRank };
