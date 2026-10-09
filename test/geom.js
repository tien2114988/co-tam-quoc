/* Kiểm tra hình học bàn cờ — chạy: node test/geom.js */
const B = require('../js/board.js');
let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const near = (a, b, eps = 0.05) => Math.abs(a - b) < eps;
const nearP = (p, x, y) => near(p[0], x) && near(p[1], y);
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* 1. 6 đỉnh lục giác (đúng thứ tự draw.hex: TL, TR, R, BR, BL, L) */
const hexExpect = [[230, 27.18], [630, 27.18], [830, 373.59], [630, 720], [230, 720], [30, 373.59]];
B.draw.hex.forEach((p, i) =>
  ok(nearP(p, ...hexExpect[i]), `đỉnh lục giác ${i}: (${p[0].toFixed(2)}, ${p[1].toFixed(2)}) ≈ (${hexExpect[i]})`));

/* 2. điểm mốc tính tay từ toạ độ path gốc */
ok(nearP(B.pos[B.nodeId(0, 1, 1)], 230, 720), 'Thục(1,1) = đỉnh dưới-trái (230,720)');
ok(nearP(B.pos[B.nodeId(0, 9, 1)], 630, 720), 'Thục(9,1) = đỉnh dưới-phải (630,720)');
ok(nearP(B.pos[B.nodeId(0, 3, 3)], 303.47, 607.79), 'Thục(3,3) = (303.47, 607.79) [pháo]');
ok(nearP(B.pos[B.nodeId(0, 5, 4)], 430, 495.0), 'Thục(5,4) = (430, 495) [tốt giữa]');
ok(nearP(B.pos[B.nodeId(0, 5, 5)], 430, 420), 'Thục(5,5) = T-node (430, 420)');
ok(nearP(B.pos[B.nodeId(2, 1, 1)], 30, 373.59), 'Ngụy(1,1) = đỉnh giữa-trái (30,373.59)');
ok(nearP(B.pos[B.nodeId(1, 1, 1)], 830, 373.59), 'Ngô(1,1) = đỉnh giữa-phải (830,373.59)');
ok(nearP(B.pos[B.nodeId(1, 9, 1)], 630, 27.18), 'Ngô(9,1) = đỉnh trên-phải (630,27.18)');
ok(nearP(B.pos[B.nodeId(2, 9, 1)], 230, 27.18), 'Ngụy(9,1) = đỉnh trên-trái (230,27.18)');

/* 3. tam giác T-center: 3 cạnh bằng nhau ≈ 80.4 */
const dTR = d(B.pos[B.T_NODE[0]], B.pos[B.T_NODE[1]]);
const dTL = d(B.pos[B.T_NODE[0]], B.pos[B.T_NODE[2]]);
const dRL = d(B.pos[B.T_NODE[1]], B.pos[B.T_NODE[2]]);
ok(near(dTR, 80.4, 0.1) && near(dTL, 80.4, 0.1) && near(dRL, 80.4, 0.1),
  `tam giác T cân: ${dTR.toFixed(2)} / ${dTL.toFixed(2)} / ${dRL.toFixed(2)} ≈ 80.4`);

/* 4. miệng sông: 2 node khác phe kề nhau cách 44.44 */
ok(near(d(B.pos[B.nodeId(0, 1, 5)], B.pos[B.nodeId(2, 1, 5)]), 44.44, 0.1), 'miệng LL: Thục(1,5)–Ngụy(1,5) = 44.44');
ok(near(d(B.pos[B.nodeId(0, 9, 5)], B.pos[B.nodeId(1, 1, 5)]), 44.44, 0.1), 'miệng LR: Thục(9,5)–Ngô(1,5) = 44.44');
ok(near(d(B.pos[B.nodeId(2, 9, 5)], B.pos[B.nodeId(1, 9, 5)]), 44.44, 0.1), 'miệng TOP: Ngụy(9,5)–Ngô(9,5) = 44.44');

/* 5. node f5 mỗi phe thuộc đúng 2 chuỗi cặp */
for (let t = 0; t < 3; t++)
  ok(B.fileMap[B.T_NODE[t]].length === 2, `T-node phe ${t} thuộc đúng 2 chuỗi cặp`);

/* 6. 135 node toạ độ finite */
let bad = 0;
for (let i = 0; i < B.SIZE; i++) {
  const p = B.pos[i];
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) bad++;
}
ok(bad === 0, `135 node có toạ độ finite (sai: ${bad})`);

/* 7. fileMap/rankMap phủ đủ */
let fm = 0, rm = 0;
for (let i = 0; i < B.SIZE; i++) {
  if (!B.fileMap[i] || !B.fileMap[i].length) fm++;
  if (!B.rankMap[i]) rm++;
}
ok(fm === 0 && rm === 0, `fileMap/rankMap phủ đủ 135 node (thiếu fm=${fm}, rm=${rm})`);

/* 8. số chuỗi & không trùng node */
ok(B.fileLines.length === 15,
  `15 chuỗi file = 9 vượt sông + 3 cửa + 3 cặp (${B.fileLines.length})`);
ok(B.rankLines.length === 15, `15 chuỗi rank (${B.rankLines.length})`);
let dup = 0;
B.fileLines.forEach(arr => { if (new Set(arr).size !== arr.length) dup++; });
B.rankLines.forEach(arr => { if (new Set(arr).size !== arr.length) dup++; });
ok(dup === 0, `không chuỗi nào trùng node (${dup})`);

/* 9. cấu trúc chuỗi file: mỗi nửa 5 node thẳng hàng, tách đúng 2 phe,
      ngân sông giữa 2 bank trong khoảng 1 bước đi; 3 cửa sông thẳng hoàn toàn */
function collinear(arr) {
  if (arr.length < 3) return true;
  const [x0, y0] = B.pos[arr[0]], [x1, y1] = B.pos[arr[arr.length - 1]];
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let i = 1; i < arr.length - 1; i++) {
    const [x, y] = B.pos[arr[i]];
    const area = Math.abs((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0));
    if (area / len > 0.05) return false;
  }
  return true;
}
let badHalf = 0, badTerr = 0, badGap = 0;
B.fileLines.forEach(arr => {
  if (arr.length !== 10) { badHalf++; return; }
  if (!collinear(arr.slice(0, 5)) || !collinear(arr.slice(5, 10))) badHalf++;
  const t0 = B.nodes[arr[0]].t;
  if (arr.some((id, i) => (i < 5 ? B.nodes[id].t !== t0 : B.nodes[id].t === t0))) badTerr++;
  const gap = d(B.pos[arr[4]], B.pos[arr[5]]);
  if (gap < 40 || gap > 85) badGap++;
});
ok(badHalf === 0, `15 chuỗi file: mỗi nửa 5 node thẳng hàng (sai: ${badHalf})`);
ok(badTerr === 0, `mỗi chuỗi: 5 node phe đầu & 5 node phe sau tách đúng lãnh thổ (sai: ${badTerr})`);
ok(badGap === 0, `ngăn sông 2 bank = 40–85 ≤ 1 bước (sai: ${badGap})`);
ok(collinear(B.fileLines[B.INTER.LL]) && collinear(B.fileLines[B.INTER.LR]) &&
   collinear(B.fileLines[B.INTER.TOP]),
  '3 cửa sông (f1/f9) thẳng hàng hoàn toàn trên cạnh lục giác');

/* 10. node trên chuỗi file giữ đúng thứ tự khoảng cách tăng dần (không nhảy ngược) */
let jumps = 0;
B.fileLines.forEach(arr => {
  for (let i = 1; i < arr.length; i++) if (d(B.pos[arr[i]], B.pos[arr[i - 1]]) < 1) jumps++;
});
ok(jumps === 0, `không cặp node nào chồng nhau (${jumps})`);

/* 11. setup: 54 quân, không trùng ô */
const pcs = B.initialPieces();
ok(pcs.length === 54, `54 quân ban đầu (${pcs.length})`);
ok(new Set(pcs.map(p => p.node)).size === 54, 'không 2 quân cùng ô');

/* 12. Tướng/Sĩ trong cung; Tượng ở rank1; Cờ hiệu (4,3)&(6,3) */
const K0 = pcs.find(p => p.owner === 0 && p.type === B.K);
const A0 = pcs.filter(p => p.owner === 0 && p.type === B.A);
const B0 = pcs.filter(p => p.owner === 0 && p.type === B.B);
ok(B.PALACE[0].has(K0.node) && A0.every(p => B.PALACE[0].has(p.node)), 'Tướng & 2 Sĩ Thục trong cung');
ok(B0.length === 2 && B0.every(p => [B.nodeId(0, 4, 3), B.nodeId(0, 6, 3)].includes(p.node)), '2 cờ hiệu Thục ở (4,3),(6,3)');

/* 13. distOrigin: rank1=1 … rank5=5 ở phe mình; ở phe khác rank5=6 … rank1=10 */
ok(B.distOrigin(B.nodeId(0, 1, 1), 0) === 1 && B.distOrigin(B.nodeId(0, 1, 5), 0) === 5, 'distOrigin nội bộ 1..5');
ok(B.distOrigin(B.nodeId(1, 1, 5), 0) === 6 && B.distOrigin(B.nodeId(1, 1, 1), 0) === 10, 'distOrigin địch 6..10');

console.log(fail === 0 ? '\n★ GEOMETRY PASSED' : `\n✗ ${fail} lỗi`);
process.exit(fail ? 1 : 0);
