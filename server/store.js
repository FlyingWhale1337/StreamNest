const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.STREAMNEST_DATA || path.join(__dirname, '..', 'data');
const BADGE_DIR = path.join(DATA_DIR, 'badges');
fs.mkdirSync(BADGE_DIR, { recursive: true });

const DEFAULTS = {
  config: {
    port: 3777,
    lang: null,
    closeAction: null,
    openBrowser: true,
    twitch: { clientId: '', token: '', login: '', userId: '', channel: '', scopes: [] },
    youtube: {
      channel: '', clientId: '', clientSecret: '', refreshToken: '', accessToken: '', expiresAt: 0,
      channelId: '', channelTitle: '', pollInterval: 6000, autoConnect: false,
    },
    kick: { channel: '', chatroomId: '', clientId: '', clientSecret: '', accessToken: '', refreshToken: '', expiresAt: 0, userId: '', login: '', scopes: [] },
    emotes: { seventv: true, bttv: true, ffz: true },
    overlay: {
      theme: 'glass', fontSize: 18, fontFamily: 'Inter', maxMessages: 25, hideAfter: 0,
      showPlatform: true, showTwitchBadges: true, showCustomBadges: true, animation: 'slide',
      hideCommands: true, hideVotes: true, hideBots: 'nightbot, streamelements, moobot, fossabot',
      textColor: '#ffffff', nameShadow: true, emoteScale: 1.6, align: 'bottom',
      accent: '#8b5cf6', width: 0, height: 0, anchor: 'left',
    },
    dock: {
      fontSize: 13, showTime: true, showBadges: true, showViewers: true, buttonsMode: 'hover',
      modButtons: [
        { id: 'm1', label: 'Удалить', action: 'delete', amount: 0, unit: 's', reason: '' },
        { id: 'm2', label: 'Мут 10 мин', action: 'timeout', amount: 10, unit: 'm', reason: '' },
        { id: 'm3', label: 'Мут 1 ч', action: 'timeout', amount: 1, unit: 'h', reason: '' },
        { id: 'm4', label: 'Бан', action: 'ban', amount: 0, unit: 's', reason: '' },
      ],
    },
    chat: { pollKeywords: true, announcePolls: true, announceGiveaways: true },
  },
  commands: [
    { id: 'c_hello', trigger: '!привет', aliases: ['!hi'], response: 'Привет, {user}! 👋', permission: 'everyone', cooldown: 5, userCooldown: 15, platform: 'all', enabled: true, count: 0 },
    { id: 'c_dice', trigger: '!кубик', aliases: ['!roll'], response: '{user} бросает кубик: 🎲 {random:1-6}', permission: 'everyone', cooldown: 3, userCooldown: 10, platform: 'all', enabled: true, count: 0 },
    { id: 'c_uptime', trigger: '!аптайм', aliases: ['!uptime'], response: 'Стрим идёт уже {uptime}', permission: 'everyone', cooldown: 10, userCooldown: 0, platform: 'all', enabled: true, count: 0 },
  ],
  badges: [],
  users: {},
  presets: [],
  history: { polls: [], giveaways: [] },
};

const cache = {};
const timers = {};

function file(name) { return path.join(DATA_DIR, name + '.json'); }

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = (k in base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null)
      ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function get(name) {
  if (cache[name]) return cache[name];
  let val = JSON.parse(JSON.stringify(DEFAULTS[name]));
  try {
    const raw = JSON.parse(fs.readFileSync(file(name), 'utf8'));
    val = (name === 'config') ? deepMerge(val, raw) : raw;
  } catch {   }
  cache[name] = val;
  return val;
}

const COMPACT = new Set(['users']);
const DELAY = { users: 5000 };

function write(name) {
  timers[name] = null;
  if (!cache[name]) return;
  try {
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, COMPACT.has(name) ? JSON.stringify(cache[name]) : JSON.stringify(cache[name], null, 2));
    fs.renameSync(tmp, file(name));
  } catch (e) {
    console.error(`[store] не удалось сохранить ${name}:`, e.message);
  }
}

function save(name, immediate = false) {
  if (immediate) { clearTimeout(timers[name]); write(name); return; }
  if (timers[name]) return;
  timers[name] = setTimeout(() => write(name), DELAY[name] || 400);
}

function flushAll() {
  for (const name of Object.keys(cache)) { clearTimeout(timers[name]); save(name, true); }
}

module.exports = { get, save, flushAll, DATA_DIR, BADGE_DIR, DEFAULTS };
