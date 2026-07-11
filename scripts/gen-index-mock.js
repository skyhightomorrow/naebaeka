// 메인(index) 시안 — 분야 무관 통합 취업률 랭킹 ("전체" 탭)
// 단위: 학원×분야 (취업률이 학원×직종 단위이므로 과정 도배 방지, 대표과정 + N개 표기)
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data.json'), 'utf8'));
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 학원×분야 그룹핑
const groups = new Map();
for (const cat of data.categories) {
  if (cat.slug === 'etc') continue;
  for (const c of cat.top) {
    const key = c.org + '|' + cat.slug;
    const g = groups.get(key);
    if (!g) groups.set(key, { org: c.org, catName: cat.name, rate: c.emplRate, best: c, count: 1, certGrade: c.certGrade });
    else { g.count++; if (c.emplRate > g.rate) { g.rate = c.emplRate; g.best = c; } if (!g.certGrade) g.certGrade = c.certGrade; }
  }
}
const all = [...groups.values()].sort((a, b) => b.rate - a.rate);
const top = all.slice(0, 50);
const VISIBLE = 10;
const totalRanked = data.categories.filter(c => c.slug !== 'etc').reduce((s, c) => s + c.rankedCount, 0);
const avgAll = (data.categories.filter(c => c.slug !== 'etc' && c.avgRate).reduce((s, c) => s + c.avgRate * c.rankedCount, 0) / totalRanked).toFixed(1);
const nav = data.categories.filter(c => c.rankedCount >= 3).slice(0, 10);

const html = `<!doctype html><html lang="ko"><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>국비지원 과정 취업률 랭킹 — 전체 · 내배카랭킹</title>
<style>
:root{
  --paper:#f8f7f4; --card:#fff; --ink:#191d20; --ink2:#555f66; --mut:#98a1a8; --line:#e7e5de;
  --teal:#0e7c6b; --teal-d:#0a5c50; --teal-bg:#e7f3f0; --gold:#b8791a; --grid:#f0eee8;
  --num:"SF Mono",ui-monospace,"Cascadia Mono",monospace;
}
*{box-sizing:border-box} html,body{margin:0;background:var(--paper);color:var(--ink);
  font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:640px;margin:0 auto;padding:0 16px 70px}
.top{display:flex;align-items:center;gap:8px;padding:14px 2px;font-size:13.5px}
.top b{color:var(--teal-d);font-weight:800;letter-spacing:-.02em}
.pill{margin-left:auto;font-size:11px;color:var(--teal-d);background:var(--teal-bg);padding:4px 10px;border-radius:999px;font-weight:700}
header{text-align:center;padding:30px 0 6px}
.kick{display:inline-block;font-size:12px;font-weight:700;color:var(--teal-d);background:var(--teal-bg);padding:5px 13px;border-radius:999px;margin-bottom:16px}
h1{font-size:29px;line-height:1.27;margin:0 0 10px;letter-spacing:-.03em;font-weight:900;text-wrap:balance}
h1 em{font-style:normal;color:var(--teal);box-shadow:inset 0 -11px 0 var(--teal-bg)}
.stat{font-size:13px;color:var(--mut);margin:0}
.stat b{color:var(--ink2);font-family:var(--num);font-weight:700}
.tabs{display:flex;gap:7px;overflow-x:auto;padding:24px 0 18px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{white-space:nowrap;font-size:13px;color:var(--ink2);background:var(--card);border:1px solid var(--line);padding:7px 14px;border-radius:999px;text-decoration:none;font-weight:600}
.tab.on{background:var(--teal);color:#fff;border-color:var(--teal);font-weight:700}
.row{display:flex;align-items:center;gap:13px;background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 16px;margin-bottom:9px;text-decoration:none;color:inherit;transition:.13s}
.row:hover{border-color:var(--teal);box-shadow:0 2px 12px rgba(14,124,107,.08)}
.row.t1{border-color:rgba(184,121,26,.45);background:linear-gradient(100deg,#fdf8ee, var(--card) 45%)}
.rank{flex:0 0 30px;text-align:center;font-family:var(--num);font-size:16px;font-weight:800;color:var(--mut)}
.t1 .rank,.t2 .rank,.t3 .rank{color:var(--gold);font-size:18px}
.info{flex:1;min-width:0}
.ct{font-size:14.5px;font-weight:700;letter-spacing:-.01em;line-height:1.35;margin-bottom:4px}
.ct .n{color:var(--mut);font-weight:600;font-size:12.5px}
.meta{display:flex;flex-wrap:wrap;gap:5px 9px;font-size:12px;color:var(--mut);align-items:center}
.meta .org{color:var(--ink2);font-weight:600}
.catb{font-size:10.5px;color:var(--teal-d);background:var(--teal-bg);border-radius:4px;padding:1px 7px;font-weight:700}
.rt{flex:0 0 auto;text-align:right}
.rt .big{font-family:var(--num);font-size:24px;font-weight:800;letter-spacing:-.04em;color:var(--teal-d);line-height:1}
.rt .big sup{font-size:11px;color:var(--gold);font-weight:700}
.rt .lb{font-size:10px;color:var(--mut);margin-top:3px;letter-spacing:.04em}
.foot-note{font-size:12px;color:var(--mut);margin:16px 2px 0;line-height:1.6}
.foot-note b{color:var(--ink2)}
details{margin-top:10px;font-size:12px;color:var(--mut)}
summary{cursor:pointer;color:var(--teal-d);font-weight:600;font-size:12.5px}
details p{line-height:1.7;margin:8px 0 0}
.row.hid{display:none}
.more{display:block;width:100%;margin:6px 0 0;font-size:13.5px;font-weight:700;color:var(--teal-d);background:var(--teal-bg);border:1px solid var(--teal);border-radius:12px;padding:13px;cursor:pointer;font-family:inherit}
.more:hover{background:var(--teal);color:#fff}
footer{margin-top:30px;text-align:center;font-size:11px;color:var(--mut)}
@media (prefers-color-scheme:dark){:root{--paper:#14171a;--card:#1c2124;--ink:#eceef0;--ink2:#aeb7be;--mut:#78828a;--line:#2b3134;--teal:#41bda6;--teal-d:#63d3bd;--teal-bg:#12352c;--grid:#22272a;--gold:#d9a556}
.row.t1{background:linear-gradient(100deg,#2a2417,var(--card) 45%)}}
</style></head><body>
<div class="wrap">
  <div class="top"><b>내배카랭킹</b><span class="pill">고용노동부 공시 데이터</span></div>
  <header>
    <span class="kick">취업률로 줄 세운 국비지원 과정</span>
    <h1>내일배움카드로 무엇을 배우면<br><em>진짜 취업</em>될까?</h1>
    <p class="stat">전국 <b>${totalRanked}</b>개 과정 · 학원 ${all.length}곳 비교 · 평균 <b>${avgAll}%</b> · ${data.generatedAt} 기준</p>
  </header>
  <div class="tabs"><a class="tab on" href="#">전체</a>${nav.map(c => `<a class="tab" href="#">${c.name}</a>`).join('')}</div>
  ${top.map((g, i) => `<a class="row t${i + 1}${i >= VISIBLE ? ' hid' : ''}" href="#">
    <div class="rank">${i + 1}</div>
    <div class="info">
      <div class="ct">${esc(g.best.title)}${g.count > 1 ? ` <span class="n">외 ${g.count - 1}개</span>` : ''}</div>
      <div class="meta"><span class="org">${esc(g.org)}</span><span class="catb">${g.catName}</span><span>${(g.best.region || '').split(' ').slice(0, 2).join(' ')}</span></div>
    </div>
    <div class="rt"><div class="big">${g.rate}%${g.rate >= 95 ? '<sup>†</sup>' : ''}</div><div class="lb">학원 취업률</div></div>
  </a>`).join('')}
  <button class="more" onclick="document.querySelectorAll('.row.hid').forEach(e=>e.classList.remove('hid'));this.remove()">나머지 ${top.length - VISIBLE}곳 더보기</button>
  <p class="foot-note"><b>취업률은 과정이 아니라 학원 단위</b>예요 — 그 학원의 같은 직종 수료생(2024년 · 10명 이상)이 실제 취업한 비율이에요. 전체 랭킹은 학원×분야 단위로 묶어 대표 과정을 보여줍니다. <b>†</b> 95% 이상은 소규모 기관일 수 있어요.</p>
  <details><summary>산출 기준 자세히</summary><p>2024년에 종료된 과정 기준, NCS 소분류 직종별 훈련기관 평균 취업률입니다. 수료자 10명 미만이거나 신규 개설된 과정은 취업률이 공시되지 않아 순위에서 제외됩니다. 본 사이트는 공식 고용24가 아니며 공시 데이터를 재구성한 정보 서비스입니다.</p></details>
  <footer>내배카랭킹 · 데이터: 고용노동부 고용24 · 매일 자동 갱신</footer>
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, '..', 'design-index.html'), html, 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync(path.join(__dirname, '..', 'design-index.art.html'), title + '\n' + style + '\n' + body, 'utf8');
console.log(`생성: design-index.html — 학원×분야 ${all.length}곳, TOP ${top.length} 표시`);
console.log('전체 TOP 5:');
top.slice(0, 5).forEach((g, i) => console.log(` ${i + 1}. ${g.rate}% | ${g.org} [${g.catName}] | ${g.best.title.slice(0, 30)}${g.count > 1 ? ' 외 ' + (g.count - 1) : ''}`));
