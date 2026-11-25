const crypto = require('crypto');
const store = require('./store');
const bus = require('./bus');
const chat = require('./chat');
const { request } = require('./http');

const API = 'https://www.googleapis.com/youtube/v3';
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const WEB_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8', Cookie: 'CONSENT=YES+1; SOCS=CAI' };

let status = { state: 'disconnected', error: null, broadcastId: null, broadcastTitle: '', channelName: '', mode: null, viewers: 0 };
let running = false;
let timer = null;
let session = null;
let liveChatId = null;
let apiPageToken = null;
let firstBatch = true;
let currentChannelId = null;
let onChannelCb = () => {};
let viewersTimer = null;

async function fetchViewers(videoId) {
  try {
    const d = await request('https://www.youtube.com/youtubei/v1/updated_metadata?prettyPrint=false', {
      method: 'POST', headers: { 'User-Agent': UA, Origin: 'https://www.youtube.com' },
      body: { context: { client: { clientName: 'WEB', clientVersion: session?.version || '2.20241120.01.00', hl: 'ru' } }, videoId },
    });
    const m = JSON.stringify(d).match(/"originalViewCount":"(\d+)"/);
    if (m) return Number(m[1]);
  } catch {   }
  if (isAuthorized()) {
    const v = await api(`/videos?part=liveStreamingDetails&id=${videoId}`);
    const n = v.items?.[0]?.liveStreamingDetails?.concurrentViewers;
    if (n !== undefined) return Number(n);
  }
  return null;
}
function startViewers(videoId) {
  clearInterval(viewersTimer);
  const tick = async () => { try { const n = await fetchViewers(videoId); if (n !== null) setStatus({ viewers: n }); } catch {} };
  tick();
  viewersTimer = setInterval(tick, 30000);
}
function stopViewers() { clearInterval(viewersTimer); viewersTimer = null; if (status.viewers) setStatus({ viewers: 0 }); }

function cfg() { return store.get('config').youtube; }
function setStatus(s) { status = { ...status, ...s }; bus.broadcast('status', { youtube: publicStatus() }); }
function publicStatus() {
  const c = cfg();
  return {
    ...status, target: c.channel || '', hasClient: !!(c.clientId && c.clientSecret), authorized: !!c.refreshToken,
    channelTitle: c.channelTitle, channelId: c.channelId, canSend: !!liveChatId, readOnly: status.state === 'connected' && !liveChatId,
  };
}
function redirectUri(port) { return `http://127.0.0.1:${port}/auth/youtube/callback`; }

const pendingStates = new Map();
function authUrl(port) {
  const c = cfg();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  const p = new URLSearchParams({
    client_id: c.clientId, redirect_uri: redirectUri(port), response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function exchangeCode(code, state, port) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  if (!exp || exp < Date.now()) throw new Error('Сессия входа устарела — попробуйте ещё раз');
  const c = cfg();
  const d = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    form: { code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(port), grant_type: 'authorization_code' },
  });
  c.accessToken = d.access_token;
  c.expiresAt = Date.now() + (d.expires_in - 60) * 1000;
  if (d.refresh_token) c.refreshToken = d.refresh_token;
  store.save('config', true);
  const me = await api('/channels?part=snippet&mine=true');
  const ch = me.items?.[0];
  if (ch) {
    c.channelId = ch.id; c.channelTitle = ch.snippet.title;
    if (!c.channel) c.channel = ch.snippet.customUrl || ch.id;
    store.save('config', true);
  }
  setStatus({ error: null });
}

async function token() {
  const c = cfg();
  if (c.accessToken && Date.now() < c.expiresAt) return c.accessToken;
  if (!c.refreshToken) throw new Error('Войдите в YouTube во вкладке «Подключения»');
  const d = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    form: { client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' },
  });
  c.accessToken = d.access_token;
  c.expiresAt = Date.now() + (d.expires_in - 60) * 1000;
  store.save('config');
  return c.accessToken;
}

async function api(path, opts = {}) {
  const t = await token();
  return request(API + path, { ...opts, headers: { Authorization: `Bearer ${t}` } });
}

function parseTarget(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^UC[\w-]{22}$/.test(s)) return { channel: s };
  if (s.startsWith('@')) return { handle: s };
  if (/^[\w-]{11}$/.test(s)) return { handle: '@' + s, maybeVideo: s };
  if (/youtu\.?be/i.test(s)) {
    try {
      const u = new URL(s.startsWith('http') ? s : 'https://' + s);
      if (u.hostname.includes('youtu.be')) return { videoId: u.pathname.slice(1, 12) };
      if (u.searchParams.get('v')) return { videoId: u.searchParams.get('v') };
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'live' && parts[1]) return { videoId: parts[1] };
      if (parts[0]?.startsWith('@')) return { handle: decodeURIComponent(parts[0]) };
      if (parts[0] === 'channel' && parts[1]) return { channel: parts[1] };
      if ((parts[0] === 'c' || parts[0] === 'user') && parts[1]) return { path: `${parts[0]}/${parts[1]}` };
    } catch {   }
  }
  return { handle: '@' + s.replace(/^@/, '') };
}

async function getText(url) {
  const r = await fetch(url, { headers: WEB_HEADERS, redirect: 'follow' });
  if (r.status === 404) throw new Error('Канал не найден — проверьте ник');
  if (!r.ok) throw new Error(`YouTube ответил ${r.status}`);
  return r.text();
}

function jsonStr(raw) { try { return JSON.parse('"' + raw + '"'); } catch { return raw; } }
function htmlDecode(s) { return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }

async function resolveLive(input) {
  const t = parseTarget(input);
  if (!t) throw new Error('Укажите @ник или ссылку на канал YouTube');
  if (t.videoId) return { videoId: t.videoId };
  const base = t.channel ? `https://www.youtube.com/channel/${t.channel}`
    : t.path ? `https://www.youtube.com/${t.path}` : `https://www.youtube.com/${encodeURIComponent(t.handle).replace('%40', '@')}`;
  let html;
  try { html = await getText(base + '/live'); } catch (e) {
    if (t.maybeVideo) return { videoId: t.maybeVideo };
    throw e;
  }
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || '';
  const videoId = canonical.match(/[?&]v=([\w-]{11})/)?.[1] || null;
  const channelId = html.match(/"(?:externalId|channelId|browseId)":"(UC[\w-]{22})"/)?.[1] || null;
  const owner = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1];
  const ogTitle = htmlDecode(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]);
  return {
    videoId, channelId,
    channelName: owner ? jsonStr(owner) : (videoId ? '' : ogTitle),
    title: videoId ? ogTitle : '',
  };
}

function extractInitialData(html) {
  const m = html.match(/(?:window\["ytInitialData"\]|var ytInitialData)\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function openChat(videoId) {
  const html = await getText(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`);
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || null;
  const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20241120.01.00';
  const data = extractInitialData(html);
  const lcr = data?.contents?.liveChatRenderer;
  if (!lcr) throw new Error('Чат недоступен: эфир завершён или чат выключен');
  const items = lcr.header?.liveChatHeaderRenderer?.viewSelector?.sortFilterSubMenuRenderer?.subMenuItems || [];
  const all = items[1]?.continuation?.reloadContinuationData?.continuation;
  const first = lcr.continuations?.[0];
  const continuation = all || Object.values(first || {})[0]?.continuation;
  if (!continuation) throw new Error('Не удалось открыть чат трансляции');
  return { videoId, key, version, continuation, initial: lcr.actions || [] };
}

async function fetchBatch() {
  const url = 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false' + (session.key ? `&key=${session.key}` : '');
  const d = await request(url, {
    method: 'POST', headers: { 'User-Agent': UA, Origin: 'https://www.youtube.com' },
    body: { context: { client: { clientName: 'WEB', clientVersion: session.version, hl: 'ru', gl: 'RU' } }, continuation: session.continuation },
  });
  const lc = d?.continuationContents?.liveChatContinuation;
  if (!lc) return { ended: true };
  const c = lc.continuations?.[0] || {};
  const cd = c.invalidationContinuationData || c.timedContinuationData || c.reloadContinuationData;
  if (!cd?.continuation) return { ended: true, actions: lc.actions || [] };
  session.continuation = cd.continuation;
  return { actions: lc.actions || [], wait: Math.min(Math.max(cd.timeoutMs || 2000, 1000), 6000) };
}

function runsText(runs) { return (runs || []).map(r => r.text ?? r.emoji?.shortcuts?.[0] ?? r.emoji?.emojiId ?? '').join(''); }

function runsToParts(runs) {
  const parts = [];
  let text = '';
  const pushText = (t) => {
    for (const p of chat.buildParts(t)) {
      const last = parts[parts.length - 1];
      if (p.type === 'text' && last?.type === 'text') last.text += p.text; else parts.push(p);
    }
  };
  for (const r of runs || []) {
    if (r.text !== undefined) { pushText(r.text); text += r.text; continue; }
    const e = r.emoji;
    if (!e) continue;
    if (e.isCustomEmoji) {
      const name = e.shortcuts?.[0] || e.emojiId;
      const thumbs = e.image?.thumbnails || [];
      parts.push({ type: 'emote', name, url: thumbs[thumbs.length - 1]?.url, provider: 'youtube' });
      text += name;
    } else { pushText(e.emojiId); text += e.emojiId; }
  }
  return { parts, text };
}

function handleAction(a) {
  if (a.markChatItemAsDeletedAction) { chat.remove({ platform: 'youtube', messageId: a.markChatItemAsDeletedAction.targetItemId }); return; }
  if (a.markChatItemsByAuthorAsDeletedAction) { chat.remove({ platform: 'youtube', userId: a.markChatItemsByAuthorAsDeletedAction.externalChannelId }); return; }
  const item = a.addChatItemAction?.item;
  if (!item) return;
  const r = item.liveChatTextMessageRenderer || item.liveChatPaidMessageRenderer || item.liveChatMembershipItemRenderer || item.liveChatPaidStickerRenderer;
  if (!r || !r.authorExternalChannelId) return;

  const roles = { broadcaster: false, mod: false, sub: false, verified: false };
  const badges = [];
  for (const b of r.authorBadges || []) {
    const br = b.liveChatAuthorBadgeRenderer || {};
    const type = br.icon?.iconType;
    if (type === 'OWNER') roles.broadcaster = true;
    else if (type === 'MODERATOR') { roles.mod = true; badges.push({ url: '/app/roles/mod.svg', title: 'Модератор' }); }
    else if (type === 'VERIFIED') roles.verified = true;
    if (br.customThumbnail) {
      roles.sub = true;
      const th = br.customThumbnail.thumbnails || [];
      badges.push({ url: th[th.length - 1]?.url, title: br.tooltip || 'Спонсор' });
    }
  }
  if (roles.broadcaster) badges.unshift({ url: '/app/roles/broadcaster.svg', title: 'Владелец канала' });

  const { parts, text } = runsToParts(r.message?.runs);
  let highlight = null, eventText = null;
  if (item.liveChatPaidMessageRenderer) { highlight = 'superchat'; eventText = `Суперчат ${r.purchaseAmountText?.simpleText || ''}`; }
  else if (item.liveChatPaidStickerRenderer) { highlight = 'superchat'; eventText = `Суперстикер ${r.purchaseAmountText?.simpleText || ''}`; }
  else if (item.liveChatMembershipItemRenderer) { highlight = 'event'; eventText = runsText(r.headerSubtext?.runs) || r.headerSubtext?.simpleText || 'Новый спонсор канала!'; }

  const photos = r.authorPhoto?.thumbnails || [];
  const name = r.authorName?.simpleText || 'Зритель';
  chat.ingest({
    id: r.id, platform: 'youtube', ts: r.timestampUsec ? Math.floor(Number(r.timestampUsec) / 1000) : Date.now(),
    user: { id: r.authorExternalChannelId, login: name.replace(/^@/, ''), name: name.replace(/^@/, ''), avatar: photos[photos.length - 1]?.url, roles, badges },
    text, parts, highlight, eventText, fromSelf: r.authorExternalChannelId === cfg().channelId,
  });
}

async function loop() {
  if (!running) return;
  let wait = 2000;
  try {
    const res = await fetchBatch();
    const actions = firstBatch ? (res.actions || []).slice(-5) : (res.actions || []);
    firstBatch = false;
    for (const a of actions) { try { handleAction(a); } catch (e) { console.warn('[youtube] action', e.message); } }
    if (res.ended) { waitForLive('Трансляция завершилась — ждём следующий эфир'); return; }
    wait = res.wait;
    if (status.error) setStatus({ error: null });
  } catch (e) {
    setStatus({ error: 'Проблема с чатом: ' + e.message + ' — повторяю…' });
    wait = 8000;
  }
  if (running) timer = setTimeout(loop, wait);
}

function waitForLive(reason) {
  stopTimers();
  stopViewers();
  running = true;
  setStatus({ state: 'waiting', error: reason, broadcastTitle: '' });
  timer = setTimeout(() => { if (running) connect(); }, 60000);
}

function stopTimers() { clearTimeout(timer); timer = null; }

async function connect() {
  const c = cfg();
  const target = c.channel || (c.channelId || '');
  stopTimers();
  chat.unregisterSender('youtube');
  liveChatId = null;
  if (!target) { running = false; setStatus({ state: 'disconnected', error: 'Укажите @ник или ссылку на канал' }); return; }
  running = true;
  setStatus({ state: 'connecting', error: null, mode: 'public' });
  try {
    const live = await resolveLive(target);
    if (live.channelId && live.channelId !== currentChannelId) { currentChannelId = live.channelId; onChannelCb(live.channelId); }
    if (live.channelName) setStatus({ channelName: live.channelName });
    if (!live.videoId) { waitForLive('Канал сейчас не в эфире — подключусь автоматически, когда начнётся стрим'); return; }
    session = await openChat(live.videoId);
    firstBatch = true;
    setStatus({ state: 'connected', error: null, broadcastId: live.videoId, broadcastTitle: live.title || '' });
    for (const a of session.initial.slice(-5)) { try { handleAction(a); } catch {} }
    firstBatch = false;
    enableSending(live.videoId);
    startViewers(live.videoId);
    loop();
  } catch (e) {
    if (/не найден/.test(e.message)) { running = false; setStatus({ state: 'error', error: e.message }); return; }
    if (isAuthorized() && !c.channel) { apiConnect(); return; }
    const msg = /fetch failed|ENOTFOUND|ECONN|abort/i.test(e.message) ? 'Нет связи с YouTube' : e.message;
    setStatus({ state: 'waiting', error: msg + ' — повторю через минуту' });
    timer = setTimeout(() => { if (running) connect(); }, 60000);
  }
}

async function enableSending(videoId) {
  if (!isAuthorized()) return;
  try {
    const d = await api(`/videos?part=liveStreamingDetails&id=${videoId}`);
    liveChatId = d.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
    if (liveChatId) chat.registerSender('youtube', say);
    setStatus({});
  } catch (e) { console.warn('[youtube] отправка недоступна:', e.message); }
}

function disconnect() {
  running = false;
  stopTimers();
  stopViewers();
  liveChatId = null;
  chat.unregisterSender('youtube');
  setStatus({ state: 'disconnected', error: null, broadcastTitle: '' });
}

function logout() {
  Object.assign(cfg(), { refreshToken: '', accessToken: '', expiresAt: 0, channelId: '', channelTitle: '' });
  store.save('config', true);
  liveChatId = null;
  chat.unregisterSender('youtube');
  setStatus({});
}

async function findBroadcast() {
  for (const st of ['active', 'upcoming']) {
    const d = await api(`/liveBroadcasts?part=snippet,status&broadcastStatus=${st}&broadcastType=all&maxResults=5`);
    const b = d.items?.[0];
    if (b) return { id: b.id, title: b.snippet.title, liveChatId: b.snippet.liveChatId, status: st };
  }
  return null;
}

async function apiConnect() {
  try {
    const b = await findBroadcast();
    if (!b?.liveChatId || b.status !== 'active') { waitForLive('Нет активной трансляции'); return; }
    liveChatId = b.liveChatId; apiPageToken = null; firstBatch = true; running = true;
    setStatus({ state: 'connected', mode: 'api', broadcastId: b.id, broadcastTitle: b.title, error: null });
    chat.registerSender('youtube', say);
    startViewers(b.id);
    apiPoll();
  } catch (e) { setStatus({ state: 'error', error: e.message }); }
}

async function apiPoll() {
  if (!running) return;
  let wait = Math.max(cfg().pollInterval || 6000, 3000);
  try {
    const q = new URLSearchParams({ liveChatId, part: 'snippet,authorDetails', maxResults: '200' });
    if (apiPageToken) q.set('pageToken', apiPageToken);
    const d = await api(`/liveChat/messages?${q}`);
    apiPageToken = d.nextPageToken;
    wait = Math.max(wait, d.pollingIntervalMillis || 0);
    const items = firstBatch ? (d.items || []).slice(-5) : (d.items || []);
    firstBatch = false;
    for (const it of items) handleApiItem(it);
    if (d.offlineAt) { waitForLive('Трансляция завершилась'); return; }
  } catch (e) {
    if (e.status === 403 || e.status === 404) { waitForLive('Чат недоступен: ' + e.message); return; }
    setStatus({ error: e.message }); wait = 10000;
  }
  if (running) timer = setTimeout(apiPoll, wait);
}

function handleApiItem(it) {
  const s = it.snippet || {}, a = it.authorDetails || {};
  if (s.type === 'messageDeletedEvent') { chat.remove({ platform: 'youtube', messageId: s.messageDeletedDetails?.deletedMessageId }); return; }
  let text = s.displayMessage || '', highlight = null, eventText = null;
  if (s.type === 'superChatEvent') { highlight = 'superchat'; eventText = `Суперчат ${s.superChatDetails?.amountDisplayString || ''}`; text = s.superChatDetails?.userComment || ''; }
  else if (s.type === 'newSponsorEvent') { highlight = 'event'; eventText = 'Новый спонсор канала!'; text = ''; }
  else if (s.type !== 'textMessageEvent') return;
  chat.ingest({
    id: it.id, platform: 'youtube',
    user: { id: a.channelId, login: a.displayName, name: a.displayName, avatar: a.profileImageUrl, badges: [],
      roles: { broadcaster: !!a.isChatOwner, mod: !!a.isChatModerator, sub: !!a.isChatSponsor } },
    text, highlight, eventText, fromSelf: a.channelId === cfg().channelId,
  });
}

async function say(text) {
  if (!liveChatId) throw new Error('Для отправки в YouTube войдите через Google');
  await api('/liveChat/messages?part=snippet', {
    method: 'POST',
    body: { snippet: { liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: text.slice(0, 200) } } },
  });
}

async function getStream() {
  const b = await findBroadcast();
  if (!b) throw new Error('Нет активной или запланированной трансляции');
  const v = await api(`/videos?part=snippet&id=${b.id}`);
  const sn = v.items?.[0]?.snippet || {};
  return { broadcastId: b.id, status: b.status, title: sn.title, categoryId: sn.categoryId, description: sn.description || '' };
}

async function updateStream({ title, categoryId }) {
  const b = await findBroadcast();
  if (!b) throw new Error('Нет активной или запланированной трансляции');
  const v = await api(`/videos?part=snippet&id=${b.id}`);
  const sn = v.items?.[0]?.snippet;
  if (!sn) throw new Error('Не удалось получить данные трансляции');
  const snippet = { title: title ?? sn.title, categoryId: categoryId ?? sn.categoryId, description: sn.description, tags: sn.tags, defaultLanguage: sn.defaultLanguage };
  await api('/videos?part=snippet', { method: 'PUT', body: { id: b.id, snippet } });
  setStatus({ broadcastTitle: snippet.title });
  return getStream();
}

let categoriesCache = null;
async function categories() {
  if (categoriesCache) return categoriesCache;
  const d = await api('/videoCategories?part=snippet&regionCode=RU&hl=ru');
  categoriesCache = (d.items || []).filter(i => i.snippet.assignable).map(i => ({ id: i.id, name: i.snippet.title }));
  return categoriesCache;
}

function isAuthorized() { return !!cfg().refreshToken; }

module.exports = {
  authUrl, exchangeCode, connect, disconnect, logout, publicStatus, getStream, updateStream, categories,
  isAuthorized, parseTarget, runsToParts, handleAction,
  channelId: () => currentChannelId || cfg().channelId || null,
  onChannel: (fn) => { onChannelCb = fn; },
};
