const store = require('./store');

const T = {
  pollStart: { ru: '📊 Голосование: {q} Пишите номер в чат: {list}', en: '📊 Poll: {q} Type the number in chat: {list}' },
  pollNoVotes: { ru: '📊 Голосование «{q}» завершено — голосов нет', en: '📊 Poll "{q}" ended with no votes' },
  pollTie: { ru: '📊 Ничья в «{q}»: {opts} ({n} гол.)', en: '📊 Tie in "{q}": {opts} ({n} votes)' },
  pollWin: { ru: '📊 Итог «{q}»: победил вариант «{opt}» — {pct}% ({n} гол.)', en: '📊 Result of "{q}": "{opt}" wins with {pct}% ({n} votes)' },
  gwStart: { ru: '🎁 Розыгрыш: {prize}! Чтобы участвовать, напишите {kw}', en: '🎁 Giveaway: {prize}! Type {kw} to enter' },
  gwClosed: { ru: '🎁 Приём заявок закрыт. Участников: {n}', en: '🎁 Entries are closed. Participants: {n}' },
  gwWinner: { ru: '🎉 Победитель розыгрыша «{prize}» — @{name}! Поздравляем!', en: '🎉 The winner of "{prize}" is @{name}! Congratulations!' },
  offline: { ru: 'стрим офлайн', en: 'stream is offline' },
  hm: { ru: '{h} ч {m} мин', en: '{h}h {m}m' },
  m: { ru: '{m} мин', en: '{m} min' },
  localBot: { ru: 'Бот (локально)', en: 'Bot (local)' },
};

function lang() { return store.get('config').lang === 'en' ? 'en' : 'ru'; }
function t(key, vars = {}) {
  const s = T[key]?.[lang()] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

const EN_COMMANDS = [
  { id: 'c_hello', trigger: '!hello', aliases: ['!hi'], response: 'Hi, {user}! 👋', permission: 'everyone', cooldown: 5, userCooldown: 15, platform: 'all', enabled: true, count: 0 },
  { id: 'c_dice', trigger: '!dice', aliases: ['!roll'], response: '{user} rolls a die: 🎲 {random:1-6}', permission: 'everyone', cooldown: 3, userCooldown: 10, platform: 'all', enabled: true, count: 0 },
  { id: 'c_uptime', trigger: '!uptime', aliases: [], response: 'The stream has been live for {uptime}', permission: 'everyone', cooldown: 10, userCooldown: 0, platform: 'all', enabled: true, count: 0 },
];

module.exports = { t, lang, EN_COMMANDS };
