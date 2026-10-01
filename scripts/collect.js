// 고용24 훈련과정 수집기 — raw/courses-all.json 로 증분 저장(중복 제거)
// 사용: node scripts/collect.js [페이지수=60] [시작페이지=1]
const fs = require('fs');
const path = require('path');
const { certGradeOf } = require('../lib/cert');

const PAGES = Number(process.argv[2] || 60);
const START = Number(process.argv[3] || 1);
// 수집기 신원을 밝힌다 — 고용24 운영 측이 누가 무엇 때문에 접속하는지 알 수 있어야 하고, 문제가 있으면 연락할 수 있어야 한다.
// (2026-10-01까지는 일반 브라우저 UA로 접속했다. 같은 날 이 UA로도 목록이 정상 응답하는 것을 확인.)
const UA = 'Mozilla/5.0 (compatible; naebaeka-bot/1.0; +https://naebaeka.com/about; hello@naebaeka.com)';
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
    // 🔴 카드에는 «다른 회차» 선택 목록(<option> 6회차 2026-10-06 ~ 2026-11-05)이 본 회차 날짜보다 앞에 온다.
    //    카드의 첫 «날짜 ~ 날짜»를 잡으면 다른 회차 날짜가 저장된다(2026-10-01 점검: 표본 70장 중 23장이 틀렸다).
    //    본 회차 날짜는 <span class="time item …">2026-10-01 ~ 2026-11-26 (5회차)</span> 에 있다.
    const pm =
      c.match(/class="time item[^"]*"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/) ||
      c.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s*\(\s*\d+\s*회차\s*\)/) ||
      c.replace(/<select[\s\S]*?<\/select>/g, '').match(/(\d{4}-\d{2}-\d{2})\s*~[\s\S]*?(\d{4}-\d{2}-\d{2})/);
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
      tel: g(/<p class="s1_r"[^>]*>[^<(]*\(\s*([\d-]{9,14})\s*\)/), // 「서울 서초구 ( 02-577-8004 )」
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

  // 🔴 고용24 목록은 pageSize를 무시하고 항상 10건씩 준다(2026-10-01 실측: 50·100을 줘도 10장).
  //    1,400쪽이 넘어 한 쪽씩 돌면 워크플로의 20분 제한에 걸려 770쪽 안팎에서 끊겼고,
  //    그러면 아래 «사라진 과정 정리»가 실행되지 않아 이미 개강한 과정이 '모집중'으로 남았다
  //    (같은 날 실측: 색인 10,861개 중 6,229개가 개강일이 지난 과정). 그래서 여러 쪽을 동시에 받는다.
  // 2026-10-01 실측(96쪽): 동시 4개 55초 · 8개 36초 · 12개 21초. 4개로는 전량(1,427쪽)에 20분이 넘게 걸려
  // 워크플로 제한에 다시 걸린다. 8개면 9분 안팎이다.
  // 2026-10-01 정정: 8개 동시 요청은 상대 서버에 주는 부담에 비해 과하다(고용24 약관 제14조의2 «과도한 트래픽»).
  // 기본 3개로 낮추고 묶음 사이 간격을 둔다. 전량에 20분 남짓 걸리므로 워크플로 제한은 40분으로 맞춘다.
  const CONC = Number(process.env.COLLECT_CONC || 3);
  const fetchPage = async (p) => {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const res = await fetch(listUrl(p), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
        const html = await res.text();
        if (res.status === 200 && html.includes('t3_sb mt10')) return html;
        await sleep(1500);
      } catch (e) { await sleep(2000); }
    }
    return null;
  };
  let stop = false;
  let lastPage = START + PAGES - 1;
  for (let p = START; p <= lastPage && !stop; p += CONC) {
    const pages = [];
    for (let q = p; q <= Math.min(p + CONC - 1, lastPage); q++) pages.push(q);
    const htmls = await Promise.all(pages.map(fetchPage));
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i], html = htmls[i];
      if (!html) { failPages++; console.log(`page ${pg}: 실패(스킵)`); continue; }
      okPages++;
      if (total == null) {
        const t = html.match(/총&nbsp;<span[^>]*>([\d,]+)<\/span>건/); total = t ? t[1] : '?';
        // 공시 건수로 마지막 쪽을 계산해 거기서 멈춘다. 예전에는 1500쪽까지 돌며 목록이 끝난 뒤의 빈 쪽 70여 개를
        // 3번씩 재시도하느라 몇 분을 버렸고, 그 실패가 실패율(5% 기준)에도 잡혔다.
        const nTotal = Number(String(total).replace(/,/g, ''));
        if (nTotal > 0) lastPage = Math.min(lastPage, START - 1 + Math.ceil(nTotal / 10) + 2);
      }
      const cards = parseCards(html);
      // 데이터가 끝난 뒤의 빈 페이지가 이어지면 조기 종료 (뒤쪽 수백 페이지를 헛돌지 않게)
      emptyStreak = cards.length === 0 ? emptyStreak + 1 : 0;
      for (const x of cards) { const k = x.courseId + '_' + x.round; seen.add(k); seenIds.add(x.courseId); map.set(k, x); }
      if (pg % 40 === 0 || pg === START) console.log(`page ${pg}: +${cards.length} (누적 ${map.size} / 전체 ${total})`);
      if (emptyStreak >= 3) { console.log(`page ${pg}: 빈 페이지 3연속 — 목록 끝으로 보고 종료`); stop = true; break; }
    }
    if ((p - START) % 100 < CONC) save();   // 중간 저장(진행분 보존)
    await sleep(600);
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
