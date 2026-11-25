const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const store = require('./store');
const bus = require('./bus');
const chat = require('./chat');
const emotes = require('./emotes');
const twitch = require('./twitch');
const youtube = require('./youtube');
const kick = require('./kick');
const commands = require('./commands');
const polls = require('./polls');
const giveaways = require('./giveaways');
const badges = require('./badges');
const i18n = require('./i18n');

const PUBLIC = path.join(__dirname, '..', 'public');
const config = store.get('config');
const PORT = Number(process.env.PORT) || config.port || 3777;

commands.init(() => twitch.getStreamInfo());
const reloadSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => reloadEmotes().catch(() => {}), 500); }; })();
polls.init();
twitch.onRoom(reloadSoon);
youtube.onChannel(reloadSoon);
kick.onChannel(reloadSoon);
giveaways.init();
badges.init();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

function serveFile(res, base, rel, extraHeaders = {}) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { res.writeHead(400); return res.end(); }
  if (decoded.includes('\0')) { res.writeHead(400); return res.end(); }
  const root = path.resolve(base);
  const p = path.resolve(root, '.' + path.sep + decoded);
  if (p !== root && !p.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS, ...extraHeaders,
    });
    fs.createReadStream(p).on('error', () => res.destroy()).pipe(res);
  });
}

const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map(h => `http://${h}`));

function isTrustedRequest(req) {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) return false;
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.origin;
  if (origin !== undefined) return ALLOWED_ORIGINS.has(String(origin).toLowerCase());
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 6e6) { reject(new Error('Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
      } catch { reject(new Error('Неверный JSON')); }
    });
    req.on('error', reject);
  });
}

function publicConfig() {
  const c = store.get('config');
  return {
    port: PORT, lang: c.lang || null, electron: !!process.env.STREAMNEST_ELECTRON, closeAction: c.closeAction || 'ask',
    twitch: { clientId: c.twitch.clientId, channel: c.twitch.channel, login: c.twitch.login },
    youtube: { channel: c.youtube.channel, clientId: c.youtube.clientId, hasSecret: !!c.youtube.clientSecret, pollInterval: c.youtube.pollInterval, autoConnect: c.youtube.autoConnect },
    kick: { channel: c.kick.channel, chatroomId: c.kick.chatroomId, clientId: c.kick.clientId, hasSecret: !!c.kick.clientSecret },
    emotes: c.emotes, overlay: c.overlay, chat: c.chat, dock: c.dock,
  };
}

function fullState() {
  return {
    config: publicConfig(),
    status: { twitch: twitch.publicStatus(), youtube: youtube.publicStatus(), kick: kick.publicStatus(), twitchStream: twitch.getStreamInfo() },
    commands: commands.list(), badges: badges.list(), presets: store.get('presets'),
    poll: polls.state(), giveaway: giveaways.state(), emotes: emotes.getStats(),
    pollHistory: polls.history().slice(0, 10), giveawayHistory: giveaways.history().slice(0, 10),
  };
}

async function reloadEmotes() {
  const twitchId = twitch.roomId() || await twitch.getBroadcasterId().catch(() => null);
  const st = await emotes.load({ twitchId, youtubeId: youtube.channelId(), kickId: kick.userId() });
  bus.broadcast('emotes', st);
  return st;
}

const OVERLAY_ENUMS = { theme: ['glass', 'bubble', 'minimal'], animation: ['slide', 'fade', 'pop', 'none'], anchor: ['left', 'right'], align: ['bottom', 'top'] };
const OVERLAY_NUMS = { fontSize: [10, 72], maxMessages: [1, 100], hideAfter: [0, 3600], emoteScale: [0.5, 4], width: [0, 7680], height: [0, 4320] };
const OVERLAY_BOOLS = ['showPlatform', 'showTwitchBadges', 'showCustomBadges', 'hideCommands', 'hideVotes', 'nameShadow'];
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
function sanitizeOverlay(o) {
  const d = store.DEFAULTS.config.overlay;
  const out = {};
  for (const [k, list] of Object.entries(OVERLAY_ENUMS)) out[k] = list.includes(o[k]) ? o[k] : d[k];
  for (const [k, [lo, hi]] of Object.entries(OVERLAY_NUMS)) { const n = Number(o[k]); out[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d[k]; }
  for (const k of OVERLAY_BOOLS) out[k] = o[k] === undefined ? d[k] : !!o[k];
  for (const k of ['textColor', 'accent']) out[k] = COLOR_RE.test(String(o[k])) ? o[k] : d[k];
  out.fontFamily = /^[\w \-]{1,40}$/u.test(String(o.fontFamily)) ? o.fontFamily : d.fontFamily;
  out.hideBots = String(o.hideBots ?? d.hideBots).slice(0, 500);
  return out;
}

const routes = {
  'GET /api/state': () => fullState(),

  'POST /api/twitch/config': async (b) => {
    const t = store.get('config').twitch;
    if (b.clientId !== undefined) t.clientId = String(b.clientId).trim();
    if (b.channel !== undefined) t.channel = String(b.channel).trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[^a-z0-9_]/g, '').slice(0, 25);
    store.save('config', true);
    if (t.channel || t.token) twitch.connect(); else twitch.disconnect();
    return publicConfig();
  },
  'GET /api/twitch/auth-url': () => {
    if (!store.get('config').twitch.clientId) throw new Error('Сначала укажите Client ID');
    return { url: twitch.authUrl(PORT) };
  },
  'POST /api/twitch/token': async (b) => {
    const v = await twitch.setToken(String(b.token || ''), String(b.state || ''));
    twitch.connect();
    reloadEmotes().catch(() => {});
    return { login: v.login };
  },
  'POST /api/twitch/connect': () => { twitch.connect(); return { ok: true }; },
  'POST /api/twitch/disconnect': () => { twitch.disconnect(); return { ok: true }; },
  'POST /api/twitch/logout': () => { twitch.logout(); return { ok: true }; },
  'GET /api/twitch/channel': () => twitch.getChannel(),
  'POST /api/twitch/channel': (b) => twitch.updateChannel({ title: b.title, gameId: b.gameId }),
  'GET /api/twitch/categories': (b, q) => twitch.searchCategories(q.get('q')),

  'POST /api/youtube/config': (b) => {
    const y = store.get('config').youtube;
    if (b.clientId !== undefined) y.clientId = String(b.clientId).trim();
    if (b.clientSecret) y.clientSecret = String(b.clientSecret).trim();
    if (b.pollInterval) y.pollInterval = Math.max(2000, Math.min(60000, Number(b.pollInterval) || 6000));
    if (b.autoConnect !== undefined) y.autoConnect = !!b.autoConnect;
    if (b.channel !== undefined) {
      y.channel = String(b.channel).trim().slice(0, 200);
      store.save('config', true);
      if (y.channel) youtube.connect(); else youtube.disconnect();
    }
    store.save('config', true);
    return publicConfig();
  },
  'POST /api/youtube/connect': () => { youtube.connect(); return { ok: true }; },
  'POST /api/youtube/disconnect': () => { youtube.disconnect(); return { ok: true }; },
  'POST /api/youtube/logout': () => { youtube.logout(); return { ok: true }; },
  'GET /api/youtube/stream': () => youtube.getStream(),
  'POST /api/youtube/stream': (b) => youtube.updateStream({ title: b.title, categoryId: b.categoryId }),
  'GET /api/youtube/categories': () => youtube.categories(),

  'POST /api/chat/send': (b) => {
    const text = String(b.text || '').trim().slice(0, 500);
    if (!text) throw new Error('Пустое сообщение');
    if (!['all', 'twitch', 'youtube', 'kick'].includes(b.platform || 'all')) throw new Error('Неизвестная платформа');
    if (!chat.hasSender(b.platform || 'all')) throw new Error('Чат подключён только на чтение. Чтобы писать, войдите в аккаунт во вкладке «Подключения»');
    return chat.send(b.platform || 'all', text);
  },
  'POST /api/test/message': (b) => {
    const r = b.roles || {};
    const roles = { sub: !!r.sub, mod: !!r.mod, vip: !!r.vip, broadcaster: !!r.broadcaster };
    const name = String(b.name || 'Зритель').trim().slice(0, 40) || 'Зритель';
    return chat.ingest({
      id: 'test_' + Date.now() + Math.random().toString(36).slice(2, 5), platform: ['youtube', 'kick'].includes(b.platform) ? b.platform : 'twitch',
      user: { id: 'test-' + name.toLowerCase(), login: name.toLowerCase(), name, color: b.color ? String(b.color) : null, roles, badges: [] },
      text: String(b.text || 'Привет, чат! 👋').slice(0, 500), test: true,
      highlight: ['superchat', 'event', 'highlight'].includes(b.highlight) ? b.highlight : null, eventText: b.eventText ? String(b.eventText).slice(0, 100) : null,
    });
  },
  'GET /api/history': () => chat.getHistory(),
  'GET /api/users': (b, q) => {
    const s = (q.get('q') || '').toLowerCase();
    const all = Object.entries(store.get('users')).map(([key, u]) => ({ key, ...u }));
    return all.filter(u => !s || (u.name || '').toLowerCase().includes(s))
      .sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 50);
  },

  'POST /api/commands': (b) => commands.upsert(b),
  'DELETE /api/commands': (b, q) => { commands.remove(q.get('id')); return { ok: true }; },
  'POST /api/commands/preview': (b) => ({
    text: commands.render(String(b.response || ''), {
      msg: { user: { name: i18n.lang() === 'en' ? 'Viewer' : 'Зритель', messages: 42 }, platform: 'twitch' }, args: [i18n.lang() === 'en' ? '@friend' : '@друг'], cmd: { count: 7 },
    }),
  }),

  'POST /api/poll/start': (b) => polls.start(b),
  'POST /api/poll/end': () => polls.end(true),
  'POST /api/poll/cancel': () => { polls.cancel(); return { ok: true }; },

  'POST /api/giveaway/open': (b) => giveaways.open(b),
  'POST /api/giveaway/close': () => giveaways.close(true),
  'POST /api/giveaway/draw': () => giveaways.draw(),
  'POST /api/giveaway/reset': () => { giveaways.reset(); return { ok: true }; },
  'POST /api/giveaway/remove-entry': (b) => { giveaways.removeEntry(b.key); return { ok: true }; },

  'POST /api/badges': (b) => badges.upsert(b),
  'DELETE /api/badges': (b, q) => { badges.remove(q.get('id')); return { ok: true }; },
  'POST /api/badges/assign': (b) => badges.assign(b.id, b.user, b.on !== false),

  'POST /api/overlay': (b) => {
    const c = store.get('config');
    c.overlay = sanitizeOverlay({ ...c.overlay, ...b });
    store.save('config');
    bus.broadcast('overlay-config', c.overlay);
    return c.overlay;
  },
  'POST /api/lang': (b) => {
    const c = store.get('config');
    const lang = b.lang === 'en' ? 'en' : 'ru';
    c.lang = lang;
    const cmds = store.get('commands');
    const ruDefaults = { c_hello: '!привет', c_dice: '!кубик', c_uptime: '!аптайм' };
    const enDefaults = { c_hello: '!hello', c_dice: '!dice', c_uptime: '!uptime' };
    const from = lang === 'en' ? ruDefaults : enDefaults;
    const untouched = cmds.length === 3 && cmds.every(x => from[x.id] === x.trigger && !x.count);
    if (untouched) {
      const src = lang === 'en' ? i18n.EN_COMMANDS : store.DEFAULTS.commands;
      if (src.length) { cmds.splice(0, cmds.length, ...JSON.parse(JSON.stringify(src))); store.save('commands'); bus.broadcast('commands', cmds, 'dashboard'); }
    }
    const LABELS = { ru: { delete: 'Удалить', ban: 'Бан', unban: 'Разбан', timeout: (a, u) => `Мут ${a} ${{ s: 'сек', m: 'мин', h: 'ч', d: 'дн' }[u]}` },
      en: { delete: 'Delete', ban: 'Ban', unban: 'Unban', timeout: (a, u) => `Timeout ${a} ${{ s: 'sec', m: 'min', h: 'h', d: 'd' }[u]}` } };
    const other = LABELS[lang === 'en' ? 'ru' : 'en'];
    const known = new Set(['Мут 10 мин', 'Мут 1 ч', 'Timeout 10 min', 'Timeout 1 h']);
    for (const btn of c.dock.modButtons || []) {
      const otherLabel = btn.action === 'timeout' ? other.timeout(btn.amount, btn.unit) : other[btn.action];
      if (btn.label === otherLabel || known.has(btn.label)) btn.label = btn.action === 'timeout' ? LABELS[lang].timeout(btn.amount, btn.unit) : LABELS[lang][btn.action];
    }
    store.save('config', true);
    bus.broadcast('dock-config', c.dock);
    bus.broadcast('lang', { lang });
    return publicConfig();
  },
  'POST /api/app': (b) => {
    const c = store.get('config');
    if (b.closeAction !== undefined) c.closeAction = ['tray', 'quit'].includes(b.closeAction) ? b.closeAction : null;
    store.save('config', true);
    return publicConfig();
  },
  'POST /api/dock': (b) => {
    const c = store.get('config');
    const d = { ...c.dock };
    if (b.fontSize !== undefined) d.fontSize = Math.max(10, Math.min(24, Number(b.fontSize) || 13));
    for (const k of ['showTime', 'showBadges', 'showViewers']) if (b[k] !== undefined) d[k] = !!b[k];
    if (b.buttonsMode !== undefined) d.buttonsMode = b.buttonsMode === 'always' ? 'always' : 'hover';
    if (Array.isArray(b.modButtons)) {
      d.modButtons = b.modButtons.slice(0, 12).map((m, i) => ({
        id: String(m.id || 'm' + Date.now() + i),
        label: String(m.label || '').trim().slice(0, 24) || 'Кнопка',
        action: ['timeout', 'ban', 'delete', 'unban'].includes(m.action) ? m.action : 'timeout',
        amount: Math.max(1, Number(m.amount) || 1),
        unit: ['s', 'm', 'h', 'd'].includes(m.unit) ? m.unit : 'm',
        reason: String(m.reason || '').slice(0, 200),
      }));
    }
    c.dock = d;
    store.save('config');
    bus.broadcast('dock-config', d);
    return d;
  },
  'POST /api/mod': (b) => {
    const mult = { s: 1, m: 60, h: 3600, d: 86400 }[b.unit] || 1;
    const args = { action: b.action, userId: b.userId, messageId: b.messageId, duration: (Number(b.amount) || 0) * mult, reason: b.reason };
    if (b.platform === 'kick') return kick.moderate(args);
    if (!b.platform || b.platform === 'twitch') return twitch.moderate(args);
    throw new Error('Модерация доступна для Twitch и Kick');
  },

  'POST /api/kick/config': (b) => {
    const k = store.get('config').kick;
    if (b.clientId !== undefined) k.clientId = String(b.clientId).trim();
    if (b.clientSecret) k.clientSecret = String(b.clientSecret).trim();
    if (b.chatroomId !== undefined) k.chatroomId = String(b.chatroomId).replace(/\D/g, '').slice(0, 15);
    if (b.channel !== undefined) {
      k.channel = String(b.channel).trim().replace(/^.*kick\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
      store.save('config', true);
      if (k.channel) kick.connect(); else kick.disconnect();
    }
    store.save('config', true);
    return publicConfig();
  },
  'POST /api/kick/connect': () => { kick.connect(); return { ok: true }; },
  'POST /api/kick/disconnect': () => { kick.disconnect(); return { ok: true }; },
  'POST /api/kick/logout': () => { kick.logout(); return { ok: true }; },
  'GET /api/kick/channel': () => kick.getChannel(),
  'POST /api/kick/channel': (b) => kick.updateChannel({ title: b.title, categoryId: b.categoryId }),
  'GET /api/kick/categories': (b, q) => kick.searchCategories(q.get('q')),
  'POST /api/settings': (b) => {
    const c = store.get('config');
    const bools = (cur, upd, keys) => { for (const k of keys) if (upd && upd[k] !== undefined) cur[k] = !!upd[k]; };
    bools(c.chat, b.chat, ['pollKeywords', 'announcePolls', 'announceGiveaways']);
    bools(c.emotes, b.emotes, ['seventv', 'bttv', 'ffz']);
    store.save('config');
    return publicConfig();
  },
  'POST /api/emotes/reload': () => reloadEmotes(),
  'GET /api/emotes': () => ({ stats: emotes.getStats(), list: emotes.list(300) }),

  'POST /api/presets': (b) => {
    const presets = store.get('presets');
    const cat = (g) => (g && g.id ? { id: String(g.id).slice(0, 40), name: String(g.name || '').slice(0, 100), boxArt: g.boxArt ? String(g.boxArt).slice(0, 500) : null } : null);
    const p = {
      id: typeof b.id === 'string' && /^pr_[a-z0-9]+$/.test(b.id) ? b.id : 'pr_' + Date.now().toString(36),
      name: String(b.name || b.title || 'Пресет').slice(0, 80), title: String(b.title || '').slice(0, 140),
      twitchGame: cat(b.twitchGame), kickCategory: cat(b.kickCategory),
      youtubeCategoryId: b.youtubeCategoryId ? String(b.youtubeCategoryId).replace(/\D/g, '').slice(0, 5) : null,
    };
    const i = presets.findIndex(x => x.id === p.id);
    if (i >= 0) presets[i] = p; else presets.push(p);
    store.save('presets');
    return presets;
  },
  'DELETE /api/presets': (b, q) => {
    const presets = store.get('presets');
    const i = presets.findIndex(x => x.id === q.get('id'));
    if (i >= 0) presets.splice(i, 1);
    store.save('presets');
    return presets;
  },
};

const AFTER_LOGIN = process.env.STREAMNEST_ELECTRON ? '/auth/done' : '/#/settings';
const AUTH_TWITCH_PAGE = `<!doctype html><meta charset="utf-8"><title>Twitch</title>
<body style="background:#0b0b12;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh">
<div id="s">Сохраняю вход…</div>
<script>
const p = new URLSearchParams(location.hash.slice(1));
const t = p.get('access_token');
history.replaceState(null, '', location.pathname);
if (!t) { document.getElementById('s').textContent = 'Вход отменён: ' + (new URLSearchParams(location.search).get('error_description') || 'нет токена'); }
else fetch('/api/twitch/token', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token:t, state:p.get('state')})})
  .then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); location.replace('__AFTER__'); })
  .catch(e => document.getElementById('s').textContent = 'Ошибка: ' + e.message);
</script>`;

function escHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function errorPage(res, title, e) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
  return res.end(`<!doctype html><meta charset="utf-8"><body style="background:#0b0b12;color:#fff;font-family:system-ui;padding:40px">${escHtml(title)}: ${escHtml(e.message || e)}<br><a style="color:#a78bfa" href="/#/settings">Назад</a></body>`);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[server]', e);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Внутренняя ошибка' }); else res.destroy();
  });
});

async function handle(req, res) {
  if (!isTrustedRequest(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden'); }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  const p = url.pathname;

  if (p === '/events') {
    const kind = url.searchParams.get('client') === 'overlay' ? 'overlay' : 'dashboard';
    const client = bus.addClient(req, res, kind);
    bus.send(client, 'overlay-config', store.get('config').overlay);
    bus.send(client, 'badges', badges.list());
    bus.send(client, 'poll', polls.state());
    bus.send(client, 'giveaway', giveaways.state());
    if (kind === 'dashboard') bus.send(client, 'dock-config', store.get('config').dock);
    bus.send(client, 'lang', { lang: store.get('config').lang || 'ru' });
    const hist = chat.getHistory();
    const n = kind === 'overlay' ? Math.min(100, Number(url.searchParams.get('history') ?? 10) || 0) : 150;
    bus.send(client, 'history', n > 0 ? hist.slice(-n) : []);
    return;
  }

  if (p === '/auth/twitch') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS }); return res.end(AUTH_TWITCH_PAGE.replace('__AFTER__', AFTER_LOGIN)); }
  if (p === '/auth/done') {
    const en = store.get('config').lang === 'en';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>StreamNest</title><body style="background:#08080d;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
      <div><div style="font-size:48px">✅</div><h2>${en ? 'Signed in!' : 'Вход выполнен!'}</h2><p style="color:#8d8ba3">${en ? 'You can close this tab and return to StreamNest.' : 'Эту вкладку можно закрыть и вернуться в StreamNest.'}</p></div>
      <script>setTimeout(() => window.close(), 1500)</script>`);
  }
  if (p === '/auth/kick') {
    const k = store.get('config').kick;
    if (!k.clientId || !k.clientSecret) { res.writeHead(302, { Location: '/#/settings' }); return res.end(); }
    res.writeHead(302, { Location: kick.authUrl(PORT) }); return res.end();
  }
  if (p === '/auth/kick/callback') {
    try {
      const code = url.searchParams.get('code');
      if (!code) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error') || 'нет кода');
      await kick.exchangeCode(code, url.searchParams.get('state'), PORT);
      res.writeHead(302, { Location: AFTER_LOGIN }); return res.end();
    } catch (e) { return errorPage(res, 'Ошибка входа в Kick', e); }
  }
  if (p === '/auth/youtube') {
    const y = store.get('config').youtube;
    if (!y.clientId || !y.clientSecret) { res.writeHead(302, { Location: '/#/settings' }); return res.end(); }
    res.writeHead(302, { Location: youtube.authUrl(PORT) }); return res.end();
  }
  if (p === '/auth/youtube/callback') {
    const code = url.searchParams.get('code');
    try {
      if (!code) throw new Error(url.searchParams.get('error') || 'нет кода');
      await youtube.exchangeCode(code, url.searchParams.get('state'), PORT);
      reloadEmotes().catch(() => {});
      youtube.connect();
      res.writeHead(302, { Location: AFTER_LOGIN }); return res.end();
    } catch (e) { return errorPage(res, 'Ошибка входа в YouTube', e); }
  }

  if (p.startsWith('/api/')) {
    const key = `${req.method} ${p}`;
    const fn = routes[key];
    if (!fn) return sendJSON(res, 404, { error: 'Нет такого метода' });
    if (req.method === 'POST' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
      return sendJSON(res, 415, { error: 'Ожидается JSON' });
    }
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const data = await fn(body, url.searchParams);
      return sendJSON(res, 200, data ?? { ok: true });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  if (p === '/lang.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(`window.STREAMNEST_LANG = ${JSON.stringify(store.get('config').lang || 'ru')};`);
  }
  if (p.startsWith('/badges/')) {
    return serveFile(res, store.BADGE_DIR, p.slice('/badges/'.length), { 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" });
  }
  if (p === '/' || p === '/index.html') return serveFile(res, PUBLIC, 'app/index.html');
  return serveFile(res, PUBLIC, p);
}

server.on('error', (e) => {
  if (process.env.STREAMNEST_ELECTRON) return;
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Порт ${PORT} занят. Возможно, StreamNest уже запущен: http://localhost:${PORT}\n`);
    process.exit(1);
  }
  throw e;
});

function start() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      server.off('error', reject);
      const urlStr = `http://localhost:${PORT}`;
      console.log(`\n  ✦ StreamNest запущен: ${urlStr}`);
      console.log(`  ✦ Виджет чата для OBS: ${urlStr}/overlay/chat.html\n`);
      reloadEmotes().catch(() => {});
      const cf = store.get('config');
      if (cf.twitch.channel || cf.twitch.token) twitch.connect();
      if (cf.kick.channel) kick.connect();
      if (cf.youtube.channel || (youtube.isAuthorized() && cf.youtube.autoConnect)) youtube.connect();
      const shouldOpen = store.get('config').openBrowser && !process.argv.includes('--no-open') && !process.env.STREAMNEST_ELECTRON;
      if (shouldOpen) {
        const cmd = process.platform === 'win32' ? `start "" "${urlStr}"` : process.platform === 'darwin' ? `open ${urlStr}` : `xdg-open ${urlStr}`;
        exec(cmd, () => {});
      }
      resolve(urlStr);
    });
  });
}

function shutdown() { store.flushAll(); process.exit(0); }
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) start();
module.exports = { start, PORT };
