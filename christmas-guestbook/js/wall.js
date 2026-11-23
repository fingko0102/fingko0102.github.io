/* 미디어월: 떠다니는 방명록 + QR + 실시간 참여 */
(function () {
  const XG = (window.XG = window.XG || {});

  XG.startWall = function (room) {
    const $ = function (id) { return document.getElementById(id); };
    const wrap = $('ornaments');
    const countEl = $('wall-count');
    const noteEl = $('sample-note');
    const roomEl = $('room-code');
    const statusEl = $('host-status');

    const items = [];
    let samplesLeft = 0;
    let bus = null;

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
    function area() {
      const W = window.innerWidth, H = window.innerHeight;
      if (W < 760) {
        return { x: W * 0.06, y: H * 0.19, w: W * 0.88, h: H * 0.46 };
      }
      return { x: W * 0.08, y: H * 0.17, w: W * 0.84, h: H * 0.5 };
    }

    function pickSize(W, H) {
      const base = Math.min(W, H);
      return Math.round(Math.max(82, Math.min(168, base * (0.135 + Math.random() * 0.055))));
    }

    // 트리(무대)는 오너먼트가 비켜 가도록
    function treeZone() {
      const W = window.innerWidth, H = window.innerHeight;
      const tw = Math.min(Math.min(0.45 * H, 410), 0.7 * W);
      const th = tw * 1.3;
      return { x0: W / 2 - tw * 0.62, x1: W / 2 + tw * 0.62, y0: H + 18 - th * 1.02, y1: H };
    }

    function place(size) {
      const a = area();
      const zone = treeZone();
      let best = null, bestScore = -1e9;
      for (let i = 0; i < 60; i++) {
        const cx = a.x + a.w * (0.04 + Math.random() * 0.92);
        const cy = a.y + a.h * (0.05 + Math.random() * 0.9);
        if (cx > zone.x0 && cx < zone.x1 && cy > zone.y0 - size * 0.35) continue;
        let minDist = 1e9;
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          const px = it.nx * window.innerWidth;
          const py = it.ny * window.innerHeight;
          const d = Math.hypot(px - cx, py - cy) - (it.size + size) / 2;
          if (d < minDist) minDist = d;
        }
        if (minDist > bestScore) { bestScore = minDist; best = { x: cx, y: cy }; }
        if (minDist > size * 0.55) break;
      }
      if (!best) best = { x: a.x + a.w * 0.5, y: a.y + a.h * 0.4 };
      return { nx: best.x / window.innerWidth, ny: best.y / window.innerHeight };
    }

    /* ---------- 오너먼트 ---------- */
    function addArt(art, opt) {
      opt = opt || {};
      if (!art || !art.url) return;
      if (items.some(function (i) { return i.id === art.id; })) return;

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
      el.setAttribute('aria-label', (art.name || '익명') + ' 님의 그림');

      const tagText = art.msg
        ? '<b>' + XG.escape(art.name || '익명') + '</b><span>' + XG.escape(art.msg) + '</span>'
        : '<b>' + XG.escape(art.name || '익명') + '</b>';
      el.innerHTML =
        '<div class="orn-float"><div class="orn-pop">' +
          '<span class="orn-halo"></span>' +
          '<img class="orn-img" alt="" src="' + art.url + '">' +
          '<span class="orn-tag">' + tagText + (art.ex ? '<span class="ex">예시</span>' : '') + '</span>' +
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

      el.addEventListener('click', function () { showArt(art); });

      if (items.length > 44) removeItem(items[0].id);

      if (!art.ex && !opt.silent) {
        if (samplesLeft > 0) {
          const s = items.find(function (i) { return i.art.ex; });
          if (s) { samplesLeft--; removeItem(s.id); }
        }
        if (samplesLeft === 0 && noteEl) noteEl.hidden = true;
      }

      updateCount();
      if (!art.ex && !opt.silent) persist();
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
      if (bus && bus.publishCount) bus.publishCount(items.length);
    }

    /* ---------- 눌러서 크게 보기 ---------- */
    function showArt(art) {
      const card = XG.modal.open(
        '<div class="art-view">' +
          '<img src="' + art.url + '" alt="">' +
          '<p class="art-name">' + XG.escape(art.name || '익명') + '</p>' +
          (art.msg ? '<p class="art-msg">' + XG.escape(art.msg) + '</p>' : '') +
          (art.ex ? '<p class="art-msg" style="font-size:11px;color:rgba(238,243,255,.45)">예시 그림입니다</p>' : '') +
          '<button type="button" class="art-close" data-close="1">닫기</button>' +
        '</div>'
      );
      const btn = card.querySelector('.art-close');
      if (btn) btn.addEventListener('click', function () { XG.modal.close(); });
    }

    /* ---------- 저장/복원 ---------- */
    function storeKey() { return 'fgxmas:' + room + ':arts'; }

    function persist() {
      try {
        const real = items.filter(function (i) { return !i.art.ex; }).slice(-20)
          .map(function (i) { return i.art; });
        localStorage.setItem(storeKey(), JSON.stringify(real));
      } catch (e) {}
    }

    function restore() {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(storeKey()) || '[]'); } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      list.slice(-20).forEach(function (a) {
        if (a && typeof a.url === 'string' && a.url.indexOf('data:image/') === 0) {
          addArt(a, { sparkle: false, silent: true });
        }
      });
    }

    /* 최근에 휴대폰에서 보냈지만 월이 닫혀 있던 그림도 이어받기 */
    function restorePending() {
      try {
        const raw = localStorage.getItem('fgxmas:' + room + ':lastart');
        if (!raw) return;
        const a = JSON.parse(raw);
        if (!a || a.t !== 'art' || typeof a.url !== 'string') return;
        if (a.url.indexOf('data:image/') !== 0) return;
        if (Date.now() - (Number(a.ts) || 0) > 30 * 60 * 1000) return;
        addArt({ id: a.id, url: a.url, name: a.name, msg: a.msg, ts: a.ts }, { sparkle: false });
      } catch (e) {}
    }

    /* ---------- 시작 ---------- */
    restore();
    restorePending();

    if (!items.length) {
      XG.samples().forEach(function (s, i) {
        setTimeout(function () { addArt(s, { silent: true }); }, 120 * i);
        samplesLeft++;
      });
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
      samplesLeft = 0;
    }

    /* ---------- 연결 ---------- */
    bus = XG.createBus({
      room: room,
      role: 'wall',
      onArt: function (art) { addArt(art); },
      onStatus: function (s, info) {
        if (s === 'ready') {
          statusEl.className = 'host-status ok';
          statusEl.innerHTML = '<i></i>실시간 참여 열림' + (info && info.guests ? ' · ' + info.guests + '명 접속' : '');
        } else if (s === 'id-taken') {
          statusEl.className = 'host-status warn';
          statusEl.innerHTML = '<i></i>같은 방 코드의 월이 이미 열려 있어요';
        } else {
          statusEl.className = 'host-status warn';
          statusEl.innerHTML = '<i></i>실시간 연결 준비 중… (같은 기기에서는 바로 참여돼요)';
        }
      },
      onCount: function () {}
    });

    if (bus && bus.publishCount) bus.publishCount(items.length);

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
          addArt(payload);
          return '이 화면에 바로 떠올랐어요.';
        },
        onSentShown: function (el) {
          const b = el.querySelector('[data-go="wall"]');
          if (b) b.addEventListener('click', function () { XG.modal.close(); });
        }
      });
    });

    window.addEventListener('beforeunload', function () {
      if (bus) bus.destroy();
    });

    /* 화면 크기가 바뀌어도 비율 유지 (left/top % 사용) */
    let rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        items.forEach(function (it) {
          it.el.style.setProperty('--s', pickSize(window.innerWidth, window.innerHeight) + 'px');
        });
      }, 250);
    });
  };
})();
