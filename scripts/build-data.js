// courses-all.json → public/data.json (분야별 취업률 랭킹)
const fs = require('fs');
const path = require('path');
const { CATEGORIES, categorize, CAT_MAP } = require('../lib/categorize');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'raw', 'courses-all.json'), 'utf8'));

const decode = s => (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
// 지역 정규화: "서울 서초구" → 시도 "서울"
const sido = r => (r || '').split(' ')[0] || null;

const courses = raw.map(c => ({
  ...c,
  title: decode(c.title),
  org: decode(c.org),
  cat: categorize(c.title),
  sido: sido(c.region),
}));

// 분야별 집계 + 랭킹 (취업률 보유·비원격만 랭킹 대상, 취업률 desc → 인증등급 → 저비용)
const gradeRank = { 'BHA': 5, '우수훈련기관': 4, '5년인증': 3, '3년인증': 2, '1년인증': 1 };
function rankable(list) {
  const filtered = list.filter(c => c.emplRate != null && !c.remote);
  // 동일 기관·동일 과정명(회차 차이) 중복 제거 — 취업률 높은 1건만
  const seen = new Map();
  for (const c of filtered) {
    const key = c.org + '|' + c.title.replace(/[\s\d()]/g, '');
    const prev = seen.get(key);
    if (!prev || c.emplRate > prev.emplRate) seen.set(key, c);
  }
  return [...seen.values()]
    .sort((a, b) => b.emplRate - a.emplRate
      || (gradeRank[b.certGrade] || 0) - (gradeRank[a.certGrade] || 0)
      || (a.costWon || 9e9) - (b.costWon || 9e9));
}

const categories = CATEGORIES.concat([{ slug: 'etc', name: '기타' }]).map(cat => {
  const list = courses.filter(c => c.cat === cat.slug);
  const ranked = rankable(list);
  return {
    slug: cat.slug, name: cat.name,
    total: list.length,
    rankedCount: ranked.length,
    top: ranked, // 전체 랭킹 (분야 페이지에서 전부 노출 — 더보기 UI)
    avgRate: ranked.length ? +(ranked.reduce((s, c) => s + c.emplRate, 0) / ranked.length).toFixed(1) : null,
  };
}).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: '고용노동부 고용24 직업훈련 공시(비공식 재구성) — NCS직종별 훈련기관 평균취업률(2024 종료과정 기준)',
  totalCourses: courses.length,
  withRate: courses.filter(c => c.emplRate != null).length,
  categories,
};

fs.mkdirSync(path.join(__dirname, '..', 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.json'), JSON.stringify(data, null, 2), 'utf8');

console.log(`빌드 완료: ${courses.length}과정 → ${categories.length}분야`);
console.log(`취업률 보유: ${data.withRate}/${courses.length} (${(data.withRate / courses.length * 100).toFixed(0)}%)`);
console.log('\n분야별 (과정수 / 랭킹가능 / 평균취업률):');
for (const c of categories) console.log(`  ${c.name.padEnd(14)} ${String(c.total).padStart(4)} / ${String(c.rankedCount).padStart(4)} / ${c.avgRate ?? '-'}%`);
