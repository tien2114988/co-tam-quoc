/* Test AI — chạy: node test/ai.js */
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗ ' + m); } else console.log('✓ ' + m); };

/* 1. chooseMove luôn trả về nước hợp lệ */
{
  const g = new E.Game({});
  for (const level of ['easy', 'medium', 'hard']) {
    const t0 = Date.now();
    const mv = AI.chooseMove(g, { level, me: 0 });
    const dt = Date.now() - t0;
    ok(mv && g.legalMoves(0).some(m => m.p === mv.p && m.to === mv.to),
      `${level}: trả nước hợp lệ (${dt}ms)`);
  }
}

/* 2. AI vs AI — cả 3 phe do máy điều khiển, ván phải kết thúc, mỗi nước nhanh */
function aiGame(levels, moveLimit) {
  const g = new E.Game({ moveLimit });
  let n = 0, worst = 0, elims = 0;
  const t0 = Date.now();
  while (!g.st.gameOver && n < moveLimit + 5) {
    const me = g.st.turn;
    const t1 = Date.now();
    const mv = AI.chooseMove(g, { level: levels[me], me });
    worst = Math.max(worst, Date.now() - t1);
    if (!mv) break;
    const ev = g.play(mv);
    elims += ev.eliminations.length;
    n++;
  }
  return { g, n, worst, total: Date.now() - t0, elims };
}

{
  const r = aiGame(['easy', 'easy', 'easy'], 300);
  ok(r.g.st.gameOver, `3 máy Easy: ván kết thúc sau ${r.n} nước (winner=${r.g.st.winner}, elim=${r.elims}, tổng ${r.total}ms, lâu nhất ${r.worst}ms)`);
  ok(r.worst < 1500, `Easy mỗi nước < 1.5s (lâu nhất ${r.worst}ms)`);
}

{
  const r = aiGame(['medium', 'medium', 'medium'], 300);
  ok(r.g.st.gameOver, `3 máy Vừa: kết thúc sau ${r.n} nước (winner=${r.g.st.winner}, elim=${r.elims}, tổng ${r.total}ms, lâu nhất ${r.worst}ms)`);
  ok(r.worst < 3000, `Vừa mỗi nước < 3s (lâu nhất ${r.worst}ms)`);
}

/* 3. Hard chỉ kiểm 5 nước (chậm hơn) */
{
  const g = new E.Game({});
  let worst = 0;
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    const mv = AI.chooseMove(g, { level: 'hard', me: g.st.turn });
    worst = Math.max(worst, Date.now() - t);
    g.play(mv);
  }
  ok(worst < 4000, `Hard mỗi nước < 4s (lâu nhất ${worst}ms)`);
}

/* 4. Hard phải thấy chiếu hoặc ít nhất ko treo tướng ngay —
      kiểm đơn giản: máy Khó (phe Thục) đối máy Easy, 12 nước đầu ko mất tướng */
{
  const g = new E.Game({});
  let okNoBlunder = true;
  for (let i = 0; i < 12 && !g.st.gameOver; i++) {
    const me = g.st.turn;
    const level = me === 0 ? 'hard' : 'easy';
    const mv = AI.chooseMove(g, { level, me });
    g.play(mv);
    if (g.st.gameOver && g.st.winner !== 0 && g.st.winner !== -1) { okNoBlunder = false; }
    if (!g.st.alive[0]) { okNoBlunder = false; }
  }
  ok(okNoBlunder, 'Hard (Thục) 12 nước vs Easy không bị loại');
}

console.log(fail === 0 ? '\n★ AI PASSED' : `\n✗ ${fail} lỗi`);
process.exit(fail ? 1 : 0);
