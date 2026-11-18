// Hazards: drifting debris, telegraphed lightning strikes, and the Day 7
// boss — the Surge, a dam-break wall of water crossing the city.

import { HAZARDS, WORLD } from './config.js';
import { damageBoat, addFloater } from './boat.js';
import { currentAt } from './world.js';

const DEBRIS_KINDS = ['log', 'barrel', 'plank', 'tyre', 'crate'];

export function spawnDebris(world, count, rng) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: 100 + rng() * (WORLD.W - 200),
      y: 100 + rng() * (WORLD.H - 200),
      vx: 0,
      vy: 0,
      angle: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 1.2,
      size: 10 + rng() * 16,
      kind: DEBRIS_KINDS[Math.floor(rng() * DEBRIS_KINDS.length)],
    });
  }
  return out;
}

export function updateDebris(state, dt) {
  const boat = state.boat;
  for (const d of state.debris) {
    const cur = currentAt(state.world, d.x, d.y);
    d.vx += (cur.vx * 0.8 - d.vx) * dt * 0.8;
    d.vy += (cur.vy * 0.8 - d.vy) * dt * 0.8;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.angle += d.spin * dt;
    d.x = Math.max(20, Math.min(WORLD.W - 20, d.x));
    d.y = Math.max(20, Math.min(WORLD.H - 20, d.y));

    const dist = Math.hypot(d.x - boat.x, d.y - boat.y);
    if (dist < d.size + boat.radius - 4 && boat.hull > 0) {
      if (damageBoat(boat, HAZARDS.debrisDamage, state, 'debris')) {
        // Knock the boat away from the impact.
        const nx = (boat.x - d.x) / (dist || 1);
        const ny = (boat.y - d.y) / (dist || 1);
        boat.vx += nx * HAZARDS.debrisKnockback;
        boat.vy += ny * HAZARDS.debrisKnockback;
        d.vx -= nx * 120;
        d.vy -= ny * 120;
      }
    }
  }
}

// Lightning: a warning ring appears, then the bolt lands after a beat.
export function updateLightning(state, dt) {
  const L = state.lightning;
  L.timer -= dt;
  if (L.flash > 0) L.flash = Math.max(0, L.flash - dt * 1.8);

  if (L.pending) {
    L.pending.t -= dt;
    if (L.pending.t <= 0) {
      const s = L.pending;
      L.pending = null;
      L.flash = 1;
      L.bolt = { x: s.x, y: s.y, life: 0.25, segments: makeBoltSegments(s.x, s.y) };
      state.audio.thunder();
      state.shake = Math.min(12, state.shake + 5);
      const boat = state.boat;
      if (Math.hypot(boat.x - s.x, boat.y - s.y) < HAZARDS.lightningRadius) {
        damageBoat(boat, HAZARDS.lightningDamage, state, 'lightning');
      }
    }
  } else if (L.timer <= 0 && state.dayCfg.lightning && state.screen === 'play') {
    L.timer = 5 + Math.random() * 7;
    // Strikes near the boat often enough to matter, never exactly on it.
    const boat = state.boat;
    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 260;
    L.pending = {
      x: Math.max(60, Math.min(WORLD.W - 60, boat.x + Math.cos(angle) * dist)),
      y: Math.max(60, Math.min(WORLD.H - 60, boat.y + Math.sin(angle) * dist)),
      t: HAZARDS.lightningWarnTime,
    };
  }
  if (L.bolt) {
    L.bolt.life -= dt;
    if (L.bolt.life <= 0) L.bolt = null;
  }
}

function makeBoltSegments(x, y) {
  const pts = [{ x, y: y - 260 }];
  let cx = x;
  let cy = y - 260;
  while (cy < y) {
    cy += 28 + Math.random() * 30;
    cx += (Math.random() - 0.5) * 70;
    pts.push({ x: cx, y: Math.min(cy, y) });
  }
  return pts;
}

// --- The Surge (Day 7 boss) -----------------------------------------------

export function makeSurge() {
  return {
    x: -260,                 // wall front, world coords; advances right
    speed: HAZARDS.surgeSpeed,
    active: false,
    delay: 18,               // seconds of calm before the wall arrives
    crestPhase: 0,
  };
}

export function updateSurge(state, dt) {
  const surge = state.surge;
  if (!surge || !surge.active) return;
  surge.crestPhase += dt * 2.2;
  surge.x += surge.speed * dt;
  const boat = state.boat;
  // Caught by the wall: heavy damage and a violent shove.
  if (boat.x < surge.x + 40 && boat.hull > 0) {
    if (damageBoat(boat, HAZARDS.surgeDamage, state, 'surge')) {
      boat.vx += 520;
      boat.x = surge.x + 60;
      addFloater(state, boat.x, boat.y - 50, 'THE SURGE HITS YOU', '#ff4d4d');
    }
  }
  // The wall swallows debris and survivors left behind in its path.
  for (const s of state.survivors) {
    if (s.state === 'waiting' && s.x < surge.x) s.state = 'lost';
  }
  // If the wall reaches the shelter, the day is lost.
  if (surge.x >= state.world.shelter.x - 40) {
    state.surgeSwallowedShelter = true;
  }
}
