// 고용24 훈련과정 수집기 — raw/courses-all.json 로 증분 저장(중복 제거)
// 사용: node scripts/collect.js [페이지수=60] [시작페이지=1]
const fs = require('fs');
const path = require('path');
const { certGradeOf } = require('../lib/cert');

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
      certGrade: certGradeOf(c), // 마크업·정규화 근거는 lib/cert.js 주석 참고
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

  // 원자적 저장 — tmp에 완전히 쓴 뒤 rename 한다.
  // ⚠️ 이 파일은 7MB가 넘고 수집 루프에서 반복 저장된다. writeFileSync는 대상 파일을 먼저 비우고 쓰므로,
  //    워크플로의 `timeout 20m`이 보낸 SIGTERM이 쓰기 도중에 떨어지면 JSON이 잘린 채 남는다.
  //    실제로 2026-08-26 새벽 회차가 그렇게 깨졌다(page 770에서 타임아웃 → Build에서
  //    "SyntaxError: Unexpected end of JSON input" → 커밋 없음 → 사이트가 하루 낡음).
  //    rename은 같은 파일시스템에서 원자적이라, 죽어도 "이전 완전본" 아니면 "새 완전본"만 남는다.
  const save = () => {
    const tmp = outFile + '.tmp';   // raw/* 는 .gitignore 대상이라 커밋에 섞이지 않는다
    fs.writeFileSync(tmp, JSON.stringify([...map.values()], null, 0), 'utf8');
    fs.renameSync(tmp, outFile);
  };
  const map = new Map();
  if (fs.existsSync(outFile)) for (const x of JSON.parse(fs.readFileSync(outFile, 'utf8'))) map.set(x.courseId + '_' + x.round, x);

  const before = map.size;
  const seen = new Set();          // 이번 실행에서 실제로 목록에 나타난 키(courseId_round)
  const seenIds = new Set();       // 같은 것의 courseId 단위 — 사이트 공시 건수와 대조용
  let total = null, okPages = 0, failPages = 0, emptyStreak = 0;

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
    if (!ok) { failPages++; console.log(`page ${p}: 실패(스킵)`); continue; }
    okPages++;
    if (total == null) { const t = html.match(/총&nbsp;<span[^>]*>([\d,]+)<\/span>건/); total = t ? t[1] : '?'; }
    const cards = parseCards(html);
    // 데이터가 끝난 뒤의 빈 페이지가 이어지면 조기 종료 (뒤쪽 수백 페이지를 헛돌지 않게)
    emptyStreak = cards.length === 0 ? emptyStreak + 1 : 0;
    for (const x of cards) { const k = x.courseId + '_' + x.round; seen.add(k); seenIds.add(x.courseId); map.set(k, x); }
    if (p % 10 === 0 || p === START) console.log(`page ${p}: +${cards.length} (누적 ${map.size} / 전체 ${total})`);
    if (p % 25 === 0) save();   // 중간 저장(진행분 보존). 매 페이지 저장은 7MB 쓰기를 1500회 반복해 낭비인 데다 kill 창만 넓힌다
    if (emptyStreak >= 3) { console.log(`page ${p}: 빈 페이지 3연속 — 목록 끝으로 보고 종료`); break; }
    await sleep(500);
  }

  save();   // 마지막 중간 저장 이후 수집분 반영

  // ── 사라진 과정 정리 ────────────────────────────────────────────────
  // 종전에는 기존 파일에 병합만 하고 지우지 않아, 고용24에서 내려간 과정이 영원히 남았다.
  // 2026-08-11 실측: 파일 28,846건 / 고유 courseId 17,541건인데 사이트 공시는 14,592건 —
  // 약 3,000개 과정이 '모집중'으로 사이트에 계속 노출되고 있었다(죽은 링크 + 저품질 신호).
  // 전량 수집(START=1)이 정상 완주했을 때만 정리한다. 부분 수집이나 대량 실패 시에는 건드리지 않는다.
  // 안전 기준은 "기존 파일 대비 얼마나 줄었나"가 아니라 **사이트가 공시한 전체 건수를 다 봤나**로 잡는다.
  // (첫 정리에서는 누적 잔존분 때문에 정당하게 절반 가까이 줄어들 수 있어, 감소율 가드는 오히려 정리를 막는다.)
  const fullRun = START === 1;
  const failRate = okPages + failPages ? failPages / (okPages + failPages) : 1;
  const siteTotal = total ? Number(String(total).replace(/,/g, '')) : null;
  const coverage = siteTotal ? seenIds.size / siteTotal : null;
  if (!fullRun) {
    console.log(`\n부분 수집(START=${START}) — 사라진 과정 정리는 건너뜀`);
  } else if (failRate > 0.05) {
    console.log(`\n⚠️ 실패 페이지 비율 ${(failRate * 100).toFixed(1)}% — 정리 건너뜀(수집 누락을 삭제로 오인하지 않도록)`);
  } else if (coverage == null || coverage < 0.9) {
    console.log(`\n⚠️ 공시 ${siteTotal ?? '?'}건 중 ${seenIds.size}건만 확인(커버리지 ${coverage == null ? '?' : (coverage * 100).toFixed(1) + '%'}) — 정리 건너뜀`);
  } else {
    let removed = 0;
    for (const k of [...map.keys()]) if (!seen.has(k)) { map.delete(k); removed++; }
    if (removed) save();
    console.log(`\n사라진 과정 정리: ${removed}건 삭제 (기존 ${before} → ${map.size})`);
  }

  console.log(`완료: ${map.size}건 저장 → ${outFile} (사이트 전체 ${total}건, 페이지 성공 ${okPages}·실패 ${failPages})`);
})();
