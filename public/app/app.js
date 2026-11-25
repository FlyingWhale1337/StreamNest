'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const raw = (s) => `<span data-raw>${esc(s)}</span>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleString(I18N.locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

async function api(path, body, method) {
  const opts = { method: method || (body !== undefined ? 'POST' : 'GET'), headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(path, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || r.statusText);
  return d;
}
function toast(text, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3000);
}
async function run(fn, okText) {
  try { const r = await fn(); if (okText) toast(okText); return r; } catch (e) { toast(e.message, true); return undefined; }
}

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  chat: I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  stream: I('<rect x="2" y="7" width="15" height="12" rx="2"/><path d="m17 11 5-3v10l-5-3"/>'),
  cmd: I('<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>'),
  poll: I('<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-8"/>'),
  gift: I('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),
  badge: I('<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>'),
  widget: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  plug: I('<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  trash: I('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  edit: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  copy: I('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  refresh: I('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
  send: I('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
  play: I('<path d="m6 3 14 9-14 9z"/>'),
  stop: I('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  dice: I('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  upload: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'),
  ext: I('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  globe: I('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  twitch: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.3 2 3 5.4v13.4h4.6V22h2.6l3.1-3.2h3.7L22 13.9V2zm16 11.1-2.9 2.9h-4.6l-2.5 2.5V16H6.4V3.7h13.9z"/><path d="M15.9 7h1.7v5h-1.7zm-4.6 0H13v5h-1.7z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15V9l5.8 3z"/></svg>',
  kick: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v5h2V5h2V3h7v7h-2v1h-2v2h2v1h2v7h-7v-2h-2v-3h-2v5H3z"/></svg>',
  spark: I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
};

const S = {
  config: null, status: { twitch: {}, youtube: {}, twitchStream: {} }, commands: [], badges: [], presets: [],
  poll: null, giveaway: null, history: [], emotes: {}, pollHistory: [], giveawayHistory: [],
  chatFilter: 'all', sendTo: 'all', stick: true, page: 'chat',
};
const PAGES = [
  { id: 'chat', title: 'Чат', icon: 'chat' },
  { id: 'stream', title: 'Стрим', icon: 'stream' },
  { id: 'commands', title: 'Команды', icon: 'cmd' },
  { id: 'polls', title: 'Голосования', icon: 'poll' },
  { id: 'giveaways', title: 'Розыгрыши', icon: 'gift' },
  { id: 'badges', title: 'Значки', icon: 'badge' },
  { id: 'widgets', title: 'Виджеты OBS', icon: 'widget' },
  { id: 'settings', title: 'Подключения', icon: 'plug' },
];
const ROLE_NAMES = { everyone: 'Все', sub: 'Сабы / спонсоры', vip: 'VIP', mod: 'Модераторы', broadcaster: 'Только стример' };
const PNAME = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', system: 'StreamNest' };
const PTAG = { twitch: 'tw', youtube: 'yt', kick: 'kk' };
const STATE_NAMES = { connected: 'подключено', connecting: 'подключение…', reconnecting: 'переподключение…', disconnected: 'отключено', error: 'ошибка', waiting: 'ожидание эфира' };

function renderNav() {
  $('#nav').innerHTML = PAGES.map(p => {
    const dot = (p.id === 'polls' && S.poll?.status === 'active') || (p.id === 'giveaways' && S.giveaway?.status === 'open');
    return `<a href="#/${p.id}" class="${S.page === p.id ? 'active' : ''}">${ICON[p.icon]}${p.title}${dot ? '<span class="dot"></span>' : ''}</a>`;
  }).join('');
}
function renderSide() {
  const tw = S.status.twitch || {}, yt = S.status.youtube || {}, kk = S.status.kick || {};
  $('#sideStatus').innerHTML = `
    <div class="conn" onclick="location.hash='#/settings'">
      <div class="pi" style="background:var(--twitch)">${ICON.twitch}</div>
      <div><b>Twitch</b><small>${tw.channel ? esc(tw.channel) + ' · ' : ''}${STATE_NAMES[tw.state] || 'отключено'}</small></div>
      <span class="st ${tw.state || ''}"></span>
    </div>
    <div class="conn" onclick="location.hash='#/settings'">
      <div class="pi" style="background:var(--youtube)">${ICON.youtube}</div>
      <div><b>YouTube</b><small>${(yt.channelName || yt.target) ? esc(yt.channelName || yt.target) + ' · ' : ''}${STATE_NAMES[yt.state] || 'отключено'}</small></div>
      <span class="st ${yt.state || ''}"></span>
    </div>
    <div class="conn" onclick="location.hash='#/settings'">
      <div class="pi" style="background:var(--kick);color:#0b0b0b">${ICON.kick}</div>
      <div><b>Kick</b><small>${kk.channel ? esc(kk.channel) + ' · ' : ''}${STATE_NAMES[kk.state] || 'отключено'}</small></div>
      <span class="st ${kk.state || ''}"></span>
    </div>
    <div class="lang-switch" data-raw>
      ${ICON.globe}
      <div class="seg" data-seg="lang" data-value="${I18N.lang}"><button type="button" data-v="ru" class="${I18N.lang === 'ru' ? 'on' : ''}">Русский</button><button type="button" data-v="en" class="${I18N.lang === 'en' ? 'on' : ''}">English</button></div>
    </div>`;
}
async function setLang(lang) {
  if (lang === I18N.lang && S.config?.lang) return closeModal();
  try { await api('/api/lang', { lang }); } catch (e) { toast(e.message, true); return; }
  location.reload();
}
document.addEventListener('segchange', (e) => { if (e.target.dataset.seg === 'lang') setLang(e.detail); });
function showLangPicker() {
  modal(`<div data-raw style="text-align:center">
      <img src="/app/logo.svg" width="56" height="56" style="margin-bottom:10px">
      <h2 style="margin-bottom:4px">Выберите язык · Choose your language</h2>
      <div class="muted small" style="margin-bottom:20px">Его можно поменять в любой момент внизу слева · You can change it anytime in the bottom left corner</div>
      <div class="grid g2">
        <button class="lang-card" data-act="pickLang" data-lang="ru"><b>Русский</b><span>Интерфейс на русском</span></button>
        <button class="lang-card" data-act="pickLang" data-lang="en"><b>English</b><span>English interface</span></button>
      </div></div>`, null, { locked: true });
}

function route() {
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'chat';
  S.page = PAGES.some(p => p.id === id) ? id : 'chat';
  renderNav();
  VIEWS[S.page]();
  $('#view').scrollTop = 0;
}
window.addEventListener('hashchange', route);

const ACT = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); }
});
document.addEventListener('click', (e) => {
  const seg = e.target.closest('.seg[data-seg] button');
  if (!seg) return;
  const box = seg.parentElement;
  $$('button', box).forEach(b => b.classList.toggle('on', b === seg));
  box.dataset.value = seg.dataset.v;
  box.dispatchEvent(new CustomEvent('segchange', { detail: seg.dataset.v, bubbles: true }));
});
const seg = (name, items, value) => `<div class="seg" data-seg="${name}" data-value="${esc(value)}">${items.map(([v, label]) => `<button type="button" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${label}</button>`).join('')}</div>`;
const sw = (name, checked, label) => `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><i></i>${label}</label>`;

let modalLocked = false;
function modal(html, onMount, { locked = false } = {}) {
  const root = $('#modalRoot');
  modalLocked = locked;
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const bg = $('.modal-bg', root);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg && !modalLocked) closeModal(); });
  onMount?.($('.modal', root));
}
function closeModal() { modalLocked = false; $('#modalRoot').innerHTML = ''; }
ACT.closeModal = closeModal;
ACT.pickLang = (el) => setLang(el.dataset.lang);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalLocked) closeModal(); });

function partsHTML(parts) {
  return (parts || []).map(p => p.type === 'emote'
    ? `<img class="emote" src="${esc(p.url)}" alt="${esc(p.name)}" title="${esc(p.name)} · ${esc(p.provider)}" loading="lazy">`
    : esc(p.text)).join('');
}
function nameColor(u) {
  if (u.color && /^#[0-9a-f]{3,8}$/i.test(u.color)) return u.color;
  let h = 7; for (const ch of String(u.name)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  h %= 360;
  return `hsl(${h} 70% 68%)`;
}
function msgHTML(m) {
  const u = m.user;
  const sys = m.platform === 'system';
  const cls = ['msg'];
  if (sys) cls.push(m.botReply ? 'bot' : 'sys');
  if (m.action) cls.push('action');
  if (m.highlight === 'superchat') cls.push('hl-superchat'); else if (m.highlight) cls.push('hl');
  if (m.firstTime && !sys) cls.push('first');
  const pf = `<div class="pf ${m.platform}">${ICON[m.platform] || ICON.spark}</div>`;
  const badges = [...(u.badges || []).map(b => `<img class="bdg" src="${esc(b.url)}" title="${esc(b.title)}">`),
    ...(u.custom || []).map(b => `<img class="bdg" src="${esc(b.url)}" title="${esc(b.name)}">`)].join('');
  const key = `${m.platform}:${u.id}`;
  return `<div class="${cls.join(' ')}" data-id="${esc(m.id)}" data-p="${m.platform}" data-u="${esc(u.id)}">
    ${pf}<div class="body">${m.eventText ? `<span class="ev">${esc(m.eventText)}</span>` : ''}<span class="time">${fmtTime(m.ts)}</span>${badges}<span class="name" style="color:${esc(sys ? '' : nameColor(u))}" ${sys ? '' : `data-act="userCard" data-key="${esc(key)}"`}>${raw(u.name)}</span>${m.action ? ' ' : ': '}<span class="text" ${sys && !m.botReply ? '' : 'data-raw'}>${partsHTML(m.parts)}</span>${m.firstTime && !sys ? ' <span class="tag ok">впервые</span>' : ''}</div>
    ${sys ? '' : `<div class="acts">${modButtonsHTML(m)}<button data-act="replyTo" data-name="${esc(u.name)}" data-p="${m.platform}">Ответить</button><button data-act="userCard" data-key="${esc(key)}">Профиль</button></div>`}
  </div>`;
}

const VIEWS = {};

VIEWS.chat = () => {
  $('#view').innerHTML = `
  <div class="page-head">
    <div><h1>Чат</h1><p>Twitch, YouTube и Kick в одной ленте</p></div>
    ${seg('chatFilter', [['all', 'Все'], ['twitch', ICON.twitch + 'Twitch'], ['youtube', ICON.youtube + 'YouTube'], ['kick', ICON.kick + 'Kick']], S.chatFilter)}
  </div>
  <div class="split">
    <div class="card chat-wrap" style="position:relative">
      <div class="chat-feed" id="feed"></div>
      <button class="btn sm scroll-down" id="scrollDown" style="display:none" data-act="scrollDown">↓ К новым сообщениям</button>
      <form class="chat-input" id="sendForm">
        ${seg('sendTo', [['all', 'Везде'], ['twitch', ICON.twitch], ['youtube', ICON.youtube], ['kick', ICON.kick]], S.sendTo)}
        <input id="sendText" placeholder="Написать в чат…" maxlength="500" autocomplete="off">
        <button class="btn primary">${ICON.send}</button>
      </form>
    </div>
    <div class="stack">
      <div class="card" id="streamCard"></div>
      <div class="card"><h2>Эта сессия</h2><div class="mini-stat" id="sessionStats"></div></div>
      <div id="miniPoll"></div>
      <div id="miniGw"></div>
      <div class="card">
        <h2>Тестовое сообщение</h2>
        <form class="stack" id="testForm">
          <div class="row"><input name="name" value="${I18N.lang === 'en' ? 'Viewer' : 'Зритель'}" placeholder="Ник" style="width:42%"><input name="text" value="${I18N.lang === 'en' ? 'Hi chat! !dice' : 'Привет, чат! !кубик'}" placeholder="Текст"></div>
          <div class="row wrap" style="justify-content:space-between">
            ${seg('testP', [['twitch', ICON.twitch], ['youtube', ICON.youtube], ['kick', ICON.kick]], 'twitch')}
            <div class="row small">${sw('sub', false, 'саб')}${sw('mod', false, 'мод')}</div>
          </div>
          <button class="btn sm">Отправить в ленту</button>
          <div class="hint">Проходит через команды, голосования и розыгрыши — удобно проверить всё без эфира.</div>
        </form>
      </div>
    </div>
  </div>`;
  renderFeed();
  renderStreamCard(); renderSession(); renderMiniPoll(); renderMiniGw();
  const feed = $('#feed');
  feed.addEventListener('scroll', () => {
    S.stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
    $('#scrollDown').style.display = S.stick ? 'none' : '';
  });
  $('#view').addEventListener('segchange', onChatSeg);
  $('#sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $('#sendText');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    const r = await run(() => api('/api/chat/send', { text, platform: S.sendTo }));
    const bad = Object.entries(r || {}).filter(([, v]) => v !== 'ok' && v !== 'не подключено');
    if (bad.length) toast(bad.map(([k, v]) => `${k}: ${v}`).join('\n'), true);
  });
  $('#testForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    run(() => api('/api/test/message', {
      name: f.name.value, text: f.text.value, platform: $('[data-seg=testP]').dataset.value,
      roles: { sub: f.sub.checked, mod: f.mod.checked },
    }));
  });
};
function onChatSeg(e) {
  const box = e.target;
  if (box.dataset.seg === 'chatFilter') { S.chatFilter = e.detail; renderFeed(); }
  if (box.dataset.seg === 'sendTo') S.sendTo = e.detail;
}
function visibleMsg(m) { return S.chatFilter === 'all' || m.platform === S.chatFilter || m.platform === 'system'; }
function renderFeed() {
  const feed = $('#feed'); if (!feed) return;
  const list = S.history.filter(visibleMsg);
  feed.innerHTML = list.length ? list.map(msgHTML).join('') : `<div class="empty">${ICON.chat}<div>Сообщений пока нет</div><div class="small">Укажите ник канала во вкладке «Подключения» или отправьте тестовое сообщение</div></div>`;
  feed.scrollTop = feed.scrollHeight;
}
function appendMsg(m) {
  const feed = $('#feed'); if (!feed || !visibleMsg(m)) return;
  $('.empty', feed)?.remove();
  feed.insertAdjacentHTML('beforeend', msgHTML(m));
  while (feed.children.length > 300) feed.firstElementChild.remove();
  if (S.stick) feed.scrollTop = feed.scrollHeight;
}
ACT.scrollDown = () => { const f = $('#feed'); f.scrollTop = f.scrollHeight; };
ACT.replyTo = (el) => {
  const inp = $('#sendText'); if (!inp) return;
  inp.value = `@${el.dataset.name} `; inp.focus();
  const p = el.dataset.p; S.sendTo = p;
  $$('[data-seg=sendTo] button').forEach(b => b.classList.toggle('on', b.dataset.v === p));
};
function renderStreamCard() {
  const el = $('#streamCard'); if (!el) return;
  const ts = S.status.twitchStream || {}, yt = S.status.youtube || {};
  el.innerHTML = `<h2>Эфир ${ts.live ? '<span class="tag live push">LIVE</span>' : '<span class="tag push">офлайн</span>'}</h2>
    <div class="stack small">
      <div class="row"><span class="tag tw">${ICON.twitch.replace('<svg', '<svg width="12" height="12"')} Twitch</span><span class="grow muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ts.title || (S.status.twitch?.login ? '—' : 'не подключён'))}</span></div>
      ${ts.game ? `<div class="muted">Категория: <b style="color:var(--text)">${raw(ts.game)}</b>${ts.live ? ` · 👁 ${Number(ts.viewers) || 0}` : ''}</div>` : ''}
      <div class="row"><span class="tag yt">${ICON.youtube.replace('<svg', '<svg width="12" height="12"')} YouTube</span><span class="grow muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(yt.broadcastTitle || STATE_NAMES[yt.state] || 'не подключён')}</span></div>
      ${S.status.kick?.channel ? `<div class="row"><span class="tag kk">${ICON.kick.replace('<svg', '<svg width="12" height="12"')} Kick</span><span class="grow muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.status.kick.title || STATE_NAMES[S.status.kick.state] || '—')}${S.status.kick.live ? ` · 👁 ${Number(S.status.kick.viewers) || 0}` : ''}</span></div>` : ''}
      <a class="btn sm" href="#/stream">${ICON.edit} Изменить название и категорию</a>
    </div>`;
}
function renderSession() {
  const el = $('#sessionStats'); if (!el) return;
  const real = S.history.filter(m => m.platform !== 'system');
  const users = new Set(real.map(m => m.platform + m.user.id));
  const cnt = (p) => real.filter(m => m.platform === p).length;
  el.innerHTML = `<div><b>${real.length}</b><span>сообщений</span></div><div><b>${users.size}</b><span>зрителей писали</span></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap"><span class="tag tw">Twitch ${cnt('twitch')}</span><span class="tag yt">YouTube ${cnt('youtube')}</span><span class="tag kk">Kick ${cnt('kick')}</span></div>`;
}
function renderMiniPoll() {
  const el = $('#miniPoll'); if (!el) return;
  const p = S.poll;
  if (!p || p.status === 'hidden') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card"><h2>${ICON.poll.replace('<svg', '<svg width="16"')} ${esc(p.question)} <span class="tag push ${p.status === 'active' ? 'ok' : ''}">${p.status === 'active' ? 'идёт' : 'итог'}</span></h2>
    <div class="stack" style="gap:6px">${pollBars(p)}</div></div>`;
}
function renderMiniGw() {
  const el = $('#miniGw'); if (!el) return;
  const g = S.giveaway;
  if (!g) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card"><h2>${ICON.gift.replace('<svg', '<svg width="16"')} ${esc(g.prize)} <span class="tag push ${g.status === 'open' ? 'ok' : ''}">${{ open: 'приём', closed: 'закрыт', drawn: 'выбран' }[g.status]}</span></h2>
    <div class="small muted">Участников: <b style="color:var(--text)">${g.entries.length}</b> · слово <span class="code">${raw(g.keyword)}</span></div>
    ${g.rolling ? '<div style="margin-top:8px" class="muted">🎲 Выбираем победителя…</div>' : g.winner ? `<div style="margin-top:8px">🏆 <b>${raw(g.winner.name)}</b></div>` : ''}</div>`;
}

ACT.userCard = async (el) => {
  const key = el.dataset.key;
  const [platform, ...rest] = key.split(':');
  const id = rest.join(':');
  const msgs = S.history.filter(m => m.platform === platform && m.user.id === id);
  const last = msgs[msgs.length - 1];
  const u = last?.user || { name: id };
  const login = (u.login || u.name || '').toLowerCase();
  const bkey = `${platform}:${login}`;
  const manual = S.badges.filter(b => (b.users || []).includes(bkey));
  modal(`
    <div class="user-head">
      <div class="avatar">${u.avatar ? `<img src="${esc(u.avatar)}">` : esc((u.name || '?')[0].toUpperCase())}</div>
      <div class="grow"><h2 style="margin:0;color:${esc(nameColor(u))}">${raw(u.name)}</h2>
        <div class="row small muted" style="margin-top:4px">
          <span class="tag ${PTAG[platform]}">${PNAME[platform]}</span>
          ${u.roles?.broadcaster ? '<span class="tag">стример</span>' : ''}${u.roles?.mod ? '<span class="tag ok">модератор</span>' : ''}${u.roles?.vip ? '<span class="tag">VIP</span>' : ''}${u.roles?.sub ? '<span class="tag warn">саб</span>' : ''}
          <span>Всего сообщений: <b style="color:var(--text)">${u.messages ?? msgs.length}</b></span>
        </div>
      </div>
    </div>
    <h3>Значки</h3>
    ${S.badges.length ? `<div class="list">${S.badges.map(b => `
      <div class="item"><img src="${esc(b.image)}" style="height:22px">
        <div class="grow"><div class="t">${raw(b.name)}</div><div class="d">${b.rule.type === 'role' ? 'авто: ' + ROLE_NAMES[b.rule.role] : b.rule.type === 'messages' ? `авто: от ${b.rule.min} сообщений` : 'выдаётся вручную'}</div></div>
        <label class="switch"><input type="checkbox" data-badge="${b.id}" ${manual.includes(b) ? 'checked' : ''}><i></i>выдан</label>
      </div>`).join('')}</div>` : `<div class="muted small">Значков пока нет — создайте их во вкладке «Значки».</div>`}
    <h3>Последние сообщения</h3>
    <div class="stack" style="gap:2px;max-height:200px;overflow:auto">${msgs.slice(-15).reverse().map(msgHTML).join('') || '<div class="muted small">—</div>'}</div>
    <div class="foot"><button class="btn" data-act="closeModal">Закрыть</button></div>`, (root) => {
    $$('[data-badge]', root).forEach(cb => cb.addEventListener('change', () =>
      run(() => api('/api/badges/assign', { id: cb.dataset.badge, user: bkey, on: cb.checked }), cb.checked ? 'Значок выдан' : 'Значок снят')));
  });
};

VIEWS.stream = () => {
  const twOn = !!S.status.twitch?.hasToken, ytOn = !!S.status.youtube?.authorized, kkOn = !!S.status.kick?.authorized;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Стрим</h1><p>Название и категория трансляции на Twitch, YouTube и Kick</p></div></div>
  <div class="card" style="margin-bottom:18px">
    <h2>${ICON.spark.replace('<svg', '<svg width="16"')} Быстро — для обеих платформ</h2>
    <div class="row"><input id="bothTitle" placeholder="Общее название стрима" maxlength="140"><button class="btn primary" data-act="applyBoth">Применить везде</button></div>
    <div class="hint" style="margin-top:6px">Twitch и Kick — до 140 символов, YouTube — до 100. Категории меняются в карточках ниже.</div>
  </div>
  <div class="grid g2">
    <div class="card" id="twCard">
      <h2><span class="tag tw">${ICON.twitch.replace('<svg', '<svg width="13" height="13"')} Twitch</span></h2>
      ${twOn ? `<div class="stack">
        <label class="f">Название<input id="twTitle" maxlength="140"><div class="counter" id="twCount"></div></label>
        <label class="f">Категория</label>
        <div class="cur-cat" id="twCurCat"><span class="muted">загрузка…</span></div>
        <div class="cat-pick"><input id="twCatSearch" placeholder="Найти категорию: Just Chatting, Dota 2…" autocomplete="off"><div class="cat-results" id="twCatRes" style="display:none"></div></div>
        <div class="row"><button class="btn twitch" data-act="saveTwitch">Сохранить на Twitch</button><button class="btn ghost" data-act="loadTwitch">${ICON.refresh} Обновить</button></div>
      </div>` : notConnected('Twitch')}
    </div>
    <div class="card" id="ytCard">
      <h2><span class="tag yt">${ICON.youtube.replace('<svg', '<svg width="13" height="13"')} YouTube</span></h2>
      ${ytOn ? `<div class="stack">
        <label class="f">Название<input id="ytTitle" maxlength="100"><div class="counter" id="ytCount"></div></label>
        <label class="f">Категория<select id="ytCat"><option>загрузка…</option></select></label>
        <div class="hint">Меняется активная или ближайшая запланированная трансляция. Поле «Игра» YouTube через API изменить нельзя — только категорию.</div>
        <div class="row"><button class="btn youtube" data-act="saveYoutube">Сохранить на YouTube</button><button class="btn ghost" data-act="loadYoutube">${ICON.refresh} Обновить</button></div>
        <div class="small muted" id="ytInfo"></div>
      </div>` : notConnected('YouTube')}
    </div>
    <div class="card" id="kkCard">
      <h2><span class="tag kk">${ICON.kick.replace('<svg', '<svg width="13" height="13"')} Kick</span></h2>
      ${kkOn ? `<div class="stack">
        <label class="f">Название<input id="kkTitle" maxlength="140"></label>
        <label class="f">Категория</label>
        <div class="cur-cat" id="kkCurCat"><span class="muted">загрузка…</span></div>
        <div class="cat-pick"><input id="kkCatSearch" placeholder="Найти категорию…" autocomplete="off"><div class="cat-results" id="kkCatRes" style="display:none"></div></div>
        <div class="row"><button class="btn kick" data-act="saveKick">Сохранить на Kick</button><button class="btn ghost" data-act="loadKick">${ICON.refresh} Обновить</button></div>
      </div>` : notConnected('Kick')}
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <h2>Пресеты <span class="muted small" style="font-weight:400">— сохранённые наборы названия и категории</span>
      <button class="btn sm tag" data-act="savePreset">${ICON.plus} Сохранить текущее</button></h2>
    <div class="list" id="presetList"></div>
  </div>`;
  renderPresets();
  if (twOn) {
    ACT.loadTwitch();
    $('#twTitle').addEventListener('input', () => counter('twTitle', 'twCount', 140));
    const search = debounce(async (q) => {
      const box = $('#twCatRes');
      if (!q) { box.style.display = 'none'; return; }
      try {
        const res = await api('/api/twitch/categories?q=' + encodeURIComponent(q));
        box.innerHTML = res.map(g => `<div data-act="pickCat" data-id="${g.id}" data-name="${esc(g.name)}" data-art="${esc(g.boxArt || '')}"><img src="${esc(g.boxArt || '')}">${esc(g.name)}</div>`).join('') || '<div class="muted">Ничего не найдено</div>';
        box.style.display = '';
      } catch (e) { toast(e.message, true); }
    }, 300);
    $('#twCatSearch').addEventListener('input', (e) => search(e.target.value.trim()));
    $('#twCatSearch').addEventListener('blur', () => setTimeout(() => { const b = $('#twCatRes'); if (b) b.style.display = 'none'; }, 200));
  }
  if (kkOn) {
    ACT.loadKick();
    const ksearch = debounce(async (q) => {
      const box = $('#kkCatRes');
      if (!q) { box.style.display = 'none'; return; }
      try {
        const res = await api('/api/kick/categories?q=' + encodeURIComponent(q));
        box.innerHTML = res.map(g => `<div data-act="pickKickCat" data-id="${g.id}" data-name="${esc(g.name)}" data-art="${esc(g.boxArt || '')}"><img src="${esc(g.boxArt || '')}">${esc(g.name)}</div>`).join('') || '<div class="muted">Ничего не найдено</div>';
        box.style.display = '';
      } catch (e) { toast(e.message, true); }
    }, 300);
    $('#kkCatSearch').addEventListener('input', (e) => ksearch(e.target.value.trim()));
    $('#kkCatSearch').addEventListener('blur', () => setTimeout(() => { const b = $('#kkCatRes'); if (b) b.style.display = 'none'; }, 200));
  }
  if (ytOn) {
    ACT.loadYoutube();
    $('#ytTitle').addEventListener('input', () => counter('ytTitle', 'ytCount', 100));
  }
};
function notConnected(name) {
  return `<div class="empty">${ICON.plug}<div>Чтобы менять название и категорию, войдите в аккаунт ${name}</div><div class="small">Для чтения чата вход не нужен — только для управления стримом</div><a class="btn sm" href="#/settings" style="margin-top:10px">Перейти к подключению</a></div>`;
}
function counter(inp, out, max) {
  const n = $('#' + inp).value.length; const el = $('#' + out);
  el.textContent = `${n} / ${max}`; el.classList.toggle('over', n > max);
}
const streamDraft = { twGame: null };
function setTwCat(id, name, art) {
  streamDraft.twGame = id ? { id, name, boxArt: art } : null;
  $('#twCurCat').innerHTML = id ? `${art ? `<img src="${esc(art)}">` : ''}<div><b>${esc(name)}</b><div class="hint">выбранная категория</div></div>` : '<span class="muted">Категория не выбрана</span>';
}
ACT.loadTwitch = async () => {
  try {
    const ch = await api('/api/twitch/channel');
    $('#twTitle').value = ch.title || ''; counter('twTitle', 'twCount', 140);
    setTwCat(ch.gameId, ch.gameName, ch.boxArt);
  } catch (e) { $('#twCurCat').innerHTML = `<span class="tag bad">${esc(e.message)}</span>`; }
};
ACT.pickCat = (el) => { setTwCat(el.dataset.id, el.dataset.name, el.dataset.art); $('#twCatRes').style.display = 'none'; $('#twCatSearch').value = ''; };
ACT.saveTwitch = () => run(async () => {
  await api('/api/twitch/channel', { title: $('#twTitle').value, gameId: streamDraft.twGame?.id });
}, 'Twitch обновлён ✓');
function setKickCat(id, name, art) {
  streamDraft.kkCat = id ? { id, name, boxArt: art } : null;
  $('#kkCurCat').innerHTML = id ? `${art ? `<img src="${esc(art)}">` : ''}<div><b>${esc(name)}</b><div class="hint">выбранная категория</div></div>` : '<span class="muted">Категория не выбрана</span>';
}
ACT.loadKick = async () => {
  try { const ch = await api('/api/kick/channel'); $('#kkTitle').value = ch.title || ''; setKickCat(ch.categoryId, ch.categoryName, ch.thumbnail); }
  catch (e) { $('#kkCurCat').innerHTML = `<span class="tag bad">${esc(e.message)}</span>`; }
};
ACT.pickKickCat = (el) => { setKickCat(el.dataset.id, el.dataset.name, el.dataset.art); $('#kkCatRes').style.display = 'none'; $('#kkCatSearch').value = ''; };
ACT.saveKick = () => run(() => api('/api/kick/channel', { title: $('#kkTitle').value, categoryId: streamDraft.kkCat?.id }), 'Kick обновлён ✓');
ACT.loadYoutube = async () => {
  try {
    const [cats, st] = await Promise.all([api('/api/youtube/categories'), api('/api/youtube/stream')]);
    $('#ytCat').innerHTML = cats.map(c => `<option value="${c.id}" ${c.id === st.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('#ytTitle').value = st.title || ''; counter('ytTitle', 'ytCount', 100);
    $('#ytInfo').innerHTML = `Трансляция: <span class="tag ${st.status === 'active' ? 'live' : ''}">${st.status === 'active' ? 'в эфире' : 'запланирована'}</span>`;
  } catch (e) { $('#ytInfo').innerHTML = `<span class="tag bad">${esc(e.message)}</span>`; }
};
ACT.saveYoutube = () => run(() => api('/api/youtube/stream', { title: $('#ytTitle').value, categoryId: $('#ytCat').value }), 'YouTube обновлён ✓');
ACT.applyBoth = async () => {
  const title = $('#bothTitle').value.trim();
  if (!title) return toast('Введите название', true);
  const jobs = [];
  if (S.status.twitch?.hasToken) jobs.push(api('/api/twitch/channel', { title: title.slice(0, 140) }).then(() => 'Twitch ✓', e => 'Twitch: ' + e.message));
  if (S.status.youtube?.authorized) jobs.push(api('/api/youtube/stream', { title: title.slice(0, 100) }).then(() => 'YouTube ✓', e => 'YouTube: ' + e.message));
  if (S.status.kick?.authorized) jobs.push(api('/api/kick/channel', { title: title.slice(0, 140) }).then(() => 'Kick ✓', e => 'Kick: ' + e.message));
  if (!jobs.length) return toast('Нет подключённых платформ', true);
  const res = await Promise.all(jobs);
  toast(res.join(' · '), res.some(r => r.includes(':')));
  if ($('#twTitle')) $('#twTitle').value = title.slice(0, 140);
  if ($('#ytTitle')) $('#ytTitle').value = title.slice(0, 100);
  if ($('#kkTitle')) $('#kkTitle').value = title.slice(0, 140);
};
function renderPresets() {
  const el = $('#presetList'); if (!el) return;
  el.innerHTML = S.presets.length ? S.presets.map(p => `<div class="item">
    <div class="grow"><div class="t">${raw(p.name)}</div><div class="d">${raw(p.title)}${p.twitchGame ? ' · ' + esc(p.twitchGame.name) : ''}${p.kickCategory ? ' · Kick: ' + esc(p.kickCategory.name) : ''}</div></div>
    <button class="btn sm" data-act="applyPreset" data-id="${p.id}">Применить</button>
    <button class="btn sm ghost danger" data-act="delPreset" data-id="${p.id}">${ICON.trash}</button></div>`).join('')
    : '<div class="muted small">Пресетов нет. Заполните название и категорию и нажмите «Сохранить текущее».</div>';
}
ACT.savePreset = () => {
  const title = $('#twTitle')?.value || $('#kkTitle')?.value || $('#ytTitle')?.value || $('#bothTitle')?.value || '';
  if (!title) return toast('Сначала заполните название', true);
  const name = prompt(I18N.t('Название пресета'), title.slice(0, 40));
  if (!name) return;
  run(async () => { S.presets = await api('/api/presets', { name, title, twitchGame: streamDraft.twGame, kickCategory: streamDraft.kkCat || null, youtubeCategoryId: $('#ytCat')?.value || null }); renderPresets(); }, 'Пресет сохранён');
};
ACT.delPreset = (el) => run(async () => { S.presets = await api('/api/presets?id=' + el.dataset.id, undefined, 'DELETE'); renderPresets(); });
ACT.applyPreset = async (el) => {
  const p = S.presets.find(x => x.id === el.dataset.id); if (!p) return;
  const jobs = [];
  if (S.status.twitch?.hasToken) jobs.push(api('/api/twitch/channel', { title: p.title.slice(0, 140), gameId: p.twitchGame?.id }).then(() => 'Twitch ✓', e => 'Twitch: ' + e.message));
  if (S.status.kick?.authorized) jobs.push(api('/api/kick/channel', { title: p.title.slice(0, 140), categoryId: p.kickCategory?.id }).then(() => 'Kick ✓', e => 'Kick: ' + e.message));
  if (S.status.youtube?.authorized) jobs.push(api('/api/youtube/stream', { title: p.title.slice(0, 100), categoryId: p.youtubeCategoryId || undefined }).then(() => 'YouTube ✓', e => 'YouTube: ' + e.message));
  if (!jobs.length) return toast('Нет подключённых платформ', true);
  const res = await Promise.all(jobs);
  toast(res.join(' · '), res.some(r => r.includes(':')));
  VIEWS.stream();
};

VIEWS.commands = () => {
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Команды</h1><p>Бот отвечает в чат, когда зритель пишет команду</p></div>
    <button class="btn primary" data-act="editCmd">${ICON.plus} Новая команда</button></div>
  <div class="list" id="cmdList"></div>`;
  renderCommands();
};
function renderCommands() {
  const el = $('#cmdList'); if (!el) return;
  el.innerHTML = S.commands.length ? S.commands.map(c => `
    <div class="item">
      <label class="switch"><input type="checkbox" data-toggle-cmd="${c.id}" ${c.enabled ? 'checked' : ''}><i></i></label>
      <div class="grow" style="min-width:0">
        <div class="row"><span class="cmd-trigger">${raw(c.trigger)}</span>${c.aliases.map(a => `<span class="tag">${raw(a)}</span>`).join('')}</div>
        <div class="d">${raw(c.response)}</div>
      </div>
      <span class="tag">${ROLE_NAMES[c.permission]}</span>
      ${c.platform !== 'all' ? `<span class="tag ${PTAG[c.platform]}">${PNAME[c.platform]}</span>` : ''}
      <span class="tag" title="Сколько раз использована">×${c.count}</span>
      <button class="btn sm ghost" data-act="editCmd" data-id="${c.id}">${ICON.edit}</button>
      <button class="btn sm ghost danger" data-act="delCmd" data-id="${c.id}">${ICON.trash}</button>
    </div>`).join('') : `<div class="card empty">${ICON.cmd}<div>Команд пока нет</div></div>`;
  $$('[data-toggle-cmd]', el).forEach(cb => cb.addEventListener('change', () => {
    const c = S.commands.find(x => x.id === cb.dataset.toggleCmd);
    run(() => api('/api/commands', { ...c, enabled: cb.checked }));
  }));
}
const VARS = [
  ['{user}', 'ник автора'], ['{target}', 'первый аргумент или автор'], ['{args}', 'весь текст после команды'],
  ['{random:1-100}', 'случайное число'], [I18N.lang === 'en' ? '{pick:yes|no|maybe}' : '{pick:да|нет|может}', 'случайный вариант'], ['{count}', 'сколько раз вызвана'],
  ['{messages}', 'сообщений у автора'], ['{uptime}', 'время эфира'], ['{game}', 'категория'], ['{title}', 'название'], ['{time}', 'время'],
];
ACT.editCmd = (el) => {
  const c = S.commands.find(x => x.id === el.dataset.id) || { trigger: '!', aliases: [], response: '', permission: 'everyone', cooldown: 5, userCooldown: 0, platform: 'all', enabled: true };
  modal(`<h2>${c.id ? 'Редактировать команду' : 'Новая команда'}</h2>
    <form class="stack" id="cmdForm">
      <div class="grid g2"><label class="f">Команда<input name="trigger" value="${esc(c.trigger)}" placeholder="!дискорд" required></label>
      <label class="f">Синонимы <span class="hint">через запятую</span><input name="aliases" value="${esc(c.aliases.join(', '))}" placeholder="!discord, !дс"></label></div>
      <label class="f">Ответ бота<textarea name="response" required placeholder="Наш Discord: https://…">${raw(c.response)}</textarea></label>
      <div class="vars">${VARS.map(([v, d]) => `<button type="button" title="${esc(d)}" data-var="${esc(v)}">${esc(v)}</button>`).join('')}</div>
      <div class="preview-line small" id="cmdPreview"></div>
      <div class="grid g2">
        <label class="f">Кто может использовать<select name="permission">${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${k === c.permission ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f">Платформа<select name="platform">${[['all', 'Все платформы'], ['twitch', 'Только Twitch'], ['youtube', 'Только YouTube'], ['kick', 'Только Kick']].map(([k, v]) => `<option value="${k}" ${k === c.platform ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f">Общий кулдаун, сек<input name="cooldown" type="number" min="0" value="${c.cooldown}"></label>
        <label class="f">Кулдаун на зрителя, сек<input name="userCooldown" type="number" min="0" value="${c.userCooldown}"></label>
      </div>
      <div class="hint">Модераторы и стример не ограничены кулдаунами.</div>
      <div class="foot"><button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div>
    </form>`, (root) => {
    const f = $('#cmdForm', root);
    const preview = debounce(async () => {
      try { const r = await api('/api/commands/preview', { response: f.response.value }); $('#cmdPreview').innerHTML = `<b style="color:#b9a4ff">Бот:</b> ${esc(r.text) || '<span class="muted">пример ответа</span>'}`; } catch {}
    }, 250);
    preview();
    f.response.addEventListener('input', preview);
    $$('[data-var]', root).forEach(b => b.addEventListener('click', () => {
      const ta = f.response; const pos = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, pos) + b.dataset.var + ta.value.slice(ta.selectionEnd ?? pos); ta.focus(); preview();
    }));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      run(async () => {
        await api('/api/commands', { ...c, trigger: f.trigger.value, aliases: f.aliases.value, response: f.response.value, permission: f.permission.value, platform: f.platform.value, cooldown: f.cooldown.value, userCooldown: f.userCooldown.value });
        closeModal();
      }, 'Команда сохранена');
    });
  });
};
ACT.delCmd = (el) => { if (confirm(I18N.t('Удалить команду?'))) run(() => api('/api/commands?id=' + el.dataset.id, undefined, 'DELETE'), 'Удалено'); };

function pollBars(p) {
  return p.options.map((o, i) => `<div class="bar ${p.status !== 'active' && p.winner === i ? 'win' : ''}"><div class="fill" style="width:${o.pct}%"></div>
    <div class="lbl"><span>${i + 1}. ${esc(o.text)}</span><span>${o.votes} · ${o.pct}%</span></div></div>`).join('');
}
VIEWS.polls = () => {
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Голосования</h1><p>Зрители голосуют, написав номер варианта в чат: <span class="code">1</span> или <span class="code">!голос 1</span></p></div></div>
  <div class="grid g2">
    <div class="card">
      <h2>Новое голосование</h2>
      <form class="stack" id="pollForm">
        <label class="f">Вопрос<input name="question" placeholder="Во что играем дальше?" required maxlength="120"></label>
        <label class="f">Варианты</label>
        <div class="stack" id="pollOpts" style="gap:8px"></div>
        <button type="button" class="btn sm ghost" data-act="addOpt" style="align-self:flex-start">${ICON.plus} Добавить вариант</button>
        <div class="grid g2">
          <label class="f">Длительность<select name="duration">${[[30, '30 секунд'], [60, '1 минута'], [120, '2 минуты'], [300, '5 минут'], [600, '10 минут'], [0, 'Без лимита']].map(([v, l]) => `<option value="${v}" ${v === 60 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="stack" style="justify-content:flex-end;gap:8px">${sw('allowChange', true, 'Можно менять голос')}${sw('announce', true, 'Объявить в чат')}</div>
        </div>
        <button class="btn primary big">${ICON.play} Запустить</button>
      </form>
    </div>
    <div class="stack">
      <div class="card" id="pollLive"></div>
      <div class="card"><h2>История</h2><div class="list" id="pollHist"></div></div>
    </div>
  </div>`;
  ['', ''].forEach(() => ACT.addOpt());
  renderPollLive(); renderPollHist();
  $('#pollForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    run(() => api('/api/poll/start', {
      question: f.question.value, options: $$('#pollOpts input').map(i => i.value),
      duration: Number(f.duration.value), allowChange: f.allowChange.checked, announce: f.announce.checked,
    }), 'Голосование запущено');
  });
};
ACT.addOpt = () => {
  const box = $('#pollOpts'); if (!box) return;
  const n = box.children.length + 1; if (n > 9) return toast('Максимум 9 вариантов', true);
  box.insertAdjacentHTML('beforeend', `<div class="opt-row"><span class="n">${n}</span><input placeholder="Вариант ${n}" maxlength="60"><button type="button" class="btn sm ghost" data-act="delOpt">${ICON.trash}</button></div>`);
};
ACT.delOpt = (el) => {
  const box = $('#pollOpts'); if (box.children.length <= 2) return;
  el.closest('.opt-row').remove();
  $$('.opt-row .n', box).forEach((s, i) => { s.textContent = i + 1; });
};
let pollTick = null;
function renderPollLive() {
  const el = $('#pollLive'); if (!el) return;
  const p = S.poll;
  clearInterval(pollTick);
  if (!p || p.status === 'hidden') { el.innerHTML = `<h2>Сейчас</h2><div class="empty">${ICON.poll}<div>Нет активного голосования</div></div>`; return; }
  el.innerHTML = `<h2>${raw(p.question)} <span class="tag push ${p.status === 'active' ? 'ok' : ''}" id="pollTimer">${p.status === 'active' ? 'идёт' : 'завершено'}</span></h2>
    <div class="stack" style="gap:8px">${pollBars(p)}</div>
    <div class="row" style="margin-top:14px"><span class="muted">Голосов: <b style="color:var(--text)">${p.total}</b></span><span class="grow"></span>
      ${p.status === 'active' ? `<button class="btn" data-act="pollEnd">${ICON.stop} Завершить</button>` : ''}
      <button class="btn ghost danger" data-act="pollCancel">${p.status === 'active' ? 'Отменить' : 'Скрыть'}</button></div>`;
  if (p.status === 'active' && p.endsAt) {
    const tick = () => { const s = Math.max(0, Math.round((p.endsAt - Date.now()) / 1000)); const t = $('#pollTimer'); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    tick(); pollTick = setInterval(tick, 1000);
  }
}
function renderPollHist() {
  const el = $('#pollHist'); if (!el) return;
  el.innerHTML = S.pollHistory.length ? S.pollHistory.map(p => `<div class="item"><div class="grow"><div class="t">${raw(p.question)}</div>
    <div class="d">${p.winner !== null && p.winner !== undefined ? '🏆 ' + esc(p.options[p.winner].text) + ' · ' : ''}${p.total} голосов · ${fmtDate(p.endedAt)}</div></div></div>`).join('')
    : '<div class="muted small">Пока пусто</div>';
}
ACT.pollEnd = () => run(() => api('/api/poll/end', {}));
ACT.pollCancel = () => run(() => api('/api/poll/cancel', {}));

VIEWS.giveaways = () => {
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Розыгрыши</h1><p>Зрители участвуют, написав ключевое слово в чат</p></div></div>
  <div class="grid g2">
    <div class="stack">
      <div class="card" id="gwForm"></div>
      <div class="card"><h2>История</h2><div class="list" id="gwHist"></div></div>
    </div>
    <div class="card" id="gwLive"></div>
  </div>`;
  renderGwForm(); renderGwLive(); renderGwHist();
};
function renderGwForm() {
  const el = $('#gwForm'); if (!el) return;
  const g = S.giveaway;
  if (g) {
    el.innerHTML = `<h2>${ICON.gift.replace('<svg', '<svg width="16"')} ${esc(g.prize)}</h2>
      <div class="stack small">
        <div>Ключевое слово: <span class="code">${raw(g.keyword)}</span></div>
        <div class="muted">Участвуют: ${ROLE_NAMES[g.eligibility]}${g.subLuck > 1 ? ` · удача сабов ×${g.subLuck}` : ''}${g.minMessages ? ` · от ${g.minMessages} сообщений за стрим` : ''}</div>
      </div>
      <div class="row wrap" style="margin-top:16px">
        ${g.status === 'open' ? `<button class="btn" data-act="gwClose">${ICON.stop} Закрыть приём</button>` : ''}
        <button class="btn primary big" data-act="gwDraw" ${g.entries.length && !g.rolling ? '' : 'disabled'}>${ICON.dice} ${g.rolling ? 'Крутится…' : g.winner ? 'Перевыбрать' : 'Выбрать победителя'}</button>
        <button class="btn ghost danger" data-act="gwReset">Завершить розыгрыш</button>
      </div>`;
    return;
  }
  el.innerHTML = `<h2>Новый розыгрыш</h2>
    <form class="stack" id="gwNew">
      <label class="f">Приз<input name="prize" placeholder="Ключ Steam, VIP на месяц…" required maxlength="100"></label>
      <div class="grid g2">
        <label class="f">Ключевое слово<input name="keyword" value="${I18N.lang === 'en' ? '!join' : '!участвую'}" required></label>
        <label class="f">Кто участвует<select name="eligibility">${['everyone', 'sub', 'vip', 'mod'].map(k => `<option value="${k}">${ROLE_NAMES[k]}</option>`).join('')}</select></label>
        <label class="f">Удача сабов: <b id="luckV">×1</b><input type="range" name="subLuck" min="1" max="5" value="1"></label>
        <label class="f">Мин. сообщений за стрим<input type="number" name="minMessages" value="0" min="0"></label>
        <label class="f">Автозакрытие<select name="duration">${[[0, 'Вручную'], [60, 'Через 1 мин'], [180, 'Через 3 мин'], [300, 'Через 5 мин'], [600, 'Через 10 мин']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <div class="stack" style="justify-content:flex-end">${sw('announce', true, 'Объявить в чат')}</div>
      </div>
      <button class="btn primary big">${ICON.play} Начать приём заявок</button>
    </form>`;
  const f = $('#gwNew');
  f.subLuck.addEventListener('input', () => { $('#luckV').textContent = '×' + f.subLuck.value; });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => api('/api/giveaway/open', { prize: f.prize.value, keyword: f.keyword.value, eligibility: f.eligibility.value, subLuck: Number(f.subLuck.value), minMessages: Number(f.minMessages.value), duration: Number(f.duration.value), announce: f.announce.checked }), 'Розыгрыш начат');
  });
}
let rollTimer = null;
function playRoll(roll, nameEl) {
  clearInterval(rollTimer);
  const tick = () => {
    if (!document.body.contains(nameEl)) { clearInterval(rollTimer); return; }
    const t = Date.now() - roll.startAt;
    let f = roll.frames[0];
    for (const fr of roll.frames) { if (fr.at <= t) f = fr; else break; }
    if (nameEl.textContent !== f.name) { nameEl.textContent = f.name; nameEl.style.color = nameColor(f); }
  };
  tick();
  rollTimer = setInterval(tick, 25);
}
function renderGwLive() {
  const el = $('#gwLive'); if (!el) return;
  const g = S.giveaway;
  if (!g) { clearInterval(rollTimer); el.innerHTML = `<h2>Участники</h2><div class="empty">${ICON.gift}<div>Розыгрыш не запущен</div></div>`; return; }
  if (g.rolling && el.dataset.roll === String(g.roll.startAt) && $('#rollName', el)) return;
  el.dataset.roll = g.rolling ? String(g.roll.startAt) : '';
  const top = g.rolling ? `<div class="roll"><div class="name" id="rollName"></div></div><div class="small muted" style="text-align:center;margin-top:6px">Выбираем победителя…</div>`
    : g.winner ? `<div class="winner-card"><div class="muted small">Победитель</div><div class="name">${raw(g.winner.name)}</div>
        <div class="small muted">${PNAME[g.winner.platform] || ''}</div>
        <div class="stack small" style="margin-top:10px;gap:4px;text-align:left">${g.winnerMessages.length ? g.winnerMessages.slice(-5).map(m => `<div>💬 ${esc(m.text)}</div>`).join('') : '<div class="muted" style="text-align:center">Ждём сообщение от победителя…</div>'}</div></div>` : '';
  el.innerHTML = `${top}
    <h2 style="margin-top:${top ? '18px' : 0}">Участники <span class="tag push">${g.entries.length}</span></h2>
    <div class="entries">${g.entries.map(e => `<span class="entry" style="${g.pastWinners.includes(e.name) ? 'opacity:.4' : ''}"><span class="pf ${e.platform}" style="width:14px;height:14px;border-radius:4px;display:inline-grid;place-items:center">${(ICON[e.platform] || '').replace('<svg', '<svg width="8"')}</span><span style="color:${esc(nameColor(e))}">${raw(e.name)}</span>${e.weight > 1 ? `<span class="tag warn">×${e.weight}</span>` : ''}<span class="x" data-act="gwKick" data-key="${esc(e.key)}">✕</span></span>`).join('') || '<span class="muted small">Ждём участников…</span>'}</div>`;
  if (g.rolling) playRoll(g.roll, $('#rollName', el)); else clearInterval(rollTimer);
}
function renderGwHist() {
  const el = $('#gwHist'); if (!el) return;
  el.innerHTML = S.giveawayHistory.length ? S.giveawayHistory.map(h => `<div class="item"><div class="grow"><div class="t">${raw(h.prize)}</div>
    <div class="d">🏆 ${esc(h.winner)} · ${h.entries} участн. · ${fmtDate(h.at)}</div></div></div>`).join('') : '<div class="muted small">Пока пусто</div>';
}
ACT.gwClose = () => run(() => api('/api/giveaway/close', {}));
ACT.gwDraw = () => run(() => api('/api/giveaway/draw', {}));
ACT.gwReset = () => { if (confirm(I18N.t('Завершить розыгрыш?'))) run(() => api('/api/giveaway/reset', {})); };
ACT.gwKick = (el) => run(() => api('/api/giveaway/remove-entry', { key: el.dataset.key }));

VIEWS.badges = () => {
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Значки</h1><p>Свои значки рядом с ником зрителя — в виджете OBS и в чате панели</p></div>
    <button class="btn primary" data-act="editBadge">${ICON.plus} Новый значок</button></div>
  <div id="badgeGrid"></div>`;
  renderBadges();
};
function badgeRuleText(b) {
  const parts = [];
  if (b.rule.type === 'role') parts.push('авто: ' + ROLE_NAMES[b.rule.role]);
  if (b.rule.type === 'messages') parts.push(`авто: от ${b.rule.min} сообщений`);
  if (b.users?.length) parts.push(`вручную: ${b.users.length}`);
  return parts.join(' · ') || 'никому не выдан';
}
function renderBadges() {
  const el = $('#badgeGrid'); if (!el) return;
  el.innerHTML = S.badges.length ? `<div class="badge-grid">${S.badges.map(b => `
    <div class="badge-card" style="${b.enabled ? '' : 'opacity:.5'}">
      <div class="row"><div class="img"><img src="${esc(b.image)}"></div><div class="grow"><div style="font-weight:700">${raw(b.name)}</div><div class="small muted">${badgeRuleText(b)}</div></div></div>
      <div class="preview-line small"><img src="${esc(b.image)}"><b style="color:#a78bfa">Зритель</b>: привет!</div>
      <div class="row"><button class="btn sm grow" data-act="editBadge" data-id="${b.id}">${ICON.edit} Изменить</button><button class="btn sm ghost danger" data-act="delBadge" data-id="${b.id}">${ICON.trash}</button></div>
    </div>`).join('')}</div>`
    : `<div class="card empty">${ICON.badge}<div>Значков пока нет</div><div class="small">Загрузите картинку 18–72 px (PNG, GIF, WEBP, SVG). Анимированные GIF/WEBP тоже работают.</div></div>`;
}
ACT.editBadge = (el) => {
  const b = S.badges.find(x => x.id === el.dataset.id) || { name: '', enabled: true, priority: 0, rule: { type: 'manual', role: 'sub', min: 100 }, users: [] };
  let imageData = null;
  modal(`<h2>${b.id ? 'Редактировать значок' : 'Новый значок'}</h2>
    <form class="stack" id="badgeForm">
      <div class="drop" id="drop"><div class="pv" id="pv">${b.image ? `<img src="${esc(b.image)}">` : ICON.upload}</div>
        <div style="text-align:left"><b>Перетащите картинку сюда</b><div class="hint">или нажмите, чтобы выбрать файл · PNG, GIF, WEBP, SVG до 2 МБ</div></div>
        <input type="file" accept="image/*" id="file" hidden></div>
      <div class="grid g2"><label class="f">Название<input name="name" value="${esc(b.name)}" placeholder="Легенда чата" required></label>
      <label class="f">Приоритет <span class="hint">выше — левее</span><input name="priority" type="number" value="${b.priority}"></label></div>
      <label class="f">Кому показывать<select name="type">
        <option value="manual" ${b.rule.type === 'manual' ? 'selected' : ''}>Только выданным вручную</option>
        <option value="role" ${b.rule.type === 'role' ? 'selected' : ''}>Автоматически по роли</option>
        <option value="messages" ${b.rule.type === 'messages' ? 'selected' : ''}>Автоматически за количество сообщений</option></select></label>
      <label class="f" id="roleF">Роль<select name="role">${['sub', 'vip', 'mod', 'broadcaster'].map(k => `<option value="${k}" ${k === b.rule.role ? 'selected' : ''}>${ROLE_NAMES[k]}</option>`).join('')}</select></label>
      <label class="f" id="minF">Сообщений не меньше<input name="min" type="number" min="1" value="${b.rule.min}"></label>
      <label class="f">Выдан вручную <span class="hint">по одному на строку: <span class="code">ник</span>, <span class="code">twitch:ник</span> или <span class="code">youtube:Имя</span></span>
        <textarea name="users" placeholder="twitch:best_viewer&#10;youtube:Иван Петров">${esc((b.users || []).map(u => u.startsWith('*:') ? u.slice(2) : u).join('\n'))}</textarea></label>
      ${sw('enabled', b.enabled, 'Значок включён')}
      <div class="foot"><button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div>
    </form>`, (root) => {
    const f = $('#badgeForm', root);
    const sync = () => { $('#roleF').style.display = f.type.value === 'role' ? '' : 'none'; $('#minF').style.display = f.type.value === 'messages' ? '' : 'none'; };
    f.type.addEventListener('change', sync); sync();
    const drop = $('#drop'), file = $('#file');
    const take = (fl) => {
      if (!fl || !fl.type.startsWith('image/')) return toast('Это не картинка', true);
      if (fl.size > 2 * 1024 * 1024) return toast('Файл больше 2 МБ', true);
      const r = new FileReader();
      r.onload = () => { imageData = r.result; $('#pv').innerHTML = `<img src="${esc(imageData)}">`; };
      r.readAsDataURL(fl);
    };
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => take(file.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      run(async () => {
        await api('/api/badges', {
          id: b.id, name: f.name.value, priority: Number(f.priority.value), enabled: f.enabled.checked,
          rule: { type: f.type.value, role: f.role.value, min: Number(f.min.value) },
          users: f.users.value.split('\n').map(s => s.trim()).filter(Boolean), image: imageData || undefined,
        });
        closeModal();
      }, 'Значок сохранён');
    });
  });
};
ACT.delBadge = (el) => { if (confirm(I18N.t('Удалить значок?'))) run(() => api('/api/badges?id=' + el.dataset.id, undefined, 'DELETE'), 'Удалено'); };

VIEWS.widgets = () => {
  const o = S.config.overlay;
  const base = location.origin;
  const urls = [
    ['Чат', `${base}/overlay/chat.html`, 'Размер в OBS: 400×600 и больше'],
    ['Голосование', `${base}/overlay/poll.html`, 'Появляется только во время голосования · 500×400'],
    ['Розыгрыш', `${base}/overlay/giveaway.html`, 'Показывает участников и рулетку победителя · 500×400'],
    ['Док-панель', `${base}/dock.html`, 'OBS → Док-панели → Пользовательские док-панели браузера'],
  ];
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Виджеты OBS</h1><p>Добавьте в OBS источник «Браузер» и вставьте ссылку</p></div></div>
  <div class="card" style="margin-bottom:18px"><div class="stack">
    ${urls.map(([n, u, h]) => `<div><div class="row" style="margin-bottom:6px"><b>${n}</b><span class="hint">${h}</span></div>
      <div class="url-box"><input readonly value="${esc(u)}"><button class="btn" data-act="copy" data-v="${esc(u)}">${ICON.copy} Копировать</button><a class="btn ghost" href="${esc(u)}" target="_blank">${ICON.ext}</a></div></div>`).join('')}
  </div></div>
  <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="card">
      <h2>Настройки виджета чата</h2>
      <form class="stack" id="ovForm">
        <label class="f">Стиль${seg('theme', [['glass', 'Стекло'], ['bubble', 'Пузыри'], ['minimal', 'Минимал']], o.theme)}</label>
        <div class="grid g2">
          <label class="f">Размер текста: <b id="fsV">${o.fontSize}px</b><input type="range" name="fontSize" min="12" max="36" value="${o.fontSize}"></label>
          <label class="f">Размер эмоутов: <b id="esV">×${o.emoteScale}</b><input type="range" name="emoteScale" min="1" max="3" step="0.1" value="${o.emoteScale}"></label>
          <label class="f">Шрифт<select name="fontFamily">${['Inter', 'Segoe UI', 'Roboto', 'Montserrat', 'Arial', 'Comic Sans MS', 'Consolas'].map(x => `<option ${x === o.fontFamily ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="f">Анимация<select name="animation">${[['slide', 'Выезд'], ['fade', 'Появление'], ['pop', 'Пружина'], ['none', 'Без анимации']].map(([k, v]) => `<option value="${k}" ${k === o.animation ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="f">Скрывать через, сек <span class="hint">0 — не скрывать</span><input type="number" name="hideAfter" min="0" value="${o.hideAfter}"></label>
          <label class="f">Макс. сообщений<input type="number" name="maxMessages" min="1" max="100" value="${o.maxMessages}"></label>
          <label class="f">Ширина чата, px <span class="hint">0 — по размеру источника</span><input type="number" name="width" min="0" max="3840" step="10" value="${o.width || 0}"></label>
          <label class="f">Высота чата, px <span class="hint">0 — по размеру источника</span><input type="number" name="height" min="0" max="2160" step="10" value="${o.height || 0}"></label>
          <label class="f">Прижать к краю<select name="anchor"><option value="left" ${o.anchor !== 'right' ? 'selected' : ''}>Слева</option><option value="right" ${o.anchor === 'right' ? 'selected' : ''}>Справа</option></select></label>
          <div class="hint" id="sizeHint" style="align-self:end"></div>
          <label class="f">Цвет текста<input type="color" name="textColor" value="${esc(o.textColor)}"></label>
          <label class="f">Акцент<input type="color" name="accent" value="${esc(o.accent)}"></label>
        </div>
        <div class="grid g2">${sw('showPlatform', o.showPlatform, 'Иконка платформы')}${sw('showTwitchBadges', o.showTwitchBadges, 'Значки Twitch')}${sw('showCustomBadges', o.showCustomBadges, 'Свои значки')}${sw('hideCommands', o.hideCommands, 'Скрывать команды (!…)')}${sw('hideVotes', o.hideVotes !== false, 'Скрывать голоса во время опроса')}</div>
        <label class="f">Скрывать сообщения от <span class="hint">ники через запятую</span><input name="hideBots" value="${esc(o.hideBots)}"></label>
      </form>
    </div>
    <div class="card">
      <h2>Предпросмотр <span class="row tag" style="background:none;padding:0"><button class="btn sm" data-act="testOverlay">${ICON.send} Тест</button><button class="btn sm" data-act="testOverlayYt">${ICON.youtube} Тест</button><button class="btn sm" data-act="testOverlayKick">${ICON.kick} Тест</button></span></h2>
      <iframe class="preview-frame" id="ovPreview" src="/overlay/chat.html?history=15"></iframe>
      <div class="hint" style="margin-top:8px">Изменения применяются в OBS сразу, перезагружать источник не нужно.</div>
    </div>
  </div>
  <div class="split" style="grid-template-columns:minmax(0,1fr) 360px;margin-top:18px">
    <div class="card" id="dockCard"></div>
    <div class="card"><h2>Док-панель <a class="btn sm push tag" href="/dock.html" target="_blank" style="margin-left:auto">${ICON.ext}</a></h2>
      <iframe src="/dock.html" style="width:100%;height:520px;border:1px solid var(--line);border-radius:12px;background:#0d0d14"></iframe></div>
  </div>`;
  renderDockCard();
  const f = $('#ovForm');
  const save = debounce(() => {
    const data = {
      theme: $('[data-seg=theme]').dataset.value, fontSize: Number(f.fontSize.value), emoteScale: Number(f.emoteScale.value),
      fontFamily: f.fontFamily.value, animation: f.animation.value, hideAfter: Number(f.hideAfter.value), maxMessages: Number(f.maxMessages.value),
      textColor: f.textColor.value, accent: f.accent.value, showPlatform: f.showPlatform.checked, showTwitchBadges: f.showTwitchBadges.checked,
      showCustomBadges: f.showCustomBadges.checked, hideCommands: f.hideCommands.checked, hideVotes: f.hideVotes.checked, hideBots: f.hideBots.value,
      width: Math.max(0, Number(f.width.value) || 0), height: Math.max(0, Number(f.height.value) || 0), anchor: f.anchor.value,
    };
    api('/api/overlay', data).then(d => { S.config.overlay = d; }).catch(e => toast(e.message, true));
  }, 250);
  const sizeHint = () => {
    const w = Number(f.width.value) || 0, h = Number(f.height.value) || 0;
    $('#sizeHint').textContent = w || h ? `Источник в OBS должен быть не меньше ${w || '…'}×${h || '…'}` : 'Чат занимает весь источник OBS';
  };
  sizeHint();
  f.addEventListener('input', () => { $('#fsV').textContent = f.fontSize.value + 'px'; $('#esV').textContent = '×' + f.emoteScale.value; sizeHint(); save(); });
  f.addEventListener('change', save);
  f.addEventListener('segchange', save);
};
const TEST_LINES = I18N.lang === 'en' ? ['Hi everyone! 👋', 'Love the new overlay', 'GG WP', 'Are those 7TV emotes? catJAM', 'Best stream this week!', 'When is the next stream?', 'lol', 'Kappa'] : ['Привет всем! 👋', 'Какой красивый оверлей', 'GG WP', 'Это что, 7TV эмоуты? catJAM', 'Лучший стрим недели!', 'Когда следующий стрим?', 'ахаха', 'Kappa'];
const TEST_NAMES = ['Пельмень', 'NightOwl', 'Котик_2007', 'xXSniperXx', 'Анна', 'ProGamer', 'Виталик'];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
ACT.testOverlay = () => api('/api/test/message', { name: rnd(TEST_NAMES), text: rnd(TEST_LINES), platform: 'twitch', roles: { sub: Math.random() > .5 } });
ACT.testOverlayKick = () => api('/api/test/message', { name: rnd(TEST_NAMES), text: rnd(TEST_LINES), platform: 'kick' });
ACT.testOverlayYt = () => api('/api/test/message', { name: rnd(TEST_NAMES), text: rnd(TEST_LINES), platform: 'youtube' });
ACT.copy = (el) => { navigator.clipboard.writeText(el.dataset.v).then(() => toast('Скопировано'), () => toast('Не удалось скопировать', true)); };

const ACTION_NAMES = { timeout: 'Мут', ban: 'Бан', delete: 'Удалить', unban: 'Разбан' };
const UNIT_NAMES = { s: 'сек', m: 'мин', h: 'ч', d: 'дн' };
let dockDraft = null;
function renderDockCard() {
  const el = $('#dockCard'); if (!el) return;
  const d = S.config.dock;
  dockDraft = JSON.parse(JSON.stringify(d.modButtons));
  const tw = S.status.twitch || {};
  el.innerHTML = `<h2>Док-панель OBS</h2>
    <ol class="steps" style="margin-bottom:14px">
      <li>В OBS: <b>Док-панели → Пользовательские док-панели браузера</b></li>
      <li>Название — любое, адрес — <span class="code">${location.origin}/dock.html</span> <button class="btn sm ghost" data-act="copy" data-v="${location.origin}/dock.html">${ICON.copy}</button></li>
    </ol>
    <form class="stack" id="dockForm">
      <div class="grid g2">
        <label class="f">Размер текста: <b id="dfsV">${d.fontSize}px</b><input type="range" name="fontSize" min="10" max="20" value="${d.fontSize}"></label>
        <label class="f">Кнопки модерации<select name="buttonsMode"><option value="hover" ${d.buttonsMode !== 'always' ? 'selected' : ''}>При наведении на сообщение</option><option value="always" ${d.buttonsMode === 'always' ? 'selected' : ''}>Всегда видны</option></select></label>
      </div>
      <div class="row wrap" style="gap:18px">${sw('showViewers', d.showViewers, 'Счётчик зрителей')}${sw('showTime', d.showTime, 'Время')}${sw('showBadges', d.showBadges, 'Значки')}</div>
    </form>
    <h3>Кнопки модерации Twitch и Kick</h3>
    ${!tw.hasToken && !S.status.kick?.authorized ? `<div class="tag warn" style="white-space:normal;margin-bottom:10px">Кнопки появятся после входа в аккаунт Twitch или Kick (стримера или модератора канала)</div>`
      : tw.needsRelogin ? `<div class="tag warn" style="white-space:normal;margin-bottom:10px">Нужны права модерации: выйдите и войдите в Twitch заново во вкладке «Подключения»</div>` : ''}
    <div class="stack" id="modList" style="gap:8px"></div>
    <div class="row" style="margin-top:10px">
      <button class="btn sm" data-act="addMod">${ICON.plus} Добавить кнопку</button><span class="grow"></span>
      <button class="btn primary" data-act="saveMods">Сохранить кнопки</button>
    </div>
    <div class="hint" style="margin-top:8px">Бан требует подтверждения — второго нажатия. Кнопки работают и в чате приложения. Максимальный мут: Twitch — 14 дней, Kick — 7 дней (на Kick время округляется до минут).</div>`;
  renderModList();
  const f = $('#dockForm');
  const save = debounce(() => api('/api/dock', {
    fontSize: Number(f.fontSize.value), buttonsMode: f.buttonsMode.value,
    showViewers: f.showViewers.checked, showTime: f.showTime.checked, showBadges: f.showBadges.checked,
  }).then(r => { S.config.dock = { ...r, modButtons: S.config.dock.modButtons }; }).catch(e => toast(e.message, true)), 250);
  f.addEventListener('input', () => { $('#dfsV').textContent = f.fontSize.value + 'px'; save(); });
  f.addEventListener('change', save);
}
function renderModList() {
  const el = $('#modList'); if (!el) return;
  const vis = (on) => on ? '' : 'visibility:hidden';
  el.innerHTML = dockDraft.map((b, i) => `<div class="mod-row" data-i="${i}">
      <input data-k="label" value="${esc(b.label)}" placeholder="Текст кнопки" maxlength="24">
      <select data-k="action">${Object.entries(ACTION_NAMES).map(([k, v]) => `<option value="${k}" ${k === b.action ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input data-k="amount" type="number" min="1" value="${b.amount || 1}" style="${vis(b.action === 'timeout')}">
      <select data-k="unit" style="${vis(b.action === 'timeout')}">${Object.entries(UNIT_NAMES).map(([k, v]) => `<option value="${k}" ${k === b.unit ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input data-k="reason" value="${esc(b.reason || '')}" placeholder="Причина" style="${vis(b.action === 'ban' || b.action === 'timeout')}">
      <button class="btn sm ghost" data-act="moveMod" data-i="${i}" title="Выше" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn sm ghost danger" data-act="delMod" data-i="${i}">${ICON.trash}</button>
    </div>`).join('') || '<div class="muted small">Кнопок нет</div>';
  $$('#modList [data-k]').forEach(inp => {
    const upd = () => {
      const i = Number(inp.closest('[data-i]').dataset.i);
      dockDraft[i][inp.dataset.k] = inp.dataset.k === 'amount' ? Number(inp.value) : inp.value;
      if (inp.dataset.k === 'action') {
        const b = dockDraft[i];
        if (/^(Мут|Бан|Удалить|Разбан|Кнопка|Timeout|Ban|Delete|Unban|Button)/.test(b.label) || !b.label) b.label = autoLabel(b);
        renderModList();
      }
      if (inp.dataset.k === 'amount' || inp.dataset.k === 'unit') {
        const b = dockDraft[i];
        if (/^(Мут|Timeout)/.test(b.label)) { b.label = autoLabel(b); const li = $(`#modList [data-i="${i}"] [data-k=label]`); if (li) li.value = b.label; }
      }
    };
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', upd);
  });
}
function autoLabel(b) {
  if (I18N.lang === 'en') {
    if (b.action === 'timeout') return `Timeout ${b.amount || 1} ${{ s: 'sec', m: 'min', h: 'h', d: 'd' }[b.unit] || 'min'}`;
    return { ban: 'Ban', delete: 'Delete', unban: 'Unban' }[b.action];
  }
  if (b.action === 'timeout') return `Мут ${b.amount || 1} ${UNIT_NAMES[b.unit] || 'мин'}`;
  return { ban: 'Бан', delete: 'Удалить', unban: 'Разбан' }[b.action];
}
ACT.addMod = () => { const b = { id: 'm' + Date.now(), action: 'timeout', amount: 5, unit: 'm', reason: '' }; b.label = autoLabel(b); dockDraft.push(b); renderModList(); };
ACT.delMod = (el) => { dockDraft.splice(Number(el.dataset.i), 1); renderModList(); };
ACT.moveMod = (el) => { const i = Number(el.dataset.i); if (i > 0) { [dockDraft[i - 1], dockDraft[i]] = [dockDraft[i], dockDraft[i - 1]]; renderModList(); } };
ACT.saveMods = () => run(async () => { const r = await api('/api/dock', { modButtons: dockDraft }); S.config.dock = r; dockDraft = JSON.parse(JSON.stringify(r.modButtons)); renderModList(); }, 'Кнопки сохранены');

function modButtonsHTML(m) {
  const st = S.status[m.platform] || {};
  if (!['twitch', 'kick'].includes(m.platform) || !st.canModerate || m.self || m.test || m.user.roles?.broadcaster) return '';
  return (S.config.dock?.modButtons || []).map(b => `<button data-act="modAction" data-mod="${esc(b.id)}" data-msg="${esc(m.id)}" style="${b.action === 'ban' ? 'color:var(--bad)' : b.action === 'timeout' ? 'color:var(--warn)' : ''}">${esc(b.label)}</button>`).join('');
}
const modPending = new Map();
ACT.modAction = async (el) => {
  const b = (S.config.dock?.modButtons || []).find(x => x.id === el.dataset.mod);
  const m = S.history.find(x => x.id === el.dataset.msg);
  if (!b || !m) return;
  if (b.action === 'ban') {
    const key = m.id + b.id;
    if (!modPending.has(key)) {
      const old = el.textContent; el.textContent = 'Точно?'; el.style.background = '#b91c1c'; el.style.color = '#fff';
      modPending.set(key, setTimeout(() => { el.textContent = old; el.style.background = ''; el.style.color = 'var(--bad)'; modPending.delete(key); }, 3000));
      return;
    }
    clearTimeout(modPending.get(key)); modPending.delete(key);
  }
  run(() => api('/api/mod', { platform: m.platform, action: b.action, userId: m.user.id, messageId: m.id, amount: b.amount, unit: b.unit, reason: b.reason }),
    `${b.label}: ${m.user.name}`);
};

VIEWS.settings = () => {
  const c = S.config, tw = S.status.twitch || {}, yt = S.status.youtube || {};
  const twRedirect = `http://localhost:${c.port}/auth/twitch`;
  const ytRedirect = `http://127.0.0.1:${c.port}/auth/youtube/callback`;
  const kk = S.status.kick || {};
  const kkRedirect = `http://localhost:${c.port}/auth/kick/callback`;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Подключения</h1><p>Чтобы читать чат Twitch, YouTube или Kick, достаточно указать ник канала. Вход в аккаунт нужен только боту</p></div></div>
  <div class="grid g2">
    <div class="card">
      <h2><span class="tag tw">${ICON.twitch.replace('<svg', '<svg width="13" height="13"')} Twitch</span>
        ${tw.readOnly && tw.state === 'connected' ? '<span class="tag">только чтение</span>' : ''}
        <span class="tag push ${tw.state === 'connected' ? 'ok' : tw.state === 'error' ? 'bad' : ''}">${STATE_NAMES[tw.state] || 'отключено'}</span></h2>
      ${tw.error ? `<div class="tag bad" style="margin-bottom:12px;white-space:normal">${esc(tw.error)}</div>` : ''}
      <div class="stack">
        <label class="f">Канал <span class="hint">ник стримера — вход в аккаунт не нужен</span>
          <form class="row" id="twChanForm"><input id="twChannel" value="${esc(tw.channel || '')}" placeholder="например, buster" autocomplete="off">
          ${tw.state && tw.state !== 'disconnected' && tw.channel
            ? `<button class="btn" type="submit">Сменить</button><button class="btn ghost" type="button" data-act="twDisconnect" title="Отключить">${ICON.stop} Отключить</button>`
            : `<button class="btn twitch" type="submit">${ICON.play} Подключить</button>`}</form></label>
      </div>
      <div class="sep"></div>
      <h3 style="margin-top:0">Аккаунт <span style="text-transform:none;letter-spacing:0;font-weight:400">— необязательно</span></h3>
      ${tw.hasToken ? `<div class="item"><div class="avatar" style="width:38px;height:38px;font-size:16px;background:var(--twitch)">${esc((tw.login || '?')[0].toUpperCase())}</div>
            <div class="grow"><div class="t">${raw(tw.login)}</div><div class="d">${tw.needsRelogin ? '<span style="color:var(--warn)">войдите заново, чтобы включить кнопки модерации</span>' : 'бот пишет в чат, модерация, название и категория'}</div></div>
            <button class="btn sm ghost danger" data-act="twLogout">Выйти</button></div>`
        : `<div class="hint" style="margin-bottom:10px">Войдите, если нужно, чтобы бот отвечал на команды и объявлял голосования, и чтобы менять название и категорию стрима. Без входа чат только читается.</div>
        <details><summary class="btn sm">Войти через Twitch…</summary><div class="stack" style="margin-top:12px">
          <ol class="steps">
            <li>Откройте <a href="https://dev.twitch.tv/console/apps/create" target="_blank">dev.twitch.tv → Register Your Application</a></li>
            <li>OAuth Redirect URL: <span class="code">${twRedirect}</span> <button class="btn sm ghost" data-act="copy" data-v="${twRedirect}">${ICON.copy}</button></li>
            <li>Category: <i>Chat Bot</i>, Client Type: <i>Public</i> → Create</li>
            <li>Скопируйте <b>Client ID</b> сюда и нажмите «Войти»</li>
          </ol>
          <label class="f">Client ID<input id="twClientId" value="${esc(c.twitch.clientId)}" placeholder="abcd1234…"></label>
          <button class="btn twitch" data-act="twLogin">${ICON.twitch} Войти через Twitch</button>
        </div></details>`}
    </div>
    <div class="card">
      <h2><span class="tag yt">${ICON.youtube.replace('<svg', '<svg width="13" height="13"')} YouTube</span>
        ${yt.readOnly ? '<span class="tag">только чтение</span>' : ''}
        <span class="tag push ${yt.state === 'connected' ? 'ok' : yt.state === 'error' ? 'bad' : yt.state === 'waiting' ? 'warn' : ''}">${STATE_NAMES[yt.state] || 'отключено'}</span></h2>
      ${yt.error ? `<div class="tag ${yt.state === 'waiting' ? 'warn' : 'bad'}" style="margin-bottom:12px;white-space:normal">${esc(yt.error)}</div>` : ''}
      <div class="stack">
        <label class="f">Канал <span class="hint">@ник, ссылка на канал или на трансляцию</span>
          <form class="row" id="ytChanForm"><input id="ytChannel" value="${esc(yt.target || '')}" placeholder="@ник" autocomplete="off">
          ${yt.state && yt.state !== 'disconnected' && yt.target
            ? `<button class="btn" type="submit">Сменить</button><button class="btn ghost" type="button" data-act="ytDisconnect" title="Отключить">${ICON.stop} Отключить</button>`
            : `<button class="btn youtube" type="submit">${ICON.play} Подключить</button>`}</form></label>
        ${yt.channelName || yt.broadcastTitle ? `<div class="small muted">${yt.channelName ? `Канал: <b style="color:var(--text)">${raw(yt.channelName)}</b>` : ''}${yt.broadcastTitle ? ` · Эфир: ${esc(yt.broadcastTitle)}` : ''}</div>` : ''}
        <div class="hint">Чат читается напрямую, без ключей и без расхода квоты YouTube API. Если канал не в эфире, программа подключится сама, когда начнётся стрим.</div>
      </div>
      <div class="sep"></div>
      <h3 style="margin-top:0">Аккаунт <span style="text-transform:none;letter-spacing:0;font-weight:400">— необязательно</span></h3>
      ${yt.authorized ? `<div class="item"><div class="avatar" style="width:38px;height:38px;font-size:16px;background:var(--youtube)">${esc((yt.channelTitle || '?')[0].toUpperCase())}</div>
            <div class="grow"><div class="t">${esc(yt.channelTitle || 'Канал')}</div><div class="d">бот пишет в чат, можно менять название и категорию</div></div>
            <button class="btn sm ghost danger" data-act="ytLogout">Выйти</button></div>`
        : `<div class="hint" style="margin-bottom:10px">Нужен, чтобы бот писал в чат и чтобы менять название и категорию трансляции.</div>
        <details><summary class="btn sm">Войти через Google…</summary><div class="stack" style="margin-top:12px">
          <ol class="steps">
            <li>Создайте проект в <a href="https://console.cloud.google.com/projectcreate" target="_blank">Google Cloud Console</a></li>
            <li>Включите <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank">YouTube Data API v3</a></li>
            <li>Настройте OAuth consent screen (External), добавьте себя в Test users</li>
            <li>Credentials → Create OAuth client ID → тип <b>Desktop app</b></li>
            <li>Вставьте Client ID и Client Secret ниже</li>
          </ol>
          <label class="f">Client ID<input id="ytClientId" value="${esc(c.youtube.clientId)}" placeholder="…apps.googleusercontent.com"></label>
          <label class="f">Client Secret<input id="ytSecret" type="password" placeholder="${c.youtube.hasSecret ? '•••••••• (сохранён)' : 'GOCSPX-…'}"></label>
          <button class="btn youtube" data-act="ytLogin">${ICON.youtube} Войти через Google</button>
        </div></details>`}
    </div>
    <div class="card">
      <h2><span class="tag kk">${ICON.kick.replace('<svg', '<svg width="13" height="13"')} Kick</span>
        ${kk.readOnly && kk.state === 'connected' ? '<span class="tag">только чтение</span>' : ''}
        <span class="tag push ${kk.state === 'connected' ? 'ok' : kk.state === 'error' ? 'bad' : ''}">${STATE_NAMES[kk.state] || 'отключено'}</span></h2>
      ${kk.error ? `<div class="tag bad" style="margin-bottom:12px;white-space:normal">${esc(kk.error)}</div>` : ''}
      <div class="stack">
        <label class="f">Канал <span class="hint">ник стримера — вход в аккаунт не нужен</span>
          <form class="row" id="kkChanForm"><input id="kkChannel" value="${esc(kk.channel || '')}" placeholder="например, xqc" autocomplete="off">
          ${kk.state && kk.state !== 'disconnected' && kk.channel
            ? `<button class="btn" type="submit">Сменить</button><button class="btn ghost" type="button" data-act="kkDisconnect">${ICON.stop} Отключить</button>`
            : `<button class="btn kick" type="submit">${ICON.play} Подключить</button>`}</form></label>
        <details ${c.kick.chatroomId || /Cloudflare/.test(kk.error || '') ? 'open' : ''}><summary class="btn sm ghost">Не подключается? ID чата вручную</summary>
          <div class="stack" style="margin-top:10px">
            <div class="hint">Kick иногда блокирует автоматический поиск чата. Откройте в браузере <a href="https://kick.com/api/v2/channels/${esc(kk.channel || 'ник')}" target="_blank">kick.com/api/v2/channels/${esc(kk.channel || 'ник')}</a>, найдите <span class="code">"chatroom":{"id":</span> и вставьте число сюда.</div>
            <form class="row" id="kkRoomForm"><input id="kkRoom" value="${esc(c.kick.chatroomId || '')}" placeholder="например, 668" inputmode="numeric"><button class="btn" type="submit">Сохранить</button></form>
          </div></details>
      </div>
      <div class="sep"></div>
      <h3 style="margin-top:0">Аккаунт <span style="text-transform:none;letter-spacing:0;font-weight:400">— необязательно</span></h3>
      ${kk.authorized ? `<div class="item"><div class="avatar" style="width:38px;height:38px;font-size:16px;background:var(--kick);color:#0b0b0b">${esc((kk.login || '?')[0].toUpperCase())}</div>
            <div class="grow"><div class="t">${esc(kk.login || 'Kick')}</div><div class="d">${kk.needsRelogin ? '<span style="color:var(--warn)">войдите заново, чтобы выдать все права</span>' : 'бот пишет в чат, модерация, название и категория'}</div></div>
            <button class="btn sm ghost danger" data-act="kkLogout">Выйти</button></div>`
        : `<div class="hint" style="margin-bottom:10px">Нужен, чтобы бот писал в чат, для кнопок модерации и чтобы менять название и категорию.</div>
        <details><summary class="btn sm">Войти через Kick…</summary><div class="stack" style="margin-top:12px">
          <ol class="steps">
            <li>Откройте <a href="https://kick.com/settings/developer" target="_blank">kick.com → Настройки → Developer</a> и создайте приложение</li>
            <li>Redirect URL: <span class="code">${kkRedirect}</span> <button class="btn sm ghost" data-act="copy" data-v="${kkRedirect}">${ICON.copy}</button></li>
            <li>Отметьте права: чтение пользователя и канала, запись канала, отправка в чат, модерация (баны и удаление сообщений)</li>
            <li>Вставьте Client ID и Client Secret ниже</li>
          </ol>
          <label class="f">Client ID<input id="kkClientId" value="${esc(c.kick.clientId)}"></label>
          <label class="f">Client Secret<input id="kkSecret" type="password" placeholder="${c.kick.hasSecret ? '•••••••• (сохранён)' : ''}"></label>
          <button class="btn kick" data-act="kkLogin">${ICON.kick} Войти через Kick</button>
        </div></details>`}
    </div>
    <div class="card">
      <h2>Эмоуты <span class="tag push">${S.emotes.total || 0} загружено</span></h2>
      <div class="stack">
        ${sw('seventv', c.emotes.seventv, '<b>7TV</b> — глобальные и эмоуты канала')}
        ${sw('bttv', c.emotes.bttv, 'BetterTTV')}
        ${sw('ffz', c.emotes.ffz, 'FrankerFaceZ')}
        <div class="small muted">7TV: ${S.emotes.seventv || 0} · BTTV: ${S.emotes.bttv || 0} · FFZ: ${S.emotes.ffz || 0}${S.emotes.loadedAt ? ' · обновлено ' + fmtTime(S.emotes.loadedAt) : ''}</div>
        ${(S.emotes.errors || []).length ? `<div class="small" style="color:var(--warn)">${S.emotes.errors.map(esc).join('<br>')}</div>` : ''}
        <div class="row"><button class="btn" data-act="reloadEmotes">${ICON.refresh} Обновить эмоуты</button><button class="btn ghost" data-act="showEmotes">Показать</button></div>
        <div class="hint">Эмоуты 7TV подтягиваются для каналов Twitch, YouTube и Kick, если они привязаны к 7TV. Эмоуты самого Kick показываются всегда.</div>
      </div>
    </div>
    <div class="card">
      <h2>Бот</h2>
      <div class="stack">
        ${sw('announcePolls', c.chat.announcePolls, 'Объявлять голосования и итоги в чат')}
        ${sw('announceGiveaways', c.chat.announceGiveaways, 'Объявлять розыгрыши и победителей в чат')}
        <div class="hint">Бот пишет в чат только там, где вы вошли в аккаунт; без входа ответы видны лишь в панели. Данные хранятся локально в папке <span class="code">data</span>.</div>
      </div>
    </div>
    ${c.electron ? `<div class="card">
      <h2>Программа</h2>
      <div class="stack">
        <label class="f">При закрытии окна<select id="closeAction">
          <option value="ask" ${c.closeAction === 'ask' ? 'selected' : ''}>Спрашивать каждый раз</option>
          <option value="tray" ${c.closeAction === 'tray' ? 'selected' : ''}>Сворачивать в трей</option>
          <option value="quit" ${c.closeAction === 'quit' ? 'selected' : ''}>Закрывать программу</option>
        </select></label>
        <div class="hint">В трее StreamNest продолжает работать: чат, бот, виджеты OBS и док-панель остаются активными. Открыть окно — щелчок по значку в трее.</div>
      </div>
    </div>` : ''}
  </div>`;
  $('#closeAction')?.addEventListener('change', (e) => run(async () => { S.config = await api('/api/app', { closeAction: e.target.value }); }, 'Сохранено'));
  $$('[name=seventv],[name=bttv],[name=ffz]').forEach(cb => cb.addEventListener('change', () =>
    run(async () => { await api('/api/settings', { emotes: { [cb.name]: cb.checked } }); S.config.emotes[cb.name] = cb.checked; await api('/api/emotes/reload', {}); })));
  $$('[name=announcePolls],[name=announceGiveaways]').forEach(cb => cb.addEventListener('change', () =>
    run(async () => { const d = await api('/api/settings', { chat: { [cb.name]: cb.checked } }); S.config = d; })));
  $('#twChanForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ch = $('#twChannel').value.trim().replace(/^.*twitch\.tv\//i, '').replace(/[/?#].*$/, '').replace(/^[@#]/, '');
    if (!ch) return toast('Введите ник канала', true);
    run(() => api('/api/twitch/config', { channel: ch }), 'Подключаюсь к ' + ch + '…');
  });
  $('#kkChanForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ch = $('#kkChannel').value.trim();
    if (!ch) return toast('Введите ник канала', true);
    run(() => api('/api/kick/config', { channel: ch }), 'Подключаюсь к Kick…');
  });
  $('#kkRoomForm').addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => { S.config = await api('/api/kick/config', { chatroomId: $('#kkRoom').value }); if (S.status.kick?.channel) await api('/api/kick/connect', {}); }, 'ID чата сохранён');
  });
  $('#ytChanForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ch = $('#ytChannel').value.trim();
    if (!ch) return toast('Введите @ник или ссылку', true);
    run(() => api('/api/youtube/config', { channel: ch }), 'Ищу трансляцию…');
  });
};
ACT.twLogin = () => run(async () => {
  const id = $('#twClientId').value.trim();
  if (!id) throw new Error('Вставьте Client ID');
  await api('/api/twitch/config', { clientId: id });
  const { url } = await api('/api/twitch/auth-url');
  location.href = url;
});
ACT.twLogout = () => run(() => api('/api/twitch/logout', {}), 'Вы вышли из Twitch');
ACT.twReconnect = () => run(() => api('/api/twitch/connect', {}));
ACT.twDisconnect = () => run(() => api('/api/twitch/disconnect', {}));
ACT.ytLogin = () => run(async () => {
  const clientId = $('#ytClientId').value.trim(), clientSecret = $('#ytSecret').value.trim();
  if (!clientId) throw new Error('Вставьте Client ID');
  if (!clientSecret && !S.config.youtube.hasSecret) throw new Error('Вставьте Client Secret');
  await api('/api/youtube/config', { clientId, clientSecret });
  location.href = '/auth/youtube';
});
ACT.kkDisconnect = () => run(() => api('/api/kick/disconnect', {}));
ACT.kkLogout = () => run(() => api('/api/kick/logout', {}), 'Вы вышли из Kick');
ACT.kkLogin = () => run(async () => {
  const clientId = $('#kkClientId').value.trim(), clientSecret = $('#kkSecret').value.trim();
  if (!clientId) throw new Error('Вставьте Client ID');
  if (!clientSecret && !S.config.kick.hasSecret) throw new Error('Вставьте Client Secret');
  await api('/api/kick/config', { clientId, clientSecret });
  location.href = '/auth/kick';
});
ACT.ytConnect = () => run(() => api('/api/youtube/connect', {}));
ACT.ytDisconnect = () => run(() => api('/api/youtube/disconnect', {}));
ACT.ytLogout = () => run(() => api('/api/youtube/logout', {}), 'Вы вышли из YouTube');
ACT.reloadEmotes = () => run(() => api('/api/emotes/reload', {}), 'Эмоуты обновлены');
ACT.showEmotes = async () => {
  const d = await api('/api/emotes');
  modal(`<h2>Эмоуты (${d.stats.total || 0})</h2>
    <input id="emSearch" placeholder="Поиск…" style="margin-bottom:12px">
    <div id="emList" style="display:flex;flex-wrap:wrap;gap:10px;max-height:55vh;overflow:auto"></div>
    <div class="foot"><button class="btn" data-act="closeModal">Закрыть</button></div>`, () => {
    const draw = (q) => { $('#emList').innerHTML = d.list.filter(e => !q || e.name.toLowerCase().includes(q)).slice(0, 300).map(e => `<div title="${esc(e.name)} · ${e.provider}" style="text-align:center;width:72px"><img src="${esc(e.url)}" style="height:32px" loading="lazy"><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${raw(e.name)}</div></div>`).join('') || '<div class="muted">Пусто</div>'; };
    draw('');
    $('#emSearch').addEventListener('input', (e) => draw(e.target.value.toLowerCase()));
  });
};

function connectEvents() {
  const es = new EventSource('/events');
  es.addEventListener('history', (e) => { S.history = JSON.parse(e.data); if (S.page === 'chat') { renderFeed(); renderSession(); } });
  es.addEventListener('chat', (e) => {
    const m = JSON.parse(e.data);
    S.history.push(m); if (S.history.length > 400) S.history.shift();
    if (S.page === 'chat') { appendMsg(m); renderSession(); }
  });
  es.addEventListener('chat-remove', (e) => {
    const d = JSON.parse(e.data);
    S.history = S.history.filter(m => !(m.platform === d.platform && ((d.messageId && m.id === d.messageId) || (d.userId && m.user.id === d.userId))));
    $$('#feed .msg').forEach(el => {
      if (el.dataset.p === d.platform && ((d.messageId && el.dataset.id === d.messageId) || (d.userId && el.dataset.u === d.userId))) el.style.opacity = .35, el.style.textDecoration = 'line-through';
    });
  });
  es.addEventListener('status', (e) => {
    Object.assign(S.status, JSON.parse(e.data));
    renderSide(); renderStreamCard(); rerenderSettings();
  });
  es.addEventListener('poll', (e) => {
    const prev = S.poll?.status;
    S.poll = JSON.parse(e.data);
    if (S.poll?.status === 'ended' && prev === 'active') api('/api/state').then(st => { S.pollHistory = st.pollHistory; renderPollHist(); });
    renderNav(); renderPollLive(); renderMiniPoll();
  });
  es.addEventListener('giveaway', (e) => {
    const prev = S.giveaway;
    S.giveaway = JSON.parse(e.data);
    const statusChanged = (prev?.status) !== (S.giveaway?.status) || !!prev !== !!S.giveaway || prev?.winner?.key !== S.giveaway?.winner?.key || !!prev?.rolling !== !!S.giveaway?.rolling;
    if (statusChanged) { renderGwForm(); api('/api/state').then(st => { S.giveawayHistory = st.giveawayHistory; renderGwHist(); }); }
    else if (S.giveaway && $('#gwForm [data-act=gwDraw]')) $('#gwForm [data-act=gwDraw]').disabled = !S.giveaway.entries.length;
    renderNav(); renderGwLive(); renderMiniGw();
  });
  es.addEventListener('lang', (e) => { const l = JSON.parse(e.data).lang; if (S.config?.lang && l !== I18N.lang) location.reload(); });
  es.addEventListener('dock-config', (e) => { if (S.config) S.config.dock = JSON.parse(e.data); });
  es.addEventListener('commands', (e) => { S.commands = JSON.parse(e.data); renderCommands(); });
  es.addEventListener('badges', (e) => { S.badges = JSON.parse(e.data); renderBadges(); });
  es.addEventListener('emotes', (e) => { S.emotes = JSON.parse(e.data); if (S.page === 'settings') VIEWS.settings(); });
  let wasDown = false;
  es.onerror = () => { if (!wasDown) { wasDown = true; toast('Нет связи с сервером StreamNest — переподключаюсь…', true); } };
  es.onopen = () => { if (wasDown) { wasDown = false; toast('Связь восстановлена'); refreshState(); } };
}

async function refreshState() {
  const st = await api('/api/state');
  Object.assign(S, st);
  renderSide(); route();
}
const rerenderSettings = debounce(() => { if (S.page === 'settings' && !document.activeElement?.matches('input') && !$('details[open]')) VIEWS.settings(); }, 300);
setInterval(() => {   if (S.page === 'chat') renderStreamCard(); }, 60000);

(async function boot() {
  try { await refreshState(); } catch (e) { $('#view').innerHTML = `<div class="empty">Сервер недоступен: ${esc(e.message)}</div>`; }
  connectEvents();
  if (S.config && !S.config.lang) showLangPicker();
})();
