// 지역(시도) 정규화 + 슬러그
const SIDO_FIX = { '경기도': '경기', '전남광주': '광주전남', '서울특별시': '서울', '인천광역시': '인천' };
const SIDO_SLUG = {
  '서울': 'seoul', '경기': 'gyeonggi', '인천': 'incheon', '부산': 'busan', '대구': 'daegu',
  '대전': 'daejeon', '울산': 'ulsan', '세종': 'sejong', '강원': 'gangwon', '충북': 'chungbuk',
  '충남': 'chungnam', '전북': 'jeonbuk', '전남': 'jeonnam', '광주': 'gwangju', '광주전남': 'gwangju-jeonnam',
  '경북': 'gyeongbuk', '경남': 'gyeongnam', '제주': 'jeju',
};
const SIDO_NAME = Object.fromEntries(Object.entries(SIDO_SLUG).map(([k, v]) => [v, k === '광주전남' ? '광주·전남' : k]));

function sidoOf(region) {
  const raw = (region || '').split(' ')[0] || null;
  if (!raw) return null;
  return SIDO_FIX[raw] || raw;
}

const decode = s => (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = { SIDO_SLUG, SIDO_NAME, sidoOf, decode, esc };
