/* 연결 계층: PeerJS(WebRTC) + BroadcastChannel + localStorage
   - 미디어월(wall)이 Host, 휴대폰(draw)과 추가 미디어월(wall-peer)이 Guest
   - Host 자리를 이미 누가 잡고 있으면(unavailable-id) 서브 미디어월로 붙는다
   - 서버 없이 GitHub Pages에서 동작하도록 PeerJS 공개 시그널링 서버 사용
   - 그림 삭제(delete)도 같은 통로로 알려 다른 열린 월에서 즉시 사라지게 한다 */
(function () {
  const XG = (window.XG = window.XG || {});

  const MAX_URL = 3 * 1024 * 1024;
  const MAX_SYNC = 100;     // 한 번에 주고받는 그림 목록 상한
  const CHUNK = 4;          // sync-arts 한 메시지에 담는 그림 수
  const CHUNK_GAP = 70;     // 청크 사이 간격(ms)
  const TICK = 2500;

  function cleanArt(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.url !== 'string') return null;
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(data.url)) return null;
    if (data.url.length > MAX_URL) return null;
    return {
      id: String(data.id || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40),
      url: data.url,
      name: String(data.name || '').slice(0, 12),
      msg: String(data.msg || '').slice(0, 40),
      ts: Number(data.ts) || Date.now()
    };
  }

  function wire(art) {
    return { t: 'art', id: art.id, url: art.url, name: art.name, msg: art.msg, ts: art.ts };
  }

  XG.createBus = function (cfg) {
    cfg = cfg || {};
    const room = String(cfg.room || 'XMAS');
    const role = cfg.role === 'guest' || cfg.role === 'draw' ? 'guest' : 'wall';
    const onArt = cfg.onArt || function () {};
    const onArtEdit = cfg.onArtEdit || onArt;
    const onDelete = cfg.onDelete || function () {};
    const onStatus = cfg.onStatus || function () {};
    const onCount = cfg.onCount || function () {};
    const getArts = typeof cfg.getArts === 'function' ? cfg.getArts : function () { return []; };

    const HOST_ID = 'fgxmas-' + room + '-wall';
    const CHANNEL = 'fgxmas:' + room;
    const ARTS_KEY = 'fgxmas:' + room + ':arts';
    const LAST_KEY = 'fgxmas:' + room + ':lastart';
    const DEL_KEY = 'fgxmas:' + room + ':deleted';
    const hasPeerJS = typeof window.Peer === 'function';

    const seen = Object.create(null);
    const seenTs = Object.create(null);   // id별로 마지막으로 받은 ts (수정본 판별)
    const seenDeleted = Object.create(null);
    const conns = [];          // Host: [{ c, kind }]
    let peer = null;
    let hostConn = null;       // Guest/서브 월: Host와의 연결
    let bc = null;
    let isHost = false;
    let hostLinked = false;
    let p2p = 'connecting';
    let lastHello = 0;
    let count = 0;
    let destroyed = false;
    let retryTimer = 0;
    let helloTimer = 0;
    let tickTimer = 0;
    let lastAttempt = 0;
    let failStreak = 0;
    let lastStatusKey = '';

    /* ---------- 공통 ---------- */
    function guests() {
      let n = 0;
      for (let i = 0; i < conns.length; i++) if (conns[i].kind === 'guest') n++;
      return n;
    }
    function walls() {
      let n = 0;
      for (let i = 0; i < conns.length; i++) if (conns[i].kind === 'wall') n++;
      return n;
    }

    function emitStatus() {
      if (destroyed) return;
      let s, info;
      if (role === 'wall') {
        if (isHost) s = 'host';
        else if (hostLinked) s = 'linked';
        else if (p2p === 'off') s = 'off';
        else s = 'connecting';
        info = { p2p: p2p, guests: guests(), walls: walls() };
      } else {
        const sameBrowser = Date.now() - lastHello < 5000;
        if (p2p === 'open') s = 'live';
        else if (sameBrowser) s = 'local';
        else if (p2p === 'no-wall') s = 'no-wall';
        else if (p2p === 'off') s = 'off';
        else s = 'connecting';
        info = { p2p: p2p, sameBrowser: sameBrowser, guests: guests(), walls: walls() };
      }
      const key = s + '|' + info.p2p + '|' + info.guests + '|' + info.walls + '|' + (info.sameBrowser ? 1 : 0);
      if (key === lastStatusKey) return;
      lastStatusKey = key;
      onStatus(s, info);
    }

    function deliver(data) {
      const art = cleanArt(data);
      if (!art) return null;
      if (seen[art.id]) {
        // 같은 id라도 ts가 더 크면 수정본으로 보고 화면을 바꾼다
        if ((art.ts || 0) > (seenTs[art.id] || 0)) {
          seenTs[art.id] = art.ts;
          if (!(XG.artStore && XG.artStore.isDeleted && XG.artStore.isDeleted(art.id))) onArtEdit(art);
        }
        return null;
      }
      seen[art.id] = 1;
      seenTs[art.id] = art.ts || 0;
      // 이미 지운 그림은 어떤 경로로 와도 되살리지 않는다
      if (seenDeleted[art.id]) return null;
      if (XG.artStore && XG.artStore.isDeleted && XG.artStore.isDeleted(art.id)) return null;
      onArt(art);
      return art;
    }

    function deliverDelete(id) {
      const key = String(id || '');
      if (!key) return false;
      if (seenDeleted[key]) return false;
      seenDeleted[key] = 1;
      onDelete(key);
      return true;
    }

    function setCount(n) {
      count = n;
      onCount(n);
    }

    function postBC(msg) {
      if (!bc) return false;
      try { bc.postMessage(msg); return true; } catch (e) { return false; }
    }

    /* ---------- 메시지 ---------- */
    function relay(art, except, type) {
      const msg = wire(art);
      if (type) msg.t = type;
      postBC(msg);
      for (let i = 0; i < conns.length; i++) {
        if (conns[i] === except) continue;
        try { conns[i].c.send(msg); } catch (e) {}
      }
    }

    function relayDelete(id, except) {
      const msg = { t: 'delete', id: String(id) };
      postBC(msg);
      for (let i = 0; i < conns.length; i++) {
        if (conns[i] === except) continue;
        try { conns[i].c.send(msg); } catch (e) {}
      }
    }

    function sendCount(c) {
      if (!c) return;
      try { c.send({ t: 'wall-count', count: count }); } catch (e) {}
    }

    function sendArts(conn, list, type) {
      if (!conn || !conn.open) return;
      let arr = (Array.isArray(list) ? list : []).slice(-MAX_SYNC);
      arr = arr.filter(function (a) { return a && typeof a.url === 'string'; });
      if (!arr.length) {
        try { conn.send({ t: type, arts: [] }); } catch (e) {}
        return;
      }
      let i = 0;
      (function step() {
        if (destroyed || !conn || !conn.open) return;
        const part = arr.slice(i, i + CHUNK);
        i += CHUNK;
        try { conn.send({ t: type, arts: part, more: i < arr.length }); } catch (e) { return; }
        if (i < arr.length) setTimeout(step, CHUNK_GAP);
      })();
    }

    function mergeIncoming(list) {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const art = deliver(list[i]);
        // Host는 새로 알게 된 그림을 다른 월·참여자에게도 중계한다
        if (art && isHost) relay(art, null);
      }
    }

    function handle(data, src, entry) {
      if (!data || typeof data !== 'object') return;
      const t = data.t;
      if (t === 'delete') {
        if (deliverDelete(data.id)) {
          if (isHost && src !== 'bc') relayDelete(data.id, entry || null);
        }
        return;
      }
      if (t === 'art') {
        const art = deliver(data);
        if (art && isHost && src !== 'bc') relay(art, entry || null);
        return;
      }
      if (t === 'art-edit') {
        // 수정본: 같은 id를 그대로 두고 내용만 바꿔 덮어쓴다
        const art = cleanArt(data);
        if (!art) return;
        if (seenDeleted[art.id]) return;
        if (XG.artStore && XG.artStore.isDeleted && XG.artStore.isDeleted(art.id)) return;
        if ((art.ts || 0) > (seenTs[art.id] || 0)) {
          seen[art.id] = 1;
          seenTs[art.id] = art.ts;
          onArtEdit(art);
        }
        if (isHost && src !== 'bc') relay(art, entry || null, 'art-edit');
        return;
      }
      if (t === 'sync-arts') { mergeIncoming(data.arts); return; }
      if (t === 'sync-request') {
        if (isHost && entry) sendArts(entry.c, getArts(), 'sync-arts');
        return;
      }
      if (t === 'hello') {
        mergeIncoming(data.arts);
        if (isHost && entry) {
          sendCount(entry.c);
          sendArts(entry.c, getArts(), 'sync-arts');
        }
        return;
      }
      if (t === 'hello-ack') {
        if (typeof data.count === 'number') setCount(data.count);
        return;
      }
      if (t === 'wall-count') {
        if (role === 'guest' && typeof data.count === 'number') setCount(data.count);
        return;
      }
      if (role === 'guest') {
        if (t === 'wall-hello') {
          lastHello = Date.now();
          if (typeof data.count === 'number') setCount(data.count);
          emitStatus();
        } else if (t === 'wall-bye') {
          lastHello = 0;
          emitStatus();
        }
      }
    }

    const onStorage = function (e) {
      if (!e || !e.key) return;
      if (e.key === DEL_KEY && e.newValue) {
        let v = null;
        try { v = JSON.parse(e.newValue); } catch (err) { return; }
        if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            const id = typeof v[i] === 'string' ? v[i] : (v[i] && v[i].id);
            if (id) deliverDelete(id);
          }
        }
        return;
      }
      if ((e.key !== ARTS_KEY && e.key !== LAST_KEY) || !e.newValue) return;
      let v = null;
      try { v = JSON.parse(e.newValue); } catch (err) { return; }
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) deliver(v[i]);
      } else if (v) {
        deliver(v);
      }
    };
    window.addEventListener('storage', onStorage);

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = function (e) { handle(e.data, 'bc', null); };
      } catch (e) { bc = null; }
    }

    /* ---------- PeerJS ---------- */
    function dropPeer() {
      if (peer) { try { peer.destroy(); } catch (e) {} }
      peer = null;
      hostConn = null;
      hostLinked = false;
      conns.length = 0;
    }

    function bumpFail() { failStreak = Math.min(failStreak + 1, 5); }
    function retryDelay() { return Math.min(2500 * (failStreak || 1), 12000); }

    function onHostConnection(c) {
      const kind = c.metadata && c.metadata.wallPeer ? 'wall' : 'guest';
      const entry = { c: c, kind: kind };
      c.on('open', function () {
        if (destroyed) { try { c.close(); } catch (e) {} return; }
        conns.push(entry);
        sendCount(c);
        emitStatus();
      });
      c.on('data', function (d) { handle(d, 'p2p', entry); });
      c.on('close', function () {
        const i = conns.indexOf(entry);
        if (i >= 0) conns.splice(i, 1);
        emitStatus();
      });
      c.on('error', function () {
        const i = conns.indexOf(entry);
        if (i >= 0) conns.splice(i, 1);
        emitStatus();
      });
    }

    /* Host 자리 획득 시도 → 이미 있으면 서브 월로 참여 */
    function startHostPeer() {
      if (!hasPeerJS || destroyed) { p2p = 'off'; emitStatus(); return; }
      dropPeer();
      try {
        peer = new window.Peer(HOST_ID, { debug: 0 });
      } catch (e) { p2p = 'off'; emitStatus(); return; }
      p2p = 'connecting';
      peer.on('open', function () {
        isHost = true;
        hostLinked = false;
        p2p = 'host';
        failStreak = 0;
        emitStatus();
      });
      peer.on('error', function (err) {
        const type = err && err.type;
        if (type === 'unavailable-id') {
          // 다른 미디어월이 이미 Host → 서브 월로 붙는다
          isHost = false;
          startSubPeer();
          return;
        }
        isHost = false;
        p2p = type === 'peer-unavailable' ? 'no-host' : 'off';
        emitStatus();
        bumpFail();
        scheduleRetry();
      });
      peer.on('disconnected', function () {
        if (!destroyed && peer) { try { peer.reconnect(); } catch (e) {} }
      });
      peer.on('connection', onHostConnection);
    }

    /* 서브 미디어월: 랜덤 Peer ID로 Host에 접속 */
    function startSubPeer() {
      if (!hasPeerJS || destroyed) { p2p = 'off'; emitStatus(); return; }
      dropPeer();
      try {
        peer = new window.Peer(null, { debug: 0 });
      } catch (e) { p2p = 'off'; emitStatus(); return; }
      p2p = 'connecting';
      peer.on('open', function () {
        if (isHost) return;
        p2p = 'connecting';
        connectHost();
        emitStatus();
      });
      peer.on('error', function (err) {
        const type = err && err.type;
        hostLinked = false;
        if (hostConn) { try { hostConn.close(); } catch (e) {} hostConn = null; }
        p2p = type === 'peer-unavailable' ? 'no-host' : 'off';
        emitStatus();
        bumpFail();
        scheduleRetry();
      });
      peer.on('disconnected', function () {
        if (!destroyed && peer) { try { peer.reconnect(); } catch (e) {} }
      });
    }

    /* 참여자(휴대폰) 연결 */
    function startGuestPeer() {
      if (!hasPeerJS || destroyed) { p2p = 'off'; emitStatus(); return; }
      dropPeer();
      try {
        peer = new window.Peer(null, { debug: 0 });
      } catch (e) { p2p = 'off'; emitStatus(); return; }
      p2p = 'connecting';
      peer.on('open', function () {
        if (destroyed) return;
        if (!(hostConn && hostConn.open)) connectHost();
        emitStatus();
      });
      peer.on('error', function (err) {
        const type = err && err.type;
        p2p = type === 'peer-unavailable' ? 'no-wall' : 'connecting';
        emitStatus();
        bumpFail();
        scheduleRetry();
      });
      peer.on('disconnected', function () {
        if (!destroyed && peer) { try { peer.reconnect(); } catch (e) {} }
      });
    }

    function connectHost() {
      if (!peer || !peer.open || destroyed) return;
      if (hostConn && hostConn.open) return;
      let c;
      try {
        c = peer.connect(HOST_ID, {
          reliable: true,
          serialization: 'binary',
          metadata: { wallPeer: role === 'wall' }
        });
      } catch (e) { bumpFail(); scheduleRetry(); return; }
      hostConn = c;
      c.on('open', function () {
        if (hostConn !== c) return;
        hostLinked = true;
        p2p = 'open';
        failStreak = 0;
        emitStatus();
        let list = [];
        try { list = getArts().slice(-MAX_SYNC); } catch (e) { list = []; }
        try {
          c.send({ t: 'hello', role: role === 'wall' ? 'wall-peer' : 'guest', room: room, arts: list });
        } catch (e) {}
      });
      c.on('data', function (d) { handle(d, 'p2p', null); });
      c.on('close', function () {
        if (hostConn === c) { hostConn = null; hostLinked = false; }
        p2p = 'connecting';
        emitStatus();
        bumpFail();
        scheduleRetry();
      });
      c.on('error', function () {
        if (hostConn === c) { hostConn = null; hostLinked = false; }
        p2p = 'connecting';
        emitStatus();
        scheduleRetry();
      });
    }

    function scheduleRetry(ms) {
      clearTimeout(retryTimer);
      if (destroyed) return;
      retryTimer = setTimeout(function () {
        if (destroyed) return;
        if (role === 'wall') wallTick(true);
        else guestTick();
      }, ms || retryDelay());
    }

    function wallTick(force) {
      if (destroyed) return;
      if (!hasPeerJS) { p2p = 'off'; emitStatus(); return; }
      if (isHost) return;                                        // Host로 동작 중
      if (hostLinked && hostConn && hostConn.open) return;       // 서브 월로 연결됨
      const now = Date.now();
      if (!force && now - lastAttempt < retryDelay()) return;
      lastAttempt = now;
      bumpFail();
      if (peer && peer.open && hostConn) {
        // Host 연결만 끊긴 경우: 다시 시도
        connectHost();
        return;
      }
      // Host가 사라졌을 수 있으니 자리 인계를 시도한다
      startHostPeer();
    }

    function guestTick() {
      if (destroyed) return;
      if (!hasPeerJS) { p2p = 'off'; emitStatus(); return; }
      if (hostConn && hostConn.open) { p2p = 'open'; emitStatus(); return; }
      if (!peer || peer.destroyed) { startGuestPeer(); return; }
      if (peer.open) { connectHost(); return; }
      try { peer.reconnect(); } catch (e) {}
    }

    /* ---------- 시작 ---------- */
    if (role === 'wall') startHostPeer();
    else startGuestPeer();

    tickTimer = setInterval(function () {
      if (destroyed) return;
      if (role === 'wall') wallTick(false);
      else guestTick();
      emitStatus();
    }, TICK);

    if (role === 'wall') {
      helloTimer = setInterval(function () {
        postBC({ t: 'wall-hello', count: count, host: isHost, ts: Date.now() });
      }, 2000);
    }

    emitStatus();

    return {
      role: role,
      isHost: function () { return isHost; },
      sendArt: function (payload) {
        const out = { sameBrowser: false, remote: false, stored: false };
        const art = cleanArt(payload);
        if (!art) return out;
        deliver(art);
        if (isHost) {
          relay(art, null);
          out.sameBrowser = !!bc;
          out.remote = conns.length > 0;
        } else {
          if (postBC(wire(art))) out.sameBrowser = true;
          if (hostConn && hostConn.open) {
            try { hostConn.send(wire(art)); out.remote = true; } catch (e) {}
          }
        }
        if (XG.artStore) {
          XG.artStore.writeLast(room, art);
          const r = XG.artStore.remember(room, art);
          out.stored = !!(r && r.ok);
        }
        // 서버 DB가 응답하는 상태면 함께 저장한다 (실패해도 조용히 넘어간다)
        if (XG.api && XG.api.enabled()) {
          try { XG.api.putArt(room, art); } catch (e) {}
        }
        return out;
      },
      sendDelete: function (id) {
        const key = String(id || '');
        if (!key) return false;
        seenDeleted[key] = 1;
        if (isHost) relayDelete(key, null);
        else {
          postBC({ t: 'delete', id: key });
          if (hostConn && hostConn.open) {
            try { hostConn.send({ t: 'delete', id: key }); } catch (e) {}
          }
        }
        return true;
      },
      sendEdit: function (payload) {
        const art = cleanArt(payload);
        if (!art) return false;
        seen[art.id] = 1;
        seenTs[art.id] = Math.max(seenTs[art.id] || 0, art.ts || 0);
        const msg = wire(art);
        msg.t = 'art-edit';
        if (isHost) {
          relay(art, null, 'art-edit');
        } else {
          postBC(msg);
          if (hostConn && hostConn.open) {
            try { hostConn.send(msg); } catch (e) {}
          }
        }
        return true;
      },
      publishCount: function (n) {
        setCount(n);
        postBC({ t: 'wall-count', count: n });
        for (let i = 0; i < conns.length; i++) {
          try { conns[i].c.send({ t: 'wall-count', count: n }); } catch (e) {}
        }
      },
      requestSync: function () {
        if (isHost) return;
        if (hostConn && hostConn.open) {
          try { hostConn.send({ t: 'sync-request' }); } catch (e) {}
        }
      },
      state: function () {
        return {
          p2p: p2p,
          isHost: isHost,
          linked: hostLinked,
          conns: conns.length,
          guests: guests(),
          walls: walls(),
          count: count,
          lastHello: lastHello
        };
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        clearInterval(tickTimer);
        clearInterval(helloTimer);
        clearTimeout(retryTimer);
        window.removeEventListener('storage', onStorage);
        if (bc) { try { bc.postMessage({ t: 'wall-bye' }); bc.close(); } catch (e) {} bc = null; }
        for (let i = 0; i < conns.length; i++) { try { conns[i].c.close(); } catch (e) {} }
        conns.length = 0;
        if (hostConn) { try { hostConn.close(); } catch (e) {} hostConn = null; }
        if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      }
    };
  };
})();
