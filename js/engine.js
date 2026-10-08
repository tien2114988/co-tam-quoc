/* ============================================================
   engine.js — Rules engine Cờ Tam Quốc
   - 3 phe, lượt Thục → Ngô → Ngụy
   - Đi quân trên "đường" (24 file chain + 15 rank chain)
   - Chiếu bí / cờ bí → phe thua chuyển toàn quân cho phe thắng
   - Luật trung lập (tùy chọn): ko được tấn công phe chưa mời开战
   - Không bao giờ "ăn tướng" bằng nước đi thường — phân bại
     xảy ra lúc đến lượt phe bị chiếu mà không còn nước hợp lệ
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./board.js'));
  else global.Engine = factory(global.Board);
})(typeof self !== 'undefined' ? self : this, function (BD) {
  'use strict';

  const { K, A, E, H, R, C, P, B: BT } = BD;
  const SIZE = 135;
  const fileLines = BD.fileLines;                    // 24 (idx 0..23)
  const rankLines = BD.rankLines;                    // 15 (idx 0..14)
  const LINES = fileLines.concat(rankLines);         // thống nhất: 39 đường
  const RANK_OFF = 24;
  const fileEnt = BD.fileMap;                        // node → [{line,idx}] (line trong fileLines)
  const rankEnt = BD.rankMap;                        // node → {line,idx}   (line trong rankLines)

  /* node → [{line (trong LINES), idx}] — cho đi quân trượt / mã / cờ */
  const allEnt = new Array(SIZE);
  for (let id = 0; id < SIZE; id++) {
    const arr = fileEnt[id].map(e => ({ line: e.line, idx: e.idx }));
    const rk = rankEnt[id];
    arr.push({ line: RANK_OFF + rk.line, idx: rk.idx });
    allEnt[id] = arr;
  }

  /* đường chéo cung (cho Sĩ) */
  const DIAG = [];
  for (let t = 0; t < 3; t++) {
    DIAG.push([
      [BD.nodeId(t, 4, 3), BD.nodeId(t, 5, 2), BD.nodeId(t, 6, 1)],
      [BD.nodeId(t, 6, 3), BD.nodeId(t, 5, 2), BD.nodeId(t, 4, 1)]
    ]);
  }

  /* chuỗi cặp tam giác + 2 phe kết nối */
  const PAIRS = [
    { line: BD.INTER.P01, a: 0, b: 1 },
    { line: BD.INTER.P02, a: 0, b: 2 },
    { line: BD.INTER.P12, a: 1, b: 2 }
  ];

  /* ------------------------------------------------------------
     State
     ------------------------------------------------------------ */
  function State(opts) {
    opts = opts || {};
    this.sq = new Int16Array(SIZE).fill(-1);
    this.pOwner = new Uint8Array(64);
    this.pType = new Uint8Array(64);
    this.pNode = new Int16Array(64);
    this.pAlive = new Uint8Array(64);
    this.nPieces = 0;
    this.genId = [-1, -1, -1];      // id tướng từng phe
    this.alive = [true, true, true];
    this.turn = 0;
    this.neutral = !!opts.neutral;
    this.moveLimit = opts.moveLimit || 600;
    /* attack[x][y] = nước đi CUỐI CÙN của phe x có tấn công phe y (ăn quân hoặc chiếu) */
    this.attack = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
    this.lastMove = null;          // {p, from, to, cap}
    this.moveNo = 0;
    this.gameOver = false;
    this.winner = -1;              // -1 = hòa
    this.stack = [];
    this._cache = null;            // {f, moves}
  }

  State.prototype.addPiece = function (owner, type, node) {
    const id = this.nPieces++;
    this.pOwner[id] = owner; this.pType[id] = type; this.pNode[id] = node; this.pAlive[id] = 1;
    this.sq[node] = id;
    if (type === K) this.genId[owner] = id;
    return id;
  };

  function setup(st) {
    BD.initialPieces().forEach(pc => st.addPiece(pc.owner, pc.type, pc.node));
  }

  /* ------------------------------------------------------------
     Truy vấn cơ bản
     ------------------------------------------------------------ */
  const owner = (st, p) => st.pOwner[p];
  const typeOf = (st, p) => st.pType[p];
  const aliveCount = st => (st.alive[0] ? 1 : 0) + (st.alive[1] ? 1 : 0) + (st.alive[2] ? 1 : 0);

  function nextAlive(st, f) {
    for (let i = 1; i <= 3; i++) {
      const x = (f + i) % 3;
      if (st.alive[x]) return x;
    }
    return f;
  }

  /* ------------------------------------------------------------
     pieceAttacks(st, p, target) — quân p có ĐÁNH được ô target
     (target đang bị chiếm — dùng để phát hiện chiếu)
     ------------------------------------------------------------ */
  function alongEmpty(st, chainArr, i0, i1) {
    const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
    for (let i = lo + 1; i < hi; i++) if (st.sq[chainArr[i]] !== -1) return false;
    return true;
  }
  function screensBetween(st, chainArr, i0, i1) {
    const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
    let n = 0;
    for (let i = lo + 1; i < hi; i++) if (st.sq[chainArr[i]] !== -1) n++;
    return n;
  }

  function rookAttacks(st, node, target) {
    for (const e of allEnt[node]) {
      const arr = LINES[e.line];
      const j = arr.indexOf(target);
      if (j >= 0 && alongEmpty(st, arr, e.idx, j)) return true;
    }
    return false;
  }
  function cannonAttacks(st, node, target) {
    for (const e of allEnt[node]) {
      const arr = LINES[e.line];
      const j = arr.indexOf(target);
      if (j >= 0 && screensBetween(st, arr, e.idx, j) === 1) return true;
    }
    return false;
  }

  /* đích "bước nhảy chéo" của Mã/Cờ: từ n2 đi sang chuỗi KHÁC chuỗi L */
  function crossTargets(st, n2, L, n2idx, out) {
    for (const e of allEnt[n2]) {
      if (e.line === L) continue;
      const arr = LINES[e.line];
      if (e.idx - 1 >= 0) out.push(arr[e.idx - 1]);
      if (e.idx + 1 < arr.length) out.push(arr[e.idx + 1]);
    }
    /* loại đích nằm trên chính L (kể cả n1/nước kế tiếp) */
    const arrL = LINES[L];
    const ban1 = n2idx - 1 >= 0 ? arrL[n2idx - 1] : -1;
    const ban2 = n2idx + 1 < arrL.length ? arrL[n2idx + 1] : -1;
    for (let i = out.length - 1; i >= 0; i--) if (out[i] === ban1 || out[i] === ban2) out.splice(i, 1);
  }

  function horseAttacks(st, node, target) {
    for (const e of allEnt[node]) {
      const arr = LINES[e.line];
      for (const d of [-1, 1]) {
        const i1 = e.idx + d, i2 = e.idx + 2 * d;
        if (i2 < 0 || i2 >= arr.length) continue;
        if (st.sq[arr[i1]] !== -1) continue;          // chặn chân (bước đầu)
        const buf = [];
        crossTargets(st, arr[i2], e.line, i2, buf);
        if (buf.includes(target)) return true;
      }
    }
    return false;
  }
  function bannerAttacks(st, node, target) {
    for (const e of allEnt[node]) {
      const arr = LINES[e.line];
      for (const d of [-1, 1]) {
        const i1 = e.idx + d, i2 = e.idx + 2 * d, i3 = e.idx + 3 * d;
        if (i3 < 0 || i3 >= arr.length) continue;
        if (st.sq[arr[i1]] !== -1) continue;          // chặn 1
        if (st.sq[arr[i2]] !== -1) continue;          // chặn 2
        const buf = [];
        crossTargets(st, arr[i3], e.line, i3, buf);
        if (buf.includes(target)) return true;
      }
    }
    return false;
  }

  function pawnGeo(st, node, f) {   // danh sách ô đi được (chưa xét quân chặn)
    const out = [];
    const d0 = BD.distOrigin(node, f);
    for (const e of fileEnt[node]) {                  // tiến = d tăng
      const arr = fileLines[e.line];
      for (const j of [e.idx - 1, e.idx + 1]) {
        if (j < 0 || j >= arr.length) continue;
        const n2 = arr[j];
        if (BD.distOrigin(n2, f) > d0) out.push(n2);
      }
    }
    const rk = rankEnt[node];                         // ngang = đúng 1 ô, chỉ ở bank/rùa địch
    if (d0 === 5 || d0 > 5) {
      const arr = rankLines[rk.line];
      if (rk.idx - 1 >= 0) out.push(arr[rk.idx - 1]);
      if (rk.idx + 1 < arr.length) out.push(arr[rk.idx + 1]);
    }
    return out;
  }

  function elephantDests(st, node, f) {
    const n = BD.nodes[node], out = [];
    for (const df of [-2, 2]) for (const dr of [-2, 2]) {
      const nf = n.f + df, nr = n.r + dr;
      if (nf < 1 || nf > 9 || nr < 1 || nr > 5) continue;
      const eye = BD.nodeId(f, n.f + df / 2, n.r + dr / 2);
      if (st.sq[eye] !== -1) continue;                // chặn mắt
      out.push(BD.nodeId(f, nf, nr));
    }
    return out;
  }

  function advisorDests(st, node, f) {
    const out = [];
    for (const dg of DIAG[f]) {
      const j = dg.indexOf(node);
      if (j < 0) continue;
      if (j - 1 >= 0) out.push(dg[j - 1]);
      if (j + 1 < dg.length) out.push(dg[j + 1]);
    }
    return out;
  }

  function generalDests(st, node, f) {
    const n = BD.nodes[node], out = [];
    const pal = BD.PALACE[f];
    for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nf = n.f + df, nr = n.r + dr;
      if (nf < 4 || nf > 6 || nr < 1 || nr > 3) continue;
      const id = BD.nodeId(f, nf, nr);
      if (pal.has(id)) out.push(id);
    }
    return out;
  }

  function pieceAttacks(st, p, target) {
    const node = st.pNode[p], t = st.pType[p], f = st.pOwner[p];
    switch (t) {
      case R: return rookAttacks(st, node, target);
      case C: return cannonAttacks(st, node, target);
      case H: return horseAttacks(st, node, target);
      case BT: return bannerAttacks(st, node, target);
      case P: return pawnGeo(st, node, f).includes(target);
      case K: return generalDests(st, node, f).includes(target);
      case A: return advisorDests(st, node, f).includes(target);
      case E: return elephantDests(st, node, f).includes(target);
    }
    return false;
  }

  /* phe byF có đang chiếu/đe doạ ô target? */
  function factionAttacks(st, target, byF) {
    for (let id = 0; id < st.nPieces; id++) {
      if (!st.pAlive[id] || st.pOwner[id] !== byF) continue;
      if (pieceAttacks(st, id, target)) return true;
    }
    return false;
  }

  /* phe khác f còn sống nào đang chiếu tướng f */
  function checkers(st, f) {
    const out = [];
    const g = st.pNode[st.genId[f]];
    for (let e = 0; e < 3; e++) {
      if (e === f || !st.alive[e]) continue;
      if (factionAttacks(st, g, e)) out.push(e);
    }
    return out;
  }
  function inCheck(st, f) { return st.alive[f] && checkers(st, f).length > 0; }

  /* ------------------------------------------------------------
     Sinh nước đi giả (pseudo) cho 1 quân
     ------------------------------------------------------------ */
  function pseudoFor(st, p, out) {
    const node = st.pNode[p], t = st.pType[p], f = st.pOwner[p];
    const seen = new Set();
    const push = (to) => {
      if (seen.has(to)) return;
      const cap = st.sq[to];
      if (cap !== -1) {
        if (st.pOwner[cap] === f) return;        // ko ăn quân mình
        if (st.pType[cap] === K) return;         // ko "ăn tướng" bằng nước đi — phân bại ở lượt kế
        seen.add(to);
        out.push({ p, from: node, to, cap, capOwner: st.pOwner[cap], capType: st.pType[cap] });
      } else { seen.add(to); out.push({ p, from: node, to, cap: -1, capOwner: -1, capType: -1 }); }
    };

    if (t === R || t === C) {
      for (const e of allEnt[node]) {
        const arr = LINES[e.line];
        for (const d of [-1, 1]) {
          let i = e.idx + d;
          if (t === R) {
            while (i >= 0 && i < arr.length) {
              const n2 = arr[i];
              if (st.sq[n2] !== -1) { push(n2); break; }
              push(n2); i += d;
            }
          } else {
            let screen = false;
            while (i >= 0 && i < arr.length) {
              const n2 = arr[i];
              if (st.sq[n2] !== -1) {
                if (!screen) screen = true;
                else { push(n2); break; }
              } else if (!screen) push(n2);
              i += d;
            }
          }
        }
      }
    } else if (t === H) {
      for (const e of allEnt[node]) {
        const arr = LINES[e.line];
        for (const d of [-1, 1]) {
          const i1 = e.idx + d, i2 = e.idx + 2 * d;
          if (i2 < 0 || i2 >= arr.length) continue;
          if (st.sq[arr[i1]] !== -1) continue;
          const buf = [];
          crossTargets(st, arr[i2], e.line, i2, buf);
          buf.forEach(push);
        }
      }
    } else if (t === BT) {
      for (const e of allEnt[node]) {
        const arr = LINES[e.line];
        for (const d of [-1, 1]) {
          const i1 = e.idx + d, i2 = e.idx + 2 * d, i3 = e.idx + 3 * d;
          if (i3 < 0 || i3 >= arr.length) continue;
          if (st.sq[arr[i1]] !== -1 || st.sq[arr[i2]] !== -1) continue;
          const buf = [];
          crossTargets(st, arr[i3], e.line, i3, buf);
          buf.forEach(push);
        }
      }
    } else if (t === P) {
      pawnGeo(st, node, f).forEach(push);
    } else if (t === K) {
      generalDests(st, node, f).forEach(push);
    } else if (t === A) {
      advisorDests(st, node, f).forEach(push);
    } else if (t === E) {
      elephantDests(st, node, f).forEach(push);
    }
  }

  function genPseudo(st, f, out) {
    for (let id = 0; id < st.nPieces; id++) {
      if (!st.pAlive[id] || st.pOwner[id] !== f) continue;
      pseudoFor(st, id, out);
    }
    return out;
  }

  /* ------------------------------------------------------------
     make / unmake
     ------------------------------------------------------------ */
  function make(st, mv, steps) {
    const f = st.pOwner[mv.p];
    const capId = st.sq[mv.to];
    const step = {
      k: 'move', p: mv.p, from: mv.from, to: mv.to, capId,
      attackRow: Array.from(st.attack[f]),
      moveNo: st.moveNo, lastMove: st.lastMove
    };
    steps.push(step);

    if (capId !== -1) { st.sq[mv.to] = -1; st.pAlive[capId] = 0; }
    st.sq[mv.from] = -1;
    st.sq[mv.to] = mv.p;
    st.pNode[mv.p] = mv.to;
    st.moveNo++;
    st.lastMove = { p: mv.p, from: mv.from, to: mv.to, cap: capId };

    /* cập nhật cờ "tấn công lần cuối" (chỉ cần khi bật luật trung lập) */
    if (st.neutral) {
      const row = st.attack[f];
      const capOwner = capId !== -1 ? st.pOwner[capId] : -1;
      for (let x = 0; x < 3; x++) {
        row[x] = 0;
        if (x === f || !st.alive[x]) continue;
        if (capOwner === x) row[x] = 1;
        else if (factionAttacks(st, st.pNode[st.genId[x]], f)) row[x] = 1;
      }
    }
    st._cache = null;
  }

  function unmake(st, step) {
    const f = st.pOwner[step.p];
    if (step.capId !== -1) st.pAlive[step.capId] = 1;
    st.sq[step.to] = step.capId;          // -1 nếu ô trống, ngược lại trả quân bị ăn về
    st.sq[step.from] = step.p;
    st.pNode[step.p] = step.from;
    st.attack[f] = Uint8Array.from(step.attackRow);
    st.moveNo = step.moveNo;
    st.lastMove = step.lastMove;
    st._cache = null;
  }

  function snapshotElim(st, steps) {
    steps.push({
      k: 'elim',
      sq: Int16Array.from(st.sq),
      pOwner: Uint8Array.from(st.pOwner),
      pNode: Int16Array.from(st.pNode),
      pAlive: Uint8Array.from(st.pAlive),
      alive: st.alive.slice(),
      attack: [Uint8Array.from(st.attack[0]), Uint8Array.from(st.attack[1]), Uint8Array.from(st.attack[2])],
      turn: st.turn,
      lastMove: st.lastMove
    });
  }
  function restoreElim(st, step) {
    st.sq.set(step.sq); st.pOwner.set(step.pOwner);
    st.pNode.set(step.pNode); st.pAlive.set(step.pAlive);
    st.alive = step.alive.slice();
    st.attack = step.attack;
    st.turn = step.turn; st.lastMove = step.lastMove;
    st._cache = null;
  }

  /* ------------------------------------------------------------
     Luật trung lập
     ------------------------------------------------------------ */
  function mayAttack(st, f, x) {
    if (!st.neutral) return true;
    const third = 3 - f - x;
    return !!st.attack[x][f] || !st.attack[third][x];
  }

  /* nước đi có vi phạm tự chiếu / mặt đối tướng / luật trung lập? */
  function facingExists(st) {
    for (const pr of PAIRS) {
      const arr = fileLines[pr.line];
      const ga = st.pNode[st.genId[pr.a]], gb = st.pNode[st.genId[pr.b]];
      const ia = arr.indexOf(ga), ib = arr.indexOf(gb);
      if (ia < 0 || ib < 0) continue;
      if (alongEmpty(st, arr, ia, ib)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------
     Legal move generation
     ------------------------------------------------------------ */
  function legalMoves(st, f) {
    if (st._cache && st._cache.f === f) return st._cache.moves;
    const pseudo = genPseudo(st, f, []);
    const out = [];
    for (const mv of pseudo) {
      const steps = [];
      make(st, mv, steps);
      let ok = true;
      for (let e = 0; e < 3 && ok; e++) {
        if (e === f || !st.alive[e]) continue;
        if (factionAttacks(st, st.pNode[st.genId[f]], e)) ok = false;             // tự chiếu
      }
      if (ok && facingExists(st)) ok = false;                                 // tạo mặt đối tướng
      if (ok && st.neutral) {
        for (let x = 0; x < 3 && ok; x++) {
          if (x === f || !st.alive[x]) continue;
          let attacks = (mv.capOwner === x);
          if (!attacks && factionAttacks(st, st.pNode[st.genId[x]], f)) attacks = true;
          if (attacks && !mayAttack(st, f, x)) ok = false;
        }
      }
      unmake(st, steps[0]);
      if (ok) out.push(mv);
    }
    st._cache = { f, moves: out };
    return out;
  }

  /* ------------------------------------------------------------
     Loại phe (chiếu bí / cờ bí) lúc đến lượt
     ------------------------------------------------------------ */
  function eliminate(st, victim, steps, events) {
    snapshotElim(st, steps);
    const gNode = st.pNode[st.genId[victim]];
    const checkersList = checkers(st, victim);
    const isMate = checkersList.length > 0;
    const lastF = st.lastMove ? st.pOwner[st.lastMove.p] : -1;

    /* phe hưởng: người chiếu (ưu tiên người vừa đi nếu đang chiếu), cờ bí → người vừa đi */
    let taker = -1, viaPiece = -1;
    if (isMate) {
      if (lastF !== -1 && checkersList.includes(lastF)) taker = lastF;
      else taker = checkersList.slice().sort((a, b) => a - b)[0];
      /* quân chiếu sẽ trèo lên chỗ tướng bị chiếu */
      for (let id = 0; id < st.nPieces; id++) {
        if (st.pAlive[id] && st.pOwner[id] === taker && pieceAttacks(st, id, gNode)) { viaPiece = id; break; }
      }
    } else {
      taker = lastF !== -1 ? lastF : -1;
      if (taker === -1 || taker === victim) return false;             // không có người hưởng → bỏ qua
      if (st.lastMove) viaPiece = st.lastMove.p;                       // quân vừa đi "trèo lên ngai"
    }
    if (taker === -1 || !st.alive[taker]) return false;

    /* chuyển quân (trừ tướng) */
    for (let id = 0; id < st.nPieces; id++) {
      if (!st.pAlive[id] || st.pOwner[id] !== victim) continue;
      if (id === st.genId[victim]) continue;
      st.pOwner[id] = taker;
    }
    /* tướng bị hạ */
    st.pAlive[st.genId[victim]] = 0;
    st.sq[gNode] = -1;

    /* quân hưởng trèo lên ô tướng (nếu không phải tướng — tướng ko rời cung) */
    let teleported = false;
    if (viaPiece !== -1 && st.pAlive[viaPiece] && st.pType[viaPiece] !== K && st.sq[gNode] === -1) {
      st.sq[st.pNode[viaPiece]] = -1;
      st.pNode[viaPiece] = gNode;
      st.sq[gNode] = viaPiece;
      teleported = true;
    }

    st.alive[victim] = false;
    st.attack[victim] = new Uint8Array(3);        // phe chết ko còn "tấn công" ai
    st._cache = null;
    events.eliminations.push({
      victim, taker, reason: isMate ? 'mate' : 'stalemate',
      viaPiece: teleported ? viaPiece : -1, node: gNode
    });
    return true;
  }

  /* ------------------------------------------------------------
     play(): đi 1 nước hợp lệ → phân bại nếu phe kế hết nước
     ------------------------------------------------------------ */
  function play(st, mv) {
    const steps = [];
    const events = { move: mv, checks: [], eliminations: [], gameOver: false, winner: st.winner, draw: false };
    steps.push({ k: 'turn', turn: st.turn });        // undo trả turn về trước khi đi
    make(st, mv, steps);

    /* ai đang chiếu? */
    for (let x = 0; x < 3; x++) {
      if (!st.alive[x] || x === st.pOwner[mv.p]) continue;
      if (factionAttacks(st, st.pNode[st.genId[x]], st.pOwner[mv.p]))
        events.checks.push({ faction: x, by: st.pOwner[mv.p] });
    }

    /* đến lượt phe kế: nếu hết nước → loại (vòng lặp phòng hile phe kế tiếp cũng hết) */
    let guard = 0;
    while (guard++ < 4) {
      if (st.moveNo >= st.moveLimit) {
        st.gameOver = true; st.winner = -1; events.gameOver = true; events.draw = true;
        break;
      }
      if (aliveCount(st) <= 1) {
        st.gameOver = true;
        st.winner = st.alive[0] ? 0 : st.alive[1] ? 1 : 2;
        events.gameOver = true; events.winner = st.winner;
        break;
      }
      /* lượt kế = phe sống kế tiếp sau người vừa đi */
      st.turn = nextAlive(st, st.pOwner[mv.p]);
      const lm = legalMoves(st, st.turn);
      if (lm.length > 0) break;
      /* phe này hết nước → loại */
      const victim = st.turn;
      if (!eliminate(st, victim, steps, events)) { st.gameOver = true; st.winner = -1; events.gameOver = true; events.draw = true; break; }
      if (aliveCount(st) <= 1) {
        st.gameOver = true;
        st.winner = st.alive[0] ? 0 : st.alive[1] ? 1 : 2;
        events.gameOver = true; events.winner = st.winner;
        break;
      }
      st.turn = nextAlive(st, victim);
      st._cache = null;
    }

    st.stack.push(steps);
    events.gameOver = st.gameOver; events.winner = st.winner;
    return events;
  }
  function undo(st) {
    const steps = st.stack.pop();
    if (!steps) return false;
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.k === 'move') unmake(st, s);
      else if (s.k === 'elim') restoreElim(st, s);
      else if (s.k === 'turn') st.turn = s.turn;
    }
    st.gameOver = false; st.winner = -1;
    return true;
  }

  /* ------------------------------------------------------------
     Game — API cho UI/AI
     ------------------------------------------------------------ */
  function Game(opts) {
    this.st = new State(opts);
    setup(this.st);
  }

  Game.prototype = {
    legalMoves(f) {
      if (f === undefined || f === null) f = this.st.turn;
      if (!this.st.alive[f]) return [];
      return legalMoves(this.st, f);
    },
    isLegal(mv) {
      return this.legalMoves(this.st.turn).some(m => m.p === mv.p && m.to === mv.to);
    },
    play(mv) { return play(this.st, mv); },
    undo() { return undo(this.st); },
    inCheck(f) {
      const st = this.st;
      if (!st.alive[f]) return false;
      for (let e = 0; e < 3; e++) {
        if (e === f || !st.alive[e]) continue;
        if (factionAttacks(st, st.pNode[st.genId[f]], e)) return true;
      }
      return false;
    },
    checkers(f) { return checkers(this.st, f); },
    status() {
      const st = this.st;
      return {
        turn: st.turn, alive: st.alive.slice(), gameOver: st.gameOver, winner: st.winner,
        moveNo: st.moveNo, neutral: st.neutral,
        checks: [0, 1, 2].filter(f => st.alive[f] && this.inCheck(f)),
        moves: this.legalMoves(st.turn)
      };
    },
    pieces() {
      const st = this.st, out = [];
      for (let id = 0; id < st.nPieces; id++)
        if (st.pAlive[id]) out.push({ id, owner: st.pOwner[id], type: st.pType[id], node: st.pNode[id] });
      return out;
    },
    clone() {
      const g = new Game({ neutral: this.st.neutral, moveLimit: this.st.moveLimit });
      const st = g.st, s = this.st;
      st.sq.set(s.sq); st.pOwner.set(s.pOwner); st.pType.set(s.pType);
      st.pNode.set(s.pNode); st.pAlive.set(s.pAlive);
      st.nPieces = s.nPieces;
      st.genId = s.genId.slice();
      st.alive = s.alive.slice();
      st.turn = s.turn;
      st.attack = [Uint8Array.from(s.attack[0]), Uint8Array.from(s.attack[1]), Uint8Array.from(s.attack[2])];
      st.lastMove = s.lastMove ? Object.assign({}, s.lastMove) : null;
      st.moveNo = s.moveNo;
      st.gameOver = s.gameOver; st.winner = s.winner;
      return g;
    }
  };

  return {
    Game, State, legalMoves, make, unmake, play, undo,
    pieceAttacks, factionAttacks, inCheck, checkers, facingExists,
    mayAttack, pawnGeo, LINES, allEnt, PAIRS
  };
});
