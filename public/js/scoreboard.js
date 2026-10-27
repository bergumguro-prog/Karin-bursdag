import { countTo, escapeHtml, ornament } from './api.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** SQLite gives "YYYY-MM-DD HH:MM:SS" in UTC. */
const clock = (at) =>
  new Date(at.replace(' ', 'T') + 'Z').toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

function ranks(items, score) {
  // Equal scores share a place: 1, 2, 2, 4
  return items.map((item) => 1 + items.filter((other) => score(other) > score(item)).length);
}

/**
 * A ranked list that animates rows to their new positions (FLIP) and counts scores up.
 * rows: [{ key, html, score, highlight }]
 */
function createRankedList(ol) {
  const els = new Map();

  return function update(rows, rankList) {
    const first = new Map([...els].map(([key, el]) => [key, el.getBoundingClientRect().top]));
    const seen = new Set();

    rows.forEach((row, i) => {
      let el = els.get(row.key);
      const isNew = !el;
      if (isNew) {
        el = document.createElement('li');
        el.className = 'row entering';
        el.innerHTML = `<span class="place numeral"></span><span class="who"></span><span class="score numeral gold-text">0</span>`;
        el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true });
        els.set(row.key, el);
      }
      const rank = rankList[i];
      el.dataset.rank = rank <= 3 ? rank : '';
      el.classList.toggle('is-me', Boolean(row.highlight));
      el.querySelector('.place').textContent = rank;
      const who = el.querySelector('.who');
      if (who.innerHTML !== row.html) who.innerHTML = row.html;
      const prevScore = Number(el.querySelector('.score').dataset.value ?? 0);
      countTo(el.querySelector('.score'), row.score);
      if (!isNew && row.score > prevScore) flash(el);
      ol.append(el); // moves it into sorted position
      seen.add(row.key);
    });

    for (const [key, el] of els) {
      if (!seen.has(key)) {
        el.remove();
        els.delete(key);
      }
    }

    if (reducedMotion) return;
    for (const [key, el] of els) {
      const before = first.get(key);
      if (before == null) continue;
      const delta = before - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      el.animate(
        [{ transform: `translateY(${delta}px)`, zIndex: delta > 0 ? 2 : 1 }, { transform: 'translateY(0)' }],
        { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
      if (delta > 0) flash(el);
    }
  };
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

/**
 * Mounts the scoreboard into `root`. Options: { myId, tv }.
 * Returns { update(state) } so live updates only patch what changed.
 */
export function mountScoreboard(root, { myId = null, tv = false } = {}) {
  let tab = sessionTab();

  root.innerHTML = `
    <div class="board ${tv ? 'board-tv' : ''}">
      <header class="board-head reveal-up">
        <p class="eyebrow"><span class="live-dot"></span>Live</p>
        <h1 class="display board-title gold-text">Toppliste</h1>
        ${ornament()}
      </header>
      ${
        tv
          ? ''
          : `<div class="segmented reveal-up" style="--i:1" role="tablist">
              <button role="tab" data-tab="pairs">Par</button>
              <button role="tab" data-tab="guests">Personer</button>
              <span class="segmented-pill" aria-hidden="true"></span>
            </div>`
      }
      <div class="board-columns">
        <section class="board-col reveal-up" style="--i:2" data-col="pairs">
          ${tv ? '<p class="eyebrow col-title">Par</p>' : ''}
          <ol class="ranked" data-list="pairs"></ol>
          <p class="empty">Ingen par ennå – snart starter dansen ✦</p>
        </section>
        <section class="board-col reveal-up" style="--i:2" data-col="guests">
          ${tv ? '<p class="eyebrow col-title">Personer</p>' : ''}
          <ol class="ranked" data-list="guests"></ol>
          <p class="empty">Ingen gjester ennå</p>
        </section>
        <section class="card feed reveal-up" style="--i:3">
          <p class="eyebrow">Siste poeng</p>
          <ul data-list="feed"></ul>
          <p class="empty">Ingen poeng delt ut ennå</p>
        </section>
      </div>
    </div>`;

  const boardEl = root.querySelector('.board');
  const pairsList = createRankedList(root.querySelector('[data-list="pairs"]'));
  const guestsList = createRankedList(root.querySelector('[data-list="guests"]'));
  const feedEl = root.querySelector('[data-list="feed"]');
  let lastFeedId = null;

  function setTab(next) {
    tab = next;
    try {
      sessionStorage.setItem('kb.tab', tab);
    } catch {}
    boardEl.dataset.tab = tab;
    for (const b of root.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  }
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  setTab(tab);

  function update(state) {
    const myPairId = state.guests.find((g) => g.id === myId)?.pairId ?? null;

    pairsList(
      state.pairs.map((p) => ({
        key: `p${p.id}`,
        score: p.total,
        highlight: p.id === myPairId,
        html: p.members
          .map((m) => `<span class="nm">${escapeHtml(m.name)}</span>`)
          .join('<span class="amp">&amp;</span>'),
      })),
      ranks(state.pairs, (p) => p.total),
    );

    guestsList(
      state.guests.map((g) => ({
        key: `g${g.id}`,
        score: g.points,
        highlight: g.id === myId,
        html: `<span class="nm">${escapeHtml(g.name)}</span>`,
      })),
      ranks(state.guests, (g) => g.points),
    );

    root.querySelector('[data-col="pairs"]').classList.toggle('is-empty', state.pairs.length === 0);
    root.querySelector('[data-col="guests"]').classList.toggle('is-empty', state.guests.length === 0);
    root.querySelector('.feed').classList.toggle('is-empty', state.feed.length === 0);

    const newest = state.feed[0]?.id ?? null;
    if (newest !== lastFeedId) {
      feedEl.innerHTML = state.feed
        .map(
          (e) => `
          <li class="${lastFeedId != null && e.id > lastFeedId ? 'fresh' : ''}">
            <span class="numeral delta ${e.delta > 0 ? 'gold-text' : 'negative'}">${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}</span>
            <span class="what"><span class="nm">${escapeHtml(e.name)}</span>${e.reason ? ` · ${escapeHtml(e.reason)}` : ''}</span>
            <time>${clock(e.at)}</time>
          </li>`,
        )
        .join('');
      lastFeedId = newest;
    }
  }

  return { update };
}

function sessionTab() {
  try {
    return sessionStorage.getItem('kb.tab') === 'guests' ? 'guests' : 'pairs';
  } catch {
    return 'pairs';
  }
}
