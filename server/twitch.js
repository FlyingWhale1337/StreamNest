const crypto = require('crypto');
const store = require('./store');
const bus = require('./bus');
const chat = require('./chat');
const { request } = require('./http');

const SCOPES = ['chat:read', 'chat:edit', 'channel:manage:broadcast', 'moderator:manage:banned_users', 'moderator:manage:chat_messages'];
const MOD_SCOPES = ['moderator:manage:banned_users', 'moderator:manage:chat_messages'];
const HELIX = 'https://api.twitch.tv/helix';

let ws = null;
let status = { state: 'disconnected', error: null };
let reconnectDelay = 1000;
let reconnectTimer = null;
let manualClose = false;
let badgeMap = new Map();
let streamInfo = { title: '', game: '', gameId: '', startedAt: null, live: false, viewers: 0, available: false };
let roomId = null;
let onRoomCb = () => {};
let anonymous = false;
let infoTimer = null;

function cfg() { return store.get('config').twitch; }
function setStatus(s) { status = { ...status, ...s }; bus.broadcast('status', { twitch: publicStatus() }); }
function publicStatus() {
  const c = cfg();
  return { ...status, login: c.login, channel: c.channel || c.login, hasClientId: !!c.clientId, hasToken: !!c.token, live: streamInfo.live, readOnly: anonymous,
    canModerate: !!c.token && MOD_SCOPES.every(sc => (c.scopes || []).includes(sc)),
    needsRelogin: !!c.token && !MOD_SCOPES.every(sc => (c.scopes || []).includes(sc)) };
}

async function helix(path, opts = {}) {
  const c = cfg();
  if (!c.token || !c.clientId) throw new Error('Twitch не авторизован');
  return request(HELIX + path, { ...opts, headers: { Authorization: `Bearer ${c.token}`, 'Client-Id': c.clientId } });
}

const pendingStates = new Map();
function authUrl(port) {
  const c = cfg();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  const p = new URLSearchParams({
    client_id: c.clientId, redirect_uri: `http://localhost:${port}/auth/twitch`,
    response_type: 'token', scope: SCOPES.join(' '), force_verify: 'true', state,
  });
  return `https://id.twitch.tv/oauth2/authorize?${p}`;
}

async function setToken(token, state) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  if (!exp || exp < Date.now()) throw new Error('Сессия входа устарела — попробуйте ещё раз');
  if (!/^[a-z0-9]{20,60}$/i.test(token)) throw new Error('Неверный токен');
  const v = await request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
  const c = cfg();
  c.token = token; c.login = v.login; c.userId = v.user_id; c.scopes = v.scopes || [];
  if (!c.channel) c.channel = v.login;
  if (v.client_id && !c.clientId) c.clientId = v.client_id;
  store.save('config', true);
  return v;
}

function logout() {
  disconnect();
  const c = cfg();
  Object.assign(c, { token: '', login: '', userId: '', scopes: [] });
  store.save('config', true);
  setStatus({ state: 'disconnected', error: null });
  if (c.channel) connect();
}

function unescapeTag(v) {
  return v.replace(/\\(.)/g, (_, ch) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[ch] ?? ch));
}
function parseIRC(line) {
  const tags = {};
  let prefix = null;
  if (line[0] === '@') {
    const sp = line.indexOf(' ');
    for (const kv of line.slice(1, sp).split(';')) {
      const e = kv.indexOf('=');
      if (e === -1) tags[kv] = ''; else tags[kv.slice(0, e)] = unescapeTag(kv.slice(e + 1));
    }
    line = line.slice(sp + 1);
  }
  if (line[0] === ':') {
    const sp = line.indexOf(' ');
    prefix = line.slice(1, sp);
    line = line.slice(sp + 1);
  }
  let trailing = null;
  const ti = line.indexOf(' :');
  if (ti !== -1) { trailing = line.slice(ti + 2); line = line.slice(0, ti); }
  const params = line.split(' ').filter(Boolean);
  const command = params.shift();
  if (trailing !== null) params.push(trailing);
  return { tags, prefix, command, params };
}

function parseEmoteTag(tag) {
  if (!tag) return [];
  const out = [];
  for (const group of tag.split('/')) {
    const [id, ranges] = group.split(':');
    if (!ranges) continue;
    for (const r of ranges.split(',')) {
      const [s, e] = r.split('-').map(Number);
      out.push({ start: s, end: e, url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`, provider: 'twitch' });
    }
  }
  return out;
}

const ROLE_BADGES = {
  broadcaster: { url: '/app/roles/broadcaster.svg', title: 'Стример' },
  moderator: { url: '/app/roles/mod.svg', title: 'Модератор' },
  vip: { url: '/app/roles/vip.svg', title: 'VIP' },
  subscriber: { url: '/app/roles/sub.svg', title: 'Подписчик' },
  founder: { url: '/app/roles/sub.svg', title: 'Основатель' },
};
function parseBadges(tag) {
  if (!tag) return [];
  return tag.split(',').map(b => badgeMap.get(b) || ROLE_BADGES[b.split('/')[0]]).filter(Boolean);
}

function rolesFrom(tags) {
  const b = tags.badges || '';
  return {
    broadcaster: b.includes('broadcaster/'),
    mod: tags.mod === '1' || b.includes('moderator/'),
    vip: b.includes('vip/') || tags.vip === '1',
    sub: tags.subscriber === '1' || b.includes('subscriber/') || b.includes('founder/'),
  };
}

function handleLine(line) {
  if (!line) return;
  const m = parseIRC(line);
  switch (m.command) {
    case 'PING': ws.send('PONG :' + (m.params[0] || 'tmi.twitch.tv')); break;
    case '001': break;
    case 'ROOMSTATE':
      if (m.tags['room-id'] && m.tags['room-id'] !== roomId) { roomId = m.tags['room-id']; onRoomCb(roomId); }
      setStatus({ state: 'connected', error: null });
      reconnectDelay = 1000;
      break;
    case 'NOTICE': {
      const text = m.params[1] || '';
      if (/authentication failed|improperly formatted auth|invalid nick/i.test(text)) {
        manualClose = true; ws.close();
        if (anonymous) { setStatus({ state: 'error', error: 'Twitch отклонил подключение' }); break; }
        const c = cfg();
        Object.assign(c, { token: '', login: '', userId: '', scopes: [] });
        store.save('config', true);
        connect();
        chat.system('Вход в Twitch истёк — чат читается без входа. Войдите заново, чтобы бот снова мог писать', 'warn');
      } else chat.system('Twitch: ' + text);
      break;
    }
    case 'RECONNECT': ws.close(); break;
    case 'PRIVMSG': {
      let text = m.params[1] || '';
      let action = false;
      if (text.startsWith('\u0001ACTION ') && text.endsWith('\u0001')) { text = text.slice(8, -1); action = true; }
      const t = m.tags;
      const login = (m.prefix || '').split('!')[0];
      chat.ingest({
        id: t.id || String(Date.now()),
        platform: 'twitch',
        user: {
          id: t['user-id'] || login, login, name: t['display-name'] || login, color: t.color || null,
          roles: rolesFrom(t), badges: parseBadges(t.badges),
        },
        text, action, nativeEmotes: parseEmoteTag(t.emotes),
        highlight: t['msg-id'] === 'highlighted-message' ? 'highlight' : (t.bits ? 'bits' : null),
        bits: t.bits ? Number(t.bits) : 0,
        replyTo: t['reply-parent-display-name'] || null,
      });
      break;
    }
    case 'USERNOTICE': {
      const t = m.tags;
      const sysText = t['system-msg'] || '';
      const login = t.login || '';
      chat.ingest({
        id: t.id || String(Date.now()), platform: 'twitch', event: t['msg-id'],
        user: { id: t['user-id'] || login, login, name: t['display-name'] || login, color: t.color || null, roles: rolesFrom(t), badges: parseBadges(t.badges) },
        text: (m.params[1] || ''), nativeEmotes: parseEmoteTag(t.emotes),
        highlight: 'event', eventText: sysText,
      });
      break;
    }
    case 'CLEARMSG': chat.remove({ platform: 'twitch', messageId: m.tags['target-msg-id'] }); break;
    case 'CLEARCHAT':
      if (m.tags['target-user-id']) chat.remove({ platform: 'twitch', userId: m.tags['target-user-id'] });
      break;
    default: break;
  }
}

async function loadBadges() {
  const c = cfg();
  const next = new Map();
  const addSet = (data) => {
    for (const set of data || []) for (const v of set.versions || []) {
      next.set(`${set.set_id}/${v.id}`, { url: v.image_url_2x, title: v.title });
    }
  };
  try { addSet((await helix('/chat/badges/global')).data); } catch (e) { console.warn('[twitch] badges global', e.message); }
  try {
    const ch = await getBroadcasterId();
    addSet((await helix(`/chat/badges?broadcaster_id=${ch}`)).data);
  } catch (e) { console.warn('[twitch] badges channel', e.message); }
  badgeMap = next;
}

let broadcasterCache = { login: null, id: null };
let roomChannel = null;
async function getBroadcasterId() {
  const c = cfg();
  if (!c.token) { if (roomId) return roomId; throw new Error('Канал ещё не подключён'); }
  const login = (c.channel || c.login).toLowerCase();
  if (login === c.login) return c.userId;
  if (broadcasterCache.login === login) return broadcasterCache.id;
  const d = await helix(`/users?login=${encodeURIComponent(login)}`);
  if (!d.data?.[0]) throw new Error('Канал не найден: ' + login);
  broadcasterCache = { login, id: d.data[0].id };
  return d.data[0].id;
}

async function connect() {
  const c = cfg();
  const channel = (c.channel || c.login || '').toLowerCase();
  if (!channel) { setStatus({ state: 'disconnected', error: 'Укажите ник канала' }); return; }
  disconnect(true);
  manualClose = false;
  anonymous = !c.token || !c.login;
  if (channel !== (roomChannel || channel)) roomId = null;
  roomChannel = channel;
  setStatus({ state: 'connecting', error: null });
  if (!anonymous) loadBadges().catch(() => {}); else badgeMap = new Map();
  ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    if (anonymous) {
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
    } else {
      ws.send(`PASS oauth:${c.token}`);
      ws.send(`NICK ${c.login}`);
    }
    ws.send(`JOIN #${channel}`);
  };
  ws.onmessage = (ev) => { for (const line of String(ev.data).split('\r\n')) handleLine(line); };
  ws.onerror = () => {};
  ws.onclose = () => {
    chat.unregisterSender('twitch');
    if (manualClose) return;
    setStatus({ state: 'reconnecting' });
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  };
  if (!anonymous) chat.registerSender('twitch', async (text) => {
    if (!ws || ws.readyState !== 1) throw new Error('Twitch не подключён');
    for (const line of splitMessage(text, 490)) {
      ws.send(`PRIVMSG #${channel} :${line}`);
      chat.ingest({
        id: 'self_' + Date.now() + Math.random(), platform: 'twitch', self: true,
        user: { id: c.userId, login: c.login, name: c.login, roles: { broadcaster: channel === c.login, mod: true }, badges: [...badgeMap.entries()].filter(([k]) => k.startsWith('broadcaster/')).map(([, v]) => v) },
        text: line,
      });
    }
  });
  clearInterval(infoTimer);
  streamInfo = { title: '', game: '', gameId: '', startedAt: null, live: false, viewers: 0, available: false };
  refreshStreamInfo();
  infoTimer = setInterval(refreshStreamInfo, 30000);
}

function splitMessage(text, max) {
  const out = [];
  let s = text.replace(/[\r\n]+/g, ' ');
  while (s.length > max) { let i = s.lastIndexOf(' ', max); if (i < 1) i = max; out.push(s.slice(0, i)); s = s.slice(i).trim(); }
  if (s) out.push(s);
  return out;
}

function disconnect(silent) {
  manualClose = true;
  clearTimeout(reconnectTimer);
  clearInterval(infoTimer);
  chat.unregisterSender('twitch');
  if (ws) { try { ws.close(); } catch {} ws = null; }
  if (!silent) setStatus({ state: 'disconnected', error: null });
}

async function moderate({ action, userId, messageId, duration, reason }) {
  const c = cfg();
  if (!c.token) throw new Error('Войдите в аккаунт Twitch');
  if (!MOD_SCOPES.every(sc => (c.scopes || []).includes(sc))) throw new Error('Нужны права модерации — выйдите и войдите в Twitch заново');
  const b = await getBroadcasterId();
  const q = `broadcaster_id=${b}&moderator_id=${c.userId}`;
  if (action === 'delete') {
    if (!messageId) throw new Error('Нет ID сообщения');
    await helix(`/moderation/chat?${q}&message_id=${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    return { ok: true };
  }
  if (action === 'unban') {
    await helix(`/moderation/bans?${q}&user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
    return { ok: true };
  }
  if (!userId) throw new Error('Нет ID пользователя');
  const data = { user_id: String(userId) };
  if (reason) data.reason = String(reason).slice(0, 500);
  if (action === 'timeout') data.duration = Math.max(1, Math.min(1209600, Math.round(Number(duration) || 600)));
  else if (action !== 'ban') throw new Error('Неизвестное действие');
  await helix(`/moderation/bans?${q}`, { method: 'POST', body: { data } });
  return { ok: true };
}

async function getChannel() {
  const id = await getBroadcasterId();
  const d = await helix(`/channels?broadcaster_id=${id}`);
  const ch = d.data?.[0] || {};
  let boxArt = null;
  if (ch.game_id) {
    try { const g = await helix(`/games?id=${ch.game_id}`); boxArt = g.data?.[0]?.box_art_url?.replace('{width}', '72').replace('{height}', '96'); } catch {}
  }
  return { title: ch.title, gameId: ch.game_id, gameName: ch.game_name, boxArt, tags: ch.tags || [], language: ch.broadcaster_language };
}

async function updateChannel({ title, gameId }) {
  const id = await getBroadcasterId();
  const body = {};
  if (title !== undefined) body.title = title;
  if (gameId !== undefined) body.game_id = gameId;
  await helix(`/channels?broadcaster_id=${id}`, { method: 'PATCH', body });
  refreshStreamInfo();
  return getChannel();
}

async function searchCategories(q) {
  if (!q) return [];
  const d = await helix(`/search/categories?first=12&query=${encodeURIComponent(q)}`);
  return (d.data || []).map(g => ({ id: g.id, name: g.name, boxArt: g.box_art_url?.replace(/\d+x\d+/, '72x96') }));
}

async function publicStreamInfo(login) {
  const d = await request('https://gql.twitch.tv/gql', {
    method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
    body: { query: `query { user(login: ${JSON.stringify(login)}) { stream { viewersCount createdAt } broadcastSettings { title game { id displayName } } } }` },
  });
  const u = d?.data?.user;
  if (!u) throw new Error('канал не найден');
  return {
    title: u.broadcastSettings?.title || '', game: u.broadcastSettings?.game?.displayName || '', gameId: u.broadcastSettings?.game?.id || '',
    live: !!u.stream, startedAt: u.stream?.createdAt || null, viewers: u.stream?.viewersCount || 0, available: true,
  };
}

async function refreshStreamInfo() {
  const c = cfg();
  if (!c.token) {
    try {
      streamInfo = await publicStreamInfo((c.channel || '').toLowerCase());
      bus.broadcast('status', { twitch: publicStatus(), twitchStream: streamInfo });
    } catch {   }
    return;
  }
  try {
    const id = await getBroadcasterId();
    const [s, ch] = await Promise.all([helix(`/streams?user_id=${id}`), helix(`/channels?broadcaster_id=${id}`)]);
    const live = s.data?.[0];
    const c = ch.data?.[0] || {};
    streamInfo = {
      title: c.title || '', game: c.game_name || '', gameId: c.game_id || '',
      live: !!live, startedAt: live?.started_at || null, viewers: live?.viewer_count || 0, available: true,
    };
    bus.broadcast('status', { twitch: publicStatus(), twitchStream: streamInfo });
  } catch {   }
}

module.exports = {
  connect, disconnect, logout, setToken, authUrl, publicStatus, getChannel, updateChannel,
  searchCategories, getStreamInfo: () => streamInfo, getBroadcasterId, parseIRC, parseEmoteTag, SCOPES,
  roomId: () => roomId, moderate, onRoom: (fn) => { onRoomCb = fn; },
};
