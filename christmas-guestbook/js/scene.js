/* 밤하늘 캔버스: 별 반짝임 + 눈 내림 */
(function () {
  const XG = (window.XG = window.XG || {});

  XG.scene = {
    mount(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      let W = 0, H = 0, dpr = 1;
      let flakes = [], stars = [];
      let raf = 0, last = 0, t = 0, running = true;

      function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = canvas.clientWidth || window.innerWidth;
        H = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.max(1, Math.round(W * dpr));
        canvas.height = Math.max(1, Math.round(H * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildFlakes();
        buildStars();
      }

      function makeFlake(anywhere) {
        const depth = Math.random();               // 0 = 멀리, 1 = 가까이
        return {
          x: Math.random() * W,
          y: anywhere ? Math.random() * H : -12,
          r: 0.7 + depth * 2.7,
          sp: 9 + depth * 34,
          sway: 6 + depth * 22,
          ph: Math.random() * Math.PI * 2,
          a: 0.16 + depth * 0.62
        };
      }

      function buildFlakes() {
        const n = Math.round(Math.min(170, Math.max(45, (W * H) / 8800)));
        flakes = [];
        for (let i = 0; i < n; i++) flakes.push(makeFlake(true));
      }

      function buildStars() {
        const n = Math.round(Math.min(120, Math.max(40, (W * H) / 11000)));
        stars = [];
        for (let i = 0; i < n; i++) {
          stars.push({
            x: Math.random() * W,
            y: Math.random() * H * 0.62,
            r: 0.5 + Math.random() * 1.3,
            ph: Math.random() * Math.PI * 2,
            sp: 0.5 + Math.random() * 1.6,
            warm: Math.random() < 0.25
          });
        }
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        t += dt;

        ctx.clearRect(0, 0, W, H);

        // 별
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const a = 0.28 + 0.62 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          ctx.beginPath();
          ctx.fillStyle = s.warm
            ? 'rgba(255,236,196,' + a.toFixed(3) + ')'
            : 'rgba(226,238,255,' + a.toFixed(3) + ')';
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // 눈
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.y += f.sp * dt;
          f.x += Math.sin(t * 0.7 + f.ph) * f.sway * dt;
          if (f.y - f.r > H) { flakes[i] = makeFlake(false); continue; }
          if (f.x < -20) f.x = W + 10;
          if (f.x > W + 20) f.x = -10;
          ctx.beginPath();
          ctx.fillStyle = 'rgba(255,255,255,' + f.a.toFixed(3) + ')';
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }

        raf = requestAnimationFrame(frame);
      }

      function start() {
        if (raf) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
      function stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }

      resize();
      start();

      let rt = 0;
      window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(resize, 160);
      });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
      });
    }
  };
})();
