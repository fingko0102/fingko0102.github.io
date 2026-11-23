/* 시작: 모드/방 코드 결정 후 화면 연결 */
(function () {
  const XG = (window.XG = window.XG || {});
  if (!XG.startWall || !XG.startDraw) return;

  const params = new URLSearchParams(location.search);
  let mode = (params.get('mode') || '').toLowerCase();
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  if (mode !== 'wall' && mode !== 'draw') mode = narrow ? 'draw' : 'wall';

  const clean = function (v) { return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); };

  let room = clean(XG.roomFromUrl());
  if (!room) {
    if (mode === 'wall') {
      let saved = '';
      try { saved = clean(sessionStorage.getItem('fgxmas-room')); } catch (e) {}
      room = saved || XG.newRoom();
      try { sessionStorage.setItem('fgxmas-room', room); } catch (e) {}
    } else {
      room = 'DEMO';
    }
  }

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
    if (note && room === 'DEMO') {
      note.innerHTML = '체험 모드 · 방 코드 없이 그려볼 수 있어요';
    }
    XG.startDraw(room);
  }
})();
