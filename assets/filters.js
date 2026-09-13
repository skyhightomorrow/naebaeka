// 목록 페이지 칩 필터 — 지역×분야(/r/)는 시·군·구, 분야(/c/)는 시·도로 좁힌다.
// 칩 바: <div class="fchips" data-key="g|s">의 <button data-v="값">, 행: <a class="row" data-g="강남구" data-s="서울">.
// 필터 중에는 「더보기」로 숨긴 행도 펼치고, 전체로 돌아가면 원래 10개 + 더보기 상태로 되돌린다.
(function () {
  var bar = document.querySelector('.fchips');
  if (!bar) return;
  var key = bar.getAttribute('data-key');
  var rows = [].slice.call(document.querySelectorAll('.row[data-' + key + ']'));
  rows.forEach(function (r) { if (r.classList.contains('hid')) r.setAttribute('data-h', '1'); });
  var link = document.querySelector('.fsearch');
  var base = link ? link.getAttribute('href') : '';

  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]');
    if (!b) return;
    var v = b.getAttribute('data-v');
    [].forEach.call(bar.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
    var more = document.querySelector('button.more'); // 더보기를 이미 눌렀으면 없음 → 숨김 복원 안 함
    var n = 0;
    rows.forEach(function (r) {
      var match = !v || r.getAttribute('data-' + key) === v;
      r.classList.toggle('fx', !match);
      if (v) r.classList.remove('hid');
      else if (more && r.getAttribute('data-h')) r.classList.add('hid');
      if (match) r.querySelector('.rank').textContent = ++n;
    });
    if (more) more.style.display = v ? 'none' : '';
    if (link) link.setAttribute('href', v ? base + '&' + (key === 'g' ? 'g' : 'sd') + '=' + encodeURIComponent(v) : base);
    if (window.gtag && v) gtag('event', 'list_filter', { filter_key: key, filter_value: v });
  });
})();
