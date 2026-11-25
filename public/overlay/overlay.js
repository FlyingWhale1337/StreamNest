const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);

const PLATFORM_ICON = {
  kick: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v5h2V5h2V3h7v7h-2v1h-2v2h2v1h2v7h-7v-2h-2v-3h-2v5H3z"/></svg>',
  twitch: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.3 2 3 5.4v13.4h4.6V22h2.6l3.1-3.2h3.7L22 13.9V2zm16 11.1-2.9 2.9h-4.6l-2.5 2.5V16H6.4V3.7h13.9z"/><path d="M15.9 7h1.7v5h-1.7zm-4.6 0H13v5h-1.7z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15V9l5.8 3z"/></svg>',
};

function nameColor(u) {
  if (u.color && /^#[0-9a-f]{3,8}$/i.test(u.color)) return u.color;
  let h = 7; for (const ch of String(u.name)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  h %= 360;
  return `hsl(${h} 75% 70%)`;
}

function connect(handlers) {
  const q = new URLSearchParams({ client: 'overlay' });
  if (params.has('history')) q.set('history', params.get('history'));
  const es = new EventSource('/events?' + q);
  for (const [type, fn] of Object.entries(handlers)) es.addEventListener(type, (e) => fn(JSON.parse(e.data)));
  es.addEventListener('lang', (e) => { if (JSON.parse(e.data).lang !== (window.STREAMNEST_LANG || 'ru')) location.reload(); });
  return es;
}
