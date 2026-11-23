/* 연결 계층: PeerJS(WebRTC) + BroadcastChannel + localStorage
   - 미디어월(wall)이 Host, 휴대폰(draw)이 Guest
   - 서버 없이 GitHub Pages에서 동작하도록 PeerJS 공개 시그널링 서버 사용 */
(function () {
  const XG = (window.XG = window.XG || {});

  const MAX_URL = 3 * 1024 * 1024;

  function cleanArt(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.url !== 'string') return null;
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(data.url)) return null;
    if (data.url.length > MAX_URL) return null;
    const urlish = data.url;
    return {
      id: String(data.id || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40),
      url: urlish,
      name: String(data.name || '').slice(0, 12),
      msg: String(data.msg || '').slice(0, 40),
      ts: Number(data.ts) || Date.now()
    };
  }

  XG.createBus = function (cfg) {
    const room = cfg.room;
    const role = cfg.role;
    const onArt = cfg.onArt || function () {};
    const onStatus = cfg.onStatus || function () {};
    const onCount = cfg.onCount || function () {};

    const HOST_ID = 'fgxmas-' + room + '-wall';
    const CHANNEL = 'fgxmas:' + room;
    const STORE_KEY = 'fgxmas:' + room + ':lastart';

    const seen = Object.create(null);
    const conns = [];           // host: 열린 연결들
    let peer = null;
    let conn = null;            // guest: 미디어월과의 연결
    let bc = null;
    let p2p = 'connecting';     // connecting | open | no-wall | offline | off
    let lastHello = 0;          // 같은 브라우저의 미디어월 존재 시각
    let count = 0;
    let retryTimer = 0;
    let helloTimer = 0;
    let tickTimer = 0;
    let destroyed = false;

    /* ---------- 공통 ---------- */
    function emitStatus() {
      if (destroyed) return;
      if (role === 'wall') {
        onStatus(p2p === 'open' ? 'ready' : 'offline', { guests: conns.length, p2p: p2p });
      } else {
        const sameBrowser = Date.now() - lastHello < 5000;
        let s;
        if (p2p === 'open') s = 'live';
        else if (sameBrowser) s = 'local';
        else if (p2p === 'no-wall') s = 'no-wall';
        else s = 'connecting';
        onStatus(s, { p2p: p2p, sameBrowser: sameBrowser });
      }
    }

    function deliver(data) {
      const art = cleanArt(data);
      if (!art) return;
      if (seen[art.id]) return;
      seen[art.id] = 1;
      onArt(art);
    }

    function setCount(n) {
      count = n;
      onCount(n);
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = function (e) { handle(e.data, 'bc'); };
      } catch (e) { bc = null; }
    }

    window.addEventListener('storage', function (e) {
      if (e.key !== STORE_KEY || !e.newValue) return;
      try { deliver(JSON.parse(e.newValue)); } catch (err) {}
    });

    function handle(data, src) {
      if (!data || typeof data !== 'object') return;
      if (data.t === 'art') { deliver(data); return; }
      if (role === 'guest') {
        if (data.t === 'wall-hello') {
          lastHello = Date.now();
          if (typeof data.count === 'number') setCount(data.count);
          emitStatus();
        } else if (data.t === 'wall-count') {
          if (typeof data.count === 'number') setCount(data.count);
        } else if (data.t === 'wall-bye') {
          lastHello = 0;
          emitStatus();
        }
      } else {
        if (data.t === 'hello') { /* 새 참여자 */ }
      }
    }

    /* ---------- PeerJS ---------- */
    const hasPeerJS = typeof window.Peer === 'function';

    function startPeer() {
      if (!hasPeerJS || destroyed) { p2p = hasPeerJS ? p2p : 'off'; emitStatus(); return; }
      try {
        peer = role === 'wall'
          ? new window.Peer(HOST_ID, { debug: 0 })
          : new window.Peer(null, { debug: 0 });
      } catch (e) {
        p2p = 'offline'; emitStatus(); return;
      }

      peer.on('open', function () {
        p2p = role === 'wall' ? 'open' : 'connecting';
        if (role === 'guest') connectHost();
        emitStatus();
      });

      peer.on('error', function (err) {
        const type = err && err.type;
        if (role === 'guest') {
          if (type === 'peer-unavailable') {
            p2p = 'no-wall';
            emitStatus();
            scheduleRetry(5000);
          } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
            p2p = 'connecting';
            emitStatus();
            scheduleRetry(6000);
          } else {
            p2p = 'offline';
            emitStatus();
            scheduleRetry(9000);
          }
        } else {
          p2p = type === 'unavailable-id' ? 'id-taken' : 'offline';
          emitStatus();
          if (type === 'unavailable-id') {
            // 같은 방 코드로 이미 열린 미디어월이 있음
            try { peer.destroy(); } catch (e) {}
            peer = null;
          }
        }
      });

      peer.on('disconnected', function () {
        if (destroyed) return;
        try { peer.reconnect(); } catch (e) {}
      });

      if (role === 'wall') {
        peer.on('connection', function (c) {
          c.on('open', function () {
            conns.push(c);
            try { c.send({ t: 'hello-ack', count: count, room: room }); } catch (e) {}
            emitStatus();
          });
          c.on('data', function (d) { handle(d, 'p2p'); });
          c.on('close', function () {
            const i = conns.indexOf(c);
            if (i >= 0) conns.splice(i, 1);
            emitStatus();
          });
          c.on('error', function () {
            const i = conns.indexOf(c);
            if (i >= 0) conns.splice(i, 1);
          });
        });
      }
    }

    function scheduleRetry(ms) {
      clearTimeout(retryTimer);
      if (destroyed) return;
      retryTimer = setTimeout(function () {
        if (destroyed) return;
        if (!peer || peer.destroyed) { startPeer(); return; }
        if (!peer.open) { try { peer.reconnect(); } catch (e) {} return; }
        if (role === 'guest' && (!conn || !conn.open)) connectHost();
      }, ms);
    }

    function connectHost() {
      if (!peer || !peer.open || destroyed) return;
      if (conn && conn.open) return;
      let c;
      try {
        c = peer.connect(HOST_ID, { reliable: true, serialization: 'binary' });
      } catch (e) { scheduleRetry(5000); return; }
      conn = c;
      c.on('open', function () {
        p2p = 'open';
        emitStatus();
        try { c.send({ t: 'hello', room: room }); } catch (e) {}
      });
      c.on('data', function (d) { handle(d, 'p2p'); });
      c.on('close', function () {
        if (conn === c) conn = null;
        if (p2p === 'open') p2p = 'connecting';
        emitStatus();
        scheduleRetry(4000);
      });
      c.on('error', function () {
        if (conn === c) conn = null;
        if (p2p === 'open') p2p = 'connecting';
        emitStatus();
        scheduleRetry(5000);
      });
    }

    /* ---------- 시작 ---------- */
    startPeer();

    tickTimer = setInterval(emitStatus, 1500);

    if (role === 'wall') {
      helloTimer = setInterval(function () {
        if (!bc) return;
        try { bc.postMessage({ t: 'wall-hello', count: count, ts: Date.now() }); } catch (e) {}
      }, 2000);
    } else {
      // 참여자가 새로 들어왔음을 알림
      try { bc && bc.postMessage({ t: 'guest-hello', ts: Date.now() }); } catch (e) {}
    }

    return {
      role: role,
      sendArt: function (payload) {
        const out = { sameBrowser: false, remote: false, stored: false };
        const msg = { t: 'art', id: payload.id, url: payload.url, name: payload.name, msg: payload.msg, ts: payload.ts };
        if (bc) {
          try { bc.postMessage(msg); out.sameBrowser = true; } catch (e) {}
        }
        try { localStorage.setItem(STORE_KEY, JSON.stringify(msg)); out.stored = true; } catch (e) {}
        if (conn && conn.open) {
          try { conn.send(msg); out.remote = true; } catch (e) {}
        }
        return out;
      },
      publishCount: function (n) {
        setCount(n);
        if (bc) { try { bc.postMessage({ t: 'wall-count', count: n }); } catch (e) {} }
        for (let i = 0; i < conns.length; i++) {
          try { conns[i].send({ t: 'wall-count', count: n }); } catch (e) {}
        }
      },
      state: function () { return { p2p: p2p, conns: conns.length, count: count, lastHello: lastHello }; },
      destroy: function () {
        destroyed = true;
        clearInterval(tickTimer);
        clearInterval(helloTimer);
        clearTimeout(retryTimer);
        if (bc) { try { bc.postMessage({ t: 'wall-bye' }); bc.close(); } catch (e) {} }
        for (let i = 0; i < conns.length; i++) { try { conns[i].close(); } catch (e) {} }
        if (conn) { try { conn.close(); } catch (e) {} }
        if (peer) { try { peer.destroy(); } catch (e) {} }
      }
    };
  };
})();
