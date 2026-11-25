const store = require('./store');
const chat = require('./chat');
const bus = require('./bus');
const { t } = require('./i18n');

const lastGlobal = new Map();
const lastUser = new Map();
let streamInfoProvider = () => ({});

function list() { return store.get('commands'); }

function normalize(c) {
  const trig = String(c.trigger || '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 40);
  return {
    id: c.id || 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    trigger: trig,
    aliases: (Array.isArray(c.aliases) ? c.aliases : String(c.aliases || '').split(','))
      .map(a => String(a).trim().toLowerCase().replace(/\s+/g, '').slice(0, 40)).filter(Boolean).slice(0, 10),
    response: String(c.response || '').slice(0, 500),
    permission: chat.LEVEL[c.permission] !== undefined ? c.permission : 'everyone',
    cooldown: Math.max(0, Number(c.cooldown) || 0),
    userCooldown: Math.max(0, Number(c.userCooldown) || 0),
    platform: ['all', 'twitch', 'youtube'].includes(c.platform) ? c.platform : 'all',
    enabled: c.enabled !== false,
    count: Number(c.count) || 0,
  };
}

function upsert(data) {
  const cmds = list();
  const c = normalize(data);
  if (!c.trigger) throw new Error('Укажите команду, например !привет');
  if (!c.response) throw new Error('Укажите ответ');
  const clash = cmds.find(x => x.id !== c.id && (x.trigger === c.trigger || x.aliases.includes(c.trigger)));
  if (clash) throw new Error(`Команда ${c.trigger} уже существует`);
  const i = cmds.findIndex(x => x.id === c.id);
  if (i >= 0) { c.count = cmds[i].count; cmds[i] = c; } else cmds.push(c);
  store.save('commands');
  bus.broadcast('commands', cmds, 'dashboard');
  return c;
}

function remove(id) {
  const cmds = list();
  const i = cmds.findIndex(x => x.id === id);
  if (i >= 0) cmds.splice(i, 1);
  store.save('commands');
  bus.broadcast('commands', cmds, 'dashboard');
}

function formatDuration(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  if (h > 0) return t('hm', { h, m: m % 60 });
  return t('m', { m });
}

function render(tpl, ctx) {
  return tpl.replace(/\{(\w+)(?::([^}]*))?\}/g, (all, name, arg) => {
    switch (name) {
      case 'user': return ctx.msg.user.name;
      case 'target': return (ctx.args[0] || ctx.msg.user.name).replace(/^@/, '');
      case 'args': return ctx.args.join(' ');
      case '1': case '2': case '3': return ctx.args[Number(name) - 1] || '';
      case 'count': return String(ctx.cmd.count);
      case 'messages': return String(ctx.msg.user.messages || 0);
      case 'platform': return { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' }[ctx.msg.platform] || 'StreamNest';
      case 'random': {
        const [a, b] = String(arg || '1-100').split('-').map(Number);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
      }
      case 'pick': {
        const opts = String(arg || '').split('|').filter(Boolean);
        return opts.length ? opts[Math.floor(Math.random() * opts.length)] : '';
      }
      case 'uptime': {
        const s = streamInfoProvider();
        if (s.available === false) return '—';
        return s.startedAt ? formatDuration(Date.now() - new Date(s.startedAt).getTime()) : t('offline');
      }
      case 'game': return streamInfoProvider().game || '—';
      case 'title': return streamInfoProvider().title || '—';
      case 'time': return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      default: return all;
    }
  });
}

function handle(msg) {
  const text = (msg.text || '').trim();
  if (!text || msg.self || msg.fromSelf) return;
  const [first, ...args] = text.split(/\s+/);
  const word = first.toLowerCase();
  const cmd = list().find(c => c.enabled && (c.trigger === word || c.aliases.includes(word)));
  if (!cmd) return;
  if (cmd.platform !== 'all' && cmd.platform !== msg.platform) return;
  if (msg.user.level < chat.LEVEL[cmd.permission]) return;

  const now = Date.now();
  const isMod = msg.user.level >= chat.LEVEL.mod;
  if (!isMod) {
    if (cmd.cooldown && now - (lastGlobal.get(cmd.id) || 0) < cmd.cooldown * 1000) return;
    const uk = cmd.id + '|' + msg.platform + ':' + msg.user.id;
    if (cmd.userCooldown && now - (lastUser.get(uk) || 0) < cmd.userCooldown * 1000) return;
    lastUser.set(uk, now);
  }
  lastGlobal.set(cmd.id, now);
  cmd.count += 1;
  store.save('commands');
  const reply = render(cmd.response, { msg, args, cmd });
  chat.send(msg.platform === 'system' ? 'all' : msg.platform, reply);
  bus.broadcast('commands', list(), 'dashboard');
}

function init(provider) {
  streamInfoProvider = provider;
  chat.onMessage(handle);
}

module.exports = { init, list, upsert, remove, render };
