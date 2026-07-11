// 고용24 공개 훈련과정 목록 스크래퍼 (프로토타입 — 데이터 품질 검증용)
// 사용: node scripts/scrape-list.js [페이지수=5]
// 출력: raw/sample-courses.json + 콘솔 필드 커버리지 통계
const fs = require('fs');
const path = require('path');

const PAGES = Number(process.argv[2] || 5);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const today = new Date();
const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const end = new Date(today); end.setFullYear(end.getFullYear() + 1);

const listUrl = p =>
  `https://www.work24.go.kr/hr/a/a/1100/trnnCrsInf.do?dghtSe=A&traingMthCd=A&tracseTme=1` +
  `&startDate=${fmt(today)}&endDate=${fmt(end)}&pageSize=10&pageIndex=${p}&srchType=all_type&currentTab=1&action=trnnCrsInfPost.do`;

const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseCards(html) {
  // 카드 경계: 과정명 h3 기준으로 분할
  const chunks = html.split(/<h3 class="t3_sb mt10">/).slice(1);
  return chunks.map(c => {
    const g = (re) => { const m = c.match(re); return m ? m[1].trim() : null; };
    const ids = c.match(/fn_viewTracseInfo\('([^']+)','([^']+)','([^']+)','([^']*)'/);
    return {
      title: g(/title="([^"]+?) 훈련과정 정보 새 창 열림"/) || strip((c.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || ''),
      courseId: ids && ids[1], round: ids && ids[2], typeCode: ids && ids[3], instId: ids && ids[4],
      org: g(/title="([^"]+?) 훈련기관인증평가 닫기"/),
      certGrade: g(/alt="(1년인증|3년인증|5년인증|우수훈련기관|BHA)"/),
      costWon: (m => m ? Number(m[1].replace(/,/g, '')) : null)(c.match(/([\d,]{4,})\s*원/)),
      period: g(/(\d{4}-\d{2}-\d{2}\s*~[\s\S]*?\d{4}-\d{2}-\d{2})/) ,
      hours: g(/(\d+일,\s*총\d+시간)/),
      region: g(/<p class="s1_r"[^>]*>\s*([^<(]+?)\s*(?:\(|<)/),
      phone: g(/\(\s*([\d-]{9,14})\s*\)/),
      emplRate: (m => m ? Number(m[1]) : null)(c.match(/NCS직종 훈련기관 취업률:[\s\S]{0,300}?<em class="txt">([\d.]+)%<\/em>/)),
      tags: [...c.matchAll(/<span class="clr_blue fw600">([^<]+)<\/span>/g)].map(m => m[1]),
      status: g(/<span class="t3_sb clr_red">([^<]+)<\/span>/),
    };
  });
}

(async () => {
  const all = [];
  let totalCount = null;
  for (let p = 1; p <= PAGES; p++) {
    const res = await fetch(listUrl(p), { headers: { 'User-Agent': UA } });
    const html = await res.text();
    if (p === 1) {
      const t = html.match(/총\s*<[^>]*>?\s*([\d,]+)\s*<?[^>]*>?\s*건/) || html.match(/총\s*([\d,]+)\s*건/);
      totalCount = t ? t[1] : '(파싱 실패)';
    }
    const cards = parseCards(html);
    console.log(`page ${p}: HTTP ${res.status}, ${Math.round(html.length / 1024)}KB, 과정 ${cards.length}건`);
    all.push(...cards);
    await sleep(700); // 예의
  }

  const outDir = path.join(__dirname, '..', 'raw');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sample-courses.json'), JSON.stringify(all, null, 2), 'utf8');

  // 필드 커버리지 통계
  const cov = f => `${all.filter(x => x[f] != null && x[f] !== '' && !(Array.isArray(x[f]) && !x[f].length)).length}/${all.length}`;
  console.log(`\n전체 검색 건수(사이트 표기): ${totalCount}`);
  console.log('필드 커버리지:');
  for (const f of ['title', 'courseId', 'org', 'certGrade', 'costWon', 'period', 'hours', 'region', 'emplRate', 'tags', 'status'])
    console.log(`  ${f}: ${cov(f)}`);
  const rates = all.map(x => x.emplRate).filter(x => x != null);
  if (rates.length) console.log(`취업률 분포: min ${Math.min(...rates)}% / max ${Math.max(...rates)}% / 평균 ${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)}%`);
  console.log('\n샘플 3건:');
  console.log(JSON.stringify(all.slice(0, 3), null, 2));
})();
