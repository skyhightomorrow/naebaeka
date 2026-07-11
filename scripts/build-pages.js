// 정적 페이지 전체 생성: index + 분야 + 지역×분야 + 과정 상세 + sitemap
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/model');
const { SIDO_SLUG, SIDO_NAME, esc } = require('../lib/normalize');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

// .env
const env = {};
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const ORIGIN = env.SITE_ORIGIN || 'https://naebaeka.com';

const M = load();
const won = n => n == null ? '-' : n.toLocaleString('en-US') + '원';
const VISIBLE = 10;

function write(rel, html) {
  const f = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html, 'utf8');
}

function layout({ title, desc, canonical, content, jsonld, depth = 0 }) {
  const p = '../'.repeat(depth);
  return `<!doctype html><html lang="ko"><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${canonical}">
<link rel="stylesheet" href="${p}style.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head><body>
<div class="wrap">
<div class="top"><a class="brand" href="${p}index.html">내배카랭킹</a><span class="pill">고용노동부 공시 데이터</span></div>
${content}
<footer class="ft">취업률은 고용노동부 고용24 공시 기준(2024년 종료 과정 · NCS직종별 훈련기관 평균)입니다.<br>
본 사이트는 공식 고용24가 아니며, 공시 데이터를 재구성한 정보 서비스입니다 · 데이터 매일 자동 갱신<br>
<a href="${p}about.html">소개</a> · <a href="${p}privacy.html">개인정보처리방침</a> · <a href="${p}g/index.html">가이드</a></footer>
</div></body></html>`;
}

const tabs = (activeSlug, depth = 0) => {
  const p = '../'.repeat(depth);
  return `<div class="tabs"><a class="tab${activeSlug === 'all' ? ' on' : ''}" href="${p}index.html">전체</a>` +
    M.cats.filter(c => c.ranked.length >= 3 && c.slug !== 'etc').map(c =>
      `<a class="tab${activeSlug === c.slug ? ' on' : ''}" href="${p}c/${c.slug}.html">${c.name}</a>`).join('') + '</div>';
};

const footNote = (extra = '') => `<p class="foot-note"><b>취업률은 과정이 아니라 학원 단위</b>예요 — 그 학원의 같은 직종 수료생(2024년 · 10명 이상)이 실제 취업한 비율이에요. 과정을 고를 때 '취업으로 이어지는 학원'을 찾는 신호로 봐주세요.${extra} <b>†</b> 95% 이상은 소규모 기관일 수 있어요.</p>
<details class="basis"><summary>산출 기준 자세히</summary><p>2024년에 종료된 과정 기준, NCS 소분류 직종별 훈련기관 평균 취업률입니다. 수료자 10명 미만이거나 신규 개설된 과정은 취업률이 공시되지 않아 순위에서 제외됩니다. 진학자·입대자 등은 산정에서 빠집니다.</p></details>`;

const moreBtn = (hiddenCount, label) => hiddenCount > 0
  ? `<button class="more" onclick="document.querySelectorAll('.row.hid').forEach(e=>e.classList.remove('hid'));this.remove()">나머지 ${hiddenCount}${label} 더보기</button>` : '';

const detailHref = (c, depth) => '../'.repeat(depth) + 'p/' + c.courseId + '.html';

function courseRow(c, i, depth, { showCat = false } = {}) {
  return `<a class="row t${i + 1}${i >= VISIBLE ? ' hid' : ''}" href="${detailHref(c, depth)}">
<div class="rank">${i + 1}</div>
<div class="info"><div class="ct">${esc(c.title)}</div>
<div class="meta"><span class="org">${esc(c.org)}</span>${showCat ? `<span class="catb">${c.catName || ''}</span>` : ''}<span>${esc((c.region || '').split(' ').slice(0, 2).join(' '))}</span>${c.status === '모집중' ? '<span><span class="dot"></span>모집중</span>' : ''}</div></div>
<div class="rt"><div class="big">${c.emplRate}%${c.emplRate >= 95 ? '<sup>†</sup>' : ''}</div><div class="lb">학원 취업률</div></div></a>`;
}

// ---------- index ----------
{
  const top = M.overall.slice(0, 50);
  const totalRanked = M.cats.filter(c => c.slug !== 'etc').reduce((s, c) => s + c.ranked.length, 0);
  const avgAll = (M.cats.filter(c => c.slug !== 'etc' && c.avgRate).reduce((s, c) => s + c.avgRate * c.ranked.length, 0) / totalRanked).toFixed(1);
  const rows = top.map((g, i) => `<a class="row t${i + 1}${i >= VISIBLE ? ' hid' : ''}" href="p/${g.best.courseId}.html">
<div class="rank">${i + 1}</div>
<div class="info"><div class="ct">${esc(g.best.title)}${g.count > 1 ? ` <span class="n">외 ${g.count - 1}개</span>` : ''}</div>
<div class="meta"><span class="org">${esc(g.org)}</span><span class="catb">${g.catName}</span><span>${esc((g.best.region || '').split(' ').slice(0, 2).join(' '))}</span></div></div>
<div class="rt"><div class="big">${g.rate}%${g.rate >= 95 ? '<sup>†</sup>' : ''}</div><div class="lb">학원 취업률</div></div></a>`).join('\n');

  const regionLinks = M.regionCats.slice().sort((a, b) => b.ranked.length - a.ranked.length).slice(0, 24)
    .map(rc => `<a href="r/${SIDO_SLUG[rc.sido] || rc.sido}-${rc.catSlug}.html">${SIDO_NAME[SIDO_SLUG[rc.sido]] || rc.sido} ${rc.catName}</a>`).join('');

  const content = `
<header class="hero"><span class="kick">취업률로 줄 세운 국비지원 과정</span>
<h1>내일배움카드로 무엇을 배우면<br><em>진짜 취업</em>될까?</h1>
<p class="stat">전국 <b>${totalRanked}</b>개 과정 · 학원 ${M.overall.length}곳 비교 · 평균 <b>${avgAll}%</b> · ${M.generatedAt} 기준</p></header>
${tabs('all')}
${rows}
${moreBtn(top.length - VISIBLE, '곳')}
${footNote(' 전체 랭킹은 학원×분야 단위로 묶어 대표 과정을 보여줘요.')}
<div class="seclinks"><h2>지역별 취업률 순위</h2><div class="grid">${regionLinks}</div></div>`;

  write('index.html', layout({
    title: '내배카랭킹 — 내일배움카드 국비지원 과정 취업률 랭킹',
    desc: `내일배움카드로 배울 수 있는 전국 ${totalRanked}개 국비지원 과정을 고용노동부 공시 취업률로 비교합니다. 학원 광고가 아닌 실제 데이터 기반 순위.`,
    canonical: '/', content,
    jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: '국비지원 과정 취업률 랭킹', itemListElement: top.slice(0, 10).map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: `${g.org} — ${g.best.title}` })) },
  }));
}

// ---------- 분야 페이지 ----------
for (const cat of M.cats) {
  if (cat.slug === 'etc' || cat.ranked.length < 3) continue;
  const top = cat.ranked;
  const rows = top.map((c, i) => courseRow(c, i, 1)).join('\n');
  const regionLinks = M.regionCats.filter(rc => rc.catSlug === cat.slug)
    .map(rc => `<a href="../r/${SIDO_SLUG[rc.sido] || rc.sido}-${rc.catSlug}.html">${SIDO_NAME[SIDO_SLUG[rc.sido]] || rc.sido} ${cat.name} (${rc.ranked.length})</a>`).join('');
  const content = `
<header class="hero"><span class="kick">취업률로 줄 세운 국비지원 과정</span>
<h1>${cat.name}, 무엇을 배우면<br><em>진짜 취업</em>될까?</h1>
<p class="stat">과정 <b>${top.length}</b>개 비교 · 분야 평균 <b>${cat.avgRate}%</b> · ${M.generatedAt} 기준</p></header>
${tabs(cat.slug, 1)}
${rows}
${moreBtn(top.length - VISIBLE, '개 과정')}
${footNote()}
${regionLinks ? `<div class="seclinks"><h2>${cat.name} 지역별 순위</h2><div class="grid">${regionLinks}</div></div>` : ''}`;
  write(`c/${cat.slug}.html`, layout({
    title: `${cat.name} 국비지원 과정 취업률 순위 TOP ${Math.min(top.length, 50)} | 내배카랭킹`,
    desc: `내일배움카드 ${cat.name} 분야 ${cat.total}개 과정 중 취업률 공시가 있는 ${top.length}개를 순위로 비교합니다. 분야 평균 ${cat.avgRate}%.`,
    canonical: `/c/${cat.slug}.html`, content, depth: 1,
    jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: `${cat.name} 국비지원 과정 취업률 순위`, itemListElement: top.slice(0, 10).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title })) },
  }));
}

// ---------- 지역×분야 ----------
for (const rc of M.regionCats) {
  const slug = `${SIDO_SLUG[rc.sido] || rc.sido}-${rc.catSlug}`;
  const name = SIDO_NAME[SIDO_SLUG[rc.sido]] || rc.sido;
  const rows = rc.ranked.map((c, i) => courseRow(c, i, 1)).join('\n');
  const content = `
<header class="hero"><span class="kick">${name} · ${rc.catName}</span>
<h1>${name} ${rc.catName} 국비과정<br><em>취업률 순위</em></h1>
<p class="stat">과정 <b>${rc.ranked.length}</b>개 · 평균 <b>${rc.avgRate}%</b> · ${M.generatedAt} 기준</p></header>
${tabs(rc.catSlug, 1)}
${rows}
${moreBtn(rc.ranked.length - VISIBLE, '개 과정')}
${footNote()}
<a class="cta sub" href="../c/${rc.catSlug}.html">전국 ${rc.catName} 순위 보기</a>`;
  write(`r/${slug}.html`, layout({
    title: `${name} ${rc.catName} 국비지원 과정 취업률 순위 (${rc.ranked.length}개) | 내배카랭킹`,
    desc: `${name} 지역 내일배움카드 ${rc.catName} 과정 ${rc.ranked.length}개를 고용노동부 공시 취업률 순으로 비교합니다.`,
    canonical: `/r/${slug}.html`, content, depth: 1,
  }));
}

// ---------- 과정 상세 ----------
const CAT_OF = Object.fromEntries(M.cats.map(c => [c.slug, c.name]));
for (const c of M.courses) {
  const catName = CAT_OF[c.cat] || '기타';
  const org = c.org || '훈련기관';
  const others = M.orgRates.get(c.org);
  const otherList = others ? [...others.entries()].filter(([k]) => k !== catName) : [];
  const work24 = `https://www.work24.go.kr/hr/a/a/1100/trnnCrsInf.do`;
  const rateBlock = c.emplRate != null ? `
<div class="ratebox">
<div class="rline"><span class="huge">${c.emplRate}%${c.emplRate >= 95 ? '<sup>†</sup>' : ''}</span><span class="rlb">학원 취업률<br><span style="font-weight:400;color:var(--mut);font-size:11.5px">${esc(org)} · ${catName} 직종</span></span></div>
<div class="why"><h2>이 취업률, 무슨 뜻인가요?</h2>
"이 과정을 들으면 ${c.emplRate}% 취업"이라는 뜻이 <b>아닙니다</b>. 고용노동부는 취업률을 과정별이 아니라 <b>학원×직종 단위</b>로 공시합니다. 이 숫자는 ${esc(org)}이(가) 2024년에 배출한 <b>${catName} 계열 직종 수료생 전체(10명 이상)</b> 중 취업한 비율이에요.${c.emplRate >= 95 ? ' 100%에 가까운 수치는 수료 인원이 적은 소규모 기관에서 나오기 쉽습니다.' : ''}
 그래도 모든 학원이 같은 기준으로 공시되기 때문에, <b>"수료생이 실제로 취업까지 가는 학원"</b>을 고르는 신호로는 유용합니다.
${otherList.length ? `<p class="orgrates">📊 이 학원의 다른 분야 취업률: ${otherList.map(([k, v]) => `<b>${k}</b> ${v}%`).join(' · ')}</p>` : ''}
</div></div>` : `
<div class="ratebox"><div class="rline"><span class="rlb">취업률 공시 없음</span></div>
<div class="why">신규 개설 과정이거나 수료자가 10명 미만이어서 아직 취업률이 공시되지 않은 과정이에요. 나쁘다는 뜻이 아니라 <b>데이터가 없다</b>는 뜻입니다 — 학원 상담 시 이전 기수 취업 현황을 직접 물어보세요.</div></div>`;

  const content = `
<nav class="crumb"><a href="../index.html">전체</a> › <a href="../c/${c.cat}.html">${catName}</a></nav>
<div class="dhead"><h1>${esc(c.title)}</h1>
<div class="meta"><span class="org">${esc(org)}</span><span>${esc(c.region || '')}</span></div>
<div class="badges">${c.status === '모집중' ? '<span class="bdg red">모집중</span>' : ''}${c.certGrade ? `<span class="bdg">${c.certGrade}</span>` : ''}<span class="bdg gray">${catName}</span>${c.remote ? '<span class="bdg gray">원격</span>' : ''}</div></div>
${rateBlock}
<div class="facts">
<div class="fact"><div class="k">개강</div><div class="v">${c.startDate || '-'}</div></div>
<div class="fact"><div class="k">종강</div><div class="v">${c.endDate || '-'}</div></div>
<div class="fact"><div class="k">훈련시간</div><div class="v">${esc(c.hours || '-')}</div></div>
<div class="fact"><div class="k">수강료 (지원 전)</div><div class="v">${won(c.costWon)}</div></div>
</div>
<p class="foot-note">수강료는 정부지원 전 금액이에요. 내일배움카드를 쓰면 훈련 유형과 개인 조건에 따라 45~100%까지 지원돼 실제 부담은 훨씬 적습니다. 정확한 자부담금·수강신청은 고용24에서 확인하세요.</p>
<a class="cta" href="${work24}" target="_blank" rel="noopener">고용24에서 이 과정 검색하기</a>
<a class="cta sub" href="../c/${c.cat}.html">${catName} 취업률 순위 전체 보기</a>`;

  write(`p/${c.courseId}.html`, layout({
    title: `${c.title} — ${org} 취업률·수강료 | 내배카랭킹`,
    desc: `${org}의 ${c.title} 과정 정보. ${c.emplRate != null ? `학원 취업률 ${c.emplRate}%, ` : ''}수강료 ${won(c.costWon)}, ${c.startDate || ''} 개강. 내일배움카드 사용 가능.`,
    canonical: `/p/${c.courseId}.html`, content, depth: 1,
    jsonld: { '@context': 'https://schema.org', '@type': 'Course', name: c.title, provider: { '@type': 'Organization', name: org }, ...(c.costWon != null ? { offers: { '@type': 'Offer', price: c.costWon, priceCurrency: 'KRW' } } : {}) },
  }));
}

// ---------- 가이드 (예약발행: date <= 오늘 KST, BUILD_DATE로 시뮬레이션 가능) ----------
const { guides } = require('../lib/guides');
const TODAY = process.env.BUILD_DATE || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const pubGuides = guides(M).filter(g => g.date <= TODAY).sort((a, b) => b.date < a.date ? -1 : 1);
for (const g of pubGuides) {
  const content = `
<nav class="crumb"><a href="../index.html">홈</a> › <a href="index.html">가이드</a></nav>
<article class="art"><h1>${esc(g.title)}</h1><p class="date">${g.date} · 내배카랭킹</p>
${g.body}
</article>
<a class="cta sub" href="../index.html">전체 취업률 랭킹 보기</a>`;
  write(`g/${g.slug}.html`, layout({
    title: `${g.title} | 내배카랭킹`, desc: g.desc,
    canonical: `/g/${g.slug}.html`, content, depth: 1,
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, datePublished: g.date, author: { '@type': 'Organization', name: '내배카랭킹' } },
  }));
}
{
  const list = pubGuides.map(g => `<a href="${g.slug}.html"><div class="t">${esc(g.title)}</div><div class="d">${esc(g.desc)}</div></a>`).join('');
  write('g/index.html', layout({
    title: '국비지원·내일배움카드 가이드 | 내배카랭킹',
    desc: '내일배움카드 자격·사용처·자부담금·취업률 읽는 법 등 국비지원 훈련 가이드 모음.',
    canonical: '/g/index.html', depth: 1,
    content: `<header class="hero"><span class="kick">가이드</span><h1>국비지원, 제대로<br><em>알고 쓰는 법</em></h1></header><div class="glist">${list}</div>`,
  }));
}

// ---------- 필수 3종: 소개 · 개인정보처리방침 ----------
write('about.html', layout({
  title: '내배카랭킹 소개', desc: '내배카랭킹은 고용노동부 공시 데이터를 재구성해 국비지원 훈련과정을 취업률로 비교하는 정보 서비스입니다.',
  canonical: '/about.html',
  content: `<article class="art"><h1>내배카랭킹 소개</h1>
<p><b>내배카랭킹</b>은 내일배움카드로 수강할 수 있는 전국 국비지원 훈련과정을 <b>실제 취업률</b>로 비교하는 정보 서비스입니다.</p>
<h2>왜 만들었나</h2>
<p>국비 과정을 검색하면 학원 홍보 글이 대부분이고, 정작 판단에 필요한 "이 학원 수료생이 실제로 취업하는가"는 찾기 어렵습니다. 그 데이터는 고용노동부가 이미 공시하고 있지만 흩어져 있어 비교가 어렵습니다. 내배카랭킹은 이 공시 데이터를 매일 수집해 분야별·지역별 순위로 재구성합니다.</p>
<h2>데이터 원칙</h2>
<ul>
<li>모든 취업률은 고용노동부 고용24 공시 수치를 그대로 보여줍니다 (가공·추정하지 않음)</li>
<li>취업률은 학원×직종 단위임을 모든 페이지에 명시합니다</li>
<li>95% 이상 수치에는 소표본 가능성(†)을 표기합니다</li>
<li>특정 학원과 제휴·광고 관계가 없습니다</li>
</ul>
<h2>고지</h2>
<p>본 사이트는 고용노동부·고용24와 무관한 비공식 정보 서비스입니다. 수강 신청·자부담금 확인 등 공식 절차는 고용24(work24.go.kr)에서 진행하세요.</p>
<h2>문의</h2>
<p>skyhightomorrow@gmail.com</p></article>`,
}));
write('privacy.html', layout({
  title: '개인정보처리방침 | 내배카랭킹', desc: '내배카랭킹 개인정보처리방침 및 쿠키 사용 안내.',
  canonical: '/privacy.html',
  content: `<article class="art"><h1>개인정보처리방침</h1>
<p>내배카랭킹(이하 "사이트")은 별도의 회원가입 없이 이용하는 정보 서비스로, 이용자의 개인정보를 직접 수집·저장하지 않습니다.</p>
<h2>쿠키 및 광고</h2>
<p>사이트는 Google 애드센스 광고를 게재할 수 있습니다. Google을 포함한 제3자 광고 사업자는 쿠키를 사용해 이용자의 이전 방문 기록을 바탕으로 광고를 게재할 수 있습니다. Google의 광고 쿠키 사용으로 이용자에게 맞춤형 광고가 제공될 수 있으며, 이용자는 <a href="https://adssettings.google.com" rel="noopener" target="_blank">Google 광고 설정</a>에서 맞춤 광고를 해제할 수 있습니다.</p>
<h2>통계 도구</h2>
<p>서비스 개선을 위해 방문 통계 도구(예: Google Search Console, 웹 분석 도구)를 사용할 수 있으며, 이 과정에서 쿠키가 사용될 수 있습니다. 수집되는 정보는 개인을 식별하지 않는 통계 정보입니다.</p>
<h2>문의</h2>
<p>개인정보 관련 문의: skyhightomorrow@gmail.com</p>
<p class="small">시행일: 2026-07-12</p></article>`,
}));

// ---------- style + sitemap ----------
fs.copyFileSync(path.join(ROOT, 'assets', 'style.css'), path.join(PUB, 'style.css'));
{
  const urls = ['/', '/about.html', '/g/index.html'];
  for (const g of pubGuides) urls.push(`/g/${g.slug}.html`);
  for (const c of M.cats) if (c.slug !== 'etc' && c.ranked.length >= 3) urls.push(`/c/${c.slug}.html`);
  for (const rc of M.regionCats) urls.push(`/r/${SIDO_SLUG[rc.sido] || rc.sido}-${rc.catSlug}.html`);
  for (const c of M.courses) if (c.emplRate != null) urls.push(`/p/${c.courseId}.html`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `<url><loc>${ORIGIN}${u}</loc><lastmod>${M.generatedAt}</lastmod></url>`).join('\n') + '\n</urlset>';
  write('sitemap.xml', xml);
  console.log(`sitemap: ${urls.length} URLs`);
}

console.log(`빌드 완료 — index 1, 분야 ${M.cats.filter(c => c.slug !== 'etc' && c.ranked.length >= 3).length}, 지역×분야 ${M.regionCats.length}, 상세 ${M.courses.length}`);
