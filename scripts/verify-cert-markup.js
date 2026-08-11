// 인증등급(certGrade) 수집 검증 — 재수집 없이 파서 결함을 판정하기 위한 근거 스크립트.
// 사용: node scripts/verify-cert-markup.js
//
// 하는 일
//  1) raw/*.html (수집기가 남긴 목록 페이지 캐시)에서 cert_img 배지 alt 를 실측 집계
//  2) 구 정규식 alt="(1년인증|3년인증|5년인증|우수훈련기관|BHA)" 과 현 파서의 포착률 비교
//  3) 캐시에 배지가 보이는 courseId 를 raw/courses-all.json 저장값과 1:1 대조
//  4) courses-all.json 의 등급 분포(랭킹 대상 기준)
//
// ※ raw/*.html 은 .gitignore 대상(로컬 캐시)이라 없을 수 있다. 없으면 1~3은 건너뛰고
//   4만 출력한다. 그 경우에도 "상위 등급 0건" 자체가 결함의 방증이다.
const fs = require('fs');
const path = require('path');
const { certGradeOf, certGradeFromAlt } = require('../lib/cert');

const RAW = path.join(__dirname, '..', 'raw');
const OLD_RE = /alt="(1년인증|3년인증|5년인증|우수훈련기관|BHA)"/;
const CARD_RE = /<div class="list" data-tracseid="([^"]+)" data-tracsetme="([^"]+)"[\s\S]*?(?=<div class="list" data-tracseid=|<\/form>|<div class="paging)/g;

const pct = (a, b) => b ? ` (${(a / b * 100).toFixed(1)}%)` : '';
const rows = m => [...m].sort((a, b) => b[1] - a[1]);

// ── 1~3. 캐시 HTML 실측 ───────────────────────────────────────────────
const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter(f => f.endsWith('.html')) : [];
const altCount = new Map();
const badgeById = new Map();
let cards = 0, oldHit = 0, newHit = 0;

for (const f of files) {
  const html = fs.readFileSync(path.join(RAW, f), 'utf8');
  CARD_RE.lastIndex = 0;
  let m;
  while ((m = CARD_RE.exec(html))) {
    cards++;
    const c = m[0];
    const blk = (c.match(/<div class="cert_img"[\s\S]*?<\/div>/) || [])[0] || '';
    const alt = (blk.match(/alt="([^"]*)"/) || [])[1] || null;
    altCount.set(alt, (altCount.get(alt) || 0) + 1);
    if (OLD_RE.test(c)) oldHit++;
    if (certGradeOf(c)) { newHit++; badgeById.set(m[1], alt); }
  }
}

console.log(`# 1. 목록 캐시 HTML 실측 — 파일 ${files.length}개 / 카드 ${cards}건`);
if (!cards) {
  console.log('  raw/*.html 캐시 없음 (gitignore 대상) — 섹션 1~3 생략\n');
} else {
  console.log('  cert_img 안 img alt 분포:');
  for (const [k, v] of rows(altCount)) console.log(`    ${String(v).padStart(4)}  ${k === null ? '(배지 없음)' : JSON.stringify(k)} → ${JSON.stringify(certGradeFromAlt(k))}`);
  console.log('\n# 2. 포착률');
  console.log(`  배지를 실제로 가진 카드 : ${newHit}${pct(newHit, cards)}`);
  console.log(`  구 정규식이 잡은 카드   : ${oldHit}${pct(oldHit, cards)}   ← 놓친 배지 ${newHit - oldHit}건`);
  console.log('  구 정규식은 alt 값 전체가 등급명과 정확히 일치할 때만 매칭돼,');
  console.log('  복합 alt "5년인증 우수훈련기관" 을 통째로 놓쳤다.');
}

// ── 4. 수집 결과 대조 ────────────────────────────────────────────────
const jsonPath = path.join(RAW, 'courses-all.json');
if (!fs.existsSync(jsonPath)) { console.log('\nraw/courses-all.json 없음 — 종료'); process.exit(0); }
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const savedById = new Map();
for (const c of data) if (!savedById.has(c.courseId)) savedById.set(c.courseId, c.certGrade);

if (badgeById.size) {
  console.log('\n# 3. 캐시 HTML 배지 ↔ courses-all.json 저장값 대조 (결정적 증거)');
  const tally = new Map();
  for (const [id, alt] of badgeById) {
    if (!savedById.has(id)) continue;
    const key = `${JSON.stringify(alt)} → ${JSON.stringify(savedById.get(id))}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  for (const [k, v] of rows(tally)) console.log(`  ${String(v).padStart(4)}건  HTML alt=${k}`);
  console.log('  (HTML alt 가 "5년인증 우수훈련기관" 인 과정이 JSON 에 null 로 저장돼 있으면 결함 확정)');
}

// courseId 병합 + 랭킹 대상 필터는 lib/model.js 기준과 동일하게 맞춘다
const byId = new Map();
for (const c of data) {
  const p = byId.get(c.courseId);
  if (!p) byId.set(c.courseId, { ...c });
  else { p.emplRate = p.emplRate ?? c.emplRate; p.certGrade = p.certGrade || c.certGrade; }
}
const ranked = [...byId.values()].filter(c => c.emplRate != null && !c.remote && c.status === '모집중');
const dist = new Map();
for (const c of ranked) dist.set(c.certGrade, (dist.get(c.certGrade) || 0) + 1);

console.log(`\n# 4. courses-all.json 등급 분포 — 전체 ${data.length}건 / courseId 유니크 ${byId.size}건 /`);
console.log(`     랭킹 대상(취업률 보유·비원격·모집중) ${ranked.length}건`);
for (const [k, v] of rows(dist)) {
  const sub = ranked.filter(c => c.certGrade === k);
  const avg = (sub.reduce((s, c) => s + c.emplRate, 0) / sub.length).toFixed(1);
  console.log(`  ${String(v).padStart(6)}${pct(v, ranked.length).padEnd(9)} ${k === null ? '(무인증으로 저장됨)' : k}   평균 취업률 ${avg}%`);
}
const top = ['우수훈련기관', '5년인증', 'BHA'].reduce((s, g) => s + (dist.get(g) || 0), 0);
console.log(`\n  상위 등급(우수훈련기관·BHA) 합계: ${top}건`);
console.log(top === 0
  ? '  → 0건. 이 데이터는 파서 수정 전 수집분이다. 등급 축 분석·해석에 쓰지 말 것.\n' +
    '     null 버킷은 "무인증"이 아니라 대부분 우수훈련기관이며, 캐시 실측 비율상\n' +
    '     진짜 무배지는 전체의 10% 안팎이다.'
  : '  → 상위 등급이 수집되고 있다. 파서 수정분 반영 완료.');
