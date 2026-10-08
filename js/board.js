/* ============================================================
   board.js — Bàn cờ Cờ Tam Quốc (3 phe)
   Hình học trích xuất chính xác từ bàn cờ lịch sử:
   Wikimedia "Game of the Three Kingdoms" (Möllendorff, 1876)
   - Bàn lục giác đều, 135 điểm giao (45 điểm/phe)
   - Mỗi phe = nửa bàn cờ tướng 9×5, cung 3×3
   - 3 nhánh sông dạng Y + tam giác trung tâm (nơi vượt sông)
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.Board = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Toạ độ: path gốc → viewBox 0 0 860 750 ---------- */
  const OX = -20, OY = -232.36;
  const T = (x, y) => [x + OX, y + OY];

  /* ---------- Phe: thứ tự lượt đi Thục → Ngô → Ngụy (ngược chiều kim đồng hồ) ---------- */
  const FACTIONS = [
    { id: 0, name: 'Thục', color: '#cf3a3a', deep: '#8c1f1f', light: '#ffd8d5', char: '蜀', hero: 'Lưu Bị' },
    { id: 1, name: 'Ngô', color: '#2e9e56', deep: '#155f31', light: '#d6f5e0', char: '吳', hero: 'Tôn Quyền' },
    { id: 2, name: 'Ngụy', color: '#3b6fd4', deep: '#1c3f8f', light: '#dae6ff', char: '魏', hero: 'Tào Tháo' }
  ];

  /* ---------- Quân cờ ---------- */
  const K = 0, A = 1, E = 2, H = 3, R = 4, C = 5, P = 6, B = 7;
  const TYPE_ORDER = ['K', 'A', 'E', 'H', 'R', 'C', 'P', 'B'];
  // Hán tự theo từng phe (đúng như bàn cờ lịch sử)
  const HAN = [
    { K: '蜀', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', P: '兵', B: '火' }, // Thục
    { K: '吳', A: '士', E: '向', H: '馬', R: '車', C: '礮', P: '勇', B: '風' }, // Ngô
    { K: '魏', A: '士', E: '象', H: '馬', R: '車', C: '砲', P: '卒', B: '旗' }  // Ngụy
  ];
  const VN_NAME = { K: 'Tướng', A: 'Sĩ', E: 'Tượng', H: 'Mã', R: 'Xe', C: 'Pháo', P: 'Tốt', B: 'Cờ hiệu' };
  const BANNER_NAME = ['Hỏa', 'Phong', 'Kỳ']; // tên quân hiệu theo phe
  const VALUE = { K: 100000, R: 900, C: 480, B: 430, H: 420, E: 220, A: 220, P: 120 };

  function typeName(type, owner) {
    if (type === B) return BANNER_NAME[owner];
    return VN_NAME[TYPE_ORDER[type]];
  }

  /* ============================================================
     DỮ LIỆU ĐƯỜNG KẺ (không gian path gốc)
     RANKS_PATH[phe][rank-1] = polyline: cuối-f1, điểm gãy (f5), cuối-f9
     FILES_PATH[phe][file-1] = 2 đầu mút (đường thẳng)
     ============================================================ */
  const RANKS_PATH = [
    [ // 0 – Thục (đáy)
      [[250, 952.36], [650, 952.36]],
      [[227.78, 913.87], [450, 877.36], [672.22, 913.87]],
      [[205.56, 875.38], [450, 802.36], [694.44, 875.38]],
      [[183.33, 836.89], [450, 727.36], [716.67, 836.89]],
      [[161.11, 798.4], [450, 652.36], [738.89, 798.4]]
    ],
    [ // 1 – Ngô (trên phải) = gương của Ngụy (x → 900-x)
      [[850, 605.95], [650, 259.54]],
      [[827.78, 644.44], [685.05, 470.25], [605.56, 259.54]],
      [[805.56, 682.93], [620.1, 507.75], [561.11, 259.54]],
      [[783.33, 721.42], [555.14, 545.25], [516.67, 259.54]],
      [[761.11, 759.91], [490.19, 582.75], [472.22, 259.54]]
    ],
    [ // 2 – Ngụy (trên trái)
      [[50, 605.95], [250, 259.54]],
      [[72.22, 644.44], [214.95, 470.25], [294.44, 259.54]],
      [[94.44, 682.93], [279.9, 507.75], [338.89, 259.54]],
      [[116.67, 721.42], [344.86, 545.25], [383.33, 259.54]],
      [[138.89, 759.91], [409.81, 582.75], [427.78, 259.54]]
    ]
  ];

  const FILES_PATH = [
    [ // Thục
      [[250, 952.36], [161.11, 798.4]],
      [[300, 952.36], [229.39, 763.89]],
      [[350, 952.36], [297.32, 729.54]],
      [[400, 952.36], [365.01, 695.32]],
      [[450, 952.36], [450, 652.36]],
      [[500, 952.36], [534.99, 695.32]],
      [[550, 952.36], [602.68, 729.54]],
      [[600, 952.36], [670.61, 763.89]],
      [[650, 952.36], [738.89, 798.4]]
    ],
    [ // Ngô (gương Ngụy)
      [[850, 605.95], [761.11, 759.91]],
      [[825, 562.65], [697.08, 718.04]],
      [[800, 519.35], [633.37, 676.38]],
      [[775, 476.05], [569.89, 634.87]],
      [[750, 432.75], [490.19, 582.75]],
      [[725, 389.45], [484.91, 487.67]],
      [[700, 346.14], [480.7, 411.94]],
      [[675, 302.84], [476.47, 335.93]],
      [[650, 259.54], [472.22, 259.54]]
    ],
    [ // Ngụy
      [[50, 605.95], [138.89, 759.91]],
      [[75, 562.65], [202.92, 718.04]],
      [[100, 519.35], [266.63, 676.38]],
      [[125, 476.05], [330.11, 634.87]],
      [[150, 432.75], [409.81, 582.75]],
      [[175, 389.45], [415.09, 487.67]],
      [[200, 346.14], [419.3, 411.94]],
      [[225, 302.84], [423.53, 335.93]],
      [[250, 259.54], [427.78, 259.54]]
    ]
  ];

  /* ---------- tiện ích hình học ---------- */
  // đường thẳng qua 2 điểm: ax + by + c = 0
  function lineOf(p, q) {
    const a = q[1] - p[1];
    const b = p[0] - q[0];
    const c = -(a * p[0] + b * p[1]);
    return { a, b, c };
  }
  // giao điểm 2 đường (Cramer)
  function intersect(L1, L2) {
    const den = L1.a * L2.b - L2.a * L1.b;
    if (Math.abs(den) < 1e-9) return null;
    const x = (L1.b * L2.c - L2.b * L1.c) / den;
    const y = (L2.a * L1.c - L1.a * L2.c) / den;
    return [x, y];
  }

  /* ============================================================
     TÍNH TOÁN 135 ĐIỂM
     ============================================================ */
  const SIZE = 135;
  const nodeId = (t, f, r) => t * 45 + (f - 1) * 5 + (r - 1);
  const nT = id => Math.floor(id / 45);
  const nF = id => Math.floor((id % 45) / 5) + 1;
  const nR = id => ((id % 45) % 5) + 1;

  const nodes = new Array(SIZE);
  const pos = new Array(SIZE); // [x, y] (viewBox)

  for (let t = 0; t < 3; t++) {
    for (let f = 1; f <= 9; f++) {
      const fL = lineOf(FILES_PATH[t][f - 1][0], FILES_PATH[t][f - 1][1]);
      for (let r = 1; r <= 5; r++) {
        const poly = RANKS_PATH[t][r - 1];
        // chọn cánh polyline: f <= 5 → cánh trái (đầu → gãy); f > 5 → cánh phải (gãy → cuối)
        const w = poly.length === 2 ? [poly[0], poly[1]] : (f <= 5 ? [poly[0], poly[1]] : [poly[1], poly[2]]);
        const rL = lineOf(w[0], w[1]);
        const p = intersect(fL, rL);
        const id = nodeId(t, f, r);
        nodes[id] = { id, t, f, r };
        pos[id] = T(p[0], p[1]);
      }
    }
  }

  /* ============================================================
     HỆ ĐƯỜNG ĐI (các chuỗi thẳng — thủ tục cho Xe/Pháo)
     24 chuỗi file + 15 chuỗi rank
     ============================================================ */
  const fileLines = [];                    // [[nodeId,...], ...]
  const fileMap = new Array(SIZE);         // node → [{line, idx}] (1 hoặc 2 mục)
  const rankLines = new Array(15);         // [[nodeId,...], ...]
  const rankMap = new Array(SIZE);         // node → {line, idx}

  function addFileLine(arr) {
    const li = fileLines.length;
    fileLines.push(arr);
    return li;
  }

  // --- 18 chuỗi ngắn (f = 2,3,4,6,7,8) trong lãnh thổ ---
  const shortIdx = [new Array(9).fill(-1), new Array(9).fill(-1), new Array(9).fill(-1)];
  for (let t = 0; t < 3; t++) {
    for (const f of [2, 3, 4, 6, 7, 8]) {
      const arr = [];
      for (let r = 1; r <= 5; r++) arr.push(nodeId(t, f, r));
      shortIdx[t][f - 1] = addFileLine(arr);
    }
  }

  // --- 3 chuỗi cạnh (10 điểm, sông cắt giữa) ---
  // LL: Thục.f1 → Ngụy.f1 (cạnh dưới-trái)
  const LL = addFileLine([
    nodeId(0, 1, 1), nodeId(0, 1, 2), nodeId(0, 1, 3), nodeId(0, 1, 4), nodeId(0, 1, 5),
    nodeId(2, 1, 5), nodeId(2, 1, 4), nodeId(2, 1, 3), nodeId(2, 1, 2), nodeId(2, 1, 1)
  ]);
  // LR: Thục.f9 → Ngô.f1 (cạnh dưới-phải)
  const LR = addFileLine([
    nodeId(0, 9, 1), nodeId(0, 9, 2), nodeId(0, 9, 3), nodeId(0, 9, 4), nodeId(0, 9, 5),
    nodeId(1, 1, 5), nodeId(1, 1, 4), nodeId(1, 1, 3), nodeId(1, 1, 2), nodeId(1, 1, 1)
  ]);
  // TOP: Ngụy.f9 → Ngô.f9 (cạnh trên)
  const TOP = addFileLine([
    nodeId(2, 9, 1), nodeId(2, 9, 2), nodeId(2, 9, 3), nodeId(2, 9, 4), nodeId(2, 9, 5),
    nodeId(1, 9, 5), nodeId(1, 9, 4), nodeId(1, 9, 3), nodeId(1, 9, 2), nodeId(1, 9, 1)
  ]);

  // --- 3 cặp tam giác: file5 của 2 phe nối nhau qua tâm ---
  const P01 = addFileLine([ // Thục – Ngô (qua T_B – T_R)
    nodeId(0, 5, 1), nodeId(0, 5, 2), nodeId(0, 5, 3), nodeId(0, 5, 4), nodeId(0, 5, 5),
    nodeId(1, 5, 5), nodeId(1, 5, 4), nodeId(1, 5, 3), nodeId(1, 5, 2), nodeId(1, 5, 1)
  ]);
  const P02 = addFileLine([ // Thục – Ngụy (qua T_B – T_L)
    nodeId(0, 5, 1), nodeId(0, 5, 2), nodeId(0, 5, 3), nodeId(0, 5, 4), nodeId(0, 5, 5),
    nodeId(2, 5, 5), nodeId(2, 5, 4), nodeId(2, 5, 3), nodeId(2, 5, 2), nodeId(2, 5, 1)
  ]);
  const P12 = addFileLine([ // Ngô – Ngụy (qua T_R – T_L)
    nodeId(1, 5, 1), nodeId(1, 5, 2), nodeId(1, 5, 3), nodeId(1, 5, 4), nodeId(1, 5, 5),
    nodeId(2, 5, 5), nodeId(2, 5, 4), nodeId(2, 5, 3), nodeId(2, 5, 2), nodeId(2, 5, 1)
  ]);

  // --- map node → chuỗi file ---
  for (let id = 0; id < SIZE; id++) fileMap[id] = [];
  for (let t = 0; t < 3; t++) {
    for (let f = 1; f <= 9; f++) {
      if (f === 5) continue;
      if (f === 1 || f === 9) {
        let line, startsAtFront; // startsAtFront: idx = r-1 (phe đầu chuỗi) hay idx = 5+(5-r) (phe sau)
        if (t === 0 && f === 1) { line = LL; startsAtFront = true; }
        else if (t === 0 && f === 9) { line = LR; startsAtFront = true; }
        else if (t === 2 && f === 1) { line = LL; startsAtFront = false; }
        else if (t === 2 && f === 9) { line = TOP; startsAtFront = true; }
        else if (t === 1 && f === 1) { line = LR; startsAtFront = false; }
        else { line = TOP; startsAtFront = false; } // Ngô.f9
        for (let r = 1; r <= 5; r++) {
          const idx = startsAtFront ? (r - 1) : (5 + (5 - r));
          fileMap[nodeId(t, f, r)].push({ line, idx });
        }
      } else {
        const line = shortIdx[t][f - 1];
        for (let r = 1; r <= 5; r++) fileMap[nodeId(t, f, r)].push({ line, idx: r - 1 });
      }
    }
  }
  // f5: mỗi điểm thuộc 2 chuỗi cặp
  const f5Pairs = [[P01, P02], [P01, P12], [P02, P12]];
  for (let t = 0; t < 3; t++) {
    for (let r = 1; r <= 5; r++) {
      const id = nodeId(t, 5, r);
      for (const li of f5Pairs[t]) {
        fileMap[id].push({ line: li, idx: fileLines[li].indexOf(id) });
      }
    }
  }

  // --- map node → chuỗi rank ---
  for (let t = 0; t < 3; t++) {
    for (let r = 1; r <= 5; r++) {
      const li = t * 5 + (r - 1);
      const arr = [];
      for (let f = 1; f <= 9; f++) {
        const id = nodeId(t, f, r);
        arr.push(id);
        rankMap[id] = { line: li, idx: f - 1 };
      }
      rankLines[li] = arr;
    }
  }

  /* ---------- tam giác giữa sân & cung ---------- */
  const T_NODE = [nodeId(0, 5, 5), nodeId(1, 5, 5), nodeId(2, 5, 5)];
  const PALACE = [new Set(), new Set(), new Set()];
  for (let t = 0; t < 3; t++)
    for (let f = 4; f <= 6; f++)
      for (let r = 1; r <= 3; r++) PALACE[t].add(nodeId(t, f, r));

  /* ---------- khoảng cách tiến (cho Tốt) ---------- */
  function distOrigin(nid, owner) {
    const t = nT(nid), r = nR(nid);
    return t === owner ? r : 11 - r;
  }

  /* ============================================================
     SƠ ĐỒ VẼ
     ============================================================ */
  const draw = {};
  // lục giác (6 đỉnh)
  draw.hex = [
    nodeId(2, 9, 1), nodeId(1, 9, 1), nodeId(1, 1, 1),
    nodeId(0, 9, 1), nodeId(0, 1, 1), nodeId(2, 1, 1)
  ].map(id => pos[id]);
  // rank 2..5 (polyline f1 – gãy f5 – f9); rank1 = cạnh lục giác
  draw.ranks = [];
  for (let t = 0; t < 3; t++)
    for (let r = 2; r <= 5; r++)
      draw.ranks.push({
        t, r,
        pts: [pos[nodeId(t, 1, r)], pos[nodeId(t, 5, r)], pos[nodeId(t, 9, r)]],
        major: r === 5
      });
  // file nội bộ
  draw.files = [];
  for (let t = 0; t < 3; t++)
    for (const f of [2, 3, 4, 6, 7, 8])
      draw.files.push({ t, f, a: pos[nodeId(t, f, 1)], b: pos[nodeId(t, f, 5)] });
  // cung: 2 đường chéo gãy qua (5,2)
  draw.palaces = [];
  for (let t = 0; t < 3; t++) {
    draw.palaces.push([pos[nodeId(t, 4, 3)], pos[nodeId(t, 5, 2)], pos[nodeId(t, 6, 1)]]);
    draw.palaces.push([pos[nodeId(t, 6, 3)], pos[nodeId(t, 5, 2)], pos[nodeId(t, 4, 1)]]);
  }
  // tam giác giữa sân
  draw.triangle = T_NODE.map(id => pos[id]);
  // 3 nhánh sông
  draw.channels = [
    [pos[nodeId(2, 9, 5)], pos[nodeId(1, 9, 5)], pos[nodeId(1, 5, 5)], pos[nodeId(2, 5, 5)]], // trên
    [pos[nodeId(2, 5, 5)], pos[nodeId(2, 1, 5)], pos[nodeId(0, 1, 5)], pos[nodeId(0, 5, 5)]], // dưới-trái
    [pos[nodeId(1, 5, 5)], pos[nodeId(1, 1, 5)], pos[nodeId(0, 9, 5)], pos[nodeId(0, 5, 5)]]  // dưới-phải
  ];

  /* ============================================================
     QUÂN ĐẶT BAN ĐẦU (18 quân/phe)
     ============================================================ */
  const SETUP = [
    [K, 5, 1], [A, 4, 1], [A, 6, 1], [E, 3, 1], [E, 7, 1],
    [H, 2, 1], [H, 8, 1], [R, 1, 1], [R, 9, 1],
    [C, 2, 3], [C, 8, 3], [B, 4, 3], [B, 6, 3],
    [P, 1, 4], [P, 3, 4], [P, 5, 4], [P, 7, 4], [P, 9, 4]
  ];
  function initialPieces() {
    const out = [];
    for (let owner = 0; owner < 3; owner++)
      for (const [type, f, r] of SETUP)
        out.push({ owner, type, node: nodeId(owner, f, r) });
    return out;
  }

  return {
    SIZE, FACTIONS, TYPE_ORDER, HAN, VN_NAME, BANNER_NAME, VALUE,
    K, A, E, H, R, C, P, B,
    nodes, pos, nodeId, nT, nF, nR,
    fileLines, rankLines, fileMap, rankMap,
    T_NODE, PALACE, distOrigin,
    draw, initialPieces, typeName,
    INTER: { LL, LR, TOP, P01, P02, P12 }
  };
});
