/* ============================================================
   app.js — Cờ Tam Quốc: giao diện, hiệu ứng, âm thanh, chế độ chơi
   ============================================================ */
(function () {
  'use strict';
  const BD = window.Board, EN = window.Engine, AIM = window.AI, NetCls = window.Net;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const FILE_L = 'abcdefghi';
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ===================== TRẠNG THÁI ===================== */
  const APP = {
    mode: 'ai', level: 'medium', sound: true, neutral: false,
    game: null, humanF: [true, false, false],
    seat: 0, host: false, roomCode: null, net: null, netDead: false,
    started: true, busy: false, aiScheduled: false,
    sel: null, selMoves: [],
    aiGen: 0, cards: [], pieceEls: new Map(), pieceOwner: new Map(),
    pendingNet: null
  };

  /* ===================== ÂM THANH (WebAudio) ===================== */
  const Sfx = {
    ctx: null, ok: true,
    ac() {
      if (!this.ok || !APP.sound) return null;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) { this.ok = false; return null; }
      if (!this.ctx) this.ctx = new C();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(o) {
      const ctx = this.ac(); if (!ctx) return;
      const t = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.dur || .2));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol || .12, t + .01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || .2));
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + (o.dur || .2) + .05);
    },
    noise(o) {
      const ctx = this.ac(); if (!ctx) return;
      const t = ctx.currentTime + (o.delay || 0);
      const n = Math.max(1, Math.floor(ctx.sampleRate * (o.dur || .1)));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = o.freq || 1800; bp.Q.value = o.q || 1;
      const g = ctx.createGain(); g.gain.value = o.vol || .2;
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start(t);
    },
    click()  { this.tone({ f: 560, f2: 700, dur: .06, vol: .05, type: 'triangle' }); },
    select() { this.tone({ f: 780, f2: 1050, dur: .08, vol: .06 }); },
    move()   { this.noise({ dur: .06, freq: 2300, vol: .22 }); this.tone({ f: 330, f2: 190, dur: .12, vol: .1, type: 'triangle' }); },
    capture(){ this.noise({ dur: .14, freq: 1300, vol: .3 }); this.tone({ f: 190, f2: 70, dur: .22, vol: .17 }); this.tone({ f: 620, dur: .07, vol: .07, delay: .04 }); },
    check()  { this.tone({ f: 660, dur: .14, vol: .1, type: 'square' }); this.tone({ f: 880, dur: .26, vol: .09, delay: .13, type: 'square' }); },
    elim()   { this.noise({ dur: .9, freq: 750, vol: .18, q: .6 }); this.tone({ f: 340, f2: 55, dur: .9, vol: .17, type: 'sawtooth' }); this.tone({ f: 92, f2: 44, dur: 1.1, vol: .14, delay: .1 }); },
    win()    { [523, 659, 784, 1046, 1319].forEach((f, i) => this.tone({ f, dur: .34, vol: .1, delay: i * .13, type: 'triangle' })); this.tone({ f: 1568, dur: .7, vol: .1, delay: .7, type: 'triangle' }); },
    draw()   { this.tone({ f: 440, dur: .4, vol: .1, type: 'triangle' }); this.tone({ f: 415, dur: .5, vol: .1, delay: .3, type: 'triangle' }); },
    err()    { this.tone({ f: 240, f2: 150, dur: .3, vol: .09, type: 'square' }); }
  };

  /* ===================== TIỆN ÍCH ===================== */
  function fmtPieceName(owner, type) {
    return type === BD.B ? 'Cờ hiệu ' + BD.BANNER_NAME[owner] : BD.typeName(type, owner);
  }
  function coord(node) { return FILE_L[BD.nF(node) - 1] + BD.nR(node); }
  function elNS(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ===================== XÂY BÀN CỜ SVG ===================== */
  function buildBoard() {
    const svg = $('board');
    let s = '<defs>' +
      '<radialGradient id="parchGrad" cx="50%" cy="42%" r="72%">' +
      '<stop offset="0%" stop-color="#fbf3de"/><stop offset="62%" stop-color="#f1e2be"/><stop offset="100%" stop-color="#dcc79a"/></radialGradient>' +
      '<radialGradient id="gradF0" cx="35%" cy="27%" r="82%"><stop offset="0%" stop-color="#ea6d5c"/><stop offset="55%" stop-color="#cf3a3a"/><stop offset="100%" stop-color="#7d1a1a"/></radialGradient>' +
      '<radialGradient id="gradF1" cx="35%" cy="27%" r="82%"><stop offset="0%" stop-color="#4fc57c"/><stop offset="55%" stop-color="#2e9e56"/><stop offset="100%" stop-color="#12522b"/></radialGradient>' +
      '<radialGradient id="gradF2" cx="35%" cy="27%" r="82%"><stop offset="0%" stop-color="#7fa6ef"/><stop offset="55%" stop-color="#4a7fe0"/><stop offset="100%" stop-color="#173573"/></radialGradient>' +
      '</defs>';

    // lục giác + sông
    s += '<polygon class="board-hex" points="' + BD.draw.hex.map(p => p[0] + ',' + p[1]).join(' ') + '"/>';
    for (const ch of BD.draw.channels)
      s += '<polygon class="board-river" points="' + ch.map(p => p[0] + ',' + p[1]).join(' ') + '"/>';
    // rank
    for (const rk of BD.draw.ranks)
      s += '<polyline class="board-line' + (rk.major ? ' major' : '') + '" points="' +
        rk.pts.map(p => p[0] + ',' + p[1]).join(' ') + '"/>';
    // file nội bộ + file 5 trong lãnh thổ
    for (const f of BD.draw.files)
      s += `<line class="board-line" x1="${f.a[0]}" y1="${f.a[1]}" x2="${f.b[0]}" y2="${f.b[1]}"/>`;
    for (let t = 0; t < 3; t++) {
      const a = BD.pos[BD.nodeId(t, 5, 1)], b = BD.pos[BD.nodeId(t, 5, 5)];
      s += `<line class="board-line" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    }
    // cung
    for (const p of BD.draw.palaces)
      s += '<polyline class="board-palace" points="' + p.map(q => q[0] + ',' + q[1]).join(' ') + '"/>';
    // tam giác trung tâm
    s += '<polygon class="board-tri" points="' + BD.draw.triangle.map(p => p[0] + ',' + p[1]).join(' ') + '"/>';
    // 135 điểm
    for (let i = 0; i < BD.SIZE; i++)
      s += `<circle class="node-dot" cx="${BD.pos[i][0].toFixed(1)}" cy="${BD.pos[i][1].toFixed(1)}" r="4.2"/>`;
    // watermark phe + tên sông
    for (let t = 0; t < 3; t++) {
      const F = BD.FACTIONS[t], p = BD.pos[BD.nodeId(t, 5, 2)];
      s += `<text class="land-label" x="${p[0]}" y="${p[1]}" font-size="112" fill="${F.color}">${F.char}</text>`;
      s += `<text class="land-label" x="${p[0]}" y="${p[1] + 78}" font-size="21" fill="${F.color}" letter-spacing="6">${F.name.toUpperCase()}</text>`;
    }
    for (const ch of BD.draw.channels) {
      const cx = (ch[0][0] + ch[1][0] + ch[2][0] + ch[3][0]) / 4;
      const cy = (ch[0][1] + ch[1][1] + ch[2][1] + ch[3][1]) / 4;
      s += `<text class="board-hint-txt" x="${cx.toFixed(0)}" y="${cy.toFixed(0)}" text-anchor="middle" style="font-size:16px;fill:#3d6f9e;opacity:.5">SÔNG</text>`;
    }
    s += '<g id="gPieces"></g><g id="gFx"></g>';
    svg.innerHTML = s;
  }

  /* ===================== QUÂN CỜ ===================== */
  function createPieceEl(pc) {
    const g = elNS('g', { class: 'piece' });
    g.dataset.id = pc.id;
    const inner = elNS('g', { class: 'p-in' }, g);
    g._in = inner;
    g._shadow = elNS('circle', { class: 'p-shadow', r: 25, cy: 4.5 }, inner);
    g._body = elNS('circle', { class: 'p-body', r: 23 }, inner);
    g._ring = elNS('circle', { class: 'p-ring', r: 18.5 }, inner);
    g._glow = elNS('circle', { class: 'p-glow', r: 28.5, 'stroke-dasharray': '7 9' }, inner);
    g._han = elNS('text', { class: 'p-han', 'font-size': 27 }, inner);
    g._title = elNS('title', {}, g);
    return g;
  }
  function updatePieceEl(g, pc, delayMs) {
    const F = BD.FACTIONS[pc.owner];
    g._body.setAttribute('fill', 'url(#gradF' + pc.owner + ')');
    g._body.setAttribute('stroke', F.deep);
    g._body.style.transitionDelay = delayMs != null ? delayMs + 'ms' : '';
    g._han.textContent = BD.HAN[pc.owner][BD.TYPE_ORDER[pc.type]];
    g.classList.toggle('banner', pc.type === BD.B);
    const [x, y] = BD.pos[pc.node];
    g._title.textContent = fmtPieceName(pc.owner, pc.type) + ' ' + F.name + ' · ô ' + coord(pc.node);
    return [x, y];
  }
  function syncPieces(opts) {
    opts = opts || {};
    const seen = new Set();
    let ti = 0;
    for (const pc of APP.game.pieces()) {
      seen.add(pc.id);
      let g = APP.pieceEls.get(pc.id);
      const ownerBefore = APP.pieceOwner.has(pc.id) ? APP.pieceOwner.get(pc.id) : pc.owner;
      const changed = ownerBefore !== pc.owner;
      const delay = (opts.stagger && changed) ? (140 + ti++ * 35) : null;
      if (!g) {
        g = createPieceEl(pc);
        $('gPieces').appendChild(g);
        APP.pieceEls.set(pc.id, g);
        const p = updatePieceEl(g, pc, null);
        g.style.transform = `translate(${p[0]}px,${p[1]}px)`;
      } else {
        const p = updatePieceEl(g, pc, delay);
        g.style.transform = `translate(${p[0]}px,${p[1]}px)`;
      }
      APP.pieceOwner.set(pc.id, pc.owner);
      g.classList.remove('dead');
    }
    for (const [id, g] of APP.pieceEls) {
      if (seen.has(id)) continue;
      APP.pieceEls.delete(id);
      APP.pieceOwner.delete(id);
      if (opts.fx) {
        g.classList.add('cap-fx');
        setTimeout(() => g.remove(), 540);
      } else g.remove();
    }
  }

  /* ===================== NHẬT KÝ ===================== */
  function logLine(cls, html) {
    const log = $('log');
    const d = document.createElement('div');
    d.className = cls; d.innerHTML = html;
    log.appendChild(d);
    while (log.children.length > 300) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  const logInfo = t => logLine('l-info', t);
  function logMove(events) {
    const mv = events.move;
    const owner = APP.game.st.pOwner[mv.p];
    const F = BD.FACTIONS[owner];
    const name = fmtPieceName(owner, APP.game.st.pType[mv.p]);
    let s = `<b style="color:${F.color}">${F.name}</b>: ${name} ${coord(mv.from)} → ${coord(mv.to)}`;
    if (mv.cap !== -1) s += ` <span style="color:#c92a2a">✖ ăn ${fmtPieceName(mv.capOwner, mv.capType)}</span>`;
    logLine('l-move', s);
  }
  function logCheck(c) {
    const by = BD.FACTIONS[c.by], at = BD.FACTIONS[c.faction];
    logLine('l-check', `⚑ <b>${by.name}</b> CHIẾU <b>${at.name}</b>!`);
  }
  function logElim(el) {
    const V = BD.FACTIONS[el.victim], T = BD.FACTIONS[el.taker];
    logLine('l-elim',
      `⚡ PHE ${V.name.toUpperCase()} BỊ TIÊU DIỆT (${el.reason === 'mate' ? 'chiếu bí' : 'cờ bí'}) — ` +
      `<b style="color:${T.color}">${T.name}</b> hưởng toàn quân!`);
  }

  /* ===================== HUD ===================== */
  function buildCards() {
    const wrap = $('faction-cards');
    wrap.innerHTML = ''; APP.cards = [];
    for (let f = 0; f < 3; f++) {
      const F = BD.FACTIONS[f];
      const d = document.createElement('div');
      d.className = 'fcard'; d.style.color = F.color;
      d.innerHTML =
        `<div class="fc-crest" style="background:${F.color}"><span>${F.char}</span></div>` +
        `<div class="fc-info"><div class="fc-name">${F.name} · ${F.hero}</div>` +
        `<div class="fc-sub"></div></div><div class="fc-badge"></div>`;
      wrap.appendChild(d);
      APP.cards.push({ el: d, sub: d.querySelector('.fc-sub'), badge: d.querySelector('.fc-badge') });
    }
  }
  function updateHUD() {
    const st = APP.game.st, turn = st.turn;
    for (let f = 0; f < 3; f++) {
      const c = APP.cards[f], alive = st.alive[f];
      const n = APP.game.pieces().filter(p => p.owner === f).length;
      c.el.classList.toggle('dead', !alive);
      c.el.classList.toggle('turn', !!alive && APP.started && turn === f);
      c.sub.textContent = alive ? (n + ' quân' + (n !== 18 ? ' (' + (n > 18 ? '+' : '−') + Math.abs(18 - n) + ')' : '')) : 'Đã bị loại';
      c.badge.className = 'fc-badge'; c.badge.textContent = ''; c.badge.style.display = '';
      if (!alive) { c.badge.textContent = 'Bị loại'; c.badge.classList.add('dead'); }
      else if (APP.started && turn === f) {
        if (isAI(f)) { c.badge.textContent = 'Máy'; c.badge.classList.add('turn'); }
        else { c.badge.textContent = APP.mode === 'online' ? 'Bạn' : 'Đang đi'; c.badge.classList.add('turn'); }
      } else if (alive && APP.game.inCheck(f)) {
        c.badge.textContent = 'Bị chiếu!'; c.badge.classList.add('check');
      }
      if (!c.badge.textContent) c.badge.style.display = 'none';
      // vệt sáng check trên tướng
      const gEl = APP.pieceEls.get(st.genId[f]);
      if (gEl) gEl.classList.toggle('chk', !!alive && APP.game.inCheck(f));
    }
    // banner lượt
    const F = BD.FACTIONS[turn];
    const dot = document.querySelector('.tb-dot');
    dot.style.background = F.color; dot.style.color = F.color;
    let txt;
    if (!APP.started) txt = APP.mode === 'online'
      ? (APP.host ? 'Bạn là chủ phòng — bấm Bắt đầu' : 'Chờ chủ phòng bắt đầu…')
      : 'Chưa bắt đầu';
    else if (APP.game.st.gameOver) txt = 'Trận kết thúc';
    else if (isAI(turn)) txt = `${F.name} (máy) đang suy nghĩ…`;
    else txt = `Đến lượt ${F.name}` + (isMySeat(turn) && APP.mode === 'online' ? ' — bạn' : '');
    $('turn-text').textContent = txt;
    // gợi ý
    const hint = $('board-hint');
    if (!APP.started) {
      const under = matchMedia('(orientation:portrait) and (max-width:960px)').matches;
      hint.textContent = APP.mode === 'online'
        ? (under ? 'Chat ở panel phía dưới · chủ phòng bấm Bắt đầu'
                 : 'Nhắn chat ở panel bên phải · chủ phòng bấm Bắt đầu')
        : '';
    }
    else if (APP.game.st.gameOver) hint.textContent = '';
    else if (isAI(turn)) hint.textContent = 'Máy đang tính toán nước đi…';
    else if (APP.sel != null) hint.textContent = 'Chọn ô sáng để đi · ô viền đỏ là ô ăn quân';
    else hint.textContent = 'Chọn một quân cờ của phe mình';
    // nút hoàn nước
    const canUndo = APP.mode !== 'online' && APP.game.st.stack.length > 0 &&
      !APP.busy && APP.started && !st.gameOver;
    $('btn-undo').disabled = !canUndo;
    // lớp check nếu đang chiếu → thêm quầng sáng cho banner lượt
    document.querySelector('.turn-banner').style.borderColor =
      APP.started && !st.gameOver && APP.game.inCheck(turn) ? '#ff5a4e' : '';
    // thanh thông tin trên topbar: chế độ · phòng · số nước
    const info = $('top-info');
    if (info) {
      const small = matchMedia('(max-width:960px)').matches;   // màn nhỏ: nhãn gọn cho khỏi cắt
      const modeL = { ai: '1 vs 2 máy', mix: '2 người + 1 máy', pass: '3 người chơi chung', online: 'Online 3 người' }[APP.mode];
      const modeS = { ai: '1v2 máy', mix: '2 + 1', pass: '3 người', online: 'Online' }[APP.mode];
      const lv = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }[APP.level];
      let s = APP.mode === 'online'
        ? 'Phòng ' + (APP.roomCode || '——')
        : (small ? modeS : modeL) + (APP.mode !== 'pass' && lv ? ' · ' + lv : '');
      if (APP.started) s += st.gameOver ? ' · Hết' : ' · Nước ' + (st.stack.length + 1);
      info.textContent = s;
    }
  }

  /* ===================== CHỌN / ĐI QUÂN ===================== */
  function isAI(f) {
    if (APP.mode === 'online') return APP.host && !APP.humanF[f] && APP.started; // chủ phòng điều khiển phe trống
    return !APP.humanF[f];
  }
  function isMySeat(f) {
    if (APP.mode !== 'online') return APP.humanF[f];
    return f === APP.seat;
  }
  function isHumanTurn(f) {
    if (!APP.humanF[f]) return false;
    if (APP.mode === 'online') return f === APP.seat;
    return true;
  }
  function myTurn() {
    return APP.started && !APP.busy && !APP.game.st.gameOver && isHumanTurn(APP.game.st.turn);
  }
  function clearDots() { const g = $('gFx'); if (g) g.innerHTML = ''; }
  function deselect() {
    if (APP.sel != null) {
      const g = APP.pieceEls.get(APP.sel);
      if (g) g.classList.remove('sel');
    }
    APP.sel = null; APP.selMoves = [];
    clearDots();
    updateHUD();
  }
  function select(id) {
    if (APP.sel === id) { deselect(); return; }
    deselect();
    APP.sel = id;
    const g = APP.pieceEls.get(id);
    if (g) g.classList.add('sel');
    const from = APP.game.st.pNode[id];
    APP.selMoves = APP.game.legalMoves().filter(m => m.from === from);
    const fx = $('gFx');
    for (const m of APP.selMoves) {
      const [x, y] = BD.pos[m.to];
      const c = elNS('circle', {
        class: 'mv-dot' + (m.cap !== -1 ? ' cap' : ''),
        cx: x.toFixed(1), cy: y.toFixed(1), r: m.cap !== -1 ? 28 : 11
      });
      c.dataset.to = m.to;
      fx.appendChild(c);
    }
    Sfx.select();
    updateHUD();
  }

  /* ===================== HIỆU ỨNG ===================== */
  let bannerTimer = null;
  function showBanner(text, color) {
    const b = $('fx-banner');
    b.textContent = text;
    b.style.color = color || '#d9b45b';
    b.style.borderColor = color || '#d9b45b';
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.add('hidden'), 2200);
  }
  function sparks(pos, color) {
    const fx = $('gFx');
    for (let i = 0; i < 9; i++) {
      const a = (Math.PI * 2 * i) / 9 + Math.random() * .5;
      const d = 34 + Math.random() * 30;
      const outer = elNS('g', { style: `transform:translate(${pos[0]}px,${pos[1]}px)` }, fx);
      const c = elNS('circle', {
        r: 3 + Math.random() * 2.5, fill: i % 3 === 0 ? '#ffd77a' : color,
        style: `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px`
      }, outer);
      c.classList.add('spark');
      setTimeout(() => outer.remove(), 620);
    }
  }
  function flashScreen(color) {
    const d = document.createElement('div');
    d.className = 'elim-flash';
    d.style.background = `radial-gradient(ellipse at center, ${color}55, ${color}22 55%, transparent)`;
    $('screen-game').appendChild(d);
    setTimeout(() => d.remove(), 950);
    const w = document.createElement('div');
    w.className = 'shockwave';
    $('screen-game').appendChild(w);
    setTimeout(() => w.remove(), 850);
  }

  /* ===================== LỚP PHỦ ===================== */
  function showOverlay(html, onClick) {
    const o = $('fx-overlay');
    $('fx-overlay-inner').innerHTML = html;
    o.classList.remove('hidden');
    o.onclick = onClick || null;
  }
  function hideOverlay() {
    const o = $('fx-overlay');
    o.classList.add('hidden'); o.onclick = null;
    o.querySelectorAll('.confetti').forEach(c => c.remove());
  }
  function confettiBurst() {
    const o = $('fx-overlay');
    const cols = ['#cf3a3a', '#2e9e56', '#4a7fe0', '#d9b45b', '#f5df9b', '#fff'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = (2.4 + Math.random() * 2.6) + 's';
      c.style.animationDelay = (Math.random() * 1.2) + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      o.appendChild(c);
    }
    setTimeout(() => o.querySelectorAll('.confetti').forEach(c => c.remove()), 7000);
  }
  function showVictory(events) {
    const F = events.winner >= 0 ? BD.FACTIONS[events.winner] : null;
    let title, sub;
    if (!F) { title = 'HÒA'; sub = 'Vượt giới hạn số nước — ba phe ngang tài, người cười người đắng!'; Sfx.draw(); }
    else {
      title = F.name + ' THẮNG!';
      if (APP.mode === 'online') sub = `Phe ${F.name} — ${F.hero} — giành chiến thắng!`;
      else if (APP.mode === 'pass') sub = `${F.hero} của phe ${F.name} thống nhất giang sơn!`;
      else if (events.winner === 0) sub = 'Bạn đã bình định Tam Quốc — thiên hạ quy về một mối!';
      else sub = `${F.name} đã thắng — thử lại nhé, vận may sẽ mỉm cười!`;
      Sfx.win();
    }
    logLine('l-elim', F ? `👑 <b>${F.name} giành chiến thắng!</b>` : '🤝 Trận hòa!');
    showOverlay(
      `<div class="win-rays"></div><div class="win-title">${title}</div><div class="win-sub">${sub}</div>` +
      `<div class="win-actions"><button class="net-btn primary" id="ov-replay">⟳ Chơi lại</button>` +
      `<button class="net-btn" id="ov-menu">☰ Về menu</button></div>`
    );
    confettiBurst();
    $('ov-replay').onclick = e => {
      e.stopPropagation(); hideOverlay();
      if (APP.mode === 'online') {
        if (APP.host && APP.net) APP.net.send({ t: 'rematch' });
        else logInfo('Chờ chủ phòng tạo ván mới…');
        return;
      }
      newGame();
    };
    $('ov-menu').onclick = e => { e.stopPropagation(); hideOverlay(); enterMenu(); };
  }
  function passHandover() {
    const f = APP.game.st.turn, F = BD.FACTIONS[f];
    showOverlay(
      `<div class="pass-title" style="color:${F.color}">${F.char} ${F.name}</div>` +
      `<div class="win-sub">Đến lượt <b>${F.name}</b> — Người chơi ${F.name} bấm để xem bàn cờ</div>`
    );
  }

  /* ===================== ĐI NƯỚC ===================== */
  async function playMove(mv) {
    if (APP.busy) return;
    APP.busy = true;
    APP.aiScheduled = false;
    deselect();
    const game = APP.game;
    const events = game.play(mv);
    // hiệu ứng ăn quân
    if (mv.cap !== -1 && APP.pieceEls.has(mv.cap)) {
      const capEl = APP.pieceEls.get(mv.cap);
      capEl.classList.add('cap-fx');
      APP.pieceEls.delete(mv.cap); APP.pieceOwner.delete(mv.cap);
      sparks(BD.pos[mv.to], BD.FACTIONS[mv.capOwner].color);
      setTimeout(() => capEl.remove(), 540);
    }
    if (mv.cap !== -1) Sfx.capture(); else Sfx.move();
    logMove(events);
    const stagger = events.eliminations.length > 0;
    syncPieces({ fx: true, stagger });
    // vệt "nước vừa đi"
    for (const [, g] of APP.pieceEls) g.classList.remove('moved-last');
    const movedEl = APP.pieceEls.get(mv.p);
    if (movedEl) movedEl.classList.add('moved-last');
    updateHUD();
    await wait(370);
    if (APP.game !== game) { APP.busy = false; return; }   // ván mới giữa chừng
    // chiếu
    if (events.checks.length) {
      Sfx.check();
      showBanner('CHIẾU TƯỚNG!', '#ff5a4e');
      for (const c of events.checks) logCheck(c);
    }
    // loại phe
    for (const e of events.eliminations) await doElimination(e, game);
    updateHUD();
    if (events.gameOver) {
      await wait(650);
      APP.busy = false;
      if (APP.game === game) showVictory(events);
      return;
    }
    APP.busy = false;
    // nước từ mạng đang chờ
    if (APP.pendingNet) { const m = APP.pendingNet; APP.pendingNet = null; handleNetMove(m); return; }
    afterTurn();
  }

  async function doElimination(el, game) {
    const V = BD.FACTIONS[el.victim], T = BD.FACTIONS[el.taker];
    Sfx.elim();
    flashScreen(V.color);
    showBanner(`PHE ${V.name} BỊ TIÊU DIỆT!`, V.color);
    logElim(el);
    // tướng bị hạ
    const gEl = APP.pieceEls.get(game.st.genId[el.victim]);
    if (gEl) {
      gEl.classList.add('cap-fx');
      setTimeout(() => gEl.remove(), 540);
      APP.pieceEls.delete(game.st.genId[el.victim]);
    }
    // quân hưởng trèo ngai
    if (el.viaPiece !== -1) {
      const via = APP.pieceEls.get(el.viaPiece);
      if (via) { via.classList.add('sel'); setTimeout(() => via.classList.remove('sel'), 1400); }
    }
    await wait(1150);
  }

  /* ===================== LƯU ĐIỂM / AI / MẠNG ===================== */
  function afterTurn() {
    updateHUD();
    if (APP.mode === 'pass' && !APP.game.st.gameOver && APP.started) { passHandover(); return; }
    maybeAITurn();
  }
  function runAI(f, cb) {
    if (APP.aiScheduled) return;
    APP.aiScheduled = true;
    const gen = APP.aiGen;
    showThinking(f);
    setTimeout(() => {
      if (gen !== APP.aiGen) return;                    // ván mới / hoàn nước → bỏ
      APP.aiScheduled = false;
      if (APP.game.st.gameOver || APP.game.st.turn !== f) { hideThinking(); return; }
      const mv = AIM.chooseMove(APP.game, { level: APP.level, me: f });
      hideThinking();
      if (mv && APP.game.st.turn === f) cb(mv);
    }, 120);
  }
  function showThinking(f) {
    $('think-text').textContent = BD.FACTIONS[f].name + ' đang suy nghĩ';
    $('thinking').classList.remove('hidden');
  }
  function hideThinking() { $('thinking').classList.add('hidden'); }
  function maybeAITurn() {
    if (!APP.started || APP.busy || APP.game.st.gameOver) return;
    const f = APP.game.st.turn;
    if (APP.mode === 'online') {
      if (f === APP.seat) return;                        // mình đi
      if (APP.host && !APP.humanF[f]) runAI(f, mv => { APP.net.send({ t: 'move', seat: f, p: mv.p, to: mv.to }); });
      return;                                            // còn lại: chờ mạng
    }
    if (isHumanTurn(f)) return;
    runAI(f, mv => playMove(mv));
  }

  function handleNetMove(m) {
    if (!APP.game || !APP.started || APP.game.st.gameOver) return;
    if (m.seat === APP.seat) return;                     // echo của chính mình
    if (APP.game.st.turn !== m.seat) { logInfo('Nước đi lệch lượt — bỏ qua'); return; }
    const mv = APP.game.legalMoves().find(x => x.p === m.p && x.to === m.to);
    if (!mv) { logInfo('Nước đi không hợp lệ từ máy chủ — bỏ qua'); return; }
    if (APP.busy) { APP.pendingNet = m; return; }
    playMove(mv);
  }

  /* ===================== VÁN MỚI / MENU ===================== */
  function newGame() {
    APP.aiGen++;
    APP.aiScheduled = false;
    hideOverlay(); hideThinking(); clearDots();
    $('fx-banner').classList.add('hidden');
    APP.sel = null; APP.selMoves = []; APP.pendingNet = null; APP.busy = false;
    for (const [, g] of APP.pieceEls) g.remove();
    APP.pieceEls.clear(); APP.pieceOwner.clear();
    APP.game = new EN.Game({ neutral: APP.neutral, moveLimit: 600 });
    $('log').innerHTML = '';
    syncPieces();
    const modeName = { ai: '1 người vs 2 máy', mix: '2 người + 1 máy', pass: '3 người chơi chung', online: 'Online 3 người' }[APP.mode];
    logInfo(`⚔ Ván mới · ${modeName}${APP.mode !== 'pass' ? ' · độ khó: ' + ({ easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }[APP.level]) : ''}`);
    updateHUD();
    if (APP.started) maybeAITurn();      // phe máy (hoặc máy trống trong online) đi trước nếu tới lượt
  }
  function enterGameScreen() {
    $('screen-menu').classList.remove('active');
    $('screen-game').classList.add('active');
    $('room-panel').classList.toggle('hidden', APP.mode !== 'online');
  }
  function enterMenu() {
    clearTimersUI();
    if (APP.net) { try { APP.net.send({ t: 'leave' }); APP.net.close(); } catch (e) {} }
    APP.net = null; APP.roomCode = null; APP.started = false;
    hideOverlay(); hideThinking();
    $('screen-game').classList.remove('active');
    $('screen-menu').classList.add('active');
    $('net-msg').textContent = '';
  }
  function clearTimersUI() {
    APP.aiGen++;
    clearTimeout(bannerTimer);
  }
  function applyMode(m) {
    APP.mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('selected', b.dataset.mode === m));
    $('online-box').classList.toggle('hidden', m !== 'online');
    $('btn-play').style.display = m === 'online' ? 'none' : '';
    if (m === 'ai') APP.humanF = [true, false, false];
    else if (m === 'mix') APP.humanF = [true, true, false];
    else if (m === 'pass') APP.humanF = [true, true, true];
    else APP.humanF = [false, false, false];
  }

  /* ===================== MẠNG ===================== */
  function netMsg(t) { $('net-msg').textContent = t || ''; }
  function renderRoster(players, host) {
    const box = $('room-seats'); box.innerHTML = '';
    APP.humanF = [false, false, false];
    const bySeat = {};
    players.forEach(p => { bySeat[p.seat] = p; APP.humanF[p.seat] = true; });
    APP.host = APP.seat === host;
    $('btn-start').style.display = (APP.host && !APP.started) ? '' : 'none';
    for (let f = 0; f < 3; f++) {
      const F = BD.FACTIONS[f], p = bySeat[f];
      const d = document.createElement('div');
      d.className = 'seat';
      d.innerHTML = `<span class="s-f" style="color:${F.color}">${F.char} ${F.name}</span>` +
        `<span class="s-n">${p ? p.name + (f === APP.seat ? ' (bạn)' : '') + (host === f ? ' 👑' : '') : '— trống (máy)'}</span>`;
      box.appendChild(d);
    }
  }
  function wireNet(net) {
    net.on('joined', m => {
      APP.seat = m.seat; APP.roomCode = m.code; APP.netDead = false; APP.started = false;
      netMsg('');
      applyMode('online');
      enterGameScreen();
      renderRoster(m.players, m.host);
      $('room-code-txt').textContent = m.code;
      $('chat-log').innerHTML = '';
      newGame();
      logInfo(`Đã vào phòng <b>${m.code}</b> — bạn ngồi phe <b>${BD.FACTIONS[m.seat].name}</b>.`);
      if (m.host === m.seat) logInfo('Bạn là CHỦ PHÒNG — mời thêm 2 người rồi bấm Bắt đầu.');
      updateHUD();
    });
    net.on('players', m => {
      renderRoster(m.players, m.host);
      if (APP.started) { updateHUD(); maybeAITurn(); }
    });
    net.on('started', () => {
      APP.started = true;
      newGame();
      logInfo('🏆 Trận đấu bắt đầu! Phe Thục đi trước.');
      Sfx.click();
      maybeAITurn();
    });
    net.on('move', m => handleNetMove(m));
    net.on('chat', m => {
      const d = document.createElement('div');
      d.className = 'l-chat';
      d.innerHTML = `<b style="color:#d9b45b">${m.name}:</b> ${m.msg}`;
      $('chat-log').appendChild(d);
      $('chat-log').scrollTop = 1e6;
      logLine('l-chat', `💬 <b>${m.name}</b>: ${m.msg}`);
    });
    net.on('err', m => { netMsg(m.msg); Sfx.err(); });
    net.on('rematch', () => {
      APP.started = false;
      newGame();
      logInfo('Ván mới — chủ phòng bấm Bắt đầu khi mọi người sẵn sàng.');
      updateHUD();
    });
    net.on('close', () => {
      if (APP.netDead) return;
      APP.netDead = true;
      showBanner('MẤT KẾT NỐI!', '#ff5a4e');
      logInfo('🔌 Mất kết nối máy chủ.');
      hideThinking();
    });
  }
  async function netCreateOrJoin(payload) {
    netMsg('Đang kết nối…');
    if (APP.net) { try { APP.net.close(); } catch (e) {} APP.net = null; }
    const net = new NetCls();
    try { await net.connect(); }
    catch (e) {
      netMsg('Không kết nối được. Chơi online cần Internet — hoặc chạy "node server.js" rồi mở http://localhost:8787');
      return;
    }
    APP.net = net;
    wireNet(net);
    net.send(payload);
  }

  /* ===================== SỰ KIỆN ===================== */
  function wireEvents() {
    // âm thanh khi bấm nút bất kỳ
    document.addEventListener('click', e => { if (e.target.closest('button')) Sfx.click(); });
    document.addEventListener('pointerdown', () => Sfx.ac());

    // menu: chế độ
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.addEventListener('click', () => applyMode(b.dataset.mode));
    });
    // menu: độ khó
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.addEventListener('click', () => {
        APP.level = b.dataset.level;
        document.querySelectorAll('.diff-btn').forEach(x => x.classList.toggle('selected', x === b));
      });
    });
    $('opt-sound').addEventListener('change', e => { APP.sound = e.target.checked; syncSoundBtn(); });
    $('opt-neutral').addEventListener('change', e => { APP.neutral = e.target.checked; });
    // bắt đầu trận (offline)
    $('btn-play').addEventListener('click', () => {
      APP.started = true;
      enterGameScreen();
      newGame();
    });
    // online
    $('btn-create').addEventListener('click', () => {
      netCreateOrJoin({ t: 'create', name: $('inp-name').value });
    });
    $('btn-join').addEventListener('click', () => {
      const code = $('inp-code').value.trim().toUpperCase();
      if (code.length < 4) { netMsg('Mã phòng gồm 4 ký tự'); return; }
      netCreateOrJoin({ t: 'join', code, name: $('inp-name').value });
    });
    $('inp-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().slice(0, 4); });
    $('inp-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });

    // bàn cờ
    $('board').addEventListener('click', onBoardClick);

    // thanh trên
    $('btn-undo').addEventListener('click', doUndo);
    $('btn-sound').addEventListener('click', () => {
      APP.sound = !APP.sound;
      $('opt-sound').checked = APP.sound;
      syncSoundBtn();
    });
    $('btn-restart').addEventListener('click', () => {
      if (APP.mode === 'online') { if (APP.net) APP.net.send({ t: 'rematch' }); return; }
      newGame();
    });
    $('btn-menu').addEventListener('click', enterMenu);

    // room panel
    $('btn-start').addEventListener('click', () => { if (APP.net) APP.net.send({ t: 'start' }); });
    const sendChat = () => {
      const v = $('inp-chat').value.trim();
      if (v && APP.net) { APP.net.send({ t: 'chat', msg: v }); $('inp-chat').value = ''; }
    };
    $('btn-chat-send').addEventListener('click', sendChat);
    $('inp-chat').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

    window.addEventListener('beforeunload', () => {
      if (APP.net) { try { APP.net.send({ t: 'leave' }); } catch (e) {} }
    });
  }
  function syncSoundBtn() { $('btn-sound').textContent = APP.sound ? '🔊' : '🔇'; }

  /* đổi tọa độ SVG từ vị trí chạm — dùng để "chụt" khi ngón tay trượt */
  function svgPoint(e) {
    const svg = $('board'), r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const k = Math.min(r.width / vb.width, r.height / vb.height) || 1;
    const ox = (r.width - vb.width * k) / 2, oy = (r.height - vb.height * k) / 2;
    return [(e.clientX - r.left - ox) / k, (e.clientY - r.top - oy) / k];
  }
  function sendMove(mv) {
    if (APP.mode === 'online' && APP.net) APP.net.send({ t: 'move', seat: APP.seat, p: mv.p, to: mv.to });
    playMove(mv);
  }
  function onBoardClick(e) {
    if (!myTurn()) return;
    // 1) chạm trúng ô đi / ô ăn (hit-test thật)
    const dot = e.target.closest && e.target.closest('.mv-dot');
    if (dot != null) {
      const mv = APP.selMoves.find(m => m.to === +dot.dataset.to);
      if (mv) sendMove(mv);
      return;
    }
    // 2) chạm trúng quân cờ
    const pel = e.target.closest && e.target.closest('.piece');
    if (pel) {
      const id = +pel.dataset.id;
      const st = APP.game.st;
      if (st.pOwner[id] === st.turn && st.pAlive[id]) select(id);
      else deselect();
      return;
    }
    // 3) trượt ngón (điện thoại): chọn mục tiêu NEAREST trong bán kính dễ bấm
    const [x, y] = svgPoint(e);
    const st = APP.game.st;
    if (APP.sel != null) {
      let best = null, bestKey = 33;   // ăn quân được cộng 8 — gần như bấm đâu cũng ăn
      for (const m of APP.selMoves) {
        const p = BD.pos[m.to];
        const key = Math.hypot(p[0] - x, p[1] - y) - (m.cap !== -1 ? 8 : 0);
        if (key < bestKey) { bestKey = key; best = m; }
      }
      if (best) { sendMove(best); return; }
    }
    let bp = null, bd = 27;
    for (const [id] of APP.pieceEls) {
      if (st.pOwner[id] !== st.turn || !st.pAlive[id]) continue;
      const p = BD.pos[st.pNode[id]];
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; bp = id; }
    }
    if (bp != null) select(bp); else deselect();
  }

  function doUndo() {
    if (APP.mode === 'online' || APP.busy) return;
    const game = APP.game;
    if (!game.st.stack.length) return;
    APP.aiGen++;
    APP.aiScheduled = false;
    hideOverlay(); hideThinking();
    game.undo();
    // hoàn tới khi về lượt người
    let guard = 0;
    while (!isHumanTurn(game.st.turn) && game.st.stack.length && guard++ < 12) game.undo();
    for (const [, g] of APP.pieceEls) g.remove();
    APP.pieceEls.clear(); APP.pieceOwner.clear();
    APP.sel = null; APP.selMoves = [];
    syncPieces();
    logInfo('↩ Hoàn nước');
    updateHUD();
  }

  /* ===================== KHỞI TẠO ===================== */
  function init() {
    buildBoard();
    buildCards();
    wireEvents();
    applyMode('ai');
    syncSoundBtn();
    APP.started = true;
    newGame();
  }
  init();
  /* hook cho test tự động / debug */
  window.__coTamQuoc = { APP, playMove, newGame, enterMenu, updateHUD, syncPieces, doElimination };
})();
