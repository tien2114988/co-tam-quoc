/* Test rules engine — chạy: node test/engine.js */
const BD = require('../js/board.js');
const E = require('../js/engine.js');

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('✗ ' + msg); } else { pass++; } };
const K = BD.K, A = BD.A, H = BD.H, R = BD.R, C = BD.C, P = BD.P;

/* Tạo ván với thế cờ thủ công: [owner, type, territory, f, r] */
function craft(spec) {
  const g = new E.Game({ neutral: !!spec.neutral, moveLimit: spec.moveLimit || 600 });
  const st = g.st;
  st.sq.fill(-1); st.pAlive.fill(0); st.nPieces = 0; st.genId = [-1, -1, -1];
  st.alive = [true, true, true];
  st.attack = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
  st.lastMove = null; st.moveNo = 0; st.stack = []; st._cache = null;
  st.gameOver = false; st.winner = -1;
  st.turn = spec.turn || 0;
  (spec.pieces || []).forEach(([o, t, terr, f, r]) => st.addPiece(o, t, BD.nodeId(terr, f, r)));
  return g;
}
const node = (terr, f, r) => BD.nodeId(terr, f, r);

/* ============ 1. ván chuẩn: 30 nước/phe, undo chuẩn ============ */
{
  const g = new E.Game({});
  ok(g.legalMoves(0).length === 30 && g.legalMoves(1).length === 30 && g.legalMoves(2).length === 30,
    `ván chuẩn: 30/30/30 nước đầu (${g.legalMoves(0).length},${g.legalMoves(1).length},${g.legalMoves(2).length})`);

  const snap = () => JSON.stringify({
    sq: Array.from(g.st.sq), pOwner: Array.from(g.st.pOwner), pNode: Array.from(g.st.pNode),
    pAlive: Array.from(g.st.pAlive), alive: g.st.alive, turn: g.st.turn, moveNo: g.st.moveNo,
    attack: g.st.attack.map(a => Array.from(a)), lastMove: g.st.lastMove
  });
  const mv = g.legalMoves(0)[0];
  const s1 = snap();
  g.play(mv);
  const s2 = snap();
  g.undo();
  ok(snap() === s1 && s2 !== s1, 'undo khôi phục trạng thái y hệt sau 1 nước');
  ok(g.st.turn === 0 && g.st.moveNo === 0, 'undo trả turn & moveNo');
}

/* ============ 2. Xe: dừng ở quân đầu tiên ============ */
{
  const g = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 3],          // chặn mặt đối P02
    [0, R, 0, 1, 1], [0, P, 0, 1, 3], [2, P, 2, 1, 5], [2, K, 2, 5, 1]
  ]});
  const tos = g.legalMoves(0).filter(m => m.p === 2).map(m => m.to);
  ok(tos.includes(node(0, 1, 2)), 'xe đi được ô trống kế tiếp');
  ok(!tos.includes(node(0, 1, 4)) && !tos.includes(node(2, 1, 5)), 'xe bị chặn quân mình, ko đi xuyên');
}

/* ============ 3. Pháo: nhảy 1 màn ăn, ko đi sau màn ============ */
{
  const g = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 3],
    [0, C, 0, 1, 1], [0, P, 0, 1, 3], [2, P, 2, 1, 5], [2, K, 2, 5, 1]
  ]});
  const tos = g.legalMoves(0).filter(m => m.p === 2).map(m => m.to);
  ok(tos.includes(node(0, 1, 2)), 'pháo đi ô trống trước màn');
  ok(!tos.includes(node(0, 1, 4)) && !tos.includes(node(0, 1, 5)), 'pháo ko đi được sau màn (chỉ ăn)');
  ok(tos.includes(node(2, 1, 5)), 'pháo nhảy 1 màn ăn quân địch');
}

/* ============ 4. Mã: chặn chân ============ */
{
  const g1 = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 3], [0, H, 0, 2, 1], [2, K, 2, 5, 1]
  ]});
  let tos = g1.legalMoves(0).filter(m => m.p === 2).map(m => m.to);
  ok(tos.includes(node(0, 1, 3)) && tos.includes(node(0, 3, 3)), 'mã đi được nước chéo khi ko chặn');

  const g2 = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 3], [0, H, 0, 2, 1], [0, P, 0, 2, 2], [2, K, 2, 5, 1]
  ]});
  tos = g2.legalMoves(0).filter(m => m.p === 2).map(m => m.to);
  ok(!tos.includes(node(0, 1, 3)) && !tos.includes(node(0, 3, 3)), 'mã bị chặn chân khi có quân ở bước đầu');
}

/* ============ 5. CHIẾU BÍ bằng mã (ko thể chặn) → chuyển quân ============ */
{
  /* Kiểm chứng thế cờ: mã Thục tại Ngô(3,2) chiếu tướng Ngô(5,1) */
  const g = craft({ pieces: [
    [0, K, 0, 4, 1],                         // tướng Thục ko đứng f5 → tránh mặt đối sẵn
    [0, H, 1, 3, 2],                         // MÃ Thục trong đất Ngô — chiếu!
    [0, R, 1, 6, 5],                         // xe bịt ô chạy (6,1)
    [0, R, 1, 7, 2],                         // xe bịt ô chạy (5,2)
    [0, P, 0, 1, 4],                         // tốt Thục còn nước đi kích hoạt lượt
    [1, K, 1, 5, 1], [1, A, 1, 4, 1],        // tướng Ngô + sĩ bất động
    [2, K, 2, 5, 1], [2, P, 2, 5, 4]         // Ngụy + chặn mặt đối P12
  ]});
  ok(E.facingExists(g.st) === false, 'thế cờ chiếu bí ko có mặt đối');
  ok(g.checkers(1).join() === '0', 'ngô bị chiếu bởi đúng Thục');
  ok(g.legalMoves(1).length === 0, `tướng Ngô bị mã chiếu hết đường (có ${g.legalMoves(1).length} nước)`);

  const mvP = g.legalMoves(0).find(m => m.p === 4 && m.to === node(0, 1, 5));
  ok(!!mvP, 'Thục còn nước đi (tốt 1,4→1,5)');
  const ev = g.play(mvP);
  ok(ev.eliminations.length === 1 && ev.eliminations[0].victim === 1 && ev.eliminations[0].taker === 0
    && ev.eliminations[0].reason === 'mate', 'Ngô bị chiếu bí, Thục hưởng nguyên quân');
  ok(g.st.alive[1] === false, 'phe Ngô chết');
  ok(g.st.pAlive[g.st.genId[1]] === 0, 'tướng Ngô bị hạ');

  const advAt = g.pieces().find(p => p.type === A);
  ok(!!advAt && advAt.owner === 0 && advAt.node === node(1, 4, 1), 'sĩ Ngô chuyển thành quân Thục, giữ vị trí');

  const via = ev.eliminations[0].viaPiece;
  ok(via !== -1 && g.st.pNode[via] === node(1, 5, 1) && g.st.sq[node(1, 5, 1)] === via,
    'mã chiếu trèo lên ô tướng bị chiếu');
  ok(g.st.turn === 2 && !g.st.gameOver, 'ván tiếp tục với lượt Ngụy (còn 2 phe)');

  g.undo();
  ok(g.st.alive[1] === true && g.st.pAlive[g.st.genId[1]] === 1, 'undo: Ngô sống lại');
  ok(g.st.pNode[g.st.genId[1]] === node(1, 5, 1), 'undo: tướng Ngô về chỗ cũ');
  ok(g.pieces().find(p => p.type === A).owner === 1, 'undo: sĩ về lại Ngô');
  ok(g.legalMoves(1).length === 0 && g.legalMoves(0).length > 0, 'undo: thế cờ như chưa từng đi');
}

/* ============ 6. CỜ BÍ (hết nước, ko chiếu) → người vừa đi hưởng ============ */
{
  const g = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 4],         // chặn P01 & P02
    [0, R, 2, 1, 2], [0, R, 2, 4, 5], [0, R, 2, 6, 5],   // 3 xe Thục bịt cửa cung Ngụy
    [1, K, 1, 5, 1], [1, P, 1, 1, 4], [1, P, 1, 5, 5],   // Ngô có quân đi + chặn P12
    [2, K, 2, 5, 1]                                       // Ngụy: mỗi 1 tướng, hết nước
  ]});
  const mvK = g.legalMoves(0).find(m => m.p === 0 && m.to === node(0, 4, 1));
  ok(!!mvK, 'Thục đi được tướng (4,1)');
  g.play(mvK);
  ok(g.st.turn === 1, 'tới lượt Ngô');

  const mvN = g.legalMoves(1).find(m => m.to === node(1, 1, 5));
  ok(!!mvN, 'Ngô còn nước đi');
  ok(g.legalMoves(2).length === 0, 'Ngụy hết nước (cờ bí)');
  const ev = g.play(mvN);
  ok(ev.eliminations.length === 1 && ev.eliminations[0].victim === 2 && ev.eliminations[0].taker === 1
    && ev.eliminations[0].reason === 'stalemate', 'Ngụy cờ bí → Ngô hưởng (người vừa đi)');
  ok(g.st.alive[2] === false && g.st.pAlive[g.st.genId[2]] === 0, 'tướng Ngụy bị hạ');
  const via = ev.eliminations[0].viaPiece;
  ok(via !== -1 && g.st.pNode[via] === node(2, 5, 1), 'quân Ngô trèo lên ngai Ngụy');
}

/* ============ 7. LUẬT TRUNG LẬP ============ */
function neutralPieces() {
  return [
    [0, K, 0, 5, 1], [0, P, 0, 5, 3],          // chặn P01/P02
    [0, R, 1, 1, 2],                            // xe Thục sẵn sàng ăn tốt Ngô
    [1, K, 1, 5, 1], [1, P, 1, 1, 4], [1, P, 1, 5, 4],  // Ngô + chặn P12
    [2, K, 2, 5, 1], [2, R, 1, 9, 2]            // xe Ngụy sắp chiếu Ngô
  ];
}
{
  const g = craft({ neutral: true, turn: 2, pieces: neutralPieces() });
  const mv = g.legalMoves(2).find(m => m.to === node(1, 9, 1));
  ok(!!mv, 'Ngụy có nước chiếu Ngô (9,1)');
  const ev = g.play(mv);
  ok(ev.checks.some(c => c.faction === 1 && c.by === 2), 'Ngụy chiếu Ngô → ghi cờ tấn công');
  ok(g.st.attack[2][1] === 1, 'attack[Ngụy][Ngô] = 1');

  const tos = g.legalMoves(0).filter(m => m.p === 2).map(m => m.to);
  ok(!tos.includes(node(1, 1, 4)), 'Thục bị cấm ăn quân Ngô (Ngụy đang đánh Ngô)');
  ok(tos.includes(node(1, 1, 3)), 'Thục vẫn đi được nước ko tấn công Ngô');
  ok(g.legalMoves(0).some(m => m.p === 0 && m.to === node(0, 4, 1)), 'tướng Thục đi được trong cung');

  /* bản thiếu luật → nước ăn quân hợp lệ */
  const g2 = craft({ turn: 2, pieces: neutralPieces() });
  g2.play(g2.legalMoves(2).find(m => m.to === node(1, 9, 1)));
  const tos2 = g2.legalMoves(0).filter(m => m.p === 2).map(m => m.to);
  ok(tos2.includes(node(1, 1, 4)), 'Ko bật luật: xe Thục ăn tốt Ngô bình thường');
}

/* ============ 8. MẶT ĐỐI TƯỚNG ============ */
{
  const g = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 5],        // tốt Thục trên f5 — Ghim!
    [0, R, 2, 2, 2],                         // xe Thục để còn nước đi
    [1, K, 1, 5, 1], [1, P, 1, 5, 5],        // Ngô + chặn chuỗi P12
    [2, K, 2, 5, 1]
  ]});
  ok(E.facingExists(g.st) === false, 'vị trí khởi đầu ko mặt đối');
  const pawnTos = g.legalMoves(0).filter(m => m.p === 1).map(m => m.to);
  ok(!pawnTos.includes(node(0, 4, 5)) && !pawnTos.includes(node(0, 6, 5)),
    'tốt f5 ko đi ngang được (vạch trần mặt đối tướng)');
  ok(g.legalMoves(0).filter(m => m.p === 2).length > 0, 'quân khác vẫn đi được bình thường');
}

/* ============ 9. PLAYOUT NGẪU NHIÊN — bất biến ============ */
{
  const g = new E.Game({ moveLimit: 400 });
  let steps = 0, elimSeen = 0, broken = null;

  const stateSnap = () => JSON.stringify({
    sq: Array.from(g.st.sq), pOwner: Array.from(g.st.pOwner), pNode: Array.from(g.st.pNode),
    pAlive: Array.from(g.st.pAlive), alive: g.st.alive, turn: g.st.turn, moveNo: g.st.moveNo,
    attack: g.st.attack.map(a => Array.from(a)), lastMove: g.st.lastMove,
    gameOver: g.st.gameOver, winner: g.st.winner
  });

  while (!g.st.gameOver && steps < 500) {
    const ms = g.legalMoves();
    if (!ms.length) { broken = 'hết nước mà game chưa kết thúc'; break; }
    const mv = ms[(Math.random() * ms.length) | 0];
    if (steps === 5) {
      const before = stateSnap();
      g.play(mv);
      if (stateSnap() === before) broken = 'play 1 nước mà state ko đổi';
      g.undo();
      if (stateSnap() !== before) broken = 'undo giữa playout sai';
      if (broken) break;
    }
    const ev = g.play(mv);
    elimSeen += ev.eliminations.length;
    steps++;

    /* bất biến */
    const seen = new Set();
    for (let id = 0; id < g.st.nPieces; id++) {
      if (!g.st.pAlive[id]) continue;
      const nd = g.st.pNode[id];
      if (g.st.sq[nd] !== id) { broken = `sq[${nd}] != piece ${id}`; break; }
      if (seen.has(nd)) { broken = `2 quân trùng ô ${nd}`; break; }
      seen.add(nd);
    }
    if (broken) break;
    for (let f = 0; f < 3; f++) {
      if (g.st.alive[f] && !g.st.pAlive[g.st.genId[f]]) { broken = `phe ${f} sống mà mất tướng`; break; }
      if (!g.st.alive[f] && g.st.pAlive[g.st.genId[f]]) { broken = `phe ${f} chết mà tướng còn`; break; }
    }
    if (broken) break;
    if (!g.st.gameOver && (!g.st.alive[g.st.turn] || g.legalMoves().length === 0)) {
      broken = 'turn kế ko hợp lệ'; break;
    }
  }
  ok(!broken, `playout 400 nước bất biến sạch${broken ? ' — ' + broken : ''} (${steps} nước)`);
  ok(g.st.gameOver, `ván kết thúc trong giới hạn (winner=${g.st.winner}, elim=${elimSeen})`);
}

/* ============ 10. LOẠI LIÊN TIẾP 2 PHE → THẮNG ============ */
{
  const g = craft({ pieces: [
    [0, K, 0, 5, 1], [0, P, 0, 5, 3], [0, P, 1, 5, 4],    // Thục + 2 quân chặn mặt đối
    [0, R, 1, 4, 5], [0, R, 1, 6, 5], [0, R, 1, 7, 2],    // xe Thục bịt cung Ngô
    [0, R, 2, 4, 5], [0, R, 2, 6, 5], [0, R, 2, 7, 2],    // xe Thục bịt cung Ngụy
    [1, K, 1, 5, 1],                                       // Ngô: cờ bí
    [2, K, 2, 5, 1]                                        // Ngụy: cờ bí
  ]});
  ok(g.legalMoves(0).some(m => m.p === 0 && m.to === node(0, 4, 1)), 'Thục còn 1 nước đi');
  ok(g.legalMoves(1).length === 0 && g.legalMoves(2).length === 0, 'cả Ngô & Ngụy đều hết nước');

  const ev = g.play(g.legalMoves(0).find(m => m.p === 0 && m.to === node(0, 4, 1)));
  ok(ev.eliminations.length === 2, `loại liên tiếp 2 phe (${ev.eliminations.length})`);
  ok(ev.eliminations[0].victim === 1 && ev.eliminations[1].victim === 2, 'thứ tự loại Ngô rồi Ngụy');
  ok(ev.gameOver && ev.winner === 0 && g.st.gameOver && g.st.winner === 0, 'Thục là phe sống cuối — THẮNG');

  g.undo();
  ok(g.st.alive[0] && g.st.alive[1] && g.st.alive[2] && !g.st.gameOver && g.st.turn === 0,
    'undo: ván trở lại đúng 3 phe như chưa đi');
  ok(g.pieces().length === 11 && g.pieces().filter(p => p.type === K).length === 3, 'undo: đủ 11 quân, 3 tướng');
}

console.log(fail === 0 ? `\n★ ENGINE PASSED (${pass} assertions)` : `\n✗ ${fail} lỗi / ${pass} pass`);
process.exit(fail ? 1 : 0);
