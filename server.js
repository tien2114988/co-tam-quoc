/* ============================================================
   server.js — Cờ Tam Quốc: HTTP tĩnh + WebSocket relay (zero deps)
   Chạy:  node server.js  →  mở http://localhost:8787
   Giao thức (JSON):
     client → server: {t:'create',name} {t:'join',code,name} {t:'leave'}
                      {t:'start'} {t:'move',seat,p,to} {t:'chat',msg} {t:'rematch'}
     server → client: {t:'joined',code,seat,host,players}
                      {t:'players',players,host} {t:'started'} {t:'move',seat,p,to}
                      {t:'chat',name,msg} {t:'err',msg} {t:'close'}
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8'
};

/* ---------------- HTTP tĩnh ---------------- */
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = '/'; }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ============================================================
   WebSocket tối giản (RFC 6455) — text frames, ping/pong, close
   ============================================================ */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);
  return socket;
}

/* --- đóng gói frame gửi đi (server → client: không mask) --- */
function encodeFrame(str, opcode) {
  opcode = opcode || 1;
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode; head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode; head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/* --- gắn codec frame lên socket --- */
function attachSocket(socket, onMessage, onClose) {
  let buf = Buffer.alloc(0);
  let fragments = null;      // {opcode, parts:[]}
  let alive = true;

  socket.on('error', () => { alive = false; try { socket.destroy(); } catch (e) {} });
  socket.on('close', () => { if (alive) { alive = false; onClose(); } });
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (alive) {
      if (buf.length < 2) return;
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > 1000000n) { alive = false; socket.destroy(); return; }
        len = Number(big); off = 10;
      }
      if (len > 1000000) { alive = false; socket.destroy(); return; }
      let maskKey = null;
      if (masked) {
        if (buf.length < off + 4) return;
        maskKey = buf.slice(off, off + 4); off += 4;
      }
      if (buf.length < off + len) return;
      let payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (maskKey) {
        const un = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) un[i] = payload[i] ^ maskKey[i & 3];
        payload = un;
      }

      if (opcode === 0x8) {           // close
        try { socket.write(encodeFrame('', 0x8)); } catch (e) {}
        alive = false; socket.end(); onClose(); return;
      } else if (opcode === 0x9) {    // ping → pong
        try { socket.write(encodeFrame(payload.toString('utf8'), 0xA)); } catch (e) {}
        continue;
      } else if (opcode === 0xA) {    // pong
        continue;
      } else if (opcode === 0x1 || opcode === 0x2) {
        if (!fin) { fragments = { opcode, parts: [payload] }; continue; }
        handle(payload);
        continue;
      } else if (opcode === 0x0) {    // continuation
        if (!fragments) continue;
        fragments.parts.push(payload);
        if (fin) {
          const full = Buffer.concat(fragments.parts);
          fragments = null;
          handle(full);
        }
        continue;
      }
    }
    function handle(bufPayload) {
      const text = bufPayload.toString('utf8');
      let msg; try { msg = JSON.parse(text); } catch (e) { return; }
      if (msg && msg.t) onMessage(msg);
    }
  });

  return {
    send(obj) {
      if (!alive || socket.destroyed) return;
      try { socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) {}
    },
    end() { alive = false; try { socket.end(); } catch (e) {} }
  };
}

/* ============================================================
   Phòng chơi
   ============================================================ */
const rooms = new Map();               // code → room
const SEAT_NAMES = ['Thục', 'Ngô', 'Ngụy'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
function roster(room) {
  const players = [];
  for (const seat of [0, 1, 2]) {
    const p = room.seats[seat];
    if (p) players.push({ seat, name: p.name });
  }
  return players;
}
function broadcast(room, obj) {
  for (const seat of [0, 1, 2]) {
    const p = room.seats[seat];
    if (p) p.conn.send(obj);
  }
}
function broadcastPlayers(room) {
  broadcast(room, { t: 'players', players: roster(room), host: room.host });
}
function leaveRoom(entry) {
  const room = entry.room;
  if (!room) return;
  room.seats[entry.seat] = null;
  entry.room = null; entry.seat = -1;
  // nhường host
  if (room.host === entry.seat) {
    room.host = [0, 1, 2].find(s => room.seats[s]) ?? -1;
  }
  const count = [0, 1, 2].filter(s => room.seats[s]).length;
  if (count === 0) { rooms.delete(room.code); return; }
  broadcastPlayers(room);
}

function handleMessage(entry, msg) {
  switch (msg.t) {
    case 'create': {
      if (entry.room) leaveRoom(entry);
      const code = newCode();
      const room = { code, seats: [null, null, null], host: -1, started: false };
      rooms.set(code, room);
      const seat = 0;
      const name = cleanName(msg.name);
      room.seats[seat] = { name, conn: entry.conn };
      room.host = seat;
      entry.room = room; entry.seat = seat;
      entry.conn.send({ t: 'joined', code, seat, host: room.host, players: roster(room) });
      break;
    }
    case 'join': {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { entry.conn.send({ t: 'err', msg: 'Không tìm thấy phòng "' + code + '"' }); return; }
      if (room.started) { entry.conn.send({ t: 'err', msg: 'Trận đã bắt đầu' }); return; }
      const seat = [0, 1, 2].find(s => !room.seats[s]);
      if (seat === undefined) { entry.conn.send({ t: 'err', msg: 'Phòng đã đủ 3 người' }); return; }
      if (entry.room) leaveRoom(entry);
      const name = cleanName(msg.name);
      room.seats[seat] = { name, conn: entry.conn };
      if (room.host === -1) room.host = seat;
      entry.room = room; entry.seat = seat;
      entry.conn.send({ t: 'joined', code, seat, host: room.host, players: roster(room) });
      broadcastPlayers(room);
      break;
    }
    case 'leave': leaveRoom(entry); break;
    case 'start': {
      const room = entry.room;
      if (!room || room.host !== entry.seat) return;
      room.started = true;
      broadcast(room, { t: 'started', host: room.host });
      break;
    }
    case 'move': {
      const room = entry.room;
      if (!room || !room.started) return;
      const seat = msg.seat | 0;
      if (seat < 0 || seat > 2) return;
      // người chỉ được đi cho phe của mình; host được quyền điều khiển phe trống
      const ownSeat = entry.seat;
      const isHost = room.host === ownSeat;
      const seatTaken = !!room.seats[seat];
      if (seat !== ownSeat && !(isHost && !seatTaken)) return;
      broadcast(room, { t: 'move', seat, p: msg.p | 0, to: msg.to | 0 });
      break;
    }
    case 'chat': {
      const room = entry.room;
      if (!room) return;
      const name = room.seats[entry.seat] ? room.seats[entry.seat].name : '?';
      broadcast(room, { t: 'chat', name: cleanName(name), msg: cleanName(msg.msg).slice(0, 60) });
      break;
    }
    case 'rematch': {
      const room = entry.room;
      if (!room || room.host !== entry.seat) return;
      room.started = false;
      broadcast(room, { t: 'rematch' });
      break;
    }
  }
}
function cleanName(s) {
  s = String(s || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return s || 'Người chơi';
}

/* ---------------- Upgrade ---------------- */
server.on('upgrade', (req, socket) => {
  const p = (req.url || '/').split('?')[0];
  if (p !== '/ws' && p !== '/') { socket.destroy(); return; }
  const s = wsHandshake(req, socket);
  if (!s) return;

  const entry = { conn: null, room: null, seat: -1 };
  entry.conn = attachSocket(
    s,
    msg => { try { handleMessage(entry, msg); } catch (e) { console.error('msg err', e); } },
    () => { try { leaveRoom(entry); } catch (e) {} }
  );
});

server.listen(PORT, () => {
  console.log('== Cờ Tam Quốc server ==');
  console.log('Chơi:      http://localhost:' + PORT);
  console.log('Online:    mở nhiều tab / nhiều máy, cùng địa chỉ trên');
  console.log('Dừng:      Ctrl+C');
});
