// 검색 페이지(/search) — 과목·학원명·동네 검색 + 시·도/시·군·구/분야 필터 + 정렬.
// 서버 없이 s/idx.json(빌드 시 생성)을 한 번 받아 브라우저에서 거른다.
// 인덱스: { rows, addrs } — 행: [courseId, 과정명, 학원명, 학원페이지ID|'', 분야slug, 시도, 시군구, 취업률, 개강일, 수강료|null, 인증등급|'', 주소번호|-1]
//          addrs[주소번호] = 도로명 주소(지도 핀용, assets/map.js)
// 행 순서 = 신뢰도 순(빌드의 trustScore) — '신뢰도순' 정렬은 원래 순서를 그대로 쓴다.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var q = $('sq'), sd = $('ssd'), gu = $('sg'), cat = $('sc'), ord = $('so');
  var out = $('sres'), cnt = $('scount'), orgBox = $('sorgs'), hint = $('shint'), mapWrap = $('smapwrap');
  var CATS = window.NB_CATS || {};
  var P = new URLSearchParams(location.search);
  var PAGE = 30;
  var rows = [], hay = [], list = [], shown = 0;
  var view = P.get('v') === 'map' ? 'map' : 'list', mapTimer = null;

  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[\s·.,()\[\]『』「」<>_\-\/+&]/g, ''); };
  // 같은 과목의 다른 표기 — 과정명이 제각각이라("컴활 2급" / "컴퓨터활용능력") 한쪽만 치면 반만 나온다.
  var SYN = [['컴활', '컴퓨터활용'], ['엑셀', 'excel'], ['포토샵', 'photoshop'], ['일러스트', 'illustrator'],
    ['파이썬', 'python'], ['자바', 'java'], ['캐드', 'cad'], ['프리미어', 'premiere'], ['유튜브', 'youtube'],
    ['인공지능', 'ai'], ['피그마', 'figma'], ['파워포인트', 'ppt'], ['정보처리', '정처기'], ['스케치업', 'sketchup']];
  var alts = function (t) {
    for (var i = 0; i < SYN.length; i++) if (SYN[i].indexOf(t) >= 0) return SYN[i];
    return [t];
  };

  function fill(sel, items, value, allLabel) {
    sel.innerHTML = '<option value="">' + allLabel + '</option>' + items.map(function (it) {
      return '<option value="' + esc(it[0]) + '"' + (it[0] === value ? ' selected' : '') + '>' + esc(it[1]) + '</option>';
    }).join('');
  }
  function countBy(fn, filt) {
    var m = {};
    rows.forEach(function (r) { if (!filt || filt(r)) { var k = fn(r); if (k) m[k] = (m[k] || 0) + 1; } });
    return m;
  }
  function fillGu() {
    var m = sd.value ? countBy(function (r) { return r[6]; }, function (r) { return r[5] === sd.value; }) : {};
    var keys = Object.keys(m).sort();
    fill(gu, keys.map(function (k) { return [k, k + ' (' + m[k] + ')']; }), keys.indexOf(P.get('g')) >= 0 ? P.get('g') : '', sd.value ? '시·군·구 전체' : '시·도를 먼저 고르세요');
    gu.disabled = !sd.value;
  }

  function run() {
    var terms = q.value.trim().split(/\s+/).map(norm).filter(Boolean);
    var s = sd.value, g = gu.value, c = cat.value;
    list = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (s && r[5] !== s) continue;
      if (g && r[6] !== g) continue;
      if (c && r[4] !== c) continue;
      var ok = true;
      for (var t = 0; t < terms.length && ok; t++) ok = alts(terms[t]).some(function (a) { return hay[i].indexOf(norm(a)) >= 0; });
      if (ok) list.push(r);
    }
    var o = ord.value;
    if (o === 'rate') list.sort(function (a, b) { return b[7] - a[7]; });
    else if (o === 'start') list.sort(function (a, b) { return (a[8] || '9') < (b[8] || '9') ? -1 : (a[8] || '9') > (b[8] || '9') ? 1 : 0; });
    else if (o === 'cost') list.sort(function (a, b) { return (a[9] == null ? 9e12 : a[9]) - (b[9] == null ? 9e12 : b[9]); });
    // Array.prototype.sort는 안정 정렬이라 동률은 신뢰도 순이 유지된다

    // 학원명이 맞으면 학원 페이지를 먼저 보여준다(유입 검색어의 상당수가 학원명)
    var orgs = {};
    if (terms.length) list.forEach(function (r) {
      if (!r[3]) return;
      var n = norm(r[2]);
      if (terms.every(function (t) { return n.indexOf(t) >= 0; })) orgs[r[3]] = orgs[r[3]] || { name: r[2], place: r[5] + ' ' + (r[6] || ''), n: 0 }, orgs[r[3]].n++;
    });
    var ok2 = Object.keys(orgs).sort(function (a, b) { return orgs[b].n - orgs[a].n; }).slice(0, 6);
    orgBox.innerHTML = ok2.map(function (id) {
      var x = orgs[id];
      return '<a class="ochip" href="o/' + id + '"><b>' + esc(x.name) + '</b><span>' + esc(x.place) + ' · 과정 ' + x.n + '개</span></a>';
    }).join('');

    var any = terms.length || s || c;
    hint.hidden = !!any;
    cnt.hidden = !any;
    cnt.innerHTML = any ? '과정 <b>' + list.length.toLocaleString() + '</b>개' + (list.length ? '' : ' — 검색어를 줄이거나 지역을 넓혀 보세요') : '';
    out.innerHTML = '';
    shown = 0;
    if (view === 'map') {
      mapWrap.hidden = false;
      // 타이핑 중엔 주소 변환을 쏟지 않게 입력이 멈춘 뒤 한 번만
      clearTimeout(mapTimer);
      var snapshot = list.slice();
      mapTimer = setTimeout(function () { if (window.NBMap) NBMap.show(snapshot, !!any); }, 450);
    } else {
      mapWrap.hidden = true;
      if (any) more();
    }
    sync();
    track(terms.join(' '), s, g, c);
  }

  function rowHtml(r, i) {
    return '<a class="row' + (i < 3 ? ' t' + (i + 1) : '') + '" href="p/' + r[0] + '"><div class="rank">' + (i + 1) + '</div>' +
      '<div class="info"><div class="ct">' + esc(r[1]) + '</div><div class="meta"><span class="org">' + esc(r[2]) + '</span>' +
      (r[10] ? '<span class="certb">' + esc(r[10]) + '</span>' : '') +
      (CATS[r[4]] ? '<span class="catb">' + esc(CATS[r[4]]) + '</span>' : '') +
      '<span>' + esc(r[5] + ' ' + (r[6] || '')) + '</span>' +
      (ord.value === 'start' && r[8] ? '<span>' + esc(r[8].slice(5).replace('-', '/')) + ' 개강</span>' : '') +
      (ord.value === 'cost' && r[9] != null ? '<span>' + r[9].toLocaleString() + '원</span>' : '') +
      '</div></div><div class="rt"><div class="big">' + r[7] + '%' + (r[7] >= 95 ? '<sup>†</sup>' : '') + '</div><div class="lb">학원 취업률</div></div></a>';
  }
  function more() {
    var html = '';
    for (var i = shown; i < Math.min(shown + PAGE, list.length); i++) html += rowHtml(list[i], i);
    shown = Math.min(shown + PAGE, list.length);
    var btn = $('smore'); if (btn) btn.remove();
    out.insertAdjacentHTML('beforeend', html + (shown < list.length ? '<button class="more" id="smore" type="button">다음 ' + Math.min(PAGE, list.length - shown) + '개 더보기 (남은 ' + (list.length - shown) + '개)</button>' : ''));
    var b = $('smore'); if (b) b.onclick = more;
  }

  function sync() {
    var u = new URLSearchParams();
    if (q.value.trim()) u.set('q', q.value.trim());
    if (sd.value) u.set('sd', sd.value);
    if (gu.value) u.set('g', gu.value);
    if (cat.value) u.set('c', cat.value);
    if (ord.value !== 'trust') u.set('o', ord.value);
    if (view === 'map') u.set('v', 'map');
    var qs = u.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  // GA4 권장 이벤트 'search' — 입력이 1.5초 멈췄을 때 1회(글자마다 보내지 않음)
  var tTimer = null, lastSent = '';
  function track(term, s, g, c) {
    clearTimeout(tTimer);
    var key = [term, s, g, c].join('|');
    if (key === '|||' || key === lastSent) return;
    tTimer = setTimeout(function () {
      lastSent = key;
      if (window.gtag) gtag('event', 'search', { search_term: term || '(필터만)', region: (s + ' ' + g).trim(), category: c });
    }, 1500);
  }

  var deb = null;
  q.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(run, 180); });
  $('sform').addEventListener('submit', function (e) { e.preventDefault(); q.blur(); run(); });
  sd.addEventListener('change', function () { P.delete('g'); fillGu(); run(); });
  [gu, cat, ord].forEach(function (el) { el.addEventListener('change', run); });
  function setView(v) {
    view = v;
    [].forEach.call(document.querySelectorAll('.seg button'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
    if (v === 'map' && window.gtag) gtag('event', 'map_open', {});
    run();
  }
  [].forEach.call(document.querySelectorAll('.seg button'), function (b) {
    b.addEventListener('click', function () { if (b.getAttribute('data-view') !== view) setView(b.getAttribute('data-view')); });
  });
  $('slocate').addEventListener('click', function () {
    if (view !== 'map') setView('map');
    if (window.NBMap) NBMap.locate();
  });

  // 내 위치의 행정구역(카카오 coord2RegionCode)을 검색 필터 값으로 옮긴다. 이미 시·도를 골라 뒀으면 건드리지 않는다.
  var SIDO_FULL = { '충청북도': '충북', '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남',
    '경상북도': '경북', '경상남도': '경남', '강원도': '강원', '강원특별자치도': '강원', '제주특별자치도': '제주', '세종특별자치시': '세종' };
  window.NBSearch = {
    applyRegion: function (d1, d2) {
      if (sd.value || !d1) return false;
      var opts = [].slice.call(sd.options).map(function (o) { return o.value; }).filter(Boolean);
      var s = SIDO_FULL[d1] || d1.slice(0, 2);
      // 고용24 데이터는 광주·전남을 한 지역으로 준다(2026-07 통합). 카카오 표기가 무엇이든 그쪽으로 맞춘다.
      if (/광주|전남|전라남/.test(d1) && opts.indexOf('광주·전남') >= 0) s = '광주·전남';
      if (opts.indexOf(s) < 0) return false;
      sd.value = s;
      P.delete('g');
      fillGu();
      var gs = [].slice.call(gu.options).map(function (o) { return o.value; }).filter(Boolean);
      gu.value = gs.indexOf(d2) >= 0 ? d2 : (gs.filter(function (v) { return d2 && (d2.indexOf(v) === 0 || v.indexOf(d2) === 0); })[0] || '');
      run();
      return true;
    },
  };

  document.querySelectorAll('[data-q]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); q.value = a.getAttribute('data-q'); run(); });
  });

  cnt.hidden = false;
  cnt.textContent = '과정 목록 불러오는 중…';
  fetch('s/idx.json?v=' + (window.NB_V || '')).then(function (r) { return r.json(); }).then(function (data) {
    rows = Array.isArray(data) ? data : data.rows;
    window.NB_ADDRS = data.addrs || [];
    [].forEach.call(document.querySelectorAll('.seg button'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === view); });
    hay = rows.map(function (r) { return norm(r[1] + r[2] + r[5] + (r[6] || '') + (CATS[r[4]] || '')); });
    q.value = P.get('q') || '';
    ord.value = P.get('o') || 'trust';
    var sm = countBy(function (r) { return r[5]; });
    fill(sd, Object.keys(sm).sort(function (a, b) { return sm[b] - sm[a]; }).map(function (k) { return [k, k + ' (' + sm[k] + ')']; }), P.get('sd') || '', '시·도 전체');
    var cm = countBy(function (r) { return r[4]; });
    fill(cat, Object.keys(CATS).filter(function (k) { return cm[k]; }).map(function (k) { return [k, CATS[k] + ' (' + cm[k] + ')']; }), P.get('c') || '', '분야 전체');
    fillGu();
    run();
    if (!q.value && !sd.value) q.focus();
  }).catch(function () {
    cnt.textContent = '과정 목록을 불러오지 못했어요. 새로고침해 주세요.';
  });
})();
