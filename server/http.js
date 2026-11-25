async function request(url, { method = 'GET', headers = {}, body, form, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const opts = { method, headers: { ...headers }, signal: ctrl.signal };
  if (form) {
    opts.body = new URLSearchParams(form).toString();
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error?.message || data.error_description || data.error)) || res.statusText;
      const err = new Error(`${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  } finally { clearTimeout(t); }
}

module.exports = { request };
