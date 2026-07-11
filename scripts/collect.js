// 고용24 훈련과정 수집기 — raw/courses-all.json 로 증분 저장(중복 제거)
// 사용: node scripts/collect.js [페이지수=60] [시작페이지=1]
const fs = require('fs');
const path = require('path');

const PAGES = Number(process.argv[2] || 60);
const START = Number(process.argv[3] || 1);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const today = new Date();
const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const end = new Date(today); end.setFullYear(end.getFullYear() + 1);

// traingMthCd=M1001 = 일반(집체·오프라인)과정 — 구직자 전환훈련, 취업률 보유율 ~100%
const listUrl = p =>
  `https://www.work24.go.kr/hr/a/a/1100/trnnCrsInf.do?dghtSe=A&traingMthCd=M1001&tracseTme=1` +
  `&startDate=${fmt(today)}&endDate=${fmt(end)}&pageSize=10&pageIndex=${p}&srchType=all_type&currentTab=1&action=trnnCrsInfPost.do`;

const clean = s => (s == null ? null : s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseCards(html) {
  // 카드 경계 = <div class="list" data-tracseid data-tracsetme> (카드당 1개, 카드 최상단).
  // 이 래퍼 안에 기관→과정명→비용→취업률이 모두 한 카드로 포함됨.
  const re = /<div class="list" data-tracseid="([^"]+)" data-tracsetme="([^"]+)"[\s\S]*?(?=<div class="list" data-tracseid=|<\/form>|<div class="paging)/g;
  const cards = [];
  let m;
  while ((m = re.exec(html))) cards.push({ html: m[0], courseId: m[1], round: m[2] });
  return cards.map(({ html: c, courseId, round }) => {
    const g = rx => { const mm = c.match(rx); return mm ? mm[1].trim() : null; };
    const pm = c.match(/(\d{4}-\d{2}-\d{2})\s*~[\s\S]*?(\d{4}-\d{2}-\d{2})/);
    return {
      title: clean(g(/title="([^"]+?) 훈련과정 정보 새 창 열림"/)),
      courseId, round,
      typeCode: g(/fn_viewTracseInfo\('[^']+','[^']+','([^']+)','[^']*'/), // 상세 URL의 crseTracseSe
      instId: g(/data-trin_cstm_id\s*=\s*"([^"]+)"/) || g(/fn_viewTracseInfo\('[^']+','[^']+','[^']+','([^']*)'/),
      org: clean(g(/title="([^"]+?) 훈련기관정보 새 창 열림"/)),
      certGrade: g(/alt="(1년인증|3년인증|5년인증|우수훈련기관|BHA)"/),
      costWon: (x => x ? Number(x[1].replace(/,/g, '')) : null)(c.match(/([\d,]{4,})\s*원/)),
      startDate: pm && pm[1], endDate: pm && pm[2],
      hours: g(/(\d+일,\s*총\d+시간)/),
      region: clean(g(/<p class="s1_r"[^>]*>\s*([^<(]+?)\s*(?:\(|<)/)),
      emplRate: (x => x ? Number(x[1]) : null)(c.match(/NCS직종 훈련기관 취업률:[\s\S]{0,300}?<em class="txt">([\d.]+)%<\/em>/)),
      remote: /원격훈련/.test(c),
      status: g(/<span class="t3_sb clr_red">([^<]+)<\/span>/),
    };
  }).filter(x => x.courseId && x.title);
}

(async () => {
  const outDir = path.join(__dirname, '..', 'raw');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'courses-all.json');
  const map = new Map();
  if (fs.existsSync(outFile)) for (const x of JSON.parse(fs.readFileSync(outFile, 'utf8'))) map.set(x.courseId + '_' + x.round, x);

  let total = null;
  for (let p = START; p < START + PAGES; p++) {
    let html, ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        const res = await fetch(listUrl(p), { headers: { 'User-Agent': UA } });
        html = await res.text();
        ok = res.status === 200 && html.includes('t3_sb mt10');
        if (!ok) await sleep(1500);
      } catch (e) { await sleep(2000); }
    }
    if (!ok) { console.log(`page ${p}: 실패(스킵)`); continue; }
    if (total == null) { const t = html.match(/총&nbsp;<span[^>]*>([\d,]+)<\/span>건/); total = t ? t[1] : '?'; }
    const cards = parseCards(html);
    for (const x of cards) map.set(x.courseId + '_' + x.round, x);
    if (p % 10 === 0 || p === START) console.log(`page ${p}: +${cards.length} (누적 ${map.size} / 전체 ${total})`);
    fs.writeFileSync(outFile, JSON.stringify([...map.values()], null, 0), 'utf8');
    await sleep(500);
  }
  console.log(`\n완료: ${map.size}건 저장 → ${outFile} (사이트 전체 ${total}건)`);
})();
