// 고용24 오픈API 실호출 검증 스크립트 (03 데이터 검증 단계)
// 사용: .env에 WORK24_API_KEY 넣고 `node scripts/test-api.js`
// 검증 항목: ① 호출 성공 여부 ② 전체 과정 수 ③ 응답 필드 실명세(특히 취업률·만족도 커버리지, REAL_MAN 의미)
const fs = require('fs');
const path = require('path');

// .env 로더 (무의존성 — ijacalc 패턴)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const KEY = process.env.WORK24_API_KEY;
if (!KEY) {
  console.error('WORK24_API_KEY가 없습니다. .env.example을 .env로 복사해 키를 넣어주세요.');
  process.exit(1);
}

const today = new Date();
const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const end = new Date(today); end.setMonth(end.getMonth() + 3); // 3개월 내 개강 과정

const BASE = 'https://www.work24.go.kr/cm/openApi/call/hr/callOpenApiSvcInfo310L01.do';
const params = new URLSearchParams({
  authKey: KEY,
  returnType: 'XML',
  outType: '1',        // 1=리스트
  pageNum: '1',
  pageSize: '20',
  srchTraStDt: fmt(today),
  srchTraEndDt: fmt(end),
  sort: 'ASC',
  sortCol: '2',
});

(async () => {
  const url = `${BASE}?${params}`;
  console.log('요청:', url.replace(KEY, '***KEY***'));
  const res = await fetch(url);
  console.log('HTTP', res.status, res.headers.get('content-type'));
  const body = await res.text();

  const rawDir = path.join(__dirname, '..', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const outFile = path.join(rawDir, 'test-response.xml');
  fs.writeFileSync(outFile, body, 'utf8');
  console.log(`응답 저장: ${outFile} (${body.length.toLocaleString()} chars)\n`);

  // 전체 건수 추정 태그
  const total = body.match(/<scn_cnt>(\d+)<\/scn_cnt>/i) || body.match(/<totalCount>(\d+)<\/totalCount>/i);
  if (total) console.log('전체 과정 수:', Number(total[1]).toLocaleString());

  // 등장하는 XML 태그 전수 집계 → 실제 필드 명세 파악
  const tags = {};
  for (const m of body.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)) tags[m[1]] = (tags[m[1]] || 0) + 1;
  console.log('\n[응답 태그 집계]');
  for (const [t, n] of Object.entries(tags).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);

  // 관심 필드 샘플 출력
  console.log('\n[관심 필드 샘플 (첫 5건)]');
  const pick = tag => [...body.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'gi'))].slice(0, 5).map(m => m[1]);
  for (const t of ['title', 'subTitle', 'courseMan', 'realMan', 'yardMan', 'eiEmplRate3', 'eiEmplRate6', 'eiEmplCnt3', 'stdgScor', 'grade', 'address', 'traStartDate', 'traEndDate']) {
    const v = pick(t);
    if (v.length) console.log(`  ${t}: ${v.join(' | ')}`);
  }

  if (!total && !Object.keys(tags).length) {
    console.log('\n⚠️ XML 태그를 찾지 못했습니다. 응답 앞부분:');
    console.log(body.slice(0, 1500));
  }
  console.log('\n다음 검증: REAL_MAN이 자부담인지 지원금인지(수강비와 비교), 취업률 빈값 비율, pageSize 최대치, 일 호출 한도.');
})().catch(e => { console.error('호출 실패:', e.message); process.exit(1); });
