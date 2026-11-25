const { request } = require('./http');
const store = require('./store');

let map = new Map();
let stats = { seventv: 0, bttv: 0, ffz: 0, loadedAt: 0, errors: [] };
let sevenTvSetIds = [];

function add(target, name, url, provider, zeroWidth = false) {
  if (!name || !url) return;
  target.set(name, { url, provider, zeroWidth });
}

function seventvUrl(emote) {
  const host = emote.data?.host;
  if (!host) return null;
  const files = host.files || [];
  const pick = files.find(f => f.name === '2x.webp') || files.find(f => f.name.endsWith('.webp')) || files[0];
  return `https:${host.url}/${pick ? pick.name : '2x.webp'}`;
}

function add7tvSet(target, set) {
  let n = 0;
  for (const e of set?.emotes || []) {
    const zw = ((e.data?.flags || 0) & 256) !== 0;
    add(target, e.name, seventvUrl(e), '7tv', zw); n++;
  }
  if (set?.id) sevenTvSetIds.push(set.id);
  return n;
}

async function load({ twitchId, youtubeId, kickId } = {}) {
  const cfg = store.get('config').emotes;
  const next = new Map();
  const errors = [];
  const s = { seventv: 0, bttv: 0, ffz: 0 };
  sevenTvSetIds = [];

  const safe = async (label, fn) => { try { await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); } };

  if (cfg.ffz) {
    await safe('FFZ global', async () => {
      const d = await request('https://api.frankerfacez.com/v1/set/global');
      for (const setId of d.default_sets || []) for (const e of d.sets?.[setId]?.emoticons || []) {
        const u = e.urls['2'] || e.urls['1']; add(next, e.name, u.startsWith('http') ? u : 'https:' + u, 'ffz'); s.ffz++;
      }
    });
  }
  if (cfg.bttv) {
    await safe('BTTV global', async () => {
      const d = await request('https://api.betterttv.net/3/cached/emotes/global');
      for (const e of d) { add(next, e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, 'bttv'); s.bttv++; }
    });
  }
  if (cfg.seventv) {
    await safe('7TV global', async () => {
      const d = await request('https://7tv.io/v3/emote-sets/global');
      s.seventv += add7tvSet(next, d);
    });
  }

  if (twitchId) {
    if (cfg.ffz) await safe('FFZ канал', async () => {
      const d = await request(`https://api.frankerfacez.com/v1/room/id/${twitchId}`);
      for (const set of Object.values(d.sets || {})) for (const e of set.emoticons || []) {
        const u = e.urls['2'] || e.urls['1']; add(next, e.name, u.startsWith('http') ? u : 'https:' + u, 'ffz'); s.ffz++;
      }
    });
    if (cfg.bttv) await safe('BTTV канал', async () => {
      const d = await request(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
      for (const e of [...(d.channelEmotes || []), ...(d.sharedEmotes || [])]) {
        add(next, e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, 'bttv'); s.bttv++;
      }
    });
    if (cfg.seventv) await safe('7TV Twitch', async () => {
      const d = await request(`https://7tv.io/v3/users/twitch/${twitchId}`);
      s.seventv += add7tvSet(next, d.emote_set);
    });
  }
  if (youtubeId && cfg.seventv) {
    await safe('7TV YouTube', async () => {
      const d = await request(`https://7tv.io/v3/users/youtube/${youtubeId}`);
      s.seventv += add7tvSet(next, d.emote_set);
    });
  }

  if (kickId && cfg.seventv) {
    await safe('7TV Kick', async () => {
      try {
        const d = await request(`https://7tv.io/v3/users/kick/${kickId}`);
        s.seventv += add7tvSet(next, d.emote_set);
      } catch (e) { if (e.status !== 404) throw e; }
    });
  }

  map = next;
  stats = { ...s, total: map.size, loadedAt: Date.now(), errors };
  return stats;
}

function lookup(word) { return map.get(word); }
function getStats() { return stats; }
function list(limit = 500) {
  return [...map.entries()].slice(0, limit).map(([name, v]) => ({ name, ...v }));
}

module.exports = { load, lookup, getStats, list };
