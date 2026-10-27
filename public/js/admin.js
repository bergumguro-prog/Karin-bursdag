import { adminToken, api, ApiError, escapeHtml, ornament, subscribe, toast, transition } from './api.js';
import { burst, initBurst, startBackground } from './sparkles.js';

const view = document.getElementById('view');
const REASONS = ['Beste dansemove', 'Quiz', 'Sang', 'Antrekk', 'Bursdagshilsen', 'Konkurranse', 'Sjarm', 'Bonus'];

const admin = {
  state: null,
  selected: new Set(),
  filter: '',
  reason: '',
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function renderLogin() {
  transition(() => {
    view.innerHTML = `
      <section class="login">
        <p class="eyebrow reveal-up">Kun for vertinnene</p>
        <h1 class="display gold-text reveal-up" style="--i:1">Admin</h1>
        <div class="reveal-up" style="--i:2">${ornament()}</div>
        <form class="card reveal-up" style="--i:3" novalidate>
          <label>
            <span class="eyebrow">PIN-kode</span>
            <span class="field"><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus></span>
          </label>
          <p class="form-error" role="alert"></p>
          <button class="btn" type="submit">Logg inn</button>
        </form>
        <a class="back reveal-up" style="--i:4" href="/">← Til festen</a>
      </section>`;
    view.querySelector('form').addEventListener('submit', onLogin);
  });
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const error = form.querySelector('.form-error');
  try {
    const { token } = await api('/api/admin/login', { body: { pin: form.pin.value } });
    adminToken.set(token);
    startPanel();
  } catch (err) {
    error.textContent = err.message;
    form.pin.value = '';
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
  }
}

function logout() {
  adminToken.set(null);
  stopLive?.();
  renderLogin();
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

let stopLive = null;

function startPanel() {
  listen();
  transition(() => {
    view.innerHTML = `
      <header class="panel-head reveal-up">
        <div>
          <p class="eyebrow">Vertinnepanel</p>
          <h1 class="display gold-text">Poeng &amp; par</h1>
        </div>
        <div class="links">
          <a class="btn btn-ghost btn-small" href="/#/tv" target="_blank" rel="noopener">Storskjerm</a>
          <button class="btn btn-ghost btn-small" data-action="logout" type="button">Logg ut</button>
        </div>
      </header>
      <div class="stats reveal-up" style="--i:1">
        <div class="card stat"><span class="numeral gold-text" data-stat="guests">0</span><span class="eyebrow">Gjester</span></div>
        <div class="card stat"><span class="numeral gold-text" data-stat="pairs">0</span><span class="eyebrow">Par</span></div>
        <div class="card stat"><span class="numeral gold-text" data-stat="waiting">0</span><span class="eyebrow">Venter</span></div>
      </div>
      <div class="search reveal-up" style="--i:2">
        <input type="search" placeholder="Søk – eller trykk på gjester for å velge" aria-label="Søk etter gjest">
      </div>
      <div data-region="waiting"></div>
      <p class="eyebrow section-title">Dansepartnere</p>
      <div class="pairs" data-region="pairs"></div>
      <aside class="sheet" aria-label="Handlinger for valgte gjester">
        <div class="targets">
          <span class="names"></span>
          <button class="icon-btn" data-action="clear" type="button">Fjern valg</button>
        </div>
        <input class="reason" maxlength="80" placeholder="Begrunnelse (valgfritt)">
        <div class="chips">${REASONS.map((r) => `<button type="button" data-reason="${r}">${r}</button>`).join('')}</div>
        <div class="amounts">
          <button class="btn" data-delta="1" type="button">+1</button>
          <button class="btn" data-delta="5" type="button">+5</button>
          <button class="btn" data-delta="10" type="button">+10</button>
          <button class="btn btn-ghost minus" data-delta="-1" type="button">−1</button>
          <form class="custom"><input type="number" inputmode="numeric" placeholder="±" aria-label="Egendefinert antall poeng"><button>Gi</button></form>
        </div>
        <div class="more"></div>
        <p class="form-error sheet-error" role="alert"></p>
      </aside>`;
    renderLists();
  });

  stopLive = subscribe({
    state(state) {
      admin.state = state;
      // Drop selections of guests that no longer exist
      const ids = new Set(state.guests.map((g) => g.id));
      for (const id of admin.selected) if (!ids.has(id)) admin.selected.delete(id);
      renderLists();
    },
    points(events) {
      events.forEach(toast);
    },
  });
}

let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  view.addEventListener('click', onClick);
  view.addEventListener('input', (e) => {
    if (e.target.matches('.search input')) {
      admin.filter = e.target.value.trim().toLocaleLowerCase('nb');
      renderLists();
    }
    if (e.target.matches('.reason')) admin.reason = e.target.value;
  });
  view.addEventListener('submit', (e) => {
    if (!e.target.matches('.custom')) return;
    e.preventDefault();
    const input = e.target.querySelector('input');
    givePoints(Number(input.value)).then((ok) => ok && (input.value = ''));
  });
}

function guestButton(g) {
  return `
    <button class="person" type="button" data-guest="${g.id}" aria-pressed="${admin.selected.has(g.id)}">
      <span class="nm">${escapeHtml(g.name)}</span>
      <span class="numeral pts">${g.points}</span>
    </button>`;
}

function renderLists() {
  const state = admin.state;
  if (!state || !view.querySelector('[data-region]')) return;
  const match = (name) => !admin.filter || name.toLocaleLowerCase('nb').includes(admin.filter);
  const byId = new Map(state.guests.map((g) => [g.id, g]));

  view.querySelector('[data-stat="guests"]').textContent = state.guests.length;
  view.querySelector('[data-stat="pairs"]').textContent = state.pairs.length;
  view.querySelector('[data-stat="waiting"]').textContent = state.waiting.length;

  const waiting = state.waiting.filter((g) => match(g.name));
  view.querySelector('[data-region="waiting"]').innerHTML = waiting.length
    ? `<p class="eyebrow section-title">Venter på partner</p>
       <div class="card pair-card waiting-list"><div class="people">${waiting.map((g) => guestButton(byId.get(g.id))).join('')}</div></div>`
    : '';

  const pairs = state.pairs.filter((p) => p.members.some((m) => match(m.name)));
  view.querySelector('[data-region="pairs"]').innerHTML = pairs.length
    ? pairs
        .map(
          (p, i) => `
        <article class="card pair-card" style="animation-delay:${Math.min(i, 8) * 40}ms">
          <header>
            <span class="numeral total gold-text">${p.total}</span>
            <span class="tools">
              <button class="icon-btn" type="button" data-select-pair="${p.id}">Velg begge</button>
              <button class="icon-btn" type="button" data-split="${p.id}">Splitt</button>
            </span>
          </header>
          <div class="people">${p.members.map((m) => guestButton(byId.get(m.id))).join('')}</div>
        </article>`,
        )
        .join('')
    : `<p class="empty-note">${admin.filter ? 'Ingen treff' : 'Ingen par ennå'}</p>`;

  renderSheet();
}

function renderSheet() {
  const sheet = view.querySelector('.sheet');
  const selected = [...admin.selected].map((id) => admin.state.guests.find((g) => g.id === id)).filter(Boolean);
  sheet.classList.toggle('open', selected.length > 0);
  sheet.querySelector('.names').textContent = selected.map((g) => g.name).join(' & ');

  const more = [];
  if (selected.length === 2 && (selected[0].pairId == null || selected[0].pairId !== selected[1].pairId)) {
    more.push(`<button class="btn btn-ghost btn-small" type="button" data-action="pair">Gjør til dansepartnere</button>`);
  }
  if (selected.length === 1) {
    more.push(`<button class="btn btn-ghost btn-small danger" type="button" data-action="remove">Fjern gjest</button>`);
  }
  sheet.querySelector('.more').innerHTML = more.join('');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function sheetError(message = '') {
  const el = view.querySelector('.sheet-error');
  if (el) el.textContent = message;
}

async function run(action) {
  sheetError();
  try {
    await action();
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      logout();
      return false;
    }
    sheetError(err.message);
    return false;
  }
}

function givePoints(delta) {
  if (!Number.isInteger(delta) || delta === 0) {
    sheetError('Skriv inn et helt tall, f.eks. 3 eller -2');
    return Promise.resolve(false);
  }
  return run(async () => {
    await api('/api/admin/points', {
      admin: true,
      body: { guestIds: [...admin.selected], delta, reason: admin.reason },
    });
    if (delta > 0) {
      const r = view.querySelector('.amounts').getBoundingClientRect();
      burst({ x: r.left + r.width / 2, y: r.top, power: 0.7 });
    }
    admin.selected.clear();
    admin.reason = '';
    view.querySelector('.reason').value = '';
    renderLists();
  });
}

function onClick(e) {
  const t = e.target.closest('button, a');
  if (!t) return;

  if (t.dataset.guest) {
    const id = Number(t.dataset.guest);
    if (admin.selected.has(id)) admin.selected.delete(id);
    else admin.selected.add(id);
    t.setAttribute('aria-pressed', String(admin.selected.has(id)));
    sheetError();
    return renderSheet();
  }

  if (t.dataset.selectPair) {
    const pair = admin.state.pairs.find((p) => p.id === Number(t.dataset.selectPair));
    admin.selected = new Set(pair.members.map((m) => m.id));
    return renderLists();
  }

  if (t.dataset.split) {
    const pair = admin.state.pairs.find((p) => p.id === Number(t.dataset.split));
    const names = pair.members.map((m) => m.name).join(' og ');
    if (confirm(`Splitte ${names}? De blir stående uten partner.`)) {
      run(() => api(`/api/admin/pairs/${pair.id}`, { method: 'DELETE', admin: true }));
    }
    return;
  }

  if (t.dataset.reason) {
    admin.reason = t.dataset.reason;
    view.querySelector('.reason').value = admin.reason;
    return;
  }

  if (t.dataset.delta) return givePoints(Number(t.dataset.delta));

  switch (t.dataset.action) {
    case 'logout':
      return logout();
    case 'clear':
      admin.selected.clear();
      return renderLists();
    case 'pair': {
      const [a, b] = admin.selected;
      return run(async () => {
        await api('/api/admin/pairs', { admin: true, body: { a, b } });
        admin.selected.clear();
        burst({ power: 1.2 });
      });
    }
    case 'remove': {
      const [id] = admin.selected;
      const guest = admin.state.guests.find((g) => g.id === id);
      if (!confirm(`Fjerne ${guest.name}? Poengene deres slettes, og partneren blir stående uten partner.`)) return;
      return run(async () => {
        await api(`/api/admin/guests/${id}`, { method: 'DELETE', admin: true });
        admin.selected.clear();
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

startBackground(document.getElementById('sparkles'));
initBurst(document.getElementById('burst'));

if (adminToken.get()) {
  api('/api/admin/check', { admin: true })
    .then(startPanel)
    .catch(() => {
      adminToken.set(null);
      renderLogin();
    });
} else {
  renderLogin();
}
