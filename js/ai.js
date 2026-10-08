/* ============================================================
   ai.js — Đối máy Cờ Tam Quốc
   Alpha-beta tìm kiếm, tối đa hóa cho "phe mình", các phe khác
   bị coi là liên minh đánh lại mình (hệ số xấu nhất).
   Tầng độ khó: easy (Dễ) / medium (Vừa) / hard (Khó)
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./engine.js'), require('./board.js'));
  else global.AI = factory(global.Engine, global.Board);
})(typeof self !== 'undefined' ? self : this, function (E, BD) {
  'use strict';

  const INF = 1e9;
  const WIN = 1e6;
  const V = BD.VALUE;

  const LEVELS = {
    easy:   { maxDepth: 2,  time: 250,  noise: 130 },
    medium: { maxDepth: 4,  time: 800,  noise: 45 },
    hard:   { maxDepth: 9,  time: 2200, noise: 0 }
  };

  /* ---------------- Đánh giá vị trí (quan điểm phe `me`) ---------------- */
  function evaluate(st, me) {
    if (st.gameOver) {
      if (st.winner === me) return WIN + 5000;
      if (st.winner === -1) return 0;
      return -WIN - 5000;
    }
    if (!st.alive[me]) return -WIN - 4000;      // phe mình đã bị loại

    let score = 0;

    /* vật chất */
    for (let id = 0; id < st.nPieces; id++) {
      if (!st.pAlive[id]) continue;
      const t = st.pType[id];
      let v = V[BD.TYPE_ORDER[t]];
      /* tốt được đẩy xa ăn thêm */
      if (t === BD.P) v += BD.distOrigin(st.pNode[id], st.pOwner[id]) * 6;
      score += (st.pOwner[id] === me ? v : -v);
    }

    /* áp lực lên tướng: mình chiếu +, bị chiếu − */
    for (let f = 0; f < 3; f++) {
      if (f === me || !st.alive[f]) continue;
      const n = E.checkers(st, f).length;
      if (n) score += 90 + n * 30;                     // mình đang chiếu phe khác
    }
    if (E.checkers(st, me).length) score -= 160;       // mình đang bị chiếu

    /* quân mình tiến sâu đất địch + */
    for (let id = 0; id < st.nPieces; id++) {
      if (!st.pAlive[id]) continue;
      const o = st.pOwner[id], t = st.pType[id];
      if (t === BD.K || t === BD.A || t === BD.E) continue;
      const inEnemy = BD.nodes[st.pNode[id]].t !== o;
      if (o === me && inEnemy) score += 14;
      if (o !== me && inEnemy && BD.nodes[st.pNode[id]].t === me) score -= 18;  // quân địch xâm lấn đất mình
    }

    return score;
  }

  /* ---------------- Alpha-beta ---------------- */
  function ab(game, me, depth, alpha, beta, ctx) {
    const st = game.st;
    if (st.gameOver) return terminal(st, me);
    if (ctx.nodes % 512 === 0 && Date.now() > ctx.deadline) { ctx.out = true; }
    if (ctx.out) return evaluate(st, me);
    if (depth <= 0) return evaluate(st, me);

    const moves = game.legalMoves(st.turn);
    if (!moves.length) return evaluate(st, me);

    /* ăn quân trước */
    for (const m of moves) m._s = m.cap !== -1 ? 10 * (V[BD.TYPE_ORDER[m.capType]] || 100) : 0;
    moves.sort((a, b) => b._s - a._s);

    const maxing = st.turn === me;
    let best = maxing ? -INF : INF;
    ctx.nodes++;

    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      game.play(mv);
      const s = ab(game, me, depth - 1, alpha, beta, ctx);
      game.undo();
      if (ctx.out) return best === (maxing ? -INF : INF) ? evaluate(st, me) : best;

      if (maxing) {
        if (s > best) best = s;
        if (best > alpha) alpha = best;
      } else {
        if (s < best) best = s;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  function terminal(st, me) {
    if (st.winner === me) return WIN + 5000;
    if (st.winner === -1) return 0;
    return -WIN - 5000;
  }

  /* ---------------- Chọn nước đi ---------------- */
  function chooseMove(game, opts) {
    opts = opts || {};
    const me = opts.me !== undefined && opts.me !== null ? opts.me : game.st.turn;
    const cfg = LEVELS[opts.level] || LEVELS.medium;
    const deadline = Date.now() + cfg.time;
    const ctx = { nodes: 0, out: false, deadline };

    const root0 = game.legalMoves(me);
    if (!root0.length) return null;
    if (root0.length === 1) return root0[0];

    /* sắp xếp cho root */
    for (const m of root0) m._s = m.cap !== -1 ? 10 * (V[BD.TYPE_ORDER[m.capType]] || 100) : 0;
    root0.sort((a, b) => b._s - a._s);

    let bestMove = root0[0];
    let bestScore = -INF;

    for (let depth = 1; depth <= cfg.maxDepth; depth++) {
      ctx.out = false;
      let alpha = -INF;
      let iterBest = null, iterScore = -INF;

      for (const mv of root0) {
        game.play(mv);
        const s = ab(game, me, depth - 1, alpha, INF, ctx);
        game.undo();
        if (ctx.out) break;
        const noisy = s + (cfg.noise ? (Math.random() * 2 - 1) * cfg.noise : 0);
        if (noisy > iterScore) { iterScore = noisy; iterBest = mv; }
        if (iterScore > alpha) alpha = iterScore;
      }

      if (ctx.out && depth > 1) break;      // hết giờ giữa chừng → giữ kết quả vòng trước
      if (iterBest) {
        bestMove = iterBest;
        bestScore = iterScore;
      }
      if (Math.abs(bestScore) > WIN / 2) break;   // đã thấy chắc thắng/thua
      if (Date.now() > deadline) break;
    }

    return bestMove;
  }

  return { chooseMove, evaluate, LEVELS };
});
