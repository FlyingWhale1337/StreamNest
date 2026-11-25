const store = require('./store');
const chat = require('./chat');
const bus = require('./bus');
const { t } = require('./i18n');

let gw = null;
let timer = null;
let revealTimer = null;
const ROLL_MS = 5500;

function buildRoll(entries, winKey) {
  const names = entries.map(e => ({ name: e.name, color: e.color || null }));
  const wi = Math.max(0, entries.findIndex(e => e.key === winKey));
  const times = [0];
  let d = 45;
  while (times[times.length - 1] + d < ROLL_MS) { times.push(times[times.length - 1] + d); d *= 1.1; }
  const last = times[times.length - 1];
  const n = names.length;
  const start = ((wi - (times.length - 1)) % n + n) % n;
  return times.map((t, k) => ({ at: Math.round(t * ROLL_MS / last), ...names[(start + k) % n] }));
}

function publicState() {
  if (!gw) return null;
  return {
    id: gw.id, prize: gw.prize, keyword: gw.keyword, status: gw.status, eligibility: gw.eligibility,
    subLuck: gw.subLuck, minMessages: gw.minMessages, endsAt: gw.endsAt,
    entries: [...gw.entries.values()].map(e => ({ key: e.key, name: e.name, platform: e.platform, weight: e.weight, color: e.color })),
    winner: gw.revealed ? gw.winner : null,
    winnerMessages: gw.revealed ? gw.winnerMessages : [],
    pastWinners: gw.pastWinners.filter(w => gw.revealed || w.key !== gw.winner?.key).map(w => w.name),
    rolling: gw.status === 'drawn' && !gw.revealed,
    roll: gw.status === 'drawn' && !gw.revealed ? { startAt: gw.rollAt, duration: ROLL_MS, frames: gw.rollFrames } : null,
  };
}
function emit() { bus.broadcast('giveaway', publicState()); }

function open({ prize, keyword = '!участвую', eligibility = 'everyone', subLuck = 1, minMessages = 0, duration = 0, announce = true }) {
  duration = Math.min(86400, Math.max(0, Number(duration) || 0));
  if (!prize || !String(prize).trim()) throw new Error('Укажите приз');
  keyword = String(keyword || '').trim().toLowerCase().slice(0, 40);
  if (!keyword) throw new Error('Укажите ключевое слово');
  clearTimeout(timer);
  gw = {
    id: 'g_' + Date.now(), prize: String(prize).trim().slice(0, 100), keyword, status: 'open',
    eligibility: chat.LEVEL[eligibility] !== undefined ? eligibility : 'everyone',
    subLuck: Math.max(1, Math.min(10, Number(subLuck) || 1)), minMessages: Math.max(0, Number(minMessages) || 0),
    entries: new Map(), winner: null, winnerMessages: [], pastWinners: [],
    endsAt: Number(duration) > 0 ? Date.now() + Number(duration) * 1000 : null,
  };
  if (gw.endsAt) timer = setTimeout(() => close(true), Number(duration) * 1000);
  if (announce && store.get('config').chat.announceGiveaways) {
    chat.send('all', t('gwStart', { prize: gw.prize, kw: gw.keyword }));
  }
  emit();
  return publicState();
}

function close(announce = true) {
  if (!gw || gw.status !== 'open') return publicState();
  clearTimeout(timer);
  gw.status = 'closed';
  if (announce && store.get('config').chat.announceGiveaways) {
    chat.send('all', t('gwClosed', { n: gw.entries.size }));
  }
  emit();
  return publicState();
}

function draw() {
  if (!gw) throw new Error('Нет активного розыгрыша');
  if (gw.status === 'drawn' && !gw.revealed) throw new Error('Рулетка ещё крутится');
  if (gw.status === 'open') close(false);
  const pool = [...gw.entries.values()].filter(e => !gw.pastWinners.some(w => w.key === e.key));
  if (!pool.length) throw new Error('Нет участников для выбора');
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  let win = pool[pool.length - 1];
  for (const e of pool) { r -= e.weight; if (r <= 0) { win = e; break; } }
  gw.winner = { key: win.key, name: win.name, platform: win.platform, color: win.color };
  gw.pastWinners.push(gw.winner);
  gw.winnerMessages = [];
  gw.status = 'drawn';
  gw.revealed = false;
  gw.rollAt = Date.now() + 300;
  gw.rollFrames = buildRoll(pool.length > 1 ? pool : [...gw.entries.values()], win.key);
  emit();
  const id = gw.id;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    if (!gw || gw.id !== id) return;
    gw.revealed = true;
    gw.winnerMessages = [];
    emit();
    if (store.get('config').chat.announceGiveaways) {
      chat.send(win.platform, t('gwWinner', { prize: gw.prize, name: win.name }));
    }
    const h = store.get('history');
    h.giveaways.unshift({ prize: gw.prize, winner: win.name, platform: win.platform, entries: gw.entries.size, at: Date.now() });
    h.giveaways = h.giveaways.slice(0, 50);
    store.save('history');
  }, gw.rollAt - Date.now() + ROLL_MS);
  return publicState();
}

function reset() { clearTimeout(timer); clearTimeout(revealTimer); gw = null; emit(); }

function removeEntry(key) {
  if (!gw) return;
  gw.entries.delete(key);
  emit();
}

function handle(msg) {
  if (!gw || msg.self || msg.platform === 'system') return;
  const key = msg.platform + ':' + msg.user.id;
  if (gw.status === 'drawn' && gw.revealed && gw.winner?.key === key) {
    gw.winnerMessages.push({ text: msg.text, ts: msg.ts });
    emit();
    return;
  }
  if (gw.status !== 'open') return;
  if ((msg.text || '').trim().toLowerCase() !== gw.keyword) return;
  if (gw.entries.has(key)) return;
  if (msg.user.level < chat.LEVEL[gw.eligibility]) return;
  if (gw.minMessages && chat.sessionCount(key) < gw.minMessages) return;
  const weight = msg.user.roles.sub ? gw.subLuck : 1;
  gw.entries.set(key, { key, name: msg.user.name, platform: msg.platform, weight, color: msg.user.color });
  emit();
}

function init() { chat.onMessage(handle); }

module.exports = { init, open, close, draw, reset, removeEntry, state: publicState, history: () => store.get('history').giveaways };
