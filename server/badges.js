const fs = require('fs');
const path = require('path');
const store = require('./store');
const chat = require('./chat');
const bus = require('./bus');

const MAX_BYTES = 2 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

function list() { return store.get('badges'); }

function saveImage(id, dataUrl) {
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m || !EXT[m[1]]) throw new Error('Нужна картинка PNG, GIF, WEBP, JPG или SVG');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw new Error('Картинка больше 2 МБ');
  for (const f of fs.readdirSync(store.BADGE_DIR)) if (f.startsWith(id + '.')) fs.unlinkSync(path.join(store.BADGE_DIR, f));
  const name = `${id}.${EXT[m[1]]}`;
  fs.writeFileSync(path.join(store.BADGE_DIR, name), buf);
  return `/badges/${name}?v=${Date.now()}`;
}

function upsert(data) {
  const badges = list();
  const existing = badges.find(b => b.id === data.id);
  const id = existing ? existing.id : 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const b = existing || { id, users: [] };
  b.name = String(data.name || '').trim().slice(0, 40) || 'Значок';
  b.enabled = data.enabled !== false;
  b.priority = Number(data.priority) || 0;
  const rt = ['manual', 'role', 'messages'].includes(data.rule?.type) ? data.rule.type : 'manual';
  b.rule = { type: rt, role: data.rule?.role || 'sub', min: Math.max(1, Number(data.rule?.min) || 100) };
  if (data.image) b.image = saveImage(id, data.image);
  if (!b.image) throw new Error('Загрузите картинку значка');
  if (Array.isArray(data.users)) b.users = [...new Set(data.users.slice(0, 2000).map(u => normKey(String(u).slice(0, 120))).filter(Boolean))];
  if (!existing) badges.push(b);
  store.save('badges');
  emit();
  return b;
}

function normKey(k) {
  k = String(k || '').trim();
  if (!k) return null;
  if (!k.includes(':')) k = '*:' + k;
  const [p, ...rest] = k.split(':');
  return p.toLowerCase() + ':' + rest.join(':').replace(/^@/, '').toLowerCase();
}

function assign(id, userKey, on) {
  const b = list().find(x => x.id === id);
  if (!b) throw new Error('Значок не найден');
  const k = normKey(userKey);
  b.users = b.users.filter(u => u !== k);
  if (on) b.users.push(k);
  store.save('badges');
  emit();
  return b;
}

function remove(id) {
  const badges = list();
  const i = badges.findIndex(b => b.id === id);
  if (i >= 0) {
    badges.splice(i, 1);
    for (const f of fs.readdirSync(store.BADGE_DIR)) if (f.startsWith(id + '.')) fs.unlinkSync(path.join(store.BADGE_DIR, f));
  }
  store.save('badges');
  emit();
}

function keysFor(msg) {
  const login = String(msg.user.login || '').toLowerCase();
  const name = String(msg.user.name || '').toLowerCase();
  const id = String(msg.user.id || '').toLowerCase();
  const p = msg.platform;
  return new Set([`${p}:${login}`, `${p}:${name}`, `${p}:${id}`, `*:${login}`, `*:${name}`]);
}

function resolve(msg) {
  if (msg.platform === 'system') return [];
  const keys = keysFor(msg);
  const out = [];
  for (const b of list()) {
    if (!b.enabled) continue;
    let ok = false;
    if (b.users?.some(u => keys.has(u))) ok = true;
    else if (b.rule.type === 'role') ok = !!msg.user.roles?.[b.rule.role];
    else if (b.rule.type === 'messages') ok = (msg.user.messages || 0) >= b.rule.min;
    if (ok) out.push({ id: b.id, name: b.name, url: b.image, priority: b.priority });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

function emit() { bus.broadcast('badges', list()); }

function init() { chat.setBadgeResolver(resolve); }

module.exports = { init, list, upsert, assign, remove, resolve, normKey };
