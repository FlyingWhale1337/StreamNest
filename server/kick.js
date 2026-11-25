const crypto = require('crypto');
const { execFile } = require('child_process');
const store = require('./store');
const bus = require('./bus');
const chat = require('./chat');
const { request } = require('./http');

const PUSHER_URL = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';
const API = 'https://api.kick.com/public/v1';
const SCOPES = ['user:read', 'channel:read', 'channel:write', 'chat:write', 'moderation:ban', 'moderation:chat_message:manage'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let ws = null;
let status = { state: 'disconnected', error: null, viewers: 0, live: false, startedAt: null, title: '', category: '' };
let info = null;
let manualClose = false;
let reconnectTimer = null;
let reconnectDelay = 1000;
let pingTimer = null;
let infoTimer = null;
let appToken = { token: null, expiresAt: 0 };
const pkce = new Map();
let onChannelCb = () => {};

function cfg() { return store.get('config').kick; }
function setStatus(s) { status = { ...status, ...s }; bus.broadcast('status', { kick: publicStatus() }); }
function hasScopes(list) { const sc = cfg().scopes || []; return list.every(s => sc.includes(s)); }
function publicStatus() {
  const c = cfg();
  return {
    ...status, channel: c.channel, login: c.login, authorized: !!c.refreshToken, hasClient: !!(c.clientId && c.clientSecret),
    readOnly: !c.refreshToken, canSend: !!c.refreshToken && hasScopes(['chat:write']),
    canModerate: !!c.refreshToken && hasScopes(['moderation:ban', 'moderation:chat_message:manage']),
    needsRelogin: !!c.refreshToken && !hasScopes(SCOPES),
  };
}

function curlJSON(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '-L', '--max-time', '15', '-H', `User-Agent: ${UA}`, '-H', 'Accept: application/json', url],
      { windowsHide: true, maxBuffer: 5e6 }, (err, out) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(out)); } catch { reject(new Error('Cloudflare не пустил запрос')); }
      });
  });
}

async function fetchChannelV2(slug) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'ru,en;q=0.9' } });
    if (r.status === 404) throw Object.assign(new Error('Канал Kick не найден — проверьте ник'), { notFound: true });
    if (r.ok) return await r.json();
  } catch (e) { if (e.notFound) throw e; }
  return curlJSON(url);
}

async function resolveChannel(slug) {
  const c = cfg();
  try {
    const d = await fetchChannelV2(slug);
    if (!d?.chatroom?.id) throw new Error('Kick не вернул ID чата');
    return {
      slug: d.slug || slug, chatroomId: d.chatroom.id, channelId: d.id, userId: d.user_id,
      subBadges: (d.subscriber_badges || []).map(b => ({ months: b.months, url: b.badge_image?.src })).sort((a, b) => a.months - b.months),
      live: d.livestream,
    };
  } catch (e) {
    if (e.notFound) throw e;
    if (c.chatroomId) return { slug, chatroomId: Number(c.chatroomId), channelId: null, userId: null, subBadges: [], live: null };
    throw new Error('Kick не пустил запрос (защита Cloudflare). Укажите ID чата вручную — подсказка ниже');
  }
}

function subscribe(channel) { ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel } })); }

async function connect() {
  const c = cfg();
  const slug = String(c.channel || '').trim().toLowerCase();
  disconnect(true);
  if (!slug) { setStatus({ state: 'disconnected', error: 'Укажите ник канала' }); return; }
  manualClose = false;
  setStatus({ state: 'connecting', error: null });
  try {
    info = await resolveChannel(slug);
  } catch (e) {
    setStatus({ state: 'error', error: e.message });
    return;
  }
  if (info.userId) onChannelCb(info.userId);
  if (info.live) applyLive(info.live);
  ws = new WebSocket(PUSHER_URL);
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    let data = msg.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
    switch (msg.event) {
      case 'pusher:connection_established':
        subscribe(`chatrooms.${info.chatroomId}.v2`);
        subscribe(`chatroom_${info.chatroomId}`);
        if (info.channelId) subscribe(`channel.${info.channelId}`);
        break;
      case 'pusher_internal:subscription_succeeded':
        if (status.state !== 'connected') { setStatus({ state: 'connected', error: null }); reconnectDelay = 1000; }
        break;
      case 'pusher:ping': ws.send(JSON.stringify({ event: 'pusher:pong', data: {} })); break;
      case 'pusher:error': setStatus({ error: 'Kick: ' + (data?.message || 'ошибка соединения') }); break;
      default: handleEvent(msg.event, data);
    }
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    if (manualClose) return;
    setStatus({ state: 'reconnecting' });
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  };
  ws.onerror = () => {};
  clearInterval(pingTimer);
  pingTimer = setInterval(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ event: 'pusher:ping', data: {} })); }, 60000);
  if (c.refreshToken && hasScopes(['chat:write'])) chat.registerSender('kick', say);
  clearInterval(infoTimer);
  refreshInfo();
  infoTimer = setInterval(refreshInfo, 30000);
}

function disconnect(silent) {
  manualClose = true;
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  clearInterval(infoTimer);
  chat.unregisterSender('kick');
  if (ws) { try { ws.close(); } catch {} ws = null; }
  if (!silent) setStatus({ state: 'disconnected', error: null, viewers: 0, live: false });
}

const KICK_EMOTE_RE = /\[emote:(\d+):([^\]]*)\]/g;
function contentToParts(content) {
  const parts = [];
  let text = '';
  let last = 0;
  const pushText = (t) => {
    if (!t) return;
    text += t;
    for (const p of chat.buildParts(t)) {
      const prev = parts[parts.length - 1];
      if (p.type === 'text' && prev?.type === 'text') prev.text += p.text; else parts.push(p);
    }
  };
  for (const m of content.matchAll(KICK_EMOTE_RE)) {
    pushText(content.slice(last, m.index));
    parts.push({ type: 'emote', name: m[2], url: `https://files.kick.com/emotes/${m[1]}/fullsize`, provider: 'kick' });
    text += m[2];
    last = m.index + m[0].length;
  }
  pushText(content.slice(last));
  return { parts, text };
}

const ROLE_ICON = {
  broadcaster: { url: '/app/roles/broadcaster.svg', title: 'Стример' },
  moderator: { url: '/app/roles/mod.svg', title: 'Модератор' },
  vip: { url: '/app/roles/vip.svg', title: 'VIP' },
  og: { url: '/app/roles/vip.svg', title: 'OG' },
};

function badgesFrom(identity) {
  const roles = { broadcaster: false, mod: false, vip: false, sub: false };
  const out = [];
  for (const b of identity?.badges || []) {
    const t = b.type;
    if (t === 'broadcaster') roles.broadcaster = true;
    if (t === 'moderator') roles.mod = true;
    if (t === 'vip' || t === 'og') roles.vip = true;
    if (t === 'subscriber' || t === 'founder') {
      roles.sub = true;
      const months = Number(b.count) || 1;
      const custom = [...(info?.subBadges || [])].reverse().find(x => x.months <= months);
      out.push(custom?.url ? { url: custom.url, title: b.text || 'Подписчик' } : { url: '/app/roles/sub.svg', title: b.text || 'Подписчик' });
      continue;
    }
    if (ROLE_ICON[t]) out.push(ROLE_ICON[t]);
  }
  return { roles, badges: out };
}

function handleEvent(event, d) {
  if (!d || typeof d !== 'object') return;
  const name = event.replace(/^App\\Events\\/, '');
  switch (name) {
    case 'ChatMessageEvent': {
      const s = d.sender || {};
      const { roles, badges } = badgesFrom(s.identity);
      const { parts, text } = contentToParts(String(d.content || ''));
      const c = cfg();
      chat.ingest({
        id: d.id, platform: 'kick', ts: d.created_at ? Date.parse(d.created_at) || Date.now() : Date.now(),
        user: { id: String(s.id), login: s.slug || s.username, name: s.username, color: s.identity?.color || null, roles, badges },
        text, parts, replyTo: d.metadata?.original_sender?.username || null,
        fromSelf: !!c.userId && String(s.id) === String(c.userId),
      });
      break;
    }
    case 'MessageDeletedEvent':
      chat.remove({ platform: 'kick', messageId: d.message?.id || d.id });
      break;
    case 'UserBannedEvent':
      if (d.user?.id) chat.remove({ platform: 'kick', userId: String(d.user.id) });
      break;
    case 'SubscriptionEvent':
      chat.ingest({
        id: 'kick_sub_' + Date.now(), platform: 'kick', highlight: 'event',
        eventText: `${d.username} оформил(а) подписку${d.months > 1 ? ` (${d.months} мес.)` : ''}`,
        user: { id: 'kick-' + d.username, login: d.username, name: d.username, roles: { sub: true }, badges: [] }, text: '',
      });
      break;
    case 'GiftedSubscriptionsEvent':
      chat.ingest({
        id: 'kick_gift_' + Date.now(), platform: 'kick', highlight: 'event',
        eventText: `${d.gifter_username || 'Аноним'} подарил(а) ${(d.gifted_usernames || []).length} подписок`,
        user: { id: 'kick-' + (d.gifter_username || 'anon'), login: d.gifter_username || 'anon', name: d.gifter_username || 'Аноним', roles: {}, badges: [] }, text: '',
      });
      break;
    case 'StreamerIsLive': setStatus({ live: true }); refreshInfo(); break;
    case 'StopStreamBroadcast': setStatus({ live: false, viewers: 0, startedAt: null }); break;
    default: break;
  }
}

function applyLive(l) {
  if (!l) { setStatus({ live: false, viewers: 0, startedAt: null }); return; }
  setStatus({
    live: l.is_live !== false, viewers: l.viewer_count ?? l.viewers ?? 0,
    startedAt: l.start_time || l.created_at || null, title: l.session_title || status.title,
    category: l.categories?.[0]?.name || status.category,
  });
}

async function getAppToken() {
  const c = cfg();
  if (appToken.token && Date.now() < appToken.expiresAt) return appToken.token;
  const d = await request('https://id.kick.com/oauth/token', {
    method: 'POST', form: { grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret },
  });
  appToken = { token: d.access_token, expiresAt: Date.now() + (d.expires_in - 60) * 1000 };
  return appToken.token;
}

async function anyToken() {
  const c = cfg();
  if (c.refreshToken) return userToken();
  if (c.clientId && c.clientSecret) return getAppToken();
  return null;
}

async function refreshInfo() {
  const c = cfg();
  try {
    const t = await anyToken();
    if (t) {
      const d = await request(`${API}/channels?slug=${encodeURIComponent(c.channel.toLowerCase())}`, { headers: { Authorization: `Bearer ${t}` } });
      const ch = d.data?.[0];
      if (ch) {
        setStatus({
          live: !!ch.stream?.is_live, viewers: ch.stream?.viewer_count || 0, startedAt: ch.stream?.is_live ? ch.stream.start_time : null,
          title: ch.stream_title || '', category: ch.category?.name || '',
        });
        if (!info?.userId && ch.broadcaster_user_id) { info = { ...(info || {}), userId: ch.broadcaster_user_id }; onChannelCb(ch.broadcaster_user_id); }
        return;
      }
    }
    const d = await fetchChannelV2(c.channel.toLowerCase());
    applyLive(d.livestream);
  } catch {   }
}

function redirectUri(port) { return `http://localhost:${port}/auth/kick/callback`; }
function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

function authUrl(port) {
  const c = cfg();
  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(16));
  pkce.set(state, verifier);
  const p = new URLSearchParams({
    client_id: c.clientId, response_type: 'code', redirect_uri: redirectUri(port), state, scope: SCOPES.join(' '),
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  return `https://id.kick.com/oauth/authorize?${p}`;
}

async function exchangeCode(code, state, port) {
  const verifier = pkce.get(state);
  if (!verifier) throw new Error('Сессия входа устарела — попробуйте ещё раз');
  pkce.delete(state);
  const c = cfg();
  const d = await request('https://id.kick.com/oauth/token', {
    method: 'POST',
    form: { grant_type: 'authorization_code', code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(port), code_verifier: verifier },
  });
  saveTokens(d);
  const me = await kapi('/users');
  const u = me.data?.[0];
  if (u) { c.userId = String(u.user_id); c.login = u.name; if (!c.channel) c.channel = u.name.toLowerCase(); }
  store.save('config', true);
  connect();
}

function saveTokens(d) {
  const c = cfg();
  c.accessToken = d.access_token;
  if (d.refresh_token) c.refreshToken = d.refresh_token;
  c.expiresAt = Date.now() + ((d.expires_in || 3600) - 60) * 1000;
  if (d.scope) c.scopes = String(d.scope).split(/[ ,]+/).filter(Boolean);
  store.save('config', true);
}

async function userToken() {
  const c = cfg();
  if (c.accessToken && Date.now() < c.expiresAt) return c.accessToken;
  if (!c.refreshToken) throw new Error('Войдите в Kick во вкладке «Подключения»');
  const d = await request('https://id.kick.com/oauth/token', {
    method: 'POST', form: { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret },
  });
  saveTokens(d);
  return c.accessToken;
}

async function kapi(path, opts = {}) {
  const t = await userToken();
  return request(API + path, { ...opts, headers: { Authorization: `Bearer ${t}` } });
}

function logout() {
  const c = cfg();
  Object.assign(c, { accessToken: '', refreshToken: '', expiresAt: 0, userId: '', login: '', scopes: [] });
  store.save('config', true);
  chat.unregisterSender('kick');
  setStatus({});
}

async function broadcasterId() {
  if (info?.userId) return Number(info.userId);
  const d = await kapi(`/channels?slug=${encodeURIComponent(cfg().channel.toLowerCase())}`);
  const id = d.data?.[0]?.broadcaster_user_id;
  if (!id) throw new Error('Не удалось определить канал Kick');
  info = { ...(info || {}), userId: id };
  return Number(id);
}

async function say(text) {
  await kapi('/chat', { method: 'POST', body: { type: 'user', broadcaster_user_id: await broadcasterId(), content: text.slice(0, 500) } });
}

async function moderate({ action, userId, messageId, duration, reason }) {
  if (!cfg().refreshToken) throw new Error('Войдите в аккаунт Kick');
  if (!hasScopes(['moderation:ban', 'moderation:chat_message:manage'])) throw new Error('Нужны права модерации — выйдите и войдите в Kick заново');
  if (action === 'delete') { await kapi(`/chat/${encodeURIComponent(messageId)}`, { method: 'DELETE' }); return { ok: true }; }
  const body = { broadcaster_user_id: await broadcasterId(), user_id: Number(userId) };
  if (action === 'unban') { await kapi('/moderation/bans', { method: 'DELETE', body }); return { ok: true }; }
  if (reason) body.reason = String(reason).slice(0, 100);
  if (action === 'timeout') body.duration = Math.max(1, Math.min(10080, Math.ceil((Number(duration) || 600) / 60)));
  else if (action !== 'ban') throw new Error('Неизвестное действие');
  await kapi('/moderation/bans', { method: 'POST', body });
  return { ok: true };
}

async function getChannel() {
  const d = await kapi('/channels');
  const ch = d.data?.[0] || {};
  return { title: ch.stream_title || '', categoryId: ch.category?.id || null, categoryName: ch.category?.name || '', thumbnail: ch.category?.thumbnail || null, slug: ch.slug };
}
async function updateChannel({ title, categoryId }) {
  const body = {};
  if (title !== undefined && title !== '') body.stream_title = String(title);
  if (categoryId) body.category_id = Number(categoryId);
  await kapi('/channels', { method: 'PATCH', body });
  refreshInfo();
  return getChannel();
}
async function searchCategories(q) {
  if (!q) return [];
  try {
    const d = await kapi(`/categories?q=${encodeURIComponent(q)}`);
    return (d.data || []).slice(0, 12).map(c => ({ id: c.id, name: c.name, boxArt: c.thumbnail }));
  } catch {
    const d = await kapi(`/../v2/categories?name=${encodeURIComponent(q)}&limit=12`);
    return (d.data || []).map(c => ({ id: c.id, name: c.name, boxArt: c.thumbnail }));
  }
}

module.exports = {
  connect, disconnect, logout, authUrl, exchangeCode, publicStatus, moderate, getChannel, updateChannel, searchCategories,
  contentToParts, handleEvent, isAuthorized: () => !!cfg().refreshToken,
  userId: () => info?.userId || null, onChannel: (fn) => { onChannelCb = fn; },
};
