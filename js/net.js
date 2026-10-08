/* ============================================================
   net.js — Cờ Tam Quốc: kết nối online, 2 transport
     • WS   — chạy local cùng server.js (node server.js)
     • MQTT — deploy static (GitHub Pages): giao thức JSON được
              gói trong packet MQTT 3.1.1, đi qua WebSocket sécurised
              tới broker public HiveMQ; chủ phòng đóng vai "relay".
              Topic theo mã phòng:
                cotamquoc/<CODE>/in    — khách  → chủ phòng
                cotamquoc/<CODE>/out   — chủ phòng → tất cả khách
                cotamquoc/<CODE>/alive — presence (retained, will tự xóa)
   Giao thức JSON giữ nguyên như server.js:
     client → host: {t:'create',name} {t:'join',code,name} {t:'leave'}
                    {t:'start'} {t:'move',seat,p,to} {t:'chat',msg} {t:'rematch'}
     host → client:{t:'joined',code,seat,host,players}
                    {t:'players',players,host} {t:'started'} {t:'move',seat,p,to}
                    {t:'chat',name,msg} {t:'err',msg} {t:'close'}
     Bổ sung cho MQTT: mọi tin khách→host đều kèm gid (mã phiên khách);
     tin trả thẳng (joined/err) kèm dto=<gid> (khác field "to" = điểm đích
     của nước đi, không được dùng chung tên).
   Chọn transport: ?net=ws | ?net=mqtt | tự động
     - localhost/file → WS
     - còn lại        → MQTT
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.Net = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const TOPIC_ROOT = 'cotamquoc';
  const BROKERS = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081/'
  ];

  function defaultURL() {
    if (typeof location === 'undefined') return 'ws://localhost:8787';
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    return 'ws://localhost:8787';               // mở bằng file:// → server mặc định
  }

  function isLocal() {
    if (typeof location === 'undefined') return true;
    const h = location.hostname;
    return location.protocol === 'file:' || !h || h === 'localhost' ||
      h === '127.0.0.1' || h === '::1' || h === '[::1]';
  }

  function queryTransport() {
    if (typeof location === 'undefined' || !location.search) return null;
    const m = /[?&]net=(ws|mqtt)\b/.exec(location.search);
    return m ? m[1] : null;
  }

  function makeCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }
  function randId(p) { return p + Math.random().toString(36).slice(2, 11); }
  function cleanName(s) {
    s = String(s || '').replace(/[<>]/g, '').trim().slice(0, 16);
    return s || 'Người chơi';
  }
  function roster(room) {
    const p = [];
    for (const s of [0, 1, 2]) if (room.seats[s]) p.push({ seat: s, name: room.seats[s].name });
    return p;
  }
  function parseMsg(data) {
    if (typeof data === 'string') { try { return JSON.parse(data); } catch (e) { return null; } }
    return (data && typeof data === 'object') ? data : null;
  }
  function topic(code, kind) { return TOPIC_ROOT + '/' + code + '/' + kind; }

  function Net() {
    this.ws = null;
    this.handlers = {};
    this.connected = false;
    this.transport = null;      // 'ws' | 'mqtt'
    this._mqtt = null;          // client mqtt.js
    this._code = null;          // mã phòng hiện tại
    this._gid = null;           // mã phiên của mình (khách)
    this._isHost = false;
    this._room = null;
    this._selfEntry = null;     // entry "mình" phía host
    this._conns = [];           // các guest (host side)
    this._entries = {};         // gid → entry (host side)
    this._inRoom = false;
    this._closing = false;
    this._closed = false;       // đã phát sự kiện close chưa
    this._done = false;         // đã báo lỗi/thành công lần kết nối này
    this._hasAlive = false;     // (khách) thấy retained alive của chủ
    this._joinTimer = null;
  }

  Net.prototype.on = function (type, fn) { this.handlers[type] = fn; return this; };
  Net.prototype.emit = function (type, data) { if (this.handlers[type]) this.handlers[type](data); };

  /* ===================== KẾT NỐI ===================== */
  Net.prototype.connect = function (url) {
    const mode = queryTransport() || (isLocal() ? 'ws' : 'mqtt');
    if (mode === 'ws') return this._connectWS(url || defaultURL(), 0);
    return this._connectMQTT();
  };

  Net.prototype._connectWS = function (url, timeoutMs) {
    const self = this;
    return new Promise(function (resolve, reject) {
      let ws = null, settled = false, timer = null;
      const fail = function (e) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (ws) { try { ws.onclose = null; ws.onerror = null; ws.close(); } catch (x) {} }
        reject(e instanceof Error ? e : new Error(String(e)));
      };
      if (timeoutMs > 0) timer = setTimeout(function () { fail(new Error('WS timeout')); }, timeoutMs);
      try { ws = new WebSocket(url); }
      catch (e) { fail(e); return; }
      self.ws = ws;
      ws.onmessage = function (ev) {
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg && msg.t) self.emit(msg.t, msg);
      };
      ws.onopen = function () {
        if (settled) { try { ws.close(); } catch (x) {} return; }
        settled = true;
        if (timer) clearTimeout(timer);
        self.connected = true;
        self.transport = 'ws';
        resolve();
      };
      ws.onerror = function () { fail(new Error('Không thể kết nối ' + url)); };
      ws.onclose = function () {
        const was = self.connected;
        self.connected = false;
        if (!settled) { fail(new Error('Kết nối bị đóng')); return; }
        if (was && !self._closing) self.emit('close', {});
      };
    });
  };

  Net.prototype._connectMQTT = function () {
    if (typeof mqtt === 'undefined') return Promise.reject(new Error('Thiếu thư viện MQTT'));
    this.transport = 'mqtt';
    this.connected = true;
    return Promise.resolve();
  };

  /* ---- kết nối broker MQTT (thử lần lượt, có will) ---- */
  Net.prototype._mqttConnect = function (will) {
    const self = this;
    if (typeof mqtt === 'undefined') return Promise.reject(new Error('Thiếu thư viện MQTT'));
    return new Promise(function (resolve, reject) {
      let idx = 0, client = null, settled = false, timer = null;
      const cleanup = function (c) {
        if (!c) return;
        try { c.removeAllListeners(); } catch (e) {}
        try { c.on('error', function () {}); } catch (e) {}   // nuốt lỗi khi force-end
        try { c.end(true); } catch (e) {}
      };
      const failAttempt = function () {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        cleanup(client);
        client = null;
        idx++;
        if (idx >= BROKERS.length) {
          settled = true;
          reject(new Error('Không kết nối được máy chủ trung gian'));
        } else attempt();
      };
      const attempt = function () {
        let c;
        try {
          c = mqtt.connect(BROKERS[idx], {
            clientId: randId('cotq'),
            protocolVersion: 4,
            connectTimeout: 4500,
            reconnectPeriod: 0,          // mất broker → báo close, không tự nối lại
            keepalive: 10,
            clean: true,
            will: will ? {
              topic: will.topic,
              payload: will.payload == null ? '' : String(will.payload),
              qos: 0, retain: !!will.retain
            } : undefined
          });
        } catch (e) { failAttempt(); return; }
        client = c;
        timer = setTimeout(failAttempt, 6500);
        c.on('connect', function () {
          if (settled) return;
          settled = true;
          if (timer) { clearTimeout(timer); timer = null; }
          resolve(c);
        });
        c.on('error', function () { failAttempt(); });
        c.on('close', function () { failAttempt(); });
      };
      attempt();
    });
  };

  Net.prototype._mqttPublish = function (kind, obj) {
    const c = this._mqtt;
    if (!c || !this._code) return;
    const data = typeof obj === 'string' ? obj : JSON.stringify(obj);
    try { c.publish(topic(this._code, kind), data); } catch (e) {}
  };
  Net.prototype._clearAlive = function () {
    const c = this._mqtt;
    if (!c || !this._code) return;
    try { c.publish(topic(this._code, 'alive'), '', { retain: true }); } catch (e) {}
  };
  Net.prototype._cleanupMQTT = function () {
    const c = this._mqtt;
    this._mqtt = null;
    if (!c) return;
    try { c.removeAllListeners('message'); } catch (e) {}
    try { c.end(); } catch (e) {}
  };

  /* ===================== GỬI ĐI ===================== */
  Net.prototype.send = function (obj) {
    if (this.transport === 'mqtt') { this._mqttSend(obj); return; }
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  };

  Net.prototype._mqttSend = function (obj) {
    if (!obj || !obj.t) return;
    if (obj.t === 'create') { this._mqttCreate(obj); return; }
    if (obj.t === 'join') { this._mqttJoin(obj); return; }
    if (this._isHost) { this._handleHost(this._selfEntry, obj); return; }   // xử lý tại chỗ
    if (this._inRoom && this._mqtt) {
      this._mqttPublish('in', Object.assign({}, obj, { gid: this._gid }));
    }
  };

  /* ---- chủ phòng: mở phòng theo mã ---- */
  Net.prototype._mqttCreate = function (payload) {
    const self = this;
    const name = cleanName(payload && payload.name);
    const code = makeCode();
    this._code = code;
    this._closed = false;
    this._done = false;
    this._mqttConnect({ topic: topic(code, 'alive'), payload: '', retain: true })
      .then(function (c) {
        self._mqtt = c;
        if (self._closing) { try { c.end(true); } catch (e) {} return; }
        c.on('message', function (tp, buf) { self._onHostMessage(tp, buf); });
        c.on('close', function () { self._fireClose(); });
        c.on('error', function () {});
        // presence: retained — khách đọc được ngay khi subscribe
        try { c.publish(topic(code, 'alive'), JSON.stringify({ ts: Date.now() }), { retain: true }); } catch (e) {}
        c.subscribe(topic(code, 'in'), function (err) {
          if (err) {
            self._failCreate('Không tạo được phòng — kiểm tra kết nối Internet');
            return;
          }
          if (self._closing) { self._cleanupMQTT(); return; }
          const room = { code: code, seats: [null, null, null], host: 0, started: false };
          room.seats[0] = { name: name, conn: null };
          self._room = room;
          self._isHost = true;
          self._inRoom = true;
          self._conns = [];
          self._entries = {};
          self._selfEntry = {
            conn: { send: function (o) { self.emit(o.t, o); } },   // "nhận" của chính mình
            room: room, seat: 0
          };
          self.emit('joined', { t: 'joined', code: code, seat: 0, host: 0, players: roster(room) });
        });
      })
      .catch(function () {
        self._failCreate('Không tạo được phòng — kiểm tra kết nối Internet');
      });
  };

  Net.prototype._failCreate = function (msg) {
    if (this._done || this._closing) return;
    this._done = true;
    this._closed = true;
    this.connected = false;
    this._cleanupMQTT();
    this.emit('err', { t: 'err', msg: msg });
  };

  /* ---- khách: vào phòng theo mã ---- */
  Net.prototype._mqttJoin = function (payload) {
    const self = this;
    const code = String((payload && payload.code) || '').toUpperCase().trim();
    const name = cleanName(payload && payload.name);
    if (code.length !== 4) { this.emit('err', { t: 'err', msg: 'Mã phòng gồm 4 ký tự' }); return; }
    const gid = randId('g');
    this._code = code;
    this._gid = gid;
    this._closed = false;
    this._done = false;
    this._hasAlive = false;
    // will: nếu khách chết mạng → broker tự báo chủ phòng giải phóng ghế
    this._mqttConnect({ topic: topic(code, 'in'), payload: JSON.stringify({ t: 'leave', gid: gid }), retain: false })
      .then(function (c) {
        self._mqtt = c;
        if (self._closing) { try { c.end(true); } catch (e) {} return; }
        c.on('message', function (tp, buf) { self._onGuestMessage(tp, buf); });
        c.on('close', function () {
          if (self._closing) return;
          self.connected = false;
          if (self._inRoom) self._fireClose();
          else self._failJoin('Mất kết nối — kiểm tra kết nối Internet');
        });
        c.on('error', function () {});
        c.subscribe([topic(code, 'out'), topic(code, 'alive')], function (err) {
          if (err) { self._failJoin('Không kết nối được phòng "' + code + '"'); return; }
          if (self._closing) return;
          // retained "alive" đến ngay sau SUBACK: có → phòng tồn tại; không → sai mã
          setTimeout(function () {
            if (self._done || self._inRoom || self._closing) return;
            if (!self._hasAlive) { self._failJoin('Không tìm thấy phòng "' + code + '"'); return; }
            try { self._mqttPublish('in', { t: 'join', name: name, gid: gid }); } catch (e) {}
            self._joinTimer = setTimeout(function () {
              self._joinTimer = null;
              self._failJoin('Không tìm thấy phòng "' + code + '"');
            }, 8000);
          }, 700);
        });
      })
      .catch(function () {
        self.connected = false;
        self.emit('err', { t: 'err', msg: 'Không kết nối được — kiểm tra kết nối Internet' });
      });
  };

  Net.prototype._failJoin = function (msg) {
    if (this._done || this._inRoom || this._closing) return;
    this._done = true;
    this._closed = true;
    if (this._joinTimer) { clearTimeout(this._joinTimer); this._joinTimer = null; }
    this.connected = false;
    this._cleanupMQTT();
    this.emit('err', { t: 'err', msg: msg });
  };

  /* ===================== HOST: NHẬN TIN TỪ KHÁCH ===================== */
  Net.prototype._onHostMessage = function (tp, buf) {
    if (tp.split('/').pop() !== 'in') return;
    const msg = parseMsg(buf.toString());
    if (!msg || !msg.t || !msg.gid) return;
    const self = this;
    let entry = this._entries[msg.gid];
    if (!entry) {
      entry = {
        gid: msg.gid, room: null, seat: -1,
        conn: {
          send: function (o) {
            try { self._mqttPublish('out', Object.assign({}, o, { dto: msg.gid })); } catch (e) {}
          }
        }
      };
      this._entries[msg.gid] = entry;
      this._conns.push(entry);
    }
    try { this._handleHost(entry, msg); } catch (e) {}
  };

  /* ---- host: xử lý tin (port y hệt server.js handleMessage) ---- */
  Net.prototype._handleHost = function (entry, msg) {
    switch (msg.t) {
      case 'join': {
        const room = this._room;
        if (!room) { entry.conn.send({ t: 'err', msg: 'Không tìm thấy phòng' }); return; }
        if (room.started) { entry.conn.send({ t: 'err', msg: 'Trận đã bắt đầu' }); return; }
        const seat = [0, 1, 2].find(s => !room.seats[s]);
        if (seat === undefined) { entry.conn.send({ t: 'err', msg: 'Phòng đã đủ 3 người' }); return; }
        if (entry.room) this._leaveRoom(entry);
        room.seats[seat] = { name: cleanName(msg.name), conn: entry.conn };
        entry.room = room; entry.seat = seat;
        entry.conn.send({ t: 'joined', code: room.code, seat, host: room.host, players: roster(room) });
        this._broadcastPlayers(room);
        break;
      }
      case 'leave': this._leaveRoom(entry); break;
      case 'start': {
        const room = entry.room;
        if (!room || room.host !== entry.seat) return;
        room.started = true;
        this._broadcast(room, { t: 'started', host: room.host });
        break;
      }
      case 'move': {
        const room = entry.room;
        if (!room || !room.started) return;
        const seat = msg.seat | 0;
        if (seat < 0 || seat > 2) return;
        // người chỉ được đi cho phe của mình; host được quyền điều khiển phe trống
        const isHost = room.host === entry.seat;
        const seatTaken = !!room.seats[seat];
        if (seat !== entry.seat && !(isHost && !seatTaken)) return;
        this._broadcast(room, { t: 'move', seat, p: msg.p | 0, to: msg.to | 0 });
        break;
      }
      case 'chat': {
        const room = entry.room;
        if (!room) return;
        const name = room.seats[entry.seat] ? room.seats[entry.seat].name : '?';
        this._broadcast(room, { t: 'chat', name: cleanName(name), msg: cleanName(msg.msg).slice(0, 60) });
        break;
      }
      case 'rematch': {
        const room = entry.room;
        if (!room || room.host !== entry.seat) return;
        room.started = false;
        this._broadcast(room, { t: 'rematch' });
        break;
      }
    }
  };

  Net.prototype._broadcast = function (room, obj) {
    if (this.transport === 'mqtt') this._mqttPublish('out', obj);   // 1 packet, mọi khách nhận
    this.emit(obj.t, obj);   // host cũng "nhận" lại — giống hệt server broadcast có mình
  };

  Net.prototype._broadcastPlayers = function (room) {
    this._broadcast(room, { t: 'players', players: roster(room), host: room.host });
  };

  Net.prototype._leaveRoom = function (entry) {
    const room = entry.room;
    if (!room) return;
    room.seats[entry.seat] = null;
    entry.room = null; entry.seat = -1;
    if (room.host === entry.seat) {
      room.host = [0, 1, 2].find(s => room.seats[s]);
      if (room.host === undefined) room.host = -1;
    }
    // chủ phòng rời → báo cả phòng rồi đóng broker
    if (entry === this._selfEntry && this._isHost) {
      this._closeHostRoom();
      return;
    }
    this._broadcastPlayers(room);
  };

  Net.prototype._closeHostRoom = function () {
    this._isHost = false;
    this._inRoom = false;
    this._mqttPublish('out', { t: 'close' });
    this._clearAlive();
    this.connected = false;
    this._cleanupMQTT();
  };

  /* ===================== KHÁCH: NHẬN TIN ===================== */
  Net.prototype._onGuestMessage = function (tp, buf) {
    const kind = tp.split('/').pop();
    const empty = !buf || buf.length === 0;
    if (kind === 'alive') {
      if (empty) {                       // chủ phòng đã tắt (will hoặc clear retained)
        if (this._inRoom) this._fireClose();
        else this._failJoin('Không tìm thấy phòng "' + this._code + '"');
        return;
      }
      this._hasAlive = true;             // retained presence
      return;
    }
    if (kind !== 'out') return;
    const msg = parseMsg(buf.toString());
    if (!msg || !msg.t) return;
    if (msg.dto && msg.dto !== this._gid) return;   // tin trả thẳng riêng mình
    if (msg.t === 'joined') {
      this._inRoom = true;
      this._done = true;
      if (this._joinTimer) { clearTimeout(this._joinTimer); this._joinTimer = null; }
    } else if (msg.t === 'err' && !this._inRoom) {
      this._done = true;
      if (this._joinTimer) { clearTimeout(this._joinTimer); this._joinTimer = null; }
    }
    this.emit(msg.t, msg);
  };

  Net.prototype._fireClose = function () {
    if (this._closing || this._closed) return;
    this._closed = true;
    this.connected = false;
    this.emit('close', {});
  };

  /* ===================== ĐÓNG KẾT NỐI ===================== */
  Net.prototype.close = function () {
    this._closing = true;
    if (this._joinTimer) { clearTimeout(this._joinTimer); this._joinTimer = null; }
    if (this.transport === 'mqtt') {
      try {
        if (this._isHost) {
          this._mqttPublish('out', { t: 'close' });   // báo khách (end() sẽ flush trước DISCONNECT)
          this._clearAlive();
        } else if (this._inRoom && this._gid) {
          this._mqttPublish('in', { t: 'leave', gid: this._gid });
        }
      } catch (e) {}
      this._isHost = false;
      this._inRoom = false;
      this._room = null;
      this._cleanupMQTT();
      this.connected = false;
      return;
    }
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
    this.connected = false;
  };

  Net.defaultURL = defaultURL;
  return Net;
});
