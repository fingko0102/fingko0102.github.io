/* 캔버스 그리기 컴포넌트 (그리기 화면 + 미디어월 오버레이 공용) */
(function () {
  const XG = (window.XG = window.XG || {});

  const PALETTE = [
    { c: '#ffffff', light: 1 },
    { c: '#ff5b6e', light: 0 },
    { c: '#f3d18b', light: 0 },
    { c: '#3fd18b', light: 0 },
    { c: '#6fd3ff', light: 0 },
    { c: '#ff8ac6', light: 0 },
    { c: '#b48cff', light: 0 },
    { c: '#ff9f43', light: 0 },
    { c: '#000000', dark: 1 }   // 검은색 (어두운 배경에서도 보이게 테두리)
  ];
  const SIZES = [3, 7, 14];

  const ICON = {
    eraser: '<svg viewBox="0 0 24 24"><path d="M8 20H20"/><path d="M13.5 4.5l6 6-8 8H6.5l-2.5-2.5 9.5-11.5z"/><path d="M9.5 8.5l6 6"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M4 10h7V3"/><path d="M4 10a8.5 8.5 0 1 1 2.6 6"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9L17.5 7"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M4.5 12h13"/><path d="M12 5.5l6.5 6.5-6.5 6.5"/></svg>'
  };

  XG.createDrawer = function (host, opts) {
    opts = opts || {};

    host.innerHTML =
      '<div class="drawer">' +
        '<div class="pad-box">' +
          '<div class="pad-frame">' +
            '<canvas class="pad" aria-label="그림 그리는 곳"></canvas>' +
            '<p class="pad-hint">손가락으로 그림을 그려보세요</p>' +
          '</div>' +
        '</div>' +
        '<div class="tools">' +
          '<div class="palette" role="group" aria-label="색 고르기">' +
            PALETTE.map(function (p, i) {
              return '<button type="button" class="swatch" data-i="' + i + '" data-light="' + p.light + '"' +
                (p.dark ? ' data-dark="1"' : '') +
                ' style="--c:' + p.c + '" aria-label="색 ' + (i + 1) + (p.dark ? ' 검은색' : '') + '"></button>';
            }).join('') +
          '</div>' +
          '<div class="tool-row">' +
            '<div class="seg sizes" role="group" aria-label="굵기 고르기">' +
              SIZES.map(function (s, i) {
                return '<button type="button" class="size-btn" data-i="' + i + '"><i style="width:' +
                  (3 + i * 4) + 'px;height:' + (3 + i * 4) + 'px"></i></button>';
              }).join('') +
            '</div>' +
            '<button type="button" class="tool-btn" data-act="eraser">' + ICON.eraser + '지우개</button>' +
            '<button type="button" class="tool-btn" data-act="undo">' + ICON.undo + '되돌리기</button>' +
            '<button type="button" class="tool-btn" data-act="clear">' + ICON.clear + '지우기</button>' +
          '</div>' +
        '</div>' +
        '<div class="meta">' +
          '<label class="field"><input class="nick" maxlength="12" autocomplete="off" placeholder="이름"></label>' +
          '<label class="field"><input class="bio" maxlength="40" autocomplete="off" placeholder="한마디 (예: 메리 크리스마스!)"></label>' +
        '</div>' +
        '<button type="button" class="send-btn">' + ICON.send +
          '<span>' + XG.escape(opts.sendLabel || '미디어월에 보내기') + '</span></button>' +
        '<div class="sent-card" hidden></div>' +
      '</div>';

    const root = host.querySelector('.drawer');
    const box = host.querySelector('.pad-box');
    const frame = host.querySelector('.pad-frame');
    const pad = host.querySelector('.pad');
    const ctx = pad.getContext('2d');
    const hint = host.querySelector('.pad-hint');
    const nick = host.querySelector('.nick');
    const bio = host.querySelector('.bio');
    const sendBtn = host.querySelector('.send-btn');
    const sentCard = host.querySelector('.sent-card');

    let cw = 0, ch = 0, dpr = 1;
    let strokes = [];
    let history = [];
    let drawing = null;
    let color = PALETTE[0].c;   // 기본 붓 색: 흰색
    let sizeIdx = 1;
    let erasing = false;
    let rafPending = 0;
    let baseImage = null;        // 수정 모드에서 불러온 기존 그림(맨 아래층)
    const editMode = !!(opts.initial && opts.initial.id);
    const editArt = editMode ? { id: opts.initial.id, ts: Number(opts.initial.ts) || 0 } : null;

    /* ---------- 이름 기억 ---------- */
    try {
      const saved = localStorage.getItem('fgxmas-nick');
      if (saved) nick.value = saved;
    } catch (e) {}

    /* ---------- 수정 모드: 기존 그림·이름·한마디를 그대로 불러온다 ---------- */
    if (editMode) {
      if (opts.initial.name) nick.value = String(opts.initial.name).slice(0, 12);
      if (opts.initial.msg) bio.value = String(opts.initial.msg).slice(0, 40);
      if (opts.initial.url) {
        hint.classList.add('gone');
        const img = new Image();
        img.onload = function () {
          baseImage = img;
          if (cw) render(); else layout();
        };
        img.src = opts.initial.url;
      }
    }

    /* ---------- 캔버스 크기 ---------- */
    function fit() {
      const r = pad.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w === cw && h === ch) return;
      cw = w; ch = h;
      pad.width = Math.round(w * dpr);
      pad.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      render();
    }

    // 캔버스를 항상 정사각형으로 유지
    function layout() {
      const r = box.getBoundingClientRect();
      const w = Math.max(120, Math.floor(Math.min(r.width, r.height)));
      // 세로 여유가 있으면 조금 더 길게 써서 빈 공간을 줄인다
      const h = Math.max(w, Math.min(Math.floor(r.height), Math.round(w * 1.25)));
      const cur = frame.getBoundingClientRect();
      if (Math.abs(cur.width - w) > 1 || Math.abs(cur.height - h) > 1) {
        frame.style.width = w + 'px';
        frame.style.height = h + 'px';
      }
      fit();
    }

    if (window.ResizeObserver) {
      new ResizeObserver(function () { layout(); }).observe(box);
    }
    window.addEventListener('resize', function () { setTimeout(layout, 80); });

    /* ---------- 그리기 ---------- */
    function paint(s) {
      const pts = s.pts;
      if (!pts || !pts.length) return;
      const lw = Math.max(0.7, s.w * cw);
      ctx.save();
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = lw;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0] * cw, pts[0][1] * ch, lw / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * cw, pts[0][1] * ch);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2 * cw;
          const my = (pts[i][1] + pts[i + 1][1]) / 2 * ch;
          ctx.quadraticCurveTo(pts[i][0] * cw, pts[i][1] * ch, mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0] * cw, last[1] * ch);
        ctx.stroke();
      }
      ctx.restore();
    }

    function render() {
      rafPending = 0;
      ctx.clearRect(0, 0, cw, ch);
      // 수정 모드: 기존 그림을 맨 아래층에 깔고, 그 위에 이어 그린다
      if (baseImage) {
        const iw = baseImage.naturalWidth || baseImage.width || 0;
        const ih = baseImage.naturalHeight || baseImage.height || 0;
        if (iw && ih) {
          const s = Math.min(cw / iw, ch / ih);
          const dw = iw * s, dh = ih * s;
          ctx.drawImage(baseImage, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        }
      }
      for (let i = 0; i < strokes.length; i++) paint(strokes[i]);
    }
    function schedule() {
      if (rafPending) return;
      rafPending = requestAnimationFrame(render);
    }

    function pos(e) {
      const r = pad.getBoundingClientRect();
      const x = (e.clientX - r.left) / (r.width || 1);
      const y = (e.clientY - r.top) / (r.height || 1);
      return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
    }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!cw) layout();
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (err) {}
      const stroke = {
        color: color,
        erase: erasing,
        // 지우개는 붓보다 조금 크게 해서 가장자리가 남지 않게
        w: (erasing ? SIZES[sizeIdx] * 1.7 : SIZES[sizeIdx]) / (cw || 360),
        pts: [pos(e)]
      };
      strokes.push(stroke);
      history.push({ type: 'add', stroke: stroke });
      drawing = stroke;
      hint.classList.add('gone');
      schedule();
    }

    function onMove(e) {
      if (!drawing) return;
      e.preventDefault();
      const evts = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
      for (let i = 0; i < evts.length; i++) drawing.pts.push(pos(evts[i]));
      schedule();
    }

    function onUp(e) {
      if (!drawing) return;
      drawing = null;
      try { pad.releasePointerCapture(e.pointerId); } catch (err) {}
      render();
    }

    pad.addEventListener('pointerdown', onDown);
    pad.addEventListener('pointermove', onMove);
    pad.addEventListener('pointerup', onUp);
    pad.addEventListener('pointercancel', onUp);

    /* ---------- 도구 ---------- */
    const swatches = Array.prototype.slice.call(host.querySelectorAll('.swatch'));
    const sizeBtns = Array.prototype.slice.call(host.querySelectorAll('.size-btn'));
    const eraserBtn = host.querySelector('[data-act="eraser"]');

    function syncTools() {
      swatches.forEach(function (b, i) { b.classList.toggle('on', !erasing && PALETTE[i].c === color); });
      sizeBtns.forEach(function (b, i) { b.classList.toggle('on', i === sizeIdx); });
      eraserBtn.classList.toggle('on', erasing);
    }

    swatches.forEach(function (b) {
      b.addEventListener('click', function () {
        color = PALETTE[+b.dataset.i].c;
        erasing = false;
        syncTools();
      });
    });
    sizeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        sizeIdx = +b.dataset.i;
        syncTools();
      });
    });
    eraserBtn.addEventListener('click', function () {
      erasing = !erasing;
      syncTools();
    });

    host.querySelector('[data-act="undo"]').addEventListener('click', function () {
      const op = history.pop();
      if (!op) { XG.toast('되돌릴 게 없어요'); return; }
      if (op.type === 'add') {
        const i = strokes.indexOf(op.stroke);
        if (i >= 0) strokes.splice(i, 1);
      } else if (op.type === 'clear') {
        strokes = op.prev.slice();
        if ('prevBase' in op) baseImage = op.prevBase;
      }
      schedule();
    });

    host.querySelector('[data-act="clear"]').addEventListener('click', function () {
      if (!strokes.length && !baseImage) { XG.toast('이미 비어 있어요'); return; }
      history.push({ type: 'clear', prev: strokes.slice(), prevBase: baseImage });
      strokes = [];
      baseImage = null;          // 수정 모드에서도 빈 캔버스에서 새로 그릴 수 있게
      schedule();
      XG.toast('전체 지웠어요 · 되돌리기로 복구할 수 있어요');
    });

    /* ---------- 내보내기 ---------- */
    function exportPng() {
      if (!cw || !ch) return null;
      const W = pad.width, H = pad.height;
      let data;
      try { data = ctx.getImageData(0, 0, W, H).data; } catch (e) { return null; }
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
          if (data[(y * W + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      const padPx = Math.round(Math.max(W, H) * 0.06);
      minX = Math.max(0, minX - padPx); minY = Math.max(0, minY - padPx);
      maxX = Math.min(W - 1, maxX + padPx); maxY = Math.min(H - 1, maxY + padPx);
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const scale = Math.min(1, 340 / Math.max(bw, bh));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(bw * scale));
      out.height = Math.max(1, Math.round(bh * scale));
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(pad, minX, minY, bw, bh, 0, 0, out.width, out.height);
      try { return out.toDataURL('image/png'); } catch (e) { return null; }
    }

    /* ---------- 보내기 ---------- */
    function showSent(payload, info) {
      const name = payload.name || '익명';
      sentCard.innerHTML =
        '<img src="' + payload.url + '" alt="보낸 그림">' +
        '<p class="sent-title">미디어월에 도착했어요</p>' +
        (payload.msg ? '<p class="sent-msg">' + XG.escape(payload.msg) + '</p>' : '') +
        '<p class="sent-sub">' + XG.escape(info || (name + ' 님의 그림이 별처럼 떠올랐어요.')) + '</p>' +
        '<div class="sent-actions">' +
          '<button type="button" class="btn-line" data-go="again">또 그리기</button>' +
          (opts.sentExtra || '') +
        '</div>';
      sentCard.hidden = false;
      const again = sentCard.querySelector('[data-go="again"]');
      if (again) again.addEventListener('click', function () {
        sentCard.hidden = true;
        strokes = []; history = []; render();
        hint.classList.remove('gone');
      });
      if (typeof opts.onSentShown === 'function') opts.onSentShown(sentCard, payload);
    }

    sendBtn.addEventListener('click', function () {
      if (!strokes.length && !baseImage) {
        XG.toast('먼저 그림을 그려보세요');
        const frame = host.querySelector('.pad-frame');
        frame.animate && frame.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 260, easing: 'ease-in-out' }
        );
        return;
      }
      const url = exportPng();
      if (!url) { XG.toast('그림을 읽지 못했어요. 조금 더 그려보세요'); return; }
      const name = (nick.value || '').trim().slice(0, 12);
      if (name) { try { localStorage.setItem('fgxmas-nick', name); } catch (e) {} }
      const payload = {
        // 수정 모드: 같은 id를 그대로 두고 ts만 더 크게 올려 서버·저장소가 덮어쓰게 한다
        id: editMode ? editArt.id : 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        url: url,
        name: name,
        msg: (bio.value || '').trim().slice(0, 40),
        ts: editMode ? Math.max(Date.now(), (Number(editArt.ts) || 0) + 1) : Date.now()
      };
      sendBtn.disabled = true;
      let result;
      try {
        result = opts.onSend ? opts.onSend(payload) : null;
      } catch (err) {
        result = null;
      }
      Promise.resolve(result).then(function (info) {
        sendBtn.disabled = false;
        if (editMode) {
          // 수정 저장: 보냄 카드 대신 화면을 닫고 알린다
          if (typeof opts.onSaved === 'function') opts.onSaved(payload, info);
          return;
        }
        showSent(payload, typeof info === 'string' ? info : undefined);
        strokes = []; history = []; render();
        bio.value = '';
        hint.classList.remove('gone');
      });
    });

    syncTools();
    setTimeout(layout, 20);
    setTimeout(layout, 260);

    return {
      fit: fit,
      clear: function () { strokes = []; history = []; baseImage = null; render(); },
      editId: editMode ? editArt.id : null
    };
  };
})();
