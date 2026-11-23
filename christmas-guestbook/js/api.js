/* 서버 DB 연동 (Cloudflare Worker)
   - 배포되어 응답하면 자동으로 쓰고, 아직 미배포·오프라인이면 조용히 기존 방식만 쓴다.
   - 주소: 기본 https://christmas-guestbook.fingko.workers.dev
           ?api=https://... 로 바꿀 수 있고, ?api=off 이면 서버를 쓰지 않는다.
   - 규약:
       GET  {base}/arts?room=ROOM    → 그림 목록 ([{id,url,name,msg,ts}] 또는 {arts:[...]})
       POST {base}/arts?room=ROOM    → 그림 저장 (본문: 그림 객체 JSON  또는  {arts:[그림,…]} 여러 장)
       POST {base}/delete?room=ROOM  → { id, password } · 비밀번호가 틀리면 403 wrong_password
   - 어떤 실패도 화면에 오류로 터지지 않는다(콘솔 error 없이 null/false 반환). */
(function () {
  const XG = (window.XG = window.XG || {});

  const DEFAULT_BASE = 'https://christmas-guestbook.fingko.workers.dev';
  const TIMEOUT = 7000;       // 한 번의 요청을 기다리는 시간(ms)
  const TIMEOUT_BATCH = 12000; // 여러 장 한 번에 올릴 때 (ms)
  const MAX_BATCH = 100;       // 한 요청에 담는 최대 그림 수

  function resolveBase() {
    let raw = '';
    try { raw = new URLSearchParams(location.search).get('api') || ''; } catch (e) { raw = ''; }
    raw = String(raw).trim();
    if (!raw) return DEFAULT_BASE;
    const low = raw.toLowerCase();
    if (low === 'off' || low === '0' || low === 'false' || low === 'none' || low === 'no') return '';
    return raw.replace(/\/+$/, '');
  }

  const base = resolveBase();
  let available = false;      // 서버가 응답한 적이 있는가
  let state = 'unknown';      // unknown | online | offline
  const listeners = [];

  function notify() {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) {}
    }
  }

  function setState(next) {
    if (next === state) return;
    state = next;
    available = next === 'online';
    notify();
  }

  function endpoint(path, room) {
    return base + path + '?room=' + encodeURIComponent(room);
  }

  /* fetch 한 번: 항상 resolve(절대 reject 하지 않는다) */
  function call(method, path, room, body, timeout) {
    if (!base || typeof fetch !== 'function') return Promise.resolve(null);
    const init = {
      method: method,
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: {}
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      try { init.body = JSON.stringify(body); } catch (e) { return Promise.resolve(null); }
    }
    let ctl = null;
    if (typeof AbortController === 'function') {
      ctl = new AbortController();
      init.signal = ctl.signal;
    }
    const wait = Number(timeout) > 0 ? Number(timeout) : TIMEOUT;
    const timer = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } }, wait);

    return fetch(endpoint(path, room), init).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (text) {
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        return { status: res.status, ok: res.ok, data: data };
      }, function () {
        return { status: res.status, ok: res.ok, data: null };
      });
    }).catch(function () {
      // 네트워크 실패·시간 초과·CORS 거부 → 서버 없음으로 본다
      clearTimeout(timer);
      return null;
    });
  }

  function artsFrom(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.arts)) return data.arts;
    if (data && Array.isArray(data.items)) return data.items;
    return null;
  }

  /* 그림 하나를 서버 규약 모양으로 다듬는다 (없으면 null) */
  function cleanArt(art) {
    if (!art || typeof art !== 'object' || !art.id) return null;
    return {
      id: String(art.id || '').slice(0, 40),
      url: art.url,
      name: String(art.name || '').slice(0, 12),
      msg: String(art.msg || '').slice(0, 40),
      ts: Number(art.ts) || Date.now()
    };
  }

  /* 한 장씩 차례로 올린다 (서버가 배열을 못 받을 때만 쓰는 대비책) */
  function putOneByOne(room, list) {
    let chain = Promise.resolve(true);
    list.forEach(function (a) {
      chain = chain.then(function (ok) {
        if (!ok) return false;
        return api.putArt(room, a);
      });
    });
    return chain;
  }

  const api = {
    base: base,
    enabled: function () { return !!base; },
    state: function () { return state; },
    available: function () { return available; },
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    /* 서버에 저장된 그림 목록. 실패하면 null */
    listArts: function (room) {
      return call('GET', '/arts', room).then(function (res) {
        if (!res || !res.ok) { setState('offline'); return null; }
        const list = artsFrom(res.data);
        if (!list) { setState('offline'); return null; }
        setState('online');
        return list;
      });
    },

    /* 그림 1개 저장. 실패해도 조용히 false */
    putArt: function (room, art) {
      const body = cleanArt(art);
      if (!body) return Promise.resolve(false);
      return call('POST', '/arts', room, body).then(function (res) {
        if (!res || !res.ok) { if (!res || res.status === 404) setState('offline'); return false; }
        setState('online');
        return true;
      });
    },

    /* 그림 여러 장을 한 번의 요청({arts:[…]})으로 저장한다.
       - 한 장씩 동시에 보내면 서버가 서로를 덮어써 그림이 유실되므로, 반드시 한 번에 보낸다.
       - 반환값: 보낸 그림이 모두 저장됐으면 true. 서버가 없거나 실패하면 false */
    putArts: function (room, list) {
      const src = Array.isArray(list) ? list : (list ? [list] : []);
      const out = [];
      for (let i = 0; i < src.length && out.length < MAX_BATCH; i++) {
        const a = cleanArt(src[i]);
        if (a) out.push(a);
      }
      if (!out.length) return Promise.resolve(false);

      return call('POST', '/arts', room, { arts: out }, TIMEOUT_BATCH).then(function (res) {
        if (!res) { setState('offline'); return false; }
        if (res.ok) { setState('online'); return true; }
        // 400·415·422: 서버가 배열 형식을 모르는 예전 판 → 한 장씩 차례로(동시에 아님) 올린다
        if (res.status === 400 || res.status === 415 || res.status === 422) {
          return putOneByOne(room, out);
        }
        if (res.status === 404) setState('offline');
        else setState('online');
        return false;
      });
    },

    /* 삭제 요청: { ok:true } | { ok:false, wrongPassword:true } | { ok:false, offline:true } */
    deleteArt: function (room, id, password) {
      return call('POST', '/delete', room, { id: String(id || ''), password: String(password || '') })
        .then(function (res) {
          if (!res) { setState('offline'); return { ok: false, offline: true }; }
          if (res.status === 403) { setState('online'); return { ok: false, wrongPassword: true }; }
          const wrong = res.data && (res.data.error === 'wrong_password' || res.data.error === 'wrong-password');
          if (wrong) { setState('online'); return { ok: false, wrongPassword: true }; }
          if (res.ok) { setState('online'); return { ok: true }; }
          setState('offline');
          return { ok: false, error: res.status };
        });
    }
  };

  XG.api = api;
})();
