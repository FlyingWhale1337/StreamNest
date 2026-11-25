const store = require('./store');
const chat = require('./chat');
const bus = require('./bus');
const { t } = require('./i18n');

let poll = null;
let timer = null;
let emitTimer = null;
let hideTimer = null;

function publicState() {
  if (!poll) return null;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  return {
    id: poll.id, question: poll.question, status: poll.status, endsAt: poll.endsAt, duration: poll.duration,
    total, options: poll.options.map(o => ({ text: o.text, votes: o.votes, pct: total ? Math.round(o.votes / total * 100) : 0 })),
    winner: poll.winner ?? null, allowChange: poll.allowChange,
  };
}

function emit(now = false) {
  clearTimeout(emitTimer);
  const go = () => bus.broadcast('poll', publicState());
  if (now) go(); else emitTimer = setTimeout(go, 200);
}

function start({ question, options, duration = 60, allowChange = true, announce = true }) {
  duration = Math.min(86400, Math.max(0, Number(duration) || 0));
  const opts = (Array.isArray(options) ? options : []).map(s => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 9);
  if (!question || !String(question).trim()) throw new Error('Введите вопрос');
  if (opts.length < 2) throw new Error('Нужно минимум 2 варианта');
  if (poll && poll.status === 'active') end(false);
  clearTimeout(hideTimer);
  poll = {
    id: 'p_' + Date.now(), question: String(question).trim().slice(0, 200), status: 'active',
    options: opts.map(text => ({ text, votes: 0 })), voters: new Map(),
    duration: Number(duration) || 0, endsAt: Number(duration) > 0 ? Date.now() + Number(duration) * 1000 : null,
    allowChange: !!allowChange,
  };
  clearTimeout(timer);
  if (poll.endsAt) timer = setTimeout(() => end(true), poll.duration * 1000);
  if (announce && store.get('config').chat.announcePolls) {
    const list = poll.options.map((o, i) => `${i + 1} — ${o.text}`).join(' | ');
    chat.send('all', t('pollStart', { q: poll.question, list }));
  }
  emit(true);
  return publicState();
}

function end(announce = true) {
  if (!poll || poll.status !== 'active') return publicState();
  clearTimeout(timer);
  poll.status = 'ended';
  const max = Math.max(...poll.options.map(o => o.votes));
  const winners = poll.options.map((o, i) => (o.votes === max && max > 0 ? i : -1)).filter(i => i >= 0);
  poll.winner = winners.length === 1 ? winners[0] : null;
  const st = publicState();
  if (announce && store.get('config').chat.announcePolls) {
    if (max === 0) chat.send('all', t('pollNoVotes', { q: poll.question }));
    else if (winners.length > 1) chat.send('all', t('pollTie', { q: poll.question, opts: winners.map(i => poll.options[i].text).join(', '), n: max }));
    else chat.send('all', t('pollWin', { q: poll.question, opt: poll.options[poll.winner].text, pct: st.options[poll.winner].pct, n: st.total }));
  }
  const h = store.get('history');
  h.polls.unshift({ ...st, endedAt: Date.now() });
  h.polls = h.polls.slice(0, 50);
  store.save('history');
  emit(true);
  hideTimer = setTimeout(() => { if (poll && poll.status === 'ended') { poll.status = 'hidden'; emit(true); } }, 20000);
  return st;
}

function cancel() {
  clearTimeout(timer);
  poll = null;
  emit(true);
}

const VOTE_RE = /^(?:!(?:vote|голос|г|v)\s*)?(\d)$/i;

function handle(msg) {
  if (!poll || poll.status !== 'active' || msg.self) return;
  const m = (msg.text || '').trim().match(VOTE_RE);
  if (!m) return;
  const idx = Number(m[1]) - 1;
  if (idx < 0 || idx >= poll.options.length) return;
  const key = msg.platform + ':' + msg.user.id;
  const prev = poll.voters.get(key);
  if (prev !== undefined) {
    if (!poll.allowChange || prev === idx) return;
    poll.options[prev].votes--;
  }
  poll.voters.set(key, idx);
  poll.options[idx].votes++;
  emit();
}

function init() { chat.onMessage(handle); }

module.exports = { init, start, end, cancel, state: publicState, history: () => store.get('history').polls };
