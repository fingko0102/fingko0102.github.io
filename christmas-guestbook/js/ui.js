/* 공용 UI 헬퍼: 토스트, 모달, 클립보드 */
(function () {
  const XG = (window.XG = window.XG || {});

  let toastEl = null, toastTimer = 0;

  XG.toast = function (msg, ms) {
    if (!toastEl) toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2400);
  };

  const modal = {
    el: null,
    card: null,
    init() {
      if (this.el) return;
      this.el = document.getElementById('modal');
      this.card = document.getElementById('modal-card');
      const self = this;
      this.el.addEventListener('click', function (e) {
        if (e.target.dataset && e.target.dataset.close) self.close();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !self.el.hidden) self.close();
      });
    },
    open(html) {
      this.init();
      this.card.innerHTML = html;
      this.el.hidden = false;
      return this.card;
    },
    close() {
      if (!this.el) return;
      this.el.hidden = true;
      this.card.innerHTML = '';
      if (typeof this.onClose === 'function') { const f = this.onClose; this.onClose = null; f(); }
    }
  };
  XG.modal = modal;

  XG.copyText = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacy(text); });
    }
    return legacy(text);

    function legacy(value) {
      return new Promise(function (resolve, reject) {
        try {
          const ta = document.createElement('textarea');
          ta.value = value;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0, value.length);
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error('copy failed'));
        } catch (err) { reject(err); }
      });
    }
  };

  XG.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  XG.roomFromUrl = function () {
    const p = new URLSearchParams(location.search);
    return (p.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  };

  XG.newRoom = function () {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const buf = new Uint8Array(4);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (let i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < 4; i++) s += A[buf[i] % A.length];
    return s;
  };
})();
