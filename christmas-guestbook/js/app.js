/* 시작: 모드/방 코드 결정 후 화면 연결
   - 방 코드를 지정하지 않으면 모든 화면(미디어월·그리기)이 통합 방 'XMAS'를 쓴다 */
(function () {
  const XG = (window.XG = window.XG || {});
  if (!XG.startWall || !XG.startDraw) return;

  const DEFAULT_ROOM = 'XMAS';
  const params = new URLSearchParams(location.search);

  // ?debug=1 이면 오류를 수집해 window.__errs 에 남긴다 (검사용)
  if (params.get('debug') === '1') {
    window.__errs = [];
    window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e.type)); });
    window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + String(e.reason)); });
    const origError = console.error;
    console.error = function () {
      try { window.__errs.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); } catch (e) {}
      origError.apply(console, arguments);
    };
  }

  let mode = (params.get('mode') || '').toLowerCase();
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  if (mode !== 'wall' && mode !== 'draw') mode = narrow ? 'draw' : 'wall';

  const clean = function (v) { return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); };

  // 방 코드는 URL 값과 상관없이 항상 통합 방 'XMAS' 하나만 쓴다.
  // (예전에 복사해 둔 ?room=MERRY·?room=ABC1 링크나 QR로 들어와도 방이 갈라지지 않고 같은 미디어월로 모인다.)
  const requestedRoom = clean(XG.roomFromUrl());
  const room = DEFAULT_ROOM;
  const mergedFrom = requestedRoom && requestedRoom !== room ? requestedRoom : '';

  try {
    const u = new URL(location.href);
    u.searchParams.set('mode', mode);
    u.searchParams.set('room', room);
    history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString() + u.hash);
  } catch (e) {}

  const view = document.getElementById(mode === 'wall' ? 'view-wall' : 'view-draw');
  if (view) view.classList.add('active');

  if (mode === 'wall') {
    XG.startWall(room);
  } else {
    const note = document.getElementById('draw-room-note');
    if (note) {
      note.innerHTML = '통합 방명록 · 방 코드 <b id="draw-room">' + room + '</b> — 어디서 그려도 하나의 미디어월에 모여요'
        + (mergedFrom ? ' (' + XG.escape(mergedFrom) + ' → ' + room + ')' : '');
    }
    XG.startDraw(room);
  }
})();
