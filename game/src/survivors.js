// Survivors waiting on rooftops: spawning, waving, rescue (E key) and
// delivery to the shelter, with the combo scoring chain.

import { SCORE } from './config.js';
import { addFloater } from './boat.js';

export function spawnSurvivors(world, count, existing) {
  const spots = world.roofSpots;
  const used = new Set(existing.map((s) => s.spot));
  const out = [];
  let i = 0;
  while (out.length < count && i < spots.length * 2) {
    const spot = spots[i % spots.length];
    i++;
    if (used.has(spot)) continue;
    used.add(spot);
    // 1-3 people huddle on one roof.
    const group = 1 + Math.floor(Math.random() * 3);
    for (let g = 0; g < group; g++) {
      out.push({
        x: spot.x + (Math.random() - 0.5) * 56,
        y: spot.y + (Math.random() - 0.5) * 14,
        spot,
        phase: Math.random() * Math.PI * 2,
        state: 'waiting',
        flare: Math.random() < 0.5,
        coat: ['#ff6b35', '#ffd60a', '#4ecdc4', '#ff8fa3', '#a78bfa'][Math.floor(Math.random() * 5)],
      });
    }
  }
  return out;
}

// Nearest waiting survivor within rescue reach, if any.
export function nearestRescuable(state) {
  const boat = state.boat;
  let best = null;
  let bestD = boat.rescueRadius;
  for (const s of state.survivors) {
    if (s.state !== 'waiting') continue;
    const d = Math.hypot(s.x - boat.x, s.y - boat.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function tryRescue(state) {
  const boat = state.boat;
  const target = nearestRescuable(state);
  if (!target) return false;
  if (boat.aboard >= boat.capacity) {
    addFloater(state, boat.x, boat.y - 40, 'BOAT FULL — DELIVER FIRST', '#ffb347');
    return false;
  }
  // Rescue the whole rooftop group at once (they are one family).
  const group = state.survivors.filter(
    (s) => s.state === 'waiting' && s.spot === target.spot,
  );
  let taken = 0;
  for (const s of group) {
    if (boat.aboard >= boat.capacity) break;
    s.state = 'aboard';
    boat.aboard++;
    taken++;
  }
  if (taken === 0) return false;
  state.audio.rescue();
  addFloater(state, target.x, target.y - 30, taken > 1 ? `+${taken} RESCUED` : '+1 RESCUED', '#58d68d');
  for (let i = 0; i < 6; i++) {
    state.particles.push({
      kind: 'spark', x: target.x, y: target.y - 10,
      vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60,
      life: 0.7, maxLife: 0.7, size: 2.5,
    });
  }
  return true;
}

export function tryDeliver(state) {
  const boat = state.boat;
  const sh = state.world.shelter;
  const d = Math.hypot(boat.x - sh.x, boat.y - sh.y);
  if (d > sh.radius + 10 || boat.aboard === 0) return false;

  const n = boat.aboard;
  boat.aboard = 0;
  // Combo: deliveries chained inside the window raise the multiplier.
  if (state.comboTimer > 0) {
    state.combo = Math.min(SCORE.maxCombo, state.combo + 1);
  } else {
    state.combo = 1;
  }
  state.maxCombo = Math.max(state.maxCombo || 1, state.combo);
  state.comboTimer = SCORE.comboWindow;
  const gained = n * SCORE.perSurvivor * state.combo;
  state.score += gained;
  state.dayDelivered += n;
  state.totalDelivered += n;
  state.audio.deliver(state.combo);
  addFloater(
    state, sh.x, sh.y - 70,
    `+${gained}  DELIVERED x${state.combo}`,
    state.combo > 1 ? '#ffd27a' : '#58d68d',
  );
  state.shelterFlash = 1;
  // Fresh survivors appear elsewhere so the map never runs dry mid-day.
  const waiting = state.survivors.filter((s) => s.state === 'waiting').length;
  const needed = state.dayCfg.quota - state.dayDelivered;
  if (needed > 0 && waiting < needed + 2) {
    const fresh = spawnSurvivors(state.world, Math.min(6, needed + 2 - waiting), state.survivors);
    state.survivors.push(...fresh);
  }
  return true;
}

export function tryRefuel(state) {
  const boat = state.boat;
  const fb = state.world.fuelBarge;
  const d = Math.hypot(boat.x - fb.x, boat.y - fb.y);
  if (d > fb.radius + 8) return false;
  if (boat.fuel >= boat.maxFuel - 0.5) return false;
  boat.fuel = Math.min(boat.maxFuel, boat.fuel + 34 * state.dt);
  state.refuelling = true;
  if (Math.random() < 0.1) {
    state.particles.push({
      kind: 'spark', x: boat.x, y: boat.y,
      vx: (Math.random() - 0.5) * 40, vy: -30,
      life: 0.5, maxLife: 0.5, size: 2,
    });
  }
  return true;
}
