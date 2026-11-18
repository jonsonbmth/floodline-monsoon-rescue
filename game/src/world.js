// The drowned city: blocks of half-submerged buildings separated by wide
// water streets, a shelter barge, a fuel barge, current lanes and whirlpools.
// Generation is seeded, so the same seed rebuilds the same city.

import { WORLD } from './config.js';
import { makeRng, range, rangeInt, pick, shuffle } from './random.js';

const ROOFS = ['#2e4a56', '#37474f', '#33424e', '#3d4a4a', '#2c3e50', '#40555e'];
const WALLS = ['#1c313a', '#22333c', '#1a2b33', '#243640'];

export function generateWorld(seed, dayCfg) {
  const rng = makeRng(seed);
  const buildings = [];
  const streetW = 170;   // water streets between blocks
  const blockW = 430;
  const blockH = 380;

  // Grid of blocks; each block holds 1-3 buildings, some blocks stay open water.
  let id = 0;
  for (let bx = 0; bx < 6; bx++) {
    for (let by = 0; by < 5; by++) {
      const ox = 90 + bx * (blockW + streetW);
      const oy = 90 + by * (blockH + streetW);
      if (rng() < 0.18) continue; // open plaza / flooded square
      const count = rangeInt(rng, 1, 3);
      for (let i = 0; i < count; i++) {
        const w = range(rng, 120, 210);
        const d = range(rng, 110, 180);
        const x = ox + range(rng, 0, Math.max(10, blockW - w));
        const y = oy + range(rng, 0, Math.max(10, blockH - d));
        const h = range(rng, 46, 95); // height above the waterline
        const windows = [];
        const cols = Math.max(2, Math.floor(w / 42));
        const rows = Math.max(1, Math.floor(h / 34));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            windows.push({
              cx: 14 + c * ((w - 28) / Math.max(1, cols - 1)),
              cy: 12 + r * ((h - 24) / Math.max(1, rows)),
              lit: rng() < 0.45,
              warm: rng() < 0.8,
            });
          }
        }
        buildings.push({
          id: id++,
          x, y, w, d, h,
          roof: pick(rng, ROOFS),
          wall: pick(rng, WALLS),
          windows,
          tank: rng() < 0.4,                       // rooftop water tank
          antenna: rng() < 0.35,                   // rooftop antenna
          seed: Math.floor(rng() * 1e9),
        });
      }
    }
  }

  // Shelter barge: the safe zone, on the open water at the east edge.
  const shelter = { x: WORLD.W - 260, y: WORLD.H * 0.5, radius: 110 };
  // Fuel barge: west side, so refuelling is a real detour.
  const fuelBarge = { x: 260, y: WORLD.H * 0.32, radius: 80 };

  // Keep buildings clear of the barges and the spawn point.
  const clearOf = (b, cx, cy, r) =>
    b.x + b.w < cx - r || b.x > cx + r || b.y + b.d < cy - r || b.y > cy + r;
  const kept = buildings.filter(
    (b) => clearOf(b, shelter.x, shelter.y, 190) && clearOf(b, fuelBarge.x, fuelBarge.y, 160),
  );

  // Current lanes: wide rivers of faster water pushing the boat sideways.
  const currents = [];
  const lanes = 3 + Math.floor(dayCfg.current);
  for (let i = 0; i < lanes; i++) {
    const horizontal = rng() < 0.6;
    currents.push({
      horizontal,
      at: horizontal ? range(rng, 300, WORLD.H - 300) : range(rng, 300, WORLD.W - 300),
      width: range(rng, 120, 200),
      speed: range(rng, 55, 95) * dayCfg.current * (rng() < 0.5 ? 1 : -1),
    });
  }

  // Whirlpools: spinning traps that drag the boat in.
  const whirlpools = [];
  for (let i = 0; i < dayCfg.whirlpools; i++) {
    whirlpools.push({
      x: range(rng, 500, WORLD.W - 500),
      y: range(rng, 400, WORLD.H - 400),
      radius: range(rng, 85, 120),
      spin: rng() < 0.5 ? 1 : -1,
      phase: rng() * Math.PI * 2,
    });
  }

  // Rooftop spawn spots for survivors: near the roof's front (south) edge,
  // so a boat hugging the building below is always within rescue reach.
  const roofSpots = shuffle(
    rng,
    kept.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.d - b.h - 18, building: b })),
  );

  return {
    seed,
    buildings: kept,
    shelter,
    fuelBarge,
    currents,
    whirlpools,
    roofSpots,
    spawn: { x: WORLD.W * 0.5, y: WORLD.H * 0.62 },
  };
}

// Current velocity at a world point (sum of the lanes covering it).
export function currentAt(world, x, y) {
  let vx = 0;
  let vy = 0;
  for (const c of world.currents) {
    if (c.horizontal) {
      if (Math.abs(y - c.at) < c.width / 2) vx += c.speed;
    } else if (Math.abs(x - c.at) < c.width / 2) {
      vy += c.speed;
    }
  }
  return { vx, vy };
}

// Push a circle out of every building footprint. Returns true on a hard hit.
export function collideBuildings(world, body, vx, vy) {
  let hardHit = false;
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.d));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const dist2 = dx * dx + dy * dy;
    const r = body.radius;
    if (dist2 >= r * r) continue;
    const dist = Math.sqrt(dist2) || 0.001;
    const pushX = (dx / dist) * (r - dist);
    const pushY = (dy / dist) * (r - dist);
    body.x += pushX;
    body.y += pushY;
    const speed = Math.hypot(vx, vy);
    if (speed > 200) hardHit = true;
    // Kill the velocity component into the wall.
    const dot = vx * (dx / dist) + vy * (dy / dist);
    if (dot < 0) {
      body.vx -= (dx / dist) * dot * 1.4;
      body.vy -= (dy / dist) * dot * 1.4;
    }
  }
  return hardHit;
}
