// Small client for the server API, shared by the guest app and the admin panel.

const GUEST_KEY = 'kb.guestToken';
const ADMIN_KEY = 'kb.adminToken';

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode – the session just won't be remembered */
  }
}

export const guestToken = {
  get: () => readStorage(GUEST_KEY),
  set: (v) => writeStorage(GUEST_KEY, v),
};

export const adminToken = {
  get: () => readStorage(ADMIN_KEY),
  set: (v) => writeStorage(ADMIN_KEY, v),
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { body, method = body ? 'POST' : 'GET', admin = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  const guest = guestToken.get();
  if (guest) headers['X-Guest-Token'] = guest;
  if (admin) headers['X-Admin-Token'] = adminToken.get() ?? '';

  const res = await fetch(path, { method, headers, body: body && JSON.stringify(body) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Noe gikk galt');
  return data;
}

/**
 * Subscribes to live updates. Handlers: { state(state), points(events), connection(isOnline) }.
 * EventSource reconnects by itself; we just report the status.
 */
export function subscribe(handlers) {
  const source = new EventSource('/api/events');
  source.addEventListener('state', (e) => handlers.state?.(JSON.parse(e.data)));
  source.addEventListener('points', (e) => handlers.points?.(JSON.parse(e.data)));
  source.addEventListener('open', () => handlers.connection?.(true));
  source.addEventListener('error', () => handlers.connection?.(false));
  return () => source.close();
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Runs a DOM update inside a View Transition when the browser supports it. */
export function transition(update) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return Promise.resolve();
  }
  return document.startViewTransition(update).finished.catch(() => {});
}

/** Animates a number from its current value to `to`. */
export function countTo(el, to, duration = 900) {
  const from = Number(el.dataset.value ?? el.textContent) || 0;
  el.dataset.value = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = to;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

const SPARKLE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0z"/></svg>`;
export const ornament = () => `<div class="ornament" aria-hidden="true">${SPARKLE_SVG}</div>`;

/** Shows a gold toast for each points event. */
export function toast({ delta, name, reason }) {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  const sign = delta > 0 ? '+' : '−';
  el.innerHTML = `
    <span class="delta ${delta > 0 ? 'gold-text' : 'negative'}">${sign}${Math.abs(delta)}</span>
    <span><span class="who">${escapeHtml(name)}</span>${reason ? `<br><span class="why">${escapeHtml(reason)}</span>` : ''}</span>`;
  host.append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 4200);
}
