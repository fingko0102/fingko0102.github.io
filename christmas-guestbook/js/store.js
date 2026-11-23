/* 저장 계층: 모든 방(fgxmas:*:arts / fgxmas:*:lastart)의 그림을 하나로 모아 읽고,
   기존 키는 절대 지우지 않은 채 통합 키에 병합 저장한다. */
(function () {
  const XG = (window.XG = window.XG || {});

  const MAX_ARTS = 100;

  function clean(a) {
    if (!a || typeof a !== 'object') return null;
    if (typeof a.url !== 'string' || a.url.indexOf('data:image/') !== 0) return null;
    const id = String(a.id || '').slice(0, 40);
    if (!id) return null;
    return {
      id: id,
      url: a.url,
      name: String(a.name || '').slice(0, 12),
      msg: String(a.msg || '').slice(0, 40),
      ts: Number(a.ts) || 0
    };
  }

  function byTime(a, b) {
    const d = (a.ts || 0) - (b.ts || 0);
    if (d) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function mergeInto(map, list) {
    if (!Array.isArray(list)) list = [list];
    for (let i = 0; i < list.length; i++) {
      const a = clean(list[i]);
      if (!a) continue;
      const prev = map[a.id];
      if (!prev || (a.ts || 0) >= (prev.ts || 0)) map[a.id] = a;
    }
  }

  function parse(raw) {
    if (!raw) return [];
    let v;
    try { v = JSON.parse(raw); } catch (e) { return []; }
    return Array.isArray(v) ? v : [v];
  }

  // fgxmas:<방>:arts · fgxmas:<방>:lastart 키만 골라낸다
  function artKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('fgxmas:') !== 0) continue;
        if (k.slice(-5) === ':arts' || k.slice(-8) === ':lastart') out.push(k);
      }
    } catch (e) {}
    return out;
  }

  function readRaw(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  /* 저장된 모든 방의 그림을 시간순으로 합쳐 돌려준다 (지우지 않는다) */
  function loadAll() {
    const map = Object.create(null);
    const ks = artKeys();
    for (let i = 0; i < ks.length; i++) mergeInto(map, parse(readRaw(ks[i])));
    const all = Object.keys(map).map(function (k) { return map[k]; }).sort(byTime);
    return all.slice(-MAX_ARTS);
  }

  const CAPS = [100, 80, 60, 40, 20, 10, 5, 1];

  /* 기존 값을 먼저 읽어 병합한 뒤 저장 → 다른 탭·다른 방의 그림을 덮어쓰지 않는다 */
  function writeArts(k, list) {
    const map = Object.create(null);
    mergeInto(map, parse(readRaw(k)));
    mergeInto(map, list);
    const all = Object.keys(map).map(function (x) { return map[x]; }).sort(byTime);
    for (let i = 0; i < CAPS.length; i++) {
      const part = all.slice(-Math.min(CAPS[i], MAX_ARTS));
      try {
        localStorage.setItem(k, JSON.stringify(part));
        return { ok: true, count: part.length };
      } catch (e) { /* 용량 초과 → 더 적게 저장 시도 */ }
    }
    return { ok: false, count: 0 };
  }

  XG.artStore = {
    MAX: MAX_ARTS,
    clean: clean,
    sort: function (list) { return list.slice().sort(byTime); },
    loadAll: loadAll,
    keys: artKeys,
    mergeWrite: function (room, list) { return writeArts('fgxmas:' + room + ':arts', list); },
    writeLast: function (room, art) {
      const a = clean(art);
      if (!a) return false;
      try {
        localStorage.setItem('fgxmas:' + room + ':lastart', JSON.stringify({
          t: 'art', id: a.id, url: a.url, name: a.name, msg: a.msg, ts: a.ts
        }));
        return true;
      } catch (e) { return false; }
    },
    remember: function (room, art) {
      const a = clean(art);
      if (!a) return { ok: false, count: 0 };
      return writeArts('fgxmas:' + room + ':arts', [a]);
    }
  };
})();
