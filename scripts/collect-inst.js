// 학원(훈련기관 지점) 주소·전화·홈페이지 수집기 — data/inst.json 캐시(커밋 대상)
// 사용: node scripts/collect-inst.js [최대요청수=40] [재수집일수=90]
//
// 왜 과정 상세 페이지인가: 목록에는 시·군·구까지만 있고, 도로명 주소·홈페이지는
// 과정 상세(selectTracseDetl.do)의 「지도보기」 숨은 폼(zip·bassAdr·dtalAdr·instCnnr·hmpgAdr)에만 있다.
// 상세 1건이 약 400KB라 과정마다 긁지 않고 **학원 지점(instId|region) 단위로 1회만** 받는다.
//   - 키에 region을 넣는 이유: 같은 instId가 여러 지역에 걸친 경우(2026-09 기준 61곳)가 있어서.
//   - 대상은 사이트에 페이지가 생기는 과정(취업률 보유·오프라인·모집중)의 학원만.
// ⛔ 좌표는 저장하지 않는다. 국토부 지오코더·카카오 로컬 API 모두 결과 저장이 금지다(2026-09-13 확인).
//    지도는 주소 텍스트로 카카오맵 검색 링크를 만드는 방식만 쓴다.
const fs = require('fs');
const path = require('path');
const { decode } = require('../lib/normalize');

const MAX = Number(process.argv[2] || 40);
const STALE_DAYS = Number(process.argv[3] || 90);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'inst.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const detailUrl = c =>
  `https://www.work24.go.kr/hr/a/a/3100/selectTracseDetl.do?tracseId=${c.courseId}&tracseTme=${c.round}&crseTracseSe=${c.typeCode || 'C0061'}`;

function parse(html) {
  const v = id => { const m = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`)); return m ? decode(m[1]).replace(/\s+/g, ' ').trim() || null : null; };
  let web = v('hmpgAdr');
  if (web && !/^https?:\/\//i.test(web)) web = 'http://' + web;
  if (web && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(web)) web = null; // "없음" 같은 값 거르기
  return { zip: v('zip'), addr: v('bassAdr'), addrDetail: v('dtalAdr'), tel: v('instCnnr'), web };
}

async function fetchText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000); // 스톨 방지(collect.js hang 사고 교훈)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    return res.status === 200 ? await res.text() : null;
  } finally { clearTimeout(t); }
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', 'courses-all.json'), 'utf8'));
  // 지점별 후보 과정(서로 다른 courseId, 개강 늦은 순) — 상세 URL을 만들 재료.
  // 한 과정 상세의 주소 칸이 비어 있는 경우가 있어(2026-09-13 실측: 인천 그린컴퓨터아카데미 회차 56) 최대 3건까지 시도한다.
  const targets = new Map();
  for (const c of raw) {
    if (c.emplRate == null || c.remote || c.status !== '모집중' || !c.instId) continue;
    const k = `${c.instId}|${c.region || ''}`;
    if (!targets.has(k)) targets.set(k, new Map());
    const byCourse = targets.get(k);
    const prev = byCourse.get(c.courseId);
    if (!prev || (c.startDate || '') > (prev.startDate || '')) byCourse.set(c.courseId, c);
  }
  for (const [k, byCourse] of targets) targets.set(k, [...byCourse.values()].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')).slice(0, 3));

  const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const today = todayKst();
  const ageDays = at => at ? (Date.parse(today) - Date.parse(at)) / 86400000 : Infinity;
  // 없는 것 먼저, 그다음 오래된 순
  const queue = [...targets.keys()]
    .filter(k => ageDays(cache[k]?.at) >= STALE_DAYS)
    .sort((a, b) => (cache[a] ? 1 : 0) - (cache[b] ? 1 : 0) || ageDays(cache[b]?.at) - ageDays(cache[a]?.at))
    .slice(0, MAX);

  const save = () => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const sorted = Object.fromEntries(Object.keys(cache).sort().map(k => [k, cache[k]])); // 키 정렬 = 일일 diff 최소화
    fs.writeFileSync(OUT + '.tmp', JSON.stringify(sorted, null, 1), 'utf8');
    fs.renameSync(OUT + '.tmp', OUT); // 원자적 저장(collect.js 2026-08-26 사고 교훈)
  };

  let ok = 0, miss = 0, fail = 0;
  for (const [i, k] of queue.entries()) {
    let info = null, fetched = false;
    for (const c of targets.get(k)) {
      let html = null;
      for (let retry = 0; retry < 2 && html == null; retry++) {
        try { html = await fetchText(detailUrl(c)); } catch (e) { /* 재시도 */ }
        if (html == null) await sleep(2000);
      }
      if (html == null) continue;
      fetched = true;
      const p = parse(html);
      if (p.addr) { info = p; break; }
      await sleep(1000);
    }
    if (info) { cache[k] = { ...info, at: today }; ok++; }
    else if (fetched) { cache[k] = { ...(cache[k] || {}), at: today, miss: true }; miss++; } // 후보 전부 주소 없음 — 다음 주기까지 재시도 안 함
    else fail++;
    if ((i + 1) % 20 === 0) { save(); console.log(`${i + 1}/${queue.length} (성공 ${ok}·주소없음 ${miss}·실패 ${fail})`); }
    await sleep(1000);
  }

  // 사이트에서 사라진 지점은 1년 지나면 정리(재등장 시 재수집 비용을 아끼려고 바로 지우지 않음)
  let pruned = 0;
  for (const k of Object.keys(cache)) if (!targets.has(k) && ageDays(cache[k].at) > 365) { delete cache[k]; pruned++; }

  save();
  const have = [...targets.keys()].filter(k => cache[k]?.addr).length;
  console.log(`완료: 요청 ${queue.length} (성공 ${ok}·주소없음 ${miss}·실패 ${fail}) · 정리 ${pruned} · 대상 ${targets.size}곳 중 주소 보유 ${have}곳`);
})();
