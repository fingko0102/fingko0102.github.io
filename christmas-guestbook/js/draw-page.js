/* 그리기(참여) 화면 */
(function () {
  const XG = (window.XG = window.XG || {});

  XG.startDraw = function (room) {
    const $ = function (id) { return document.getElementById(id); };
    const badge = $('conn-badge');
    const badgeText = badge.querySelector('span');
    $('draw-room').textContent = room;

    const back = $('draw-back');
    back.setAttribute('href', '?mode=wall&room=' + encodeURIComponent(room));

    let state = 'connecting';
    let lastCount = 0;

    function serverOn() {
      return !!(XG.api && XG.api.enabled() && XG.api.available());
    }

    function paint() {
      badge.classList.remove('live', 'local', 'off');
      let text = '연결 중…';
      if (serverOn()) {
        // 서버 DB에 바로 저장되므로 P2P 연결을 기다리지 않고 초록 불로 알린다
        badge.classList.add('live');
        text = '서버 DB 연결됨' + (lastCount > 0 ? ' · ' + lastCount : '');
      } else if (state === 'live') {
        badge.classList.add('live');
        text = '미디어월 연결' + (lastCount > 0 ? ' · ' + lastCount : '');
      } else if (state === 'local') {
        badge.classList.add('local');
        text = '로컬 연결' + (lastCount > 0 ? ' · ' + lastCount : '');
      } else if (state === 'no-wall') {
        badge.classList.add('off');
        text = '월 대기 중';
      } else if (state === 'off') {
        badge.classList.add('off');
        text = '체험 모드';
      }
      badgeText.textContent = text;
    }

    const bus = XG.createBus({
      room: room,
      role: 'guest',
      // 이 기기에 남아 있는 그림도 미디어월과 맞춘다
      getArts: function () { return XG.artStore ? XG.artStore.loadAll() : []; },
      onArt: function () {},
      onCount: function (n) { lastCount = n; paint(); },
      onStatus: function (s) { state = s; paint(); }
    });

    // 서버 DB가 살아 있는지 먼저 확인한다 → '월 대기 중'에 머물지 않고 바로 초록 불
    if (XG.api && XG.api.enabled()) {
      if (XG.api.onChange) XG.api.onChange(paint);
      if (XG.api.ping) XG.api.ping().then(paint, function () { paint(); });
    }

    paint();

    /* 이 기기에 남아 있던 그림도 서버 DB로 올려 둔다 (서버가 응답할 때만, 조용히)
       - 여러 장을 한 장씩 동시에 보내면 서버가 서로를 덮어쓰므로, 한 번의 요청으로 모아 올린다. */
    if (XG.api && XG.api.enabled() && XG.artStore) {
      const local = XG.artStore.loadAll();
      if (local.length) {
        XG.api.listArts(room).then(function (list) {
          if (!list) return;
          const have = Object.create(null);
          for (let i = 0; i < list.length; i++) {
            const a = list[i];
            if (a && a.id) have[a.id] = 1;
          }
          const missing = [];
          local.slice(-30).forEach(function (a) {
            if (!a || !a.id || have[a.id]) return;
            if (XG.artStore.isDeleted(a.id)) return;
            missing.push(a);
          });
          if (missing.length) XG.api.putArts(room, missing);
        }).catch(function () {});
      }
    }

    XG.createDrawer($('drawer-host'), {
      sentExtra: '<button type="button" class="btn-line" data-go="wall">미디어월 보기</button>',
      onSend: function (payload) {
        let r = { remote: false, sameBrowser: false };
        try { r = bus.sendArt(payload); } catch (e) {}
        const st = bus.state ? bus.state() : { p2p: 'connecting' };
        if (st.p2p === 'open') { state = 'live'; paint(); }
        if (r.remote) return '실시간으로 미디어월에 보냈어요.';
        // P2P가 아니어도 서버 DB에 바로 저장되므로 미디어월이 곧 받아 간다
        if (serverOn() || r.sameBrowser) return '미디어월에 보냈어요! 곧 화면에 떠올라요.';
        return '그림을 저장했어요. 미디어월이 열려 있으면 바로 떠올라요.';
      },
      onSentShown: function (el) {
        const b = el.querySelector('[data-go="wall"]');
        if (b) b.addEventListener('click', function () {
          location.href = '?mode=wall&room=' + encodeURIComponent(room);
        });
      }
    });

    window.addEventListener('beforeunload', function () { bus.destroy(); });
  };
})();
