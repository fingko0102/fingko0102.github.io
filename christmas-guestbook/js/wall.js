/* 미디어월: 떠다니는 방명록 + QR + 실시간 참여
   - 저장된 모든 방(fgxmas:*)의 그림을 통합해 한 화면에 띄운다
   - 첫 번째 월이 Host, 추가로 연 월은 서브로 붙어 서로 그림을 맞춘다
   - 서버 DB(Cloudflare Worker)가 응답하면 자동으로 불러오고 올리고 지운다
   - 그림을 600ms 이상 꾹 누르면 비밀번호를 받아 지운다 */
(function () {
  const XG = (window.XG = window.XG || {});

  const DISPLAY_MAX = 44;      // 화면에 동시에 떠 있는 그림 수 (저장은 그대로 유지)
  const LONG_PRESS_MS = 600;   // 꾹 누르기 판정 시간
  const MOVE_TOLERANCE = 12;   // 이보다 많이 움직이면 꾹 누르기 취소(px)
  const SYNC_MS = 8000;        // 서버와 맞추는 주기

  // 지우기 비밀번호의 SHA-256 (평문은 코드에 두지 않는다)
  const DELETE_SHA256 = 'c0c4a69b17a7955ac230bfc8db4a123eaa956ccf3c0022e68b8d4e2f5b699d1f';

  /* ---------- SHA-256 ---------- */
  const SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // crypto.subtle 없이도 같은 값을 내는 순수 JS SHA-256
  function sha256Bytes(bytes) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = bytes.length;
    const total = Math.ceil((l + 9) / 64) * 64;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = l * 8;
    dv.setUint32(total - 8, Math.floor(bits / 4294967296), false);
    dv.setUint32(total - 4, bits >>> 0, false);

    const w = new Uint32Array(64);
    const rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (let off = 0; off < total; off += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA_K[t] + w[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    let hex = '';
    for (let i = 0; i < 8; i++) hex += ('00000000' + H[i].toString(16)).slice(-8);
    return hex;
  }

  function utf8(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text);
    const out = [];
    for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }

  function sha256Hex(text) {
    const bytes = utf8(String(text));
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
        const b = new Uint8Array(buf);
        let hex = '';
        for (let i = 0; i < b.length; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16);
        return hex;
      }, function () { return sha256Bytes(bytes); });
    }
    return Promise.resolve(sha256Bytes(bytes));
  }
  sha256Hex.raw = sha256Bytes;              // 검사용(순수 JS 경로)
  XG.sha256Hex = sha256Hex;

  XG.startWall = function (room) {
    const $ = function (id) { return document.getElementById(id); };
    const wrap = $('ornaments');
    const countEl = $('wall-count');
    const roomEl = $('room-code');
    const statusEl = $('host-status');

    const items = [];
    const known = Object.create(null);   // id -> art (저장 대상 전체)
    let bus = null;
    let persistTimer = 0;
    let lastPublished = -1;

    const serverIds = Object.create(null);   // 서버가 마지막으로 돌려준 id
    const uploadTried = Object.create(null); // 이 화면에서 올려 본 id (반복 방지)
    const pendingGone = Object.create(null); // 서버 목록에서 한 번 사라진 id (다음 확인 때도 없으면 삭제)
    const hidden = Object.create(null);      // 화면에서만 감춘 id
    let syncing = false;
    let syncTimer = 0;
    let statusCls = 'host-status';
    let statusHtml = '<i></i>미디어월 준비 중…';

    roomEl.textContent = room;

    XG.scene.mount($('scene'));

    /* ---------- QR ---------- */
    function drawUrl() {
      const u = new URL(location.href);
      u.search = '?mode=draw&room=' + encodeURIComponent(room);
      u.hash = '';
      return u.toString();
    }

    function renderQr() {
      const box = $('qr');
      const url = drawUrl();
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
        const svg = box.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
          svg.setAttribute('role', 'img');
          svg.setAttribute('aria-label', '방명록 참여 QR 코드');
        }
      } catch (e) {
        box.innerHTML = '<div style="font-size:10px;color:#333;text-align:center;line-height:1.3">QR을 만들 수 없어요<br>아래 주소로 접속해 주세요</div>';
      }
      const open = $('wall-open-draw');
      open.setAttribute('href', '?mode=draw&room=' + encodeURIComponent(room));
    }

    renderQr();

    $('copy-link').addEventListener('click', function () {
      XG.copyText(drawUrl()).then(function () {
        XG.toast('참여 링크를 복사했어요');
      }).catch(function () {
        XG.toast('링크: ' + drawUrl(), 5000);
      });
    });

    /* ---------- 배치 ---------- */
    // 화면에서 건드리면 안 되는 자리(타이틀·달·QR 카드·상태/버튼)를 실제 크기로 잰다
    const KEEP_SEL = ['.wall-head', '.moon', '.join-card', '.wall-foot'];
    const KEEP_PAD = 12;      // 그림과 UI 사이 최소 여백(px)
    const TAG_H = 26;         // 그림 아래 이름표 높이

    function keepOuts() {
      const out = [];
      for (let i = 0; i < KEEP_SEL.length; i++) {
        const el = document.querySelector(KEEP_SEL[i]);
        if (!el) continue;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        out.push({
          x0: b.left - KEEP_PAD, y0: b.top - KEEP_PAD,
          x1: b.right + KEEP_PAD, y1: b.bottom + KEEP_PAD
        });
      }
      return out;
    }

    // 오너먼트가 들어갈 수 있는 안전한 띠 (상단 타이틀~하단 카드 사이)
    function area() {
      const W = window.innerWidth, H = window.innerHeight;
      const narrow = W < 760;
      let top = H * (narrow ? 0.17 : 0.16);
      let bottom = H * (narrow ? 0.82 : 0.66);
      const head = document.querySelector('.wall-head');
      if (head) top = Math.max(top, head.getBoundingClientRect().bottom + 6);
      const join = document.querySelector('.join-card');
      if (join) {
        const t = join.getBoundingClientRect().top - TAG_H - 6;
        if (t > top + H * 0.2) bottom = Math.min(bottom, t);
      }
      if (bottom - top < H * 0.24) bottom = Math.min(H * 0.92, top + H * 0.24);
      return { x: W * (narrow ? 0.07 : 0.08), y: top, w: W * (narrow ? 0.86 : 0.84), h: bottom - top };
    }

    function pickSize(W, H) {
      const base = Math.min(W, H);
      const short = H < 560;   // 가로로 납작한 화면: 조금 작게
      const min = short ? 58 : 82;
      const max = short ? 108 : 168;
      return Math.round(Math.max(min, Math.min(max, base * (0.135 + Math.random() * 0.055))));
    }

    // 트리(무대)는 오너먼트가 비켜 가도록 — 실제로 그려진 트리 크기를 잰다
    function treeZone() {
      const el = document.querySelector('.tree-wrap');
      if (el) {
        const b = el.getBoundingClientRect();
        if (b.width > 20) {
          return {
            x0: b.left + b.width * 0.14, x1: b.right - b.width * 0.14,
            y0: b.top + b.height * 0.04, y1: b.bottom
          };
        }
      }
      const W = window.innerWidth, H = window.innerHeight;
      const tw = Math.min(Math.min(0.45 * H, 410), 0.7 * W);
      const th = tw * 1.3;
      return { x0: W / 2 - tw * 0.62, x1: W / 2 + tw * 0.62, y0: H + 18 - th * 1.02, y1: H };
    }

    // 그림 한 장이 차지하는 사각형(이름표 포함)과 UI 영역이 겹치는가
    function hitsUi(cx, cy, size, keep) {
      const x0 = cx - size / 2, x1 = cx + size / 2;
      const y0 = cy - size / 2, y1 = cy + size / 2 + TAG_H;
      for (let i = 0; i < keep.length; i++) {
        const k = keep[i];
        if (x1 > k.x0 && k.x1 > x0 && y1 > k.y0 && k.y1 > y0) return true;
      }
      return false;
    }

    function place(size, selfId) {
      const W = window.innerWidth, H = window.innerHeight;
      const a = area();
      const zone = treeZone();
      const keep = keepOuts();
      let best = null, bestScore = -1e9, bestFree = null;
      for (let i = 0; i < 120; i++) {
        const cx = a.x + a.w * (0.04 + Math.random() * 0.92);
        const cy = a.y + a.h * (0.05 + Math.random() * 0.9);
        if (cx > zone.x0 && cx < zone.x1 && cy > zone.y0 - size * 0.35) continue;
        let minDist = 1e9;
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          if (selfId && it.id === selfId) continue;
          const px = it.nx * W;
          const py = it.ny * H;
          const d = Math.hypot(px - cx, py - cy) - (it.size + size) / 2;
          if (d < minDist) minDist = d;
        }
        if (hitsUi(cx, cy, size, keep)) continue;   // 타이틀·달·버튼·QR 뒤에는 띄우지 않는다
        if (!bestFree) bestFree = { x: cx, y: cy };
        if (minDist > bestScore) { bestScore = minDist; best = { x: cx, y: cy }; }
        if (minDist > size * 0.55) break;
      }
      if (!best) best = bestFree;
      if (!best) {
        // 자리가 좁으면 격자로 훑어 UI와 겹치지 않는 곳을 찾는다
        const step = Math.max(22, size * 0.55);
        for (let cy = a.y + size / 2; cy <= a.y + a.h && !best; cy += step) {
          for (let cx = a.x + size / 2; cx <= a.x + a.w && !best; cx += step) {
            if (cx > zone.x0 && cx < zone.x1 && cy > zone.y0 - size * 0.35) continue;
            if (hitsUi(cx, cy, size, keep)) continue;
            best = { x: cx, y: cy };
          }
        }
      }
      if (!best) {
        // 그래도 없으면 화면 밖으로 나가지 않는 선에서 가운데에 둔다
        best = {
          x: Math.min(W - size / 2 - 6, Math.max(size / 2 + 6, a.x + a.w * 0.5)),
          y: Math.min(H - size / 2 - TAG_H - 6, Math.max(size / 2 + 6, a.y + a.h * 0.4))
        };
      }
      return { nx: best.x / W, ny: best.y / H };
    }

    /* ---------- 저장(통합) ---------- */
    function allArts() {
      return Object.keys(known)
        .map(function (k) { return known[k]; })
        .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); })
        .slice(-XG.artStore.MAX);
    }

    function schedulePersist() {
      if (persistTimer) return;
      persistTimer = setTimeout(function () {
        persistTimer = 0;
        if (!XG.artStore) return;
        XG.artStore.mergeWrite(room, allArts());
      }, 400);
    }

    function remember(art) {
      if (!art || !art.id) return;
      if (XG.artStore && XG.artStore.isDeleted(art.id)) return;
      const prev = known[art.id];
      if (prev && (prev.ts || 0) > (art.ts || 0)) return;
      known[art.id] = art;
      schedulePersist();
    }

    /* ---------- 상태 배지 ---------- */
    function serverOn() {
      return !!(XG.api && XG.api.enabled() && XG.api.available());
    }

    function renderStatus() {
      if (!statusEl) return;
      statusEl.className = statusCls;
      // 점(<i>)과 글자를 나눠서, 좁은 화면에서는 글자만 말줄임(...)되게 한다
      const m = /^<i><\/i>([\s\S]*)$/.exec(statusHtml);
      const text = m ? m[1] : statusHtml;
      statusEl.innerHTML = '<i></i><span class="hs-text">' + text +
        (serverOn() ? '<span class="srv-badge">· 서버 DB 연결됨</span>' : '') + '</span>';
    }

    if (XG.api && XG.api.onChange) XG.api.onChange(renderStatus);

    /* ---------- 오너먼트 ---------- */
    function addArt(art, opt) {
      opt = opt || {};
      if (!art || !art.url) return;
      if (XG.artStore && XG.artStore.isDeleted(art.id)) return;
      if (items.some(function (i) { return i.id === art.id; })) return;

      remember(art);

      const size = pickSize(window.innerWidth, window.innerHeight);
      const spot = place(size);

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'orn';
      el.style.setProperty('--s', size + 'px');
      el.style.setProperty('--dur', (9 + Math.random() * 8).toFixed(2) + 's');
      el.style.setProperty('--delay', (-Math.random() * 8).toFixed(2) + 's');
      el.style.left = (spot.nx * 100).toFixed(3) + '%';
      el.style.top = (spot.ny * 100).toFixed(3) + '%';
      el.setAttribute('aria-label', (art.name || '익명') + ' 님의 그림 · 길게 누르면 지우기');

      const tagText = art.msg
        ? '<b>' + XG.escape(art.name || '익명') + '</b><span>' + XG.escape(art.msg) + '</span>'
        : '<b>' + XG.escape(art.name || '익명') + '</b>';
      el.innerHTML =
        '<div class="orn-float"><div class="orn-pop">' +
          '<span class="orn-halo"></span>' +
          '<img class="orn-img" alt="" src="' + art.url + '">' +
          '<span class="orn-tag">' + tagText + '</span>' +
        '</div></div>';

      const img = el.querySelector('.orn-img');
      img.addEventListener('error', function () { removeItem(art.id); });

      const item = { id: art.id, nx: spot.nx, ny: spot.ny, size: size, el: el, art: art };
      items.push(item);
      wrap.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('in'); });

      if (opt.sparkle !== false) burst(el, size);
      if (opt.arrive !== false) {
        el.querySelector('.orn-pop').style.animationDirection = 'normal';
      }

      bindPress(el, art);
      el.addEventListener('click', function (ev) {
        if (el.__pressFired) {
          // 꾹 누르기로 삭제 창이 열린 직후의 클릭은 크게 보기로 쓰지 않는다
          el.__pressFired = false;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        showArt(art);
      });
      el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

      if (items.length > DISPLAY_MAX) removeItem(items[0].id);

      updateCount();
      return item;
    }

    function removeItem(id) {
      const i = items.findIndex(function (x) { return x.id === id; });
      if (i < 0) return;
      const it = items[i];
      items.splice(i, 1);
      it.el.classList.remove('in');
      setTimeout(function () { if (it.el.parentNode) it.el.parentNode.removeChild(it.el); }, 800);
      updateCount();
    }

    function burst(el, size) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const dist = size * (0.4 + Math.random() * 0.45);
        s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
        s.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'px');
        s.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
        s.style.width = s.style.height = (3 + Math.random() * 4).toFixed(1) + 'px';
        el.appendChild(s);
        setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1400);
      }
    }

    function updateCount() {
      countEl.textContent = String(items.length);
      if (bus && bus.publishCount && items.length !== lastPublished) {
        lastPublished = items.length;
        bus.publishCount(items.length);
      }
    }

    /* ---------- 눌러서 크게 보기 ---------- */
    function showArt(art) {
      if (!art || (XG.artStore && XG.artStore.isDeleted(art.id))) return;
      const card = XG.modal.open(
        '<div class="art-view">' +
          '<img src="' + art.url + '" alt="">' +
          '<p class="art-name">' + XG.escape(art.name || '익명') + '</p>' +
          (art.msg ? '<p class="art-msg">' + XG.escape(art.msg) + '</p>' : '') +
          '<button type="button" class="art-close" data-close="1">닫기</button>' +
        '</div>'
      );
      const btn = card.querySelector('.art-close');
      if (btn) btn.addEventListener('click', function () { XG.modal.close(); });
    }

    /* ---------- 꾹 누르기 → 삭제 ---------- */
    // 꾹 누르기가 끝난 직후의 click 한 번을 삼킨다(그림 크게 보기·배경 닫기와 겹치지 않게)
    function swallowNextClick() {
      let done = false;
      function kill(ev) {
        if (done) return;
        done = true;
        ev.preventDefault();
        ev.stopPropagation();
        document.removeEventListener('click', kill, true);
      }
      document.addEventListener('click', kill, true);
      setTimeout(function () { document.removeEventListener('click', kill, true); }, 800);
    }

    function bindPress(el, art) {
      let timer = 0;
      let startX = 0, startY = 0, pointerId = null;

      function stop() {
        if (timer) { clearTimeout(timer); timer = 0; }
      }

      function begin(x, y, id) {
        stop();
        el.__pressFired = false;
        startX = x; startY = y; pointerId = id;
        timer = setTimeout(function () {
          timer = 0;
          el.__pressFired = true;
          swallowNextClick();
          openDelete(art);
        }, LONG_PRESS_MS);
      }

      function move(x, y) {
        if (!timer) return;
        if (Math.abs(x - startX) > MOVE_TOLERANCE || Math.abs(y - startY) > MOVE_TOLERANCE) stop();
      }

      if (window.PointerEvent) {
        el.addEventListener('pointerdown', function (ev) {
          if (ev.button !== undefined && ev.button !== 0) return;
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
          begin(ev.clientX, ev.clientY, ev.pointerId);
        });
        el.addEventListener('pointermove', function (ev) {
          if (pointerId !== null && ev.pointerId !== pointerId) return;
          move(ev.clientX, ev.clientY);
        });
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointercancel', stop);
      } else {
        // Pointer 이벤트가 없는 오래된 브라우저용
        el.addEventListener('touchstart', function (ev) {
          const t = ev.touches && ev.touches[0];
          if (!t) return;
          begin(t.clientX, t.clientY, null);
        }, { passive: true });
        el.addEventListener('touchmove', function (ev) {
          const t = ev.touches && ev.touches[0];
          if (t) move(t.clientX, t.clientY);
        }, { passive: true });
        el.addEventListener('touchend', stop);
        el.addEventListener('touchcancel', stop);
        el.addEventListener('mousedown', function (ev) {
          if (ev.button !== 0) return;
          begin(ev.clientX, ev.clientY, null);
        });
        el.addEventListener('mousemove', function (ev) { move(ev.clientX, ev.clientY); });
        el.addEventListener('mouseup', stop);
        el.addEventListener('mouseleave', stop);
      }
    }

    function openDelete(art) {
      const card = XG.modal.open(
        '<div class="art-view del-view">' +
          '<img class="del-thumb" src="' + art.url + '" alt="">' +
          '<p class="art-name">' + XG.escape(art.name || '익명') + '</p>' +
          '<p class="del-sub">이 그림을 지울까요? 비밀번호를 넣어 주세요.</p>' +
          '<form class="del-form" novalidate>' +
            '<label class="field del-field">' +
              '<input class="del-pass" type="password" placeholder="비밀번호 입력" autocomplete="off" ' +
                'autocapitalize="off" spellcheck="false" aria-label="삭제 비밀번호">' +
            '</label>' +
            '<p class="del-err" hidden>비밀번호가 틀렸어요</p>' +
            '<div class="del-actions">' +
              '<button type="button" class="btn-line del-cancel">취소</button>' +
              '<button type="submit" class="btn-danger del-ok">삭제</button>' +
            '</div>' +
          '</form>' +
        '</div>'
      );

      const form = card.querySelector('.del-form');
      const pass = card.querySelector('.del-pass');
      const err = card.querySelector('.del-err');
      const ok = card.querySelector('.del-ok');
      const cancel = card.querySelector('.del-cancel');

      function showErr(msg) {
        err.textContent = msg;
        err.hidden = false;
      }

      if (cancel) cancel.addEventListener('click', function () { XG.modal.close(); });
      setTimeout(function () { try { pass.focus(); } catch (e) {} }, 60);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        const value = pass.value || '';
        if (!value) { showErr('비밀번호를 입력해 주세요'); return; }
        ok.disabled = true;
        sha256Hex(value).then(function (hex) {
          if (hex !== DELETE_SHA256) {
            showErr('비밀번호가 틀렸어요');
            ok.disabled = false;
            try { pass.select(); } catch (e) {}
            return null;
          }
          if (XG.api && XG.api.enabled()) {
            return XG.api.deleteArt(room, art.id, value).then(function (res) {
              if (res && res.wrongPassword) {
                showErr('비밀번호가 틀렸어요');
                ok.disabled = false;
                return false;
              }
              // 서버가 꺼져 있으면(offline) 이미 확인한 비밀번호로 로컬에서 지운다
              return true;
            });
          }
          return true;
        }).then(function (done) {
          if (!done) return;
          commitDelete(art.id, true);
          XG.modal.close();
          XG.toast('그림을 지웠어요');
        }).catch(function () {
          ok.disabled = false;
        });
      });
    }

    // 화면·저장소·다른 월에서 같은 그림을 지운다
    function commitDelete(id, propagate) {
      if (!id) return;
      removeItem(id);
      delete known[id];
      delete serverIds[id];
      delete uploadTried[id];
      delete pendingGone[id];
      delete hidden[id];
      if (XG.artStore && XG.artStore.forget) XG.artStore.forget(room, id);
      if (propagate && bus && bus.sendDelete) {
        try { bus.sendDelete(id); } catch (e) {}
      }
      updateCount();
    }

    /* ---------- 서버 DB 동기화 ---------- */
    function serverArt(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const a = XG.artStore ? XG.artStore.clean(raw) : null;
      if (!a) return null;
      return a;
    }

    function pullServer(uploadLocal) {
      if (!XG.api || !XG.api.enabled() || syncing) return;
      syncing = true;
      XG.api.listArts(room).then(function (list) {
        if (!list) { renderStatus(); return; }
        const nowIds = Object.create(null);
        const fresh = [];
        for (let i = 0; i < list.length; i++) {
          const a = serverArt(list[i]);
          if (!a) continue;
          if (XG.artStore && XG.artStore.isDeleted(a.id)) continue;   // 지운 그림은 되살리지 않는다
          nowIds[a.id] = 1;
          delete pendingGone[a.id];
          const shown = items.some(function (it) { return it.id === a.id; });
          if (hidden[a.id]) {
            // 서버에 다시 나타났으면 다시 보여 준다
            delete hidden[a.id];
            if (!shown) fresh.push(known[a.id] || a);
          } else if (!known[a.id] && !shown) {
            fresh.push(a);
          }
        }

        // 다른 기기에서 지운 그림: 지난 응답엔 있었는데 지금 없다 → 바로 화면에서 감추고,
        // 두 번 연속 없으면 확정 삭제한다(한 번의 일시적 빈 응답으로 지워지지 않게)
        const gone = [];
        Object.keys(serverIds).forEach(function (id) {
          if (nowIds[id]) return;
          if (!known[id]) return;
          if (pendingGone[id]) { gone.push(id); return; }
          pendingGone[id] = 1;
          hidden[id] = 1;
          removeItem(id);
        });
        gone.forEach(function (id) { commitDelete(id, false); });

        Object.keys(serverIds).forEach(function (id) {
          if (!nowIds[id] && !pendingGone[id]) delete serverIds[id];
        });
        Object.keys(nowIds).forEach(function (id) { serverIds[id] = 1; });

        for (let i = 0; i < fresh.length; i++) addArt(fresh[i], { sparkle: true });

        if (uploadLocal) {
          // 서버에 없는 내 그림은 한 번의 요청으로 모아 올린다.
          // (한 장씩 동시에 보내면 서버가 서로를 덮어써 그림이 유실된다)
          const local = allArts();
          const missing = [];
          for (let i = 0; i < local.length; i++) {
            const a = local[i];
            if (nowIds[a.id] || uploadTried[a.id]) continue;
            uploadTried[a.id] = 1;
            missing.push(a);
          }
          if (missing.length > 0) {
            XG.api.putArts(room, missing).then(function (ok) {
              if (ok) return;
              // 실패하면 다음 동기화 때 다시 시도한다
              for (let i = 0; i < missing.length; i++) delete uploadTried[missing[i].id];
            }).catch(function () {});
          }
        }
        renderStatus();
      }).catch(function () {}).then(function () { syncing = false; });
    }

    function startSync() {
      if (!XG.api || !XG.api.enabled()) { renderStatus(); return; }
      pullServer(true);
      syncTimer = setInterval(function () {
        if (document.hidden) return;
        pullServer(false);
      }, SYNC_MS);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) pullServer(false);
      });
    }

    /* ---------- 복원: 저장된 모든 방의 그림을 한 번에 ---------- */
    function restoreAll() {
      const store = XG.artStore;
      const list = store ? store.loadAll() : [];
      list.forEach(function (a) { remember(a); });
      if (store) {
        // 기존 방 키는 그대로 두고, 통합 방 코드에 합쳐 저장한다
        if (persistTimer) { clearTimeout(persistTimer); persistTimer = 0; }
        store.mergeWrite(room, allArts());
      }
      list.slice(-DISPLAY_MAX).forEach(function (a) {
        addArt(a, { sparkle: false, silent: true });
      });
      updateCount();
    }

    /* ---------- 시작 ---------- */
    // 저장된 그림만 띄운다. 예시 그림은 쓰지 않는다.
    restoreAll();
    renderStatus();

    /* ---------- 연결 ---------- */
    bus = XG.createBus({
      room: room,
      role: 'wall',
      getArts: allArts,
      onArt: function (art) { addArt(art); },
      onDelete: function (id) { commitDelete(id, false); },
      onStatus: function (s, info) {
        if (s === 'host') {
          statusCls = 'host-status ok';
          statusHtml = '<i></i>통합 미디어월 연결됨' +
            (info && info.guests ? ' · ' + info.guests + '명 참여 중' : ' · 참여 열림') +
            (info && info.walls ? ' · 월 ' + (info.walls + 1) + '개' : '');
        } else if (s === 'linked') {
          statusCls = 'host-status ok';
          statusHtml = '<i></i>통합 미디어월 연결됨 · 다른 월과 그림 맞추는 중' +
            (info && info.guests ? ' · ' + info.guests + '명 참여 중' : '');
        } else if (s === 'off') {
          statusCls = 'host-status warn';
          statusHtml = '<i></i>이 기기의 그림만 표시돼요';
        } else {
          statusCls = 'host-status warn';
          statusHtml = '<i></i>통합 미디어월 연결 중… (같은 기기에서는 바로 보여요)';
        }
        renderStatus();
      },
      onCount: function () {}
    });

    if (bus && bus.publishCount) {
      lastPublished = items.length;
      bus.publishCount(items.length);
    }

    startSync();

    /* ---------- 이 화면에서 바로 그리기 ---------- */
    $('wall-draw-btn').addEventListener('click', function () {
      const card = XG.modal.open(
        '<div class="sheet">' +
          '<div class="sheet-head">' +
            '<div><b>이 화면에서 바로 그리기</b><div class="sheet-sub">보내면 미디어월에 바로 떠올라요</div></div>' +
            '<button type="button" class="sheet-close" data-close="1" aria-label="닫기">' +
              '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
          '</div>' +
          '<div class="drawer-host" id="wall-drawer"></div>' +
        '</div>'
      );
      card.querySelector('.sheet-close').addEventListener('click', function () { XG.modal.close(); });
      XG.createDrawer(card.querySelector('#wall-drawer'), {
        sentExtra: '<button type="button" class="btn-gold" data-go="wall">월 보기</button>',
        onSend: function (payload) {
          let r = { remote: false, sameBrowser: false };
          try { r = bus.sendArt(payload); } catch (e) {}
          if (r.remote) return '실시간으로 미디어월에 보냈어요.';
          if (r.sameBrowser) return '미디어월에 보냈어요.';
          return '이 화면에 바로 떠올랐어요.';
        },
        onSentShown: function (el) {
          const b = el.querySelector('[data-go=\"wall\"]');
          if (b) b.addEventListener('click', function () { XG.modal.close(); });
        }
      });
    });

    window.addEventListener('beforeunload', function () {
      clearInterval(syncTimer);
      if (bus) bus.destroy();
    });

    /* 화면 크기가 바뀌어도(회전 포함) UI와 겹치지 않는 자리로 다시 놓는다 */
    let rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        items.forEach(function (it) {
          const size = pickSize(window.innerWidth, window.innerHeight);
          it.size = size;
          it.el.style.setProperty('--s', size + 'px');
          const spot = place(size, it.id);
          it.nx = spot.nx;
          it.ny = spot.ny;
          it.el.style.left = (spot.nx * 100).toFixed(3) + '%';
          it.el.style.top = (spot.ny * 100).toFixed(3) + '%';
        });
      }, 250);
    });
  };
})();
