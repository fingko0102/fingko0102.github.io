/* 데모 샘플 그림 (실제 참여 전 미리보기용) */
(function () {
  const XG = (window.XG = window.XG || {});

  function svg(inner) {
    const s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">' + inner + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  const STAR =
    '<defs><radialGradient id="g" cx="50%" cy="40%" r="64%">' +
      '<stop offset="0" stop-color="#fffdf0"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#efa73a"/>' +
    '</radialGradient><filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter></defs>' +
    '<path d="M120 26 143 89.3 207.5 91.6 156.1 131.7 174.1 194.4 120 158 65.9 194.4 83.9 131.7 32.5 91.6 97.7 89.3Z" fill="#ffd070" opacity=".75" filter="url(#b)"/>' +
    '<path d="M120 26 143 89.3 207.5 91.6 156.1 131.7 174.1 194.4 120 158 65.9 194.4 83.9 131.7 32.5 91.6 97.7 89.3Z" fill="url(#g)" stroke="#fff8dc" stroke-width="2.5" stroke-linejoin="round"/>';

  const TREE =
    '<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3ee19a"/><stop offset="1" stop-color="#0d7a51"/></linearGradient>' +
      '<radialGradient id="s" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fffbdc"/><stop offset="1" stop-color="#f0a93c"/></radialGradient></defs>' +
    '<rect x="110" y="196" width="20" height="26" rx="4" fill="#5b3f2a"/>' +
    '<path d="M120 34 156 106H84Z" fill="url(#t)"/>' +
    '<path d="M120 78 168 158H72Z" fill="url(#t)"/>' +
    '<path d="M120 122 186 212H54Z" fill="url(#t)"/>' +
    '<path d="M120 34 156 106H84Z" fill="none" stroke="#8ff0c4" stroke-width="2" opacity=".5"/>' +
    '<path d="M120 78 168 158H72Z" fill="none" stroke="#8ff0c4" stroke-width="2" opacity=".4"/>' +
    '<path d="M120 122 186 212H54Z" fill="none" stroke="#8ff0c4" stroke-width="2" opacity=".3"/>' +
    '<path d="M120 8 129 32 154 34 135 50 141 74 120 61 99 74 105 50 86 34 111 32Z" fill="url(#s)"/>' +
    '<g fill="#ffd98a"><circle cx="120" cy="96" r="3.6"/><circle cx="98" cy="130" r="3.4"/><circle cx="146" cy="132" r="3.2"/>' +
      '<circle cx="120" cy="168" r="3.8"/><circle cx="84" cy="184" r="3.4"/><circle cx="158" cy="186" r="3.2"/></g>' +
    '<g fill="#ff6b7d"><circle cx="110" cy="112" r="3.2"/><circle cx="134" cy="152" r="3.2"/><circle cx="102" cy="196" r="3.4"/>' +
      '<circle cx="140" cy="198" r="3.2"/></g>' +
    '<path d="M54 212h132c-14 8-44 12-66 12s-52-4-66-12Z" fill="#eaf3ff" opacity=".55"/>';

  const SNOWMAN =
    '<defs><radialGradient id="w" cx="38%" cy="32%" r="70%">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e6f0ff"/><stop offset="1" stop-color="#b9cdea"/></radialGradient></defs>' +
    '<ellipse cx="120" cy="216" rx="66" ry="10" fill="#0b1020" opacity=".18"/>' +
    '<circle cx="120" cy="160" r="56" fill="url(#w)"/>' +
    '<circle cx="120" cy="86" r="38" fill="url(#w)"/>' +
    '<ellipse cx="120" cy="120" rx="40" ry="9" fill="#e8455a"/>' +
    '<path d="M120 118l10 22h-24z" fill="#e8455a"/>' +
    '<rect x="96" y="42" width="48" height="9" rx="4.5" fill="#2a3350"/>' +
    '<rect x="104" y="14" width="32" height="30" rx="5" fill="#2a3350"/>' +
    '<circle cx="107" cy="80" r="4.4" fill="#1b2238"/><circle cx="133" cy="80" r="4.4" fill="#1b2238"/>' +
    '<path d="M120 88 146 96l-26 8z" fill="#ff9f43"/>' +
    '<circle cx="120" cy="146" r="4.6" fill="#1b2238"/><circle cx="120" cy="170" r="4.6" fill="#1b2238"/>' +
    '<circle cx="120" cy="192" r="4.6" fill="#1b2238"/>' +
    '<path d="M72 142 34 118" stroke="#8a5a35" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M168 142 206 118" stroke="#8a5a35" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M34 118l-8-12M34 118l-13 2M206 118l8-12M206 118l13 2" stroke="#8a5a35" stroke-width="4" stroke-linecap="round"/>';

  const HEART =
    '<defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ff8fa0"/><stop offset=".55" stop-color="#f4405c"/><stop offset="1" stop-color="#b81b36"/></linearGradient></defs>' +
    '<path d="M120 208C54 162 30 118 42 86 54 54 94 48 120 80c26-32 66-26 78 6 12 32-12 76-78 122z" fill="url(#h)"/>' +
    '<ellipse cx="86" cy="86" rx="16" ry="10" fill="#fff" opacity=".45" transform="rotate(-28 86 86)"/>';

  const GIFT =
    '<defs><linearGradient id="r" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ff6a7d"/><stop offset="1" stop-color="#c11f3b"/></linearGradient></defs>' +
    '<ellipse cx="120" cy="212" rx="72" ry="10" fill="#0b1020" opacity=".18"/>' +
    '<rect x="48" y="96" width="144" height="108" rx="10" fill="url(#r)"/>' +
    '<rect x="40" y="76" width="160" height="30" rx="9" fill="#e8455a"/>' +
    '<rect x="106" y="76" width="28" height="128" fill="#ffd98a"/>' +
    '<path d="M120 76c-22 0-40-10-40-24 0-10 10-16 20-12 12 5 20 20 20 36z" fill="#ffd98a"/>' +
    '<path d="M120 76c22 0 40-10 40-24 0-10-10-16-20-12-12 5-20 20-20 36z" fill="#ffe6ad"/>' +
    '<circle cx="120" cy="72" r="9" fill="#fff3c9"/>' +
    '<rect x="48" y="150" width="144" height="6" fill="#ffd98a" opacity=".35"/>';

  const BELL =
    '<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffeaa8"/><stop offset=".5" stop-color="#f3c96a"/><stop offset="1" stop-color="#c89332"/></linearGradient></defs>' +
    '<path d="M120 34c-8 0-14 6-14 14v4c-18 10-30 34-30 66 0 30-10 42-18 52h124c-8-10-18-22-18-52 0-32-12-56-30-66v-4c0-8-6-14-14-14z" fill="#f3c96a"/>' +
    '<path d="M120 34c-8 0-14 6-14 14v4c-18 10-30 34-30 66 0 30-10 42-18 52h62z" fill="#ffe6a6" opacity=".55"/>' +
    '<ellipse cx="120" cy="170" rx="62" ry="12" fill="#e0b155"/>' +
    '<circle cx="120" cy="192" r="14" fill="#d9a94e"/>' +
    '<circle cx="120" cy="192" r="6" fill="#b88a34"/>' +
    '<circle cx="120" cy="30" r="7" fill="#e0b155"/>' +
    '<path d="M96 96c2-14 10-26 18-32" stroke="#fff6d6" stroke-width="5" stroke-linecap="round" fill="none" opacity=".6"/>';

  XG.samples = function () {
    return [
      { id: 'sample-star', ex: 1, url: svg(STAR), name: '별지기', msg: '메리 크리스마스!' },
      { id: 'sample-tree', ex: 1, url: svg(TREE), name: '엄마', msg: '우리 가족 화이팅!' },
      { id: 'sample-snow', ex: 1, url: svg(SNOWMAN), name: '아빠', msg: '따뜻한 겨울 보내요' },
      { id: 'sample-heart', ex: 1, url: svg(HEART), name: '지훈', msg: '산타 할아버지 보고 싶어요' },
      { id: 'sample-gift', ex: 1, url: svg(GIFT), name: '친구', msg: '올해도 고마워!' },
      { id: 'sample-bell', ex: 1, url: svg(BELL), name: '할머니', msg: '즐거운 성탄절!' }
    ];
  };
})();
