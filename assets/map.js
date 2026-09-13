// 검색 결과 지도(/search?v=map) — 걸러진 과정의 학원 주소를 카카오맵에 핀으로 찍는다.
// ⛔ 좌표는 저장하지 않는다. 국토부 지오코더·카카오 로컬 API 모두 결과 저장이 금지라(2026-09-13 확인),
//    지도를 볼 때마다 브라우저에서 실시간 변환하고, 같은 화면 안에서만 메모리에 들고 있는다.
// 한 번에 CAP곳까지만 변환한다 — 핀 1개 = 주소 변환 1회(무료 일 10만 건). 실측: 엑셀+서울 37곳, 엑셀 전국 263곳.
// SDK 로더·모바일 relayout·지도 영역→목록 동기화는 boardville KakaoMap.tsx / EventsClient.tsx 로직을 옮겨 왔다.
(function () {
  var KEY = window.NB_KAKAO;
  var CAP = 100, POOL = 5;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var sdk = null, map = null, clusterer = null, geocoder = null;
  var cache = {};            // 주소 → {lat,lng}|null (이 페이지 메모리에만)
  var markers = [], groups = [], pop = null, meOv = null, me = null, token = 0, idleTimer = null, lastStat = '';

  function loadSdk() {
    if (sdk) return sdk;
    sdk = new Promise(function (resolve, reject) {
      // 카카오톡 인앱 브라우저는 window.kakao(공유 SDK)를 미리 넣어 두기도 해서 maps.Map까지 확인한다
      if (window.kakao && kakao.maps && kakao.maps.Map && kakao.maps.services) return resolve();
      var s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + KEY + '&libraries=services,clusterer&autoload=false';
      s.onload = function () { try { kakao.maps.load(resolve); } catch (e) { reject(e); } };
      s.onerror = reject;
      document.head.appendChild(s);
      setTimeout(function () { reject(new Error('timeout')); }, 15000);
    });
    sdk.catch(function () { sdk = null; }); // 실패하면 다음에 다시 시도
    return sdk;
  }

  var ll = function (p) { return new kakao.maps.LatLng(p.lat, p.lng); };

  function ensureMap() {
    return loadSdk().then(function () {
      if (!map) {
        map = new kakao.maps.Map($('smap'), { center: new kakao.maps.LatLng(36.4, 127.9), level: 13 });
        clusterer = new kakao.maps.MarkerClusterer({ map: map, averageCenter: true, minLevel: 7 });
        geocoder = new kakao.maps.services.Geocoder();
        kakao.maps.event.addListener(map, 'idle', function () { clearTimeout(idleTimer); idleTimer = setTimeout(renderCards, 120); });
      }
      // 숨겨져 있다가 보이게 된 컨테이너는 크기를 다시 재야 한다(모바일은 레이아웃 확정이 늦어 한 번 더)
      map.relayout();
      setTimeout(function () { map.relayout(); }, 300);
    });
  }

  function stat(html) { lastStat = html; $('mstat').innerHTML = html; }

  function clearMarkers() {
    if (clusterer) clusterer.clear();
    markers = [];
    if (pop) { pop.setMap(null); pop = null; }
  }

  function geocode(addr) {
    if (Object.prototype.hasOwnProperty.call(cache, addr)) return Promise.resolve(cache[addr]);
    return new Promise(function (resolve) {
      geocoder.addressSearch(addr, function (res, status) {
        var v = status === kakao.maps.services.Status.OK && res[0] ? { lat: +res[0].y, lng: +res[0].x } : null;
        cache[addr] = v;
        resolve(v);
      });
    });
  }

  function distance(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  var fmtDist = function (m) { return m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km'; };
  var hrefOf = function (g) { return g.oid ? 'o/' + g.oid : 'p/' + g.first; };

  function openPop(g) {
    if (!g.pos) return;
    if (pop) pop.setMap(null);
    var el = document.createElement('div');
    el.className = 'mpop';
    el.innerHTML = '<button type="button" class="mx" aria-label="닫기">×</button><b>' + esc(g.name) + '</b>' +
      '<span>' + esc(g.place) + ' · 과정 ' + g.n + '개 · 최고 ' + g.best + '%' + (me ? ' · ' + fmtDist(distance(me, g.pos)) : '') + '</span>' +
      '<div class="ml"><a href="' + hrefOf(g) + '">' + (g.oid ? '학원 페이지' : '과정 보기') + '</a>' +
      '<a href="https://map.kakao.com/link/map/' + encodeURIComponent(g.name) + ',' + g.pos.lat + ',' + g.pos.lng + '" target="_blank" rel="noopener" data-ev="map_click">카카오맵</a></div>';
    el.querySelector('.mx').onclick = function () { if (pop) { pop.setMap(null); pop = null; } };
    pop = new kakao.maps.CustomOverlay({ position: ll(g.pos), content: el, yAnchor: 1.32, zIndex: 5, clickable: true });
    pop.setMap(map);
    // 핀을 정중앙에 두면 팝업(핀 위쪽)이 모바일 지도 높이에서 잘린다 → 핀이 중앙보다 90px 아래에 오게 이동
    var proj = map.getProjection();
    var pt = proj.pointFromCoords(ll(g.pos));
    map.panTo(proj.coordsFromPoint(new kakao.maps.Point(pt.x, pt.y - 90)));
  }

  function renderCards() {
    var box = $('scards');
    if (!map || !groups.length) { box.innerHTML = ''; return; }
    var b = map.getBounds();
    var vis = groups.filter(function (g) { return g.pos && b.contain(ll(g.pos)); });
    if (me) {
      vis.forEach(function (g) { g.dist = distance(me, g.pos); });
      vis.sort(function (x, y) { return x.dist - y.dist; });
    }
    var html = '<p class="mstat sub">지도 화면 안 학원 <b>' + vis.length + '</b>곳' + (me ? ' · 내 위치에서 가까운 순' : '') + (vis.length > 60 ? ' · 60곳까지 표시' : '') + '</p>';
    html += vis.slice(0, 60).map(function (g) {
      return '<div class="mcard"><a class="mmain" href="' + hrefOf(g) + '"><div class="info"><div class="ct">' + esc(g.name) + '</div>' +
        '<div class="meta"><span>' + esc(g.place) + '</span><span>과정 ' + g.n + '개</span>' + (me ? '<span class="dist">' + fmtDist(g.dist) + '</span>' : '') + '</div></div>' +
        '<div class="rt"><div class="big">' + g.best + '%</div><div class="lb">최고 취업률</div></div></a>' +
        '<button type="button" class="mpin" data-i="' + groups.indexOf(g) + '" aria-label="지도에서 위치 보기">📍</button></div>';
    }).join('');
    box.innerHTML = html;
    [].forEach.call(box.querySelectorAll('.mpin'), function (btn) {
      btn.onclick = function () { openPop(groups[+btn.getAttribute('data-i')]); $('smap').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    });
  }

  function drawMe() {
    if (meOv) meOv.setMap(null);
    var el = document.createElement('div');
    el.className = 'medot';
    el.title = '내 위치';
    meOv = new kakao.maps.CustomOverlay({ position: ll(me), content: el, yAnchor: 0.5, zIndex: 4 });
    meOv.setMap(map);
  }

  function fit() {
    var placed = groups.filter(function (g) { return g.pos; });
    if (!placed.length) { if (me) { map.setCenter(ll(me)); map.setLevel(7); } return; }
    var bounds = new kakao.maps.LatLngBounds();
    if (me) {
      // 내 위치가 있으면 나와 가장 가까운 10곳이 들어오게 — 전체에 맞추면 동네가 안 보인다
      placed.slice().sort(function (a, b) { return distance(me, a.pos) - distance(me, b.pos); }).slice(0, 10)
        .forEach(function (g) { bounds.extend(ll(g.pos)); });
      bounds.extend(ll(me));
    } else placed.forEach(function (g) { bounds.extend(ll(g.pos)); });
    map.setBounds(bounds, 40, 30, 40, 30);
  }

  window.NBMap = {
    // list = 검색 인덱스 행(현재 필터·정렬 결과), any = 검색어나 필터가 하나라도 있는지
    show: function (list, any) {
      var my = ++token;
      var addrs = window.NB_ADDRS || [];
      ensureMap().then(function () {
        if (my !== token) return;
        clearMarkers();
        groups = [];
        if (!any) {
          renderCards();
          stat('검색어나 지역을 고르거나 <b>📍 내 위치</b>를 누르면 지도에 학원이 표시돼요.');
          if (me) { map.setCenter(ll(me)); map.setLevel(7); }
          return;
        }
        // 과정 → 학원(주소+학원명) 단위로 묶는다. 순서는 현재 목록 정렬을 따른다.
        var by = {}, noAddr = {};
        list.forEach(function (r) {
          if (r[11] < 0 || r[11] == null) { noAddr[r[2] + '|' + r[5] + r[6]] = 1; return; }
          var key = r[11] + '|' + r[2];
          var g = by[key];
          if (!g) { g = by[key] = { name: r[2], oid: r[3], place: r[5] + ' ' + (r[6] || ''), addr: addrs[r[11]], n: 0, best: r[7], first: r[0] }; groups.push(g); }
          g.n++;
          if (r[7] > g.best) g.best = r[7];
        });
        var total = groups.length, capped = total > CAP;
        groups = groups.slice(0, CAP);
        var noAddrN = Object.keys(noAddr).length, done = 0, fail = 0, next = 0;
        stat('학원 위치 찾는 중… 0/' + groups.length);

        function worker() {
          if (my !== token || next >= groups.length) return Promise.resolve();
          var g = groups[next++];
          return geocode(g.addr).then(function (p) {
            if (my !== token) return;
            done++;
            if (p) {
              g.pos = p;
              var m = new kakao.maps.Marker({ position: ll(p), title: g.name });
              kakao.maps.event.addListener(m, 'click', function () { openPop(g); });
              markers.push(m);
              clusterer.addMarker(m);
            } else fail++;
            if (done % 10 === 0) stat('학원 위치 찾는 중… ' + done + '/' + groups.length);
            return worker();
          });
        }
        var ws = [];
        for (var i = 0; i < POOL; i++) ws.push(worker());
        Promise.all(ws).then(function () {
          if (my !== token) return;
          var placed = groups.length - fail;
          stat('지도에 학원 <b>' + placed + '</b>곳' +
            (capped ? ' · 결과가 많아 <b>상위 ' + CAP + '곳</b>만 표시했어요(전체 ' + total + '곳). 시·도나 시·군·구를 고르면 전부 볼 수 있어요.' : '') +
            (noAddrN ? ' · 주소 미확인 ' + noAddrN + '곳 제외' : '') +
            (fail ? ' · 위치를 못 찾은 ' + fail + '곳 제외' : ''));
          fit();
          renderCards();
          if (window.gtag) gtag('event', 'map_view', { pins: placed, capped: capped ? 1 : 0, with_location: me ? 1 : 0 });
        });
      }).catch(function () {
        stat('지도를 불러오지 못했어요. 새로고침하거나 목록으로 보세요.');
      });
    },

    // 내 위치 → 행정구역 조회(실시간 1회) → 검색 필터의 시·도/시·군·구를 자동 선택 → 지도 갱신
    locate: function () {
      if (!navigator.geolocation) { stat('이 브라우저는 위치 기능을 지원하지 않아요. 시·군·구를 직접 골라 주세요.'); return; }
      stat('내 위치 확인 중…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        ensureMap().then(function () {
          drawMe();
          geocoder.coord2RegionCode(me.lng, me.lat, function (res, status) {
            var h = status === kakao.maps.services.Status.OK && res.length ? (res.filter(function (x) { return x.region_type === 'H'; })[0] || res[0]) : null;
            var applied = h && window.NBSearch && NBSearch.applyRegion(h.region_1depth_name, h.region_2depth_name);
            if (window.gtag) gtag('event', 'locate_me', { result: 'ok', region: h ? h.region_1depth_name + ' ' + h.region_2depth_name : '' });
            // 필터가 바뀌면 검색이 다시 돌며 show()가 거리순으로 그린다. 이미 지역을 골라 둔 경우엔 지금 결과로 다시 맞춘다.
            if (!applied) {
              if (groups.length) { fit(); renderCards(); stat(lastStat); }
              else { map.setCenter(ll(me)); map.setLevel(7); }
            }
          });
        }).catch(function () { stat('지도를 불러오지 못했어요. 새로고침해 주세요.'); });
      }, function (err) {
        stat(err.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나 시·군·구를 직접 골라 주세요.' : '위치를 가져오지 못했어요. 시·군·구를 직접 골라 주세요.');
        if (window.gtag) gtag('event', 'locate_me', { result: err.code === 1 ? 'denied' : 'error' });
      }, { timeout: 8000, maximumAge: 600000 });
    },
  };
})();
