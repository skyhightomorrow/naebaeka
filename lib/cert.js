// 고용24 목록 카드의 인증등급 배지 파서 — 마크업 지식을 여기 한 곳에만 둔다.
//
// 실측 마크업 (raw/list-p1.html·list-big.html 등 캐시 8개 / 카드 40건, 2026-08-11 확인):
//   <div class="cert_img" style="display:flex; align-items:center;">
//     <img src='/hr/static/images/icoProCerti1_33.png' ... alt="3년인증">
//   </div>
//   icoProCerti1_33.png → alt="3년인증"                (20건)
//   icoProCerti6_25.png → alt="5년인증 우수훈련기관"   (17건)  ← 두 단어가 한 alt 안에 있다
//   배지 없음            → cert_img div 가 비어 있음    ( 3건)  = 무인증/인증유예/미평가
//   ※ 카드 안 위치: <div class="list" data-tracseid> → 기관링크 → cert_img → <h3>과정명
//   ※ 2026-08-11 라이브 1페이지 재확인(raw/live-check.html): 마크업 동일, 구 정규식 7/10 → 현 파서 10/10
//
// [버그] 종전 정규식 alt="(1년인증|3년인증|5년인증|우수훈련기관|BHA)" 은 닫는 따옴표를
// 강제해서 "5년인증 우수훈련기관" 을 통째로 놓쳤다. 캐시 HTML에서 이 배지가 확인된
// courseId 7건이 courses-all.json 에 전부 certGrade=null 로 저장돼 있다(3년인증 12건은 정상).
// 그 결과 최상위 등급이 0건이 되어 랭킹이 사실상 3년인증 유무로만 갈렸고,
// "무인증" 버킷(랭킹대상 10,418건 중 3,764건 = 36%)이 실제로는 대부분 우수훈련기관이었다.
// 근거 재현: node scripts/verify-cert-markup.js
//
// [등급 사다리] 목록 도움말 원문 기준:  인증유예 < 1년인증 < 3년인증 < 우수훈련기관 < BHA
// "5년인증" 은 별도 등급이 아니라 우수훈련기관의 인증 유효기간 표기다 — 도움말 원문:
//   "우수훈련기관 … 인증등급 유효기간은 기본 3년인증에 최대 2년을 추가 부여하여
//    5년 인증(우수)으로 표기"
// 그래서 5년인증 ⇔ 우수훈련기관 은 같은 등급이고, 정규화 결과는 '우수훈련기관' 하나로 모은다.
//
// [BHA] 목록 도움말에는 설명이 있으나("우수훈련기관 중 별도 선정 절차를 거쳐 직업훈련
// 선도기관으로 선정된 훈련기관"), 캐시된 목록 HTML 40개 카드에서 배지 실물은 한 번도
// 관측되지 않았다(라이브 1페이지 10건 포함 총 50카드). 희소 등급이라 표본에 안 걸렸을
// 가능성이 크므로 alt 에 "BHA" 가 있으면 잡도록 열어 두되, 마크업은 미검증이다.
// 재수집 후 scripts/verify-cert-markup.js 로 실재 여부를 확인할 것.
// 인증유예도 마찬가지로 배지 실물 미관측 — 현재로선 "배지 없음"과 구분되지 않는다.

// 높을수록 상위 등급. 배지 없음(null) = 0.
const CERT_RANK = { 'BHA': 4, '우수훈련기관': 3, '3년인증': 2, '1년인증': 1 };

// alt 문자열 → 정규화된 등급명. 복합 alt("5년인증 우수훈련기관")를 부분 매칭으로 처리한다.
function certGradeFromAlt(alt) {
  if (!alt) return null;
  if (/BHA/i.test(alt)) return 'BHA';                              // 미검증(위 주석 참고)
  if (/우수훈련기관|5년인증/.test(alt)) return '우수훈련기관';       // 5년인증 = 우수훈련기관
  const m = alt.match(/[13]년인증/);
  return m ? m[0] : null;
}

// 카드 HTML 조각 → 등급명(없으면 null). cert_img 컨테이너 안의 img alt 만 본다
// (페이지 하단 도움말에 "BHA (Best HRD Academy)" 같은 설명 텍스트가 있어 전체 검색은 위험).
function certGradeOf(cardHtml) {
  const blk = cardHtml.match(/<div class="cert_img"[\s\S]*?<\/div>/);
  if (!blk) return null;
  const alt = blk[0].match(/alt="([^"]*)"/);
  return certGradeFromAlt(alt && alt[1]);
}

module.exports = { CERT_RANK, certGradeFromAlt, certGradeOf };
