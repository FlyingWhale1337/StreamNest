const bus = require('./bus');
const store = require('./store');
const emotes = require('./emotes');
const { t } = require('./i18n');

const HISTORY_MAX = 200;
const history = [];
const handlers = [];
const senders = {};
const sessionCounts = new Map();

let badgeResolver = () => [];

const LEVEL = { everyone: 0, sub: 1, vip: 2, mod: 3, broadcaster: 4 };
function levelOf(roles = {}) {
  if (roles.broadcaster) return 4;
  if (roles.mod) return 3;
  if (roles.vip) return 2;
  if (roles.sub) return 1;
  return 0;
}

function buildParts(text, nativeEmotes = []) {
  const chars = Array.from(text);
  const parts = [];
  const sorted = [...nativeEmotes].sort((a, b) => a.start - b.start);
  let pos = 0;
  const pushText = (str) => {
    if (!str) return;
    const tokens = str.split(/(\s+)/);
    for (const tok of tokens) {
      if (!tok) continue;
      const em = /\s/.test(tok) ? null : emotes.lookup(tok);
      if (em) parts.push({ type: 'emote', name: tok, url: em.url, provider: em.provider, zeroWidth: em.zeroWidth });
      else {
        const last = parts[parts.length - 1];
        if (last && last.type === 'text') last.text += tok; else parts.push({ type: 'text', text: tok });
      }
    }
  };
  for (const e of sorted) {
    if (e.start < pos) continue;
    pushText(chars.slice(pos, e.start).join(''));
    parts.push({ type: 'emote', name: chars.slice(e.start, e.end + 1).join(''), url: e.url, provider: e.provider || 'twitch' });
    pos = e.end + 1;
  }
  pushText(chars.slice(pos).join(''));
  return parts;
}

function userKey(platform, id) { return `${platform}:${id}`; }

const MAX_USERS = 50000;
function pruneUsers(users) {
  const keys = Object.keys(users);
  if (keys.length <= MAX_USERS) return;
  keys.sort((a, b) => (users[a].lastSeen || 0) - (users[b].lastSeen || 0));
  for (const k of keys.slice(0, keys.length - Math.floor(MAX_USERS * 0.9))) delete users[k];
}

function trackUser(msg) {
  const users = store.get('users');
  const key = userKey(msg.platform, msg.user.id);
  const now = Date.now();
  const u = users[key] || { platform: msg.platform, id: msg.user.id, messages: 0, firstSeen: now };
  u.name = msg.user.name; u.login = msg.user.login; u.color = msg.user.color || u.color;
  u.avatar = msg.user.avatar || u.avatar;
  u.messages += 1; u.lastSeen = now; u.roles = msg.user.roles;
  if (!users[key]) {
    users[key] = u;
    pruneUsers(users);
  }
  store.save('users');
  sessionCounts.set(key, (sessionCounts.get(key) || 0) + 1);
  return u;
}

function ingest(raw) {
  const msg = {
    ts: Date.now(),
    ...raw,
    parts: raw.parts || buildParts(raw.text || '', raw.nativeEmotes || []),
  };
  delete msg.nativeEmotes;
  msg.user.roles = msg.user.roles || {};
  msg.user.level = levelOf(msg.user.roles);
  if (!raw.system && !raw.self) {
    const stats = trackUser(msg);
    msg.user.messages = stats.messages;
    msg.firstTime = stats.messages === 1;
  }
  msg.user.custom = badgeResolver(msg);

  history.push(msg);
  if (history.length > HISTORY_MAX) history.shift();
  bus.broadcast('chat', msg);

  if (!raw.system) for (const h of handlers) {
    try { h(msg); } catch (e) { console.error('[handler]', e); }
  }
  return msg;
}

function remove({ platform, messageId, userId }) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.platform !== platform) continue;
    if ((messageId && m.id === messageId) || (userId && m.user.id === userId)) history.splice(i, 1);
  }
  bus.broadcast('chat-remove', { platform, messageId, userId });
}

function system(text, level = 'info') {
  return ingest({
    id: 'sys_' + Date.now() + Math.random().toString(36).slice(2, 6), platform: 'system', system: true,
    user: { id: 'system', login: 'system', name: 'StreamNest', roles: {} }, text, level,
  });
}

async function send(platform, text) {
  const targets = platform === 'all' ? Object.keys(senders) : [platform];
  const results = {};
  let sent = false;
  for (const p of targets) {
    const fn = senders[p];
    if (!fn) { results[p] = 'не подключено'; continue; }
    try { await fn(text); results[p] = 'ok'; sent = true; } catch (e) { results[p] = e.message; }
  }
  if (!sent) {
    ingest({
      id: 'local_' + Date.now(), platform: 'system', system: true, botReply: true,
      user: { id: 'bot', login: 'bot', name: t('localBot'), roles: { broadcaster: true } }, text,
    });
  }
  return results;
}

module.exports = {
  ingest, remove, system, send, buildParts, levelOf, LEVEL, userKey,
  onMessage: (fn) => handlers.push(fn),
  registerSender: (platform, fn) => { senders[platform] = fn; },
  hasSender: (platform) => platform === 'all' ? Object.keys(senders).length > 0 : !!senders[platform],
  unregisterSender: (platform) => { delete senders[platform]; },
  setBadgeResolver: (fn) => { badgeResolver = fn; },
  getHistory: () => history,
  sessionCount: (key) => sessionCounts.get(key) || 0,
};
