// Glitter engine: twinkling background stars, a pointer trail and gold bursts.

const GOLDS = ['#fff3c4', '#f1d27a', '#d4af37', '#e8c766', '#ffffff', '#b8892a'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (min, max) => min + Math.random() * (max - min);
const pickGold = () => GOLDS[(Math.random() * GOLDS.length) | 0];

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);
  return ctx;
}

/** Four-pointed star, the classic "sparkle" shape. */
function drawStar(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Background: slow drifting gold dust and twinkling stars
// ---------------------------------------------------------------------------

export function startBackground(canvas) {
  const ctx = setupCanvas(canvas);
  const area = () => innerWidth * innerHeight;
  const count = () => Math.round(Math.min(160, Math.max(50, area() / 9000)));

  const makeParticle = (anywhere = true) => ({
    x: rand(0, innerWidth),
    y: anywhere ? rand(0, innerHeight) : innerHeight + 10,
    r: Math.random() < 0.18 ? rand(2.5, 5.5) : rand(0.5, 1.6),
    vy: rand(-0.06, -0.28),
    vx: rand(-0.06, 0.06),
    phase: rand(0, Math.PI * 2),
    speed: rand(0.008, 0.03),
    color: pickGold(),
  });

  let particles = Array.from({ length: count() }, () => makeParticle());
  addEventListener('resize', () => {
    const target = count();
    while (particles.length < target) particles.push(makeParticle());
    particles.length = target;
  });

  // Pointer trail
  const trail = [];
  let lastTrail = 0;
  addEventListener(
    'pointermove',
    (e) => {
      const now = performance.now();
      if (reducedMotion || now - lastTrail < 24) return;
      lastTrail = now;
      trail.push({ x: e.clientX, y: e.clientY, vx: rand(-0.4, 0.4), vy: rand(-0.2, 0.6), life: 1, r: rand(1.5, 3.5), color: pickGold() });
    },
    { passive: true },
  );

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';

    for (const p of particles) {
      p.phase += p.speed;
      if (!reducedMotion) {
        p.x += p.vx + Math.sin(p.phase * 0.5) * 0.08;
        p.y += p.vy;
      }
      if (p.y < -10) Object.assign(p, makeParticle(false));

      const twinkle = (Math.sin(p.phase) + 1) / 2;
      if (p.r > 2) {
        drawStar(ctx, p.x, p.y, p.r * (0.4 + twinkle * 0.8), p.color, 0.2 + twinkle * 0.7);
      } else {
        ctx.globalAlpha = 0.15 + twinkle * 0.55;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      t.x += t.vx;
      t.y += t.vy;
      t.life -= 0.022;
      if (t.life <= 0) {
        trail.splice(i, 1);
        continue;
      }
      drawStar(ctx, t.x, t.y, t.r * (0.5 + t.life), t.color, t.life);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Bursts: gold confetti and sparkles exploding from a point
// ---------------------------------------------------------------------------

let burstCtx;
const pieces = [];
let running = false;

export function initBurst(canvas) {
  burstCtx = setupCanvas(canvas);
}

/**
 * Fires a celebratory burst. `x`/`y` default to the screen centre.
 * `power` scales the number of pieces (1 = normal, 2 = big moment).
 */
export function burst({ x = innerWidth / 2, y = innerHeight / 2, power = 1 } = {}) {
  if (!burstCtx) return;
  const n = Math.round((reducedMotion ? 20 : 90) * power);
  for (let i = 0; i < n; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(2, 9) * Math.sqrt(power);
    const isStar = Math.random() < 0.35;
    pieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(1, 4),
      w: rand(4, 9),
      h: rand(6, 14),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.25, 0.25),
      flip: rand(0, Math.PI * 2),
      vflip: rand(0.08, 0.2),
      life: 1,
      decay: rand(0.006, 0.012),
      color: pickGold(),
      isStar,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(drawBurst);
  }
}

/** Confetti raining from the top of the screen – for the big reveal. */
export function goldRain(duration = 2200) {
  if (!burstCtx || reducedMotion) return;
  const end = performance.now() + duration;
  const tick = () => {
    for (let i = 0; i < 4; i++) {
      pieces.push({
        x: rand(0, innerWidth),
        y: -20,
        vx: rand(-1, 1),
        vy: rand(2, 5),
        w: rand(5, 10),
        h: rand(8, 16),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.15, 0.15),
        flip: rand(0, Math.PI * 2),
        vflip: rand(0.05, 0.15),
        life: 1,
        decay: 0.004,
        color: pickGold(),
        isStar: Math.random() < 0.2,
      });
    }
    if (!running) {
      running = true;
      requestAnimationFrame(drawBurst);
    }
    if (performance.now() < end) requestAnimationFrame(tick);
  };
  tick();
}

function drawBurst() {
  const ctx = burstCtx;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + 0.12;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.flip += p.vflip;
    p.life -= p.decay;
    if (p.life <= 0 || p.y > innerHeight + 40) {
      pieces.splice(i, 1);
      continue;
    }
    if (p.isStar) {
      ctx.globalCompositeOperation = 'lighter';
      drawStar(ctx, p.x, p.y, p.w * 0.8, p.color, p.life);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // A foil flake that flips as it falls: scale one axis by cos(flip)
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  if (pieces.length) requestAnimationFrame(drawBurst);
  else running = false;
}
