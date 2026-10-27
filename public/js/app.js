import { api, ApiError, countTo, escapeHtml, guestToken, ornament, subscribe, toast, transition } from './api.js';
import { mountScoreboard } from './scoreboard.js';
import { burst, goldRain, initBurst, startBackground } from './sparkles.js';

const view = document.getElementById('view');

const app = {
  title: 'Karins bursdag',
  myId: null,
  state: null,
  partnerId: undefined, // undefined = not rendered yet, null = waiting
  screen: null,
  revealing: false,
};

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

function mine() {
  const me = app.state?.guests.find((g) => g.id === app.myId);
  if (!me) return null;
  const pair = app.state.pairs.find((p) => p.id === me.pairId) ?? null;
  const partner = pair?.members.find((m) => m.id !== me.id) ?? null;
  const rank = pair ? 1 + app.state.pairs.filter((p) => p.total > pair.total).length : null;
  return { me, pair, partner, rank, pairCount: app.state.pairs.length };
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function show(screen, html, after) {
  const changed = app.screen !== screen;
  app.screen = screen;
  const update = () => {
    view.innerHTML = html;
    after?.();
  };
  return changed ? transition(update) : update();
}

function renderWelcome() {
  if (app.screen === 'welcome') return; // don't wipe what the guest is typing
  show(
    'welcome',
    `
    <p class="eyebrow reveal-up" style="--i:0">Du er invitert til</p>
    <h1 class="display hero-title gold-text reveal-up" style="--i:1">${escapeHtml(app.title)}</h1>
    <p class="eyebrow hero-sub reveal-up" style="--i:2">Glitter &amp; Glam</p>
    <div class="reveal-up" style="--i:3">${ornament()}</div>
    <form class="card register reveal-up" style="--i:4" novalidate>
      <label>
        <span class="eyebrow">Hva heter du?</span>
        <span class="field"><input name="name" autocomplete="given-name" maxlength="40" placeholder="Ditt navn" required></span>
      </label>
      <p class="form-error" role="alert"></p>
      <button class="btn" type="submit">Finn min dansepartner</button>
    </form>
    <p class="fineprint reveal-up" style="--i:5">Du blir tilfeldig paret med en annen gjest. Dere er dansepartnere resten av kvelden – og samler poeng sammen.</p>
  `,
    () => {
      const form = view.querySelector('form');
      form.addEventListener('submit', onRegister);
    },
  );
}

async function onRegister(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('button');
  const error = form.querySelector('.form-error');
  error.textContent = '';
  button.disabled = true;
  try {
    const { token, guest } = await api('/api/register', { body: { name: form.name.value } });
    guestToken.set(token);
    app.myId = guest.id;
    app.partnerId = guest.partner?.id ?? null;
    if (!mine()) app.state = await api('/api/state');
    if (guest.partner) await playReveal(guest.partner.name);
    render();
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    form.name.focus();
  }
}

function renderWaiting({ me }) {
  show(
    'waiting',
    `
    <div class="radar reveal-up" aria-hidden="true">
      <span style="--i:0"></span><span style="--i:1"></span><span style="--i:2"></span>
      <div class="initial">${escapeHtml(me.name.charAt(0).toUpperCase())}</div>
    </div>
    <p class="eyebrow reveal-up" style="--i:1">Hei, ${escapeHtml(me.name)}</p>
    <h1 class="display waiting-title gold-text reveal-up" style="--i:2">Vi finner din<br>dansepartner<span class="dots"></span></h1>
    <p class="waiting-text reveal-up" style="--i:3">Du blir paret med neste gjest som ankommer. Hold telefonen klar ✦</p>
  `,
  );
}

function renderMine({ me, partner, pair, rank, pairCount }) {
  const build = () => `
    <p class="eyebrow reveal-up" style="--i:0">Dansepartnere</p>
    <div class="couple">
      <h1 class="display name gold-text reveal-up" style="--i:1">${escapeHtml(me.name)}</h1>
      <span class="amp reveal-up" style="--i:2">&amp;</span>
      <h1 class="display name gold-text reveal-up" style="--i:3">${escapeHtml(partner.name)}</h1>
    </div>
    <section class="card score-card reveal-up" style="--i:4" aria-label="Poeng">
      <p class="eyebrow">Parets poeng</p>
      <div class="numeral total gold-text" data-ref="total">0</div>
      <p class="rank" data-ref="rank"></p>
      <div class="split">
        <div>
          <div class="numeral pts" data-ref="mine">0</div>
          <p class="who">Deg</p>
        </div>
        <div class="divider"></div>
        <div>
          <div class="numeral pts" data-ref="theirs">0</div>
          <p class="who">${escapeHtml(partner.name)}</p>
        </div>
      </div>
    </section>
    <p class="hint reveal-up" style="--i:5">Poeng deles ut av vertinnene i løpet av kvelden.</p>
  `;

  const fill = () => {
    const ref = (name) => view.querySelector(`[data-ref="${name}"]`);
    countTo(ref('total'), pair.total);
    countTo(ref('mine'), me.points);
    countTo(ref('theirs'), partner.points);
    ref('rank').innerHTML = `Plass <strong>${rank}</strong> av ${pairCount} par`;
  };

  // Re-render the markup only when the couple changes; otherwise just animate the numbers
  const key = `mine:${partner.id}`;
  if (app.screen === key) fill();
  else show(key, build(), fill);
}

// ---------------------------------------------------------------------------
// Scoreboard and navigation
// ---------------------------------------------------------------------------

const route = () => (['#/toppliste', '#/tv'].includes(location.hash) ? location.hash : '#/');

let board = null;

function renderBoard(tv) {
  const screen = tv ? 'tv' : 'board';
  if (app.screen === screen) return board?.update(app.state);
  show(screen, '', () => {
    board = mountScoreboard(view, { myId: app.myId, tv });
    if (app.state) board.update(app.state);
  });
}

function renderTabbar() {
  const bar = document.querySelector('.tabbar');
  const current = route();
  bar.hidden = current === '#/tv';
  bar.innerHTML = `
    <a href="#/" ${current === '#/' ? 'aria-current="page"' : ''}>${app.myId ? 'Meg' : 'Bli med'}</a>
    <a href="#/toppliste" ${current === '#/toppliste' ? 'aria-current="page"' : ''}>Toppliste</a>`;
}

function render() {
  if (app.revealing) return;
  renderTabbar();
  if (route() !== '#/') return renderBoard(route() === '#/tv');
  if (!app.myId) return renderWelcome();
  if (!app.state) return;
  const info = mine();
  if (!info) {
    // Removed by an admin
    guestToken.set(null);
    app.myId = null;
    renderTabbar();
    return renderWelcome();
  }
  if (!info.partner) return renderWaiting(info);
  renderMine(info);
}

// ---------------------------------------------------------------------------
// The big reveal: a slot machine of names landing on your partner
// ---------------------------------------------------------------------------

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playReveal(partnerName) {
  app.revealing = true;

  const others = (app.state?.guests ?? []).filter((g) => g.id !== app.myId && g.name !== partnerName).map((g) => g.name);
  const pool = others.length >= 3 ? others : [...others, '✦', 'Hvem?', '✧', '…'];
  const reel = [];
  while (reel.length < 26) reel.push(...shuffle(pool));
  reel.length = 26;
  reel.push(partnerName);

  const overlay = document.createElement('div');
  overlay.className = 'reveal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', `Din dansepartner er ${partnerName}`);
  overlay.innerHTML = `
    <div class="reveal-inner">
      <p class="eyebrow">Din dansepartner er</p>
      <div class="slot"><div class="slot-reel">${reel.map((n) => `<div>${escapeHtml(n)}</div>`).join('')}</div></div>
      <div class="after">
        ${ornament()}
        <p>Dere er nå låst sammen for kvelden.<br>Finn hverandre på dansegulvet!</p>
        <button class="btn" type="button">Se paret vårt</button>
      </div>
    </div>`;
  document.body.append(overlay);

  const slot = overlay.querySelector('.slot');
  const reelEl = overlay.querySelector('.slot-reel');

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const row = slot.getBoundingClientRect().height / 3;
        reelEl.style.transform = `translateY(${-(reel.length - 1) * row}px)`;
      });
    });

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      slot.classList.add('landed');
      const r = slot.getBoundingClientRect();
      burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, power: 2 });
      goldRain();
      setTimeout(() => overlay.classList.add('done'), 500);
    };
    reelEl.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 5400); // fallback when transitions are disabled

    overlay.querySelector('.after button').addEventListener('click', () => {
      overlay.classList.add('closing');
      overlay.addEventListener(
        'animationend',
        () => {
          overlay.remove();
          app.revealing = false;
          resolve();
        },
        { once: true },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

async function onState(state) {
  app.state = state;
  if (!app.myId || app.revealing) return render();

  const info = mine();
  const partnerId = info?.partner?.id ?? null;
  const changed = app.partnerId !== undefined && partnerId !== app.partnerId;
  app.partnerId = partnerId;

  // We were waiting (or an admin re-paired us): celebrate the new partner
  if (changed && info?.partner) await playReveal(info.partner.name);
  render();
}

function onPoints(events) {
  const info = mine();
  if (route() === '#/tv' && events.some((e) => e.delta > 0)) burst({ y: innerHeight * 0.35, power: 1.5 });
  for (const event of events) {
    toast(event);
    const ours = info && (event.guestId === info.me.id || event.guestId === info.partner?.id);
    if (ours && event.delta > 0) {
      const card = view.querySelector('.score-card');
      const r = card?.getBoundingClientRect();
      burst(r ? { x: r.left + r.width / 2, y: r.top + 70 } : {});
    }
  }
}

function onConnection(online) {
  document.querySelector('.offline')?.classList.toggle('visible', !online);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  startBackground(document.getElementById('sparkles'));
  initBurst(document.getElementById('burst'));
  document.body.insertAdjacentHTML(
    'beforeend',
    `<nav class="tabbar" aria-label="Meny"></nav>
     <div class="offline">Kobler til…</div>
     <a class="admin-link" href="/admin" aria-label="Admin"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0z"/></svg></a>`,
  );

  const config = await api('/api/config').catch(() => null);
  if (config) {
    app.title = config.eventTitle;
    document.title = config.eventTitle;
  }

  if (guestToken.get()) {
    try {
      app.myId = (await api('/api/me')).id;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) guestToken.set(null);
    }
  }

  addEventListener('hashchange', render);
  if (!app.myId || route() !== '#/') render();
  subscribe({ state: onState, points: onPoints, connection: onConnection });
}

boot();
