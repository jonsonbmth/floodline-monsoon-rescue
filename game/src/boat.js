// The rescue boat: acceleration steering with inertia, boost, fuel burn,
// currents and whirlpools, building collisions and hull damage.

import { BOAT, WORLD, HAZARDS } from './config.js';
import { currentAt, collideBuildings } from './world.js';

export function makeBoat(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: BOAT.radius,
    hull: BOAT.hull,
    maxHull: BOAT.hull,
    fuel: BOAT.fuel,
    maxFuel: BOAT.fuel,
    capacity: BOAT.capacity,
    aboard: 0,
    accel: BOAT.accel,
    maxSpeed: BOAT.maxSpeed,
    rescueRadius: BOAT.rescueRadius,
    lightRadius: 240,
    spotRadius: 320,
    debrisArmor: 1,
    regen: 0,
    invuln: 0,
    boosting: false,
    throttling: false,
    wakeTimer: 0,
    bobPhase: 0,
  };
}

export function updateBoat(boat, world, input, dt, state) {
  const steer = input.steerVector();
  let ax = 0;
  let ay = 0;
  boat.throttling = false;

  // Keyboard steering, or hold the mouse to steer toward the cursor.
  if (steer.x !== 0 || steer.y !== 0) {
    ax = steer.x * boat.accel;
    ay = steer.y * boat.accel;
    boat.throttling = true;
  } else if (input.mouse.down) {
    const wx = state.camera.x + input.mouse.x;
    const wy = state.camera.y + input.mouse.y;
    const dx = wx - boat.x;
    const dy = wy - boat.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 30) {
      ax = (dx / dist) * boat.accel;
      ay = (dy / dist) * boat.accel;
      boat.throttling = true;
    }
  }

  boat.boosting = boat.throttling && input.isDown('ShiftLeft') || boat.throttling && input.isDown('ShiftRight');
  const boost = boat.boosting && boat.fuel > 1 ? 1.55 : 1;

  boat.vx += ax * dt * boost;
  boat.vy += ay * dt * boost;

  // Water drag, then the river's own push.
  const drag = Math.exp(-1.6 * dt);
  boat.vx *= drag;
  boat.vy *= drag;
  const cur = currentAt(world, boat.x, boat.y);
  boat.vx += cur.vx * dt * 0.9;
  boat.vy += cur.vy * dt * 0.9;

  // Whirlpools drag the boat in a spiral.
  for (const w of world.whirlpools) {
    const dx = w.x - boat.x;
    const dy = w.y - boat.y;
    const dist = Math.hypot(dx, dy);
    if (dist < w.radius * 1.6 && dist > 1) {
      const strength = (1 - dist / (w.radius * 1.6)) * HAZARDS.whirlpoolPull;
      boat.vx += (dx / dist) * strength * dt;
      boat.vy += (dy / dist) * strength * dt;
      // Tangential spin.
      boat.vx += (-dy / dist) * strength * 0.7 * w.spin * dt;
      boat.vy += (dx / dist) * strength * 0.7 * w.spin * dt;
    }
  }

  // Cap speed.
  const speed = Math.hypot(boat.vx, boat.vy);
  const max = boat.maxSpeed * boost;
  if (speed > max) {
    boat.vx = (boat.vx / speed) * max;
    boat.vy = (boat.vy / speed) * max;
  }

  boat.x += boat.vx * dt;
  boat.y += boat.vy * dt;

  // World bounds.
  boat.x = Math.max(boat.radius, Math.min(WORLD.W - boat.radius, boat.x));
  boat.y = Math.max(boat.radius, Math.min(WORLD.H - boat.radius, boat.y));

  // Face the direction of travel, smoothly.
  if (speed > 24) {
    const target = Math.atan2(boat.vy, boat.vx);
    let diff = target - boat.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    boat.angle += diff * Math.min(1, 7.5 * dt);
  }

  // Buildings: bounce off, and a hard hit costs hull.
  if (collideBuildings(world, boat, boat.vx, boat.vy)) {
    damageBoat(boat, 6, state, 'wall');
  }

  // Fuel and hull over time.
  if (boat.throttling) {
    boat.fuel -= (BOAT.fuelDrain + (boat.boosting ? BOAT.boostDrain : 0)) * dt;
  } else {
    boat.fuel -= BOAT.fuelDrain * 0.25 * dt;
  }
  boat.fuel = Math.max(0, boat.fuel);
  if (boat.regen > 0 && boat.hull > 0) {
    boat.hull = Math.min(boat.maxHull, boat.hull + boat.regen * dt);
  }
  if (boat.invuln > 0) boat.invuln -= dt;

  // Wake foam behind the stern.
  boat.wakeTimer -= dt;
  if (speed > 60 && boat.wakeTimer <= 0) {
    boat.wakeTimer = 0.05;
    const bx = boat.x - Math.cos(boat.angle) * 26;
    const by = boat.y - Math.sin(boat.angle) * 26;
    state.particles.push({
      kind: 'wake', x: bx, y: by, vx: -boat.vx * 0.12, vy: -boat.vy * 0.12,
      life: 0.9, maxLife: 0.9, size: 7 + speed * 0.012,
    });
  }
  boat.bobPhase += dt * (1.5 + speed * 0.004);
}

export function damageBoat(boat, amount, state, source) {
  if (boat.invuln > 0 || boat.hull <= 0) return false;
  const final = source === 'debris' ? amount * boat.debrisArmor : amount;
  boat.hull = Math.max(0, boat.hull - final);
  boat.invuln = BOAT.invulnTime;
  state.shake = Math.min(14, state.shake + 8);
  state.audio.crash();
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({
      kind: 'splash', x: boat.x, y: boat.y,
      vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
      life: 0.6, maxLife: 0.6, size: 3 + Math.random() * 4,
    });
  }
  addFloater(state, boat.x, boat.y - 34, `-${Math.round(final)} HULL`, '#ff4d4d');
  return true;
}

export function addFloater(state, x, y, text, color) {
  state.floaters.push({ x, y, text, color, life: 1.4, maxLife: 1.4 });
}
