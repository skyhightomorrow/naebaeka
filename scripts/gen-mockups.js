// 디자인 시안 생성 — public/data.json 의 실데이터로 시안 A·B HTML 두 개 생성
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data.json'), 'utf8'));
const won = n => n == null ? '-' : n.toLocaleString('en-US') + '원';
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const medal = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

// 대표 분야 = 랭킹 가능 수 많은 순 상위 사용
const cat = data.categories.find(c => c.slug === 'design') || data.categories[0];
const nav = data.categories.filter(c => c.rankedCount >= 3).slice(0, 10);
const top = cat.top.slice(0, 6);
const barW = r => Math.round(r); // 0~100

// ---------- 시안 A: "훈련기관 성적표" (공시 데이터 신뢰형) ----------
const A = `<!doctype html><html lang="ko"><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cat.name} 국비 취업률 순위 · 내배카랭킹</title>
<style>
:root{
  --paper:#f7f6f2; --card:#fff; --ink:#161a1d; --ink2:#4a545b; --mut:#8a949b; --line:#e4e2da;
  --teal:#0e7c6b; --teal-d:#0a5c50; --teal-bg:#e4f2ef; --warn:#b8791a; --grid:#eeece5;
  --num:"SF Mono",ui-monospace,"Cascadia Mono",monospace;
}
*{box-sizing:border-box} html,body{margin:0;background:var(--paper);color:var(--ink);
  font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:0 18px 72px}
.top{font-size:12px;color:var(--mut);border-bottom:1px solid var(--line);padding:11px 0;display:flex;gap:8px;align-items:center}
.top b{color:var(--teal-d);font-weight:700} .top .sep{color:var(--line)}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--teal-d);background:var(--teal-bg);
  padding:3px 8px;border-radius:4px;font-weight:600}
header{padding:34px 0 20px}
.eyebrow{font-size:12.5px;letter-spacing:.14em;color:var(--teal);font-weight:700;margin-bottom:12px}
h1{font-size:29px;line-height:1.28;margin:0 0 14px;letter-spacing:-.02em;text-wrap:balance;font-weight:800}
h1 em{font-style:normal;color:var(--teal);border-bottom:3px solid var(--teal-bg);box-shadow:inset 0 -10px 0 var(--teal-bg)}
.lead{font-size:15px;color:var(--ink2);margin:0;max-width:60ch}
.meta{display:flex;gap:22px;margin-top:22px;padding:15px 18px;background:var(--card);border:1px solid var(--line);border-radius:8px}
.meta div{display:flex;flex-direction:column;gap:2px}
.meta .k{font-size:11.5px;color:var(--mut)}
.meta .v{font-size:20px;font-weight:800;font-family:var(--num);letter-spacing:-.02em}
.meta .v small{font-size:12px;color:var(--mut);font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin:26px 0 10px}
.chip{font-size:13px;color:var(--ink2);background:var(--card);border:1px solid var(--line);
  padding:6px 12px;border-radius:999px;text-decoration:none;transition:.15s}
.chip:hover{border-color:var(--teal);color:var(--teal-d)}
.chip.on{background:var(--teal);color:#fff;border-color:var(--teal);font-weight:700}
.sect{margin-top:20px} .sect-h{display:flex;align-items:baseline;gap:9px;margin:0 0 4px}
.sect-h h2{font-size:19px;margin:0;font-weight:800;letter-spacing:-.01em}
.sect-h .cnt{font-size:13px;color:var(--mut);font-family:var(--num)}
.note{font-size:12.5px;color:var(--mut);margin:2px 0 16px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
thead th{font-size:11.5px;color:var(--mut);font-weight:600;text-align:left;padding:11px 14px;background:#faf9f6;border-bottom:1px solid var(--line)}
thead th.r{text-align:right}
tbody td{padding:14px;border-bottom:1px solid var(--grid);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#fbfaf7}
.rk{font-family:var(--num);font-size:15px;font-weight:800;color:var(--teal-d);width:26px}
.cs{font-weight:700;font-size:14.5px;line-height:1.35;letter-spacing:-.01em}
.cs .st{display:inline-block;font-size:10.5px;color:#c0392b;border:1px solid #eecac4;background:#fdf3f1;border-radius:3px;padding:0 5px;margin-left:6px;vertical-align:1.5px;font-weight:700}
.org{font-size:12.5px;color:var(--ink2);margin-top:3px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.cert{font-size:10.5px;color:var(--teal-d);background:var(--teal-bg);border-radius:3px;padding:1px 6px;font-weight:700}
.sub{font-size:12px;color:var(--mut);margin-top:3px;font-family:var(--num)}
.rate{text-align:right;white-space:nowrap}
.rate .n{font-family:var(--num);font-size:22px;font-weight:800;letter-spacing:-.03em}
.rate .bar{height:5px;width:88px;background:var(--grid);border-radius:3px;overflow:hidden;margin:5px 0 0 auto}
.rate .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--teal-d))}
.disc{margin-top:22px;font-size:12px;color:var(--mut);background:#faf9f6;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:6px;padding:13px 16px;line-height:1.7}
.disc b{color:var(--ink2)}
footer{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);font-size:11.5px;color:var(--mut)}
@media (prefers-color-scheme:dark){:root{--paper:#14171a;--card:#1c2023;--ink:#eceef0;--ink2:#aab3ba;--mut:#727c83;--line:#2b3033;--teal:#3fb8a3;--teal-d:#5fd0bb;--teal-bg:#123028;--grid:#252a2d;--warn:#d69a4a}}
</style></head><body>
<div class="wrap">
  <div class="top"><b>내배카랭킹</b><span class="sep">·</span>국비 훈련과정 취업률 공시 <span style="margin-left:auto"></span><span class="badge">● 고용노동부 공시 데이터</span></div>
  <header>
    <div class="eyebrow">NCS 직종별 훈련기관 취업률 · ${data.generatedAt} 기준</div>
    <h1>${cat.name} 국비과정,<br><em>취업률 높은 곳</em>부터 봅니다</h1>
    <p class="lead">학원 후기나 광고 말고, 고용노동부가 공시한 <b>실제 취업률</b>로 줄 세웠습니다. ${cat.name} 분야 ${cat.total}개 과정 중 취업률이 집계된 ${cat.rankedCount}개를 비교합니다.</p>
    <div class="meta">
      <div><span class="k">집계 과정</span><span class="v">${cat.rankedCount}<small> / ${cat.total}개</small></span></div>
      <div><span class="k">분야 평균 취업률</span><span class="v">${cat.avgRate}<small>%</small></span></div>
      <div><span class="k">1위 취업률</span><span class="v" style="color:var(--teal)">${top[0].emplRate}<small>%</small></span></div>
    </div>
  </header>

  <div class="chips">${nav.map(c => `<a class="chip${c.slug === cat.slug ? ' on' : ''}" href="#">${c.name}</a>`).join('')}</div>

  <div class="sect">
    <div class="sect-h"><h2>${cat.name} 취업률 순위</h2><span class="cnt">TOP ${top.length}</span></div>
    <p class="note">취업률 = 해당 훈련기관의 NCS 직종별 평균 취업률 (2024년 종료 과정 기준 · 수료자 10명 이상)</p>
    <table>
      <thead><tr><th>#</th><th>과정 · 훈련기관</th><th class="r">취업률</th></tr></thead>
      <tbody>
      ${top.map((c, i) => `<tr>
        <td class="rk">${i + 1}</td>
        <td>
          <div class="cs">${esc(c.title)}${c.status === '모집중' ? '<span class="st">모집중</span>' : ''}</div>
          <div class="org">${esc(c.org)}${c.certGrade ? `<span class="cert">${c.certGrade}</span>` : ''}</div>
          <div class="sub">${c.region} · ${c.hours || '-'} · 수강료 ${won(c.costWon)}</div>
        </td>
        <td class="rate"><span class="n">${c.emplRate}<small style="font-size:13px">%</small></span><span class="bar"><i style="width:${barW(c.emplRate)}%"></i></span></td>
      </tr>`).join('')}
      </tbody>
    </table>
    <div class="disc">
      <b>이렇게 읽어주세요.</b> 취업률은 개별 과정이 아니라 <b>그 학원이 같은 직종에서 배출한 수료생의 평균 취업률</b>입니다(고용노동부 산출 기준). 수료자 10명 미만인 신규 과정은 취업률이 공시되지 않아 순위에서 빠집니다. 수강료는 정부지원 전 금액으로, 내일배움카드 적용 시 실제 자부담은 크게 낮아집니다.<br>
      본 사이트는 공식 고용24가 아니며, 공시 데이터를 보기 쉽게 재구성한 정보 서비스입니다.
    </div>
  </div>
  <footer>내배카랭킹 · 데이터 출처: 고용노동부 고용24 직업훈련 공시 · 매일 자동 갱신 · 문의 skyhightomorrow@gmail.com</footer>
</div></body></html>`;

// ---------- 시안 B: "취업 리더보드" (취준생 친화·리더보드형) ----------
const B = `<!doctype html><html lang="ko"><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cat.name} 국비과정 취업률 랭킹 · 내배카랭킹</title>
<style>
:root{
  --bg:#0f1216; --bg2:#151a20; --card:#1a2029; --card2:#20272f; --ink:#f0f3f6; --ink2:#aeb8c2; --mut:#6d7885; --line:#2a323c;
  --gold:#f5c451; --silver:#c4cdd6; --bronze:#d68b5c; --good:#37d19a;
  --num:"SF Mono",ui-monospace,"Cascadia Mono",monospace;
}
:root{--acc:#6c8cff;--acc2:#93aaff}
*{box-sizing:border-box} html,body{margin:0;background:
  radial-gradient(120% 60% at 50% -10%, #1a2438 0%, var(--bg) 55%) fixed;
  color:var(--ink);font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;line-height:1.5}
.wrap{max-width:640px;margin:0 auto;padding:0 16px 80px}
.top{display:flex;align-items:center;gap:8px;padding:14px 2px;font-size:13px;color:var(--mut)}
.top b{color:var(--ink);font-weight:800;letter-spacing:-.02em}
.pill{margin-left:auto;font-size:11px;color:var(--good);background:rgba(55,209,154,.12);border:1px solid rgba(55,209,154,.3);padding:3px 9px;border-radius:999px;font-weight:700}
header{text-align:center;padding:30px 0 20px}
.kick{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--acc2);background:rgba(108,140,255,.12);border:1px solid rgba(108,140,255,.28);padding:5px 13px;border-radius:999px;margin-bottom:18px}
h1{font-size:31px;line-height:1.25;margin:0 0 14px;letter-spacing:-.03em;font-weight:900;text-wrap:balance}
h1 .hl{background:linear-gradient(120deg,var(--acc2),#5ee0c0);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{font-size:14.5px;color:var(--ink2);margin:0 auto;max-width:44ch}
.tabs{display:flex;gap:7px;overflow-x:auto;padding:22px 0 6px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{white-space:nowrap;font-size:13px;color:var(--ink2);background:var(--card);border:1px solid var(--line);padding:8px 15px;border-radius:999px;text-decoration:none;font-weight:600}
.tab.on{background:linear-gradient(120deg,var(--acc),#5566d9);color:#fff;border-color:transparent;box-shadow:0 4px 16px rgba(108,140,255,.35)}
.board-h{display:flex;align-items:baseline;justify-content:space-between;margin:20px 4px 14px}
.board-h .t{font-size:17px;font-weight:800} .board-h .t span{color:var(--acc2)}
.board-h .avg{font-size:12.5px;color:var(--mut)} .board-h .avg b{color:var(--ink2);font-family:var(--num)}
.row{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 16px;margin-bottom:10px;position:relative;overflow:hidden}
.row.top1{border-color:rgba(245,196,81,.4);background:linear-gradient(100deg,rgba(245,196,81,.08),var(--card) 40%)}
.row.top2{border-color:rgba(196,205,214,.32)} .row.top3{border-color:rgba(214,139,92,.32)}
.rank{flex:0 0 34px;text-align:center}
.rank .badge{font-family:var(--num);font-size:20px;font-weight:900;line-height:1}
.top1 .badge{color:var(--gold)} .top2 .badge{color:var(--silver)} .top3 .badge{color:var(--bronze)}
.rank .badge.plain{color:var(--mut);font-size:17px}
.info{flex:1;min-width:0}
.info .ct{font-size:14.5px;font-weight:700;letter-spacing:-.01em;line-height:1.34;margin-bottom:5px}
.info .meta{display:flex;flex-wrap:wrap;gap:6px 10px;font-size:12px;color:var(--mut);align-items:center}
.info .org{color:var(--ink2);font-weight:600}
.cert{font-size:10px;color:var(--gold);border:1px solid rgba(245,196,81,.35);border-radius:4px;padding:1px 5px;font-weight:700}
.rt{flex:0 0 auto;text-align:right}
.rt .big{font-family:var(--num);font-size:26px;font-weight:900;letter-spacing:-.04em;line-height:1;
  background:linear-gradient(120deg,#fff,var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.rt .lb{font-size:10.5px;color:var(--mut);margin-top:3px;letter-spacing:.03em}
.ring{--p:0;flex:0 0 auto;width:52px;height:52px;border-radius:50%;
  background:conic-gradient(var(--good) calc(var(--p)*1%), var(--line) 0);display:grid;place-items:center}
.ring .in{width:42px;height:42px;border-radius:50%;background:var(--card);display:grid;place-items:center;
  font-family:var(--num);font-weight:800;font-size:13px}
.cta{display:block;text-align:center;margin:22px 0 8px;font-size:14px;font-weight:700;color:#fff;
  background:linear-gradient(120deg,var(--acc),#5566d9);border:none;border-radius:12px;padding:15px;text-decoration:none;box-shadow:0 6px 20px rgba(108,140,255,.3)}
.disc{font-size:12px;color:var(--mut);line-height:1.7;margin-top:18px;padding:14px 16px;background:var(--bg2);border:1px solid var(--line);border-radius:12px}
.disc b{color:var(--ink2)}
footer{margin-top:28px;text-align:center;font-size:11px;color:var(--mut)}
</style></head><body>
<div class="wrap">
  <div class="top"><b>🎯 내배카랭킹</b><span class="pill">고용노동부 공시 기반</span></div>
  <header>
    <span class="kick">취업률로 줄 세운 국비과정</span>
    <h1>${cat.name}, 어디서 배우면<br><span class="hl">진짜 취업</span>될까?</h1>
    <p class="lead">학원 광고는 안 알려주는 실제 취업률. ${cat.name} 분야 ${cat.rankedCount}개 과정을 고용노동부 공시 데이터로 랭킹했어요.</p>
  </header>
  <div class="tabs">${nav.map(c => `<a class="tab${c.slug === cat.slug ? ' on' : ''}" href="#">${c.name}</a>`).join('')}</div>
  <div class="board-h">
    <div class="t"><span>${cat.name}</span> 취업률 TOP ${top.length}</div>
    <div class="avg">분야 평균 <b>${cat.avgRate}%</b></div>
  </div>
  ${top.map((c, i) => `<div class="row ${i < 3 ? 'top' + (i + 1) : ''}">
    <div class="rank"><div class="badge ${i > 2 ? 'plain' : ''}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div></div>
    <div class="info">
      <div class="ct">${esc(c.title)}</div>
      <div class="meta"><span class="org">${esc(c.org)}</span>${c.certGrade ? `<span class="cert">${c.certGrade}</span>` : ''}<span>${c.region}</span></div>
    </div>
    <div class="ring" style="--p:${c.emplRate}"><div class="in">${c.emplRate}%</div></div>
  </div>`).join('')}
  <a class="cta" href="#">내 지역 · 다른 분야 순위 보기 →</a>
  <div class="disc"><b>취업률은 학원 단위예요.</b> 개별 과정이 아니라 그 학원이 같은 직종에서 배출한 수료생의 평균 취업률(고용노동부 2024년 기준)이에요. 신규 과정(수료 10명 미만)은 순위에서 빠집니다. 수강료는 지원 전 금액이라 내일배움카드 쓰면 실제 부담은 훨씬 적어요. · 공식 고용24가 아닌 정보 서비스입니다.</div>
  <footer>내배카랭킹 · 데이터: 고용노동부 고용24 · 매일 갱신</footer>
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, '..', 'design-a.html'), A, 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'design-b.html'), B, 'utf8');
console.log('생성: design-a.html (성적표형), design-b.html (리더보드형) — 분야:', cat.name, '/ TOP', top.length);
