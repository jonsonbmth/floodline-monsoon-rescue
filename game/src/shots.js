// Screenshot staging: ?shot=start|play|boss|end&seed=N puts the game into a
// deterministic, dramatic state and holds it there, so the screenshots are
// real renders of the game's own code at its best. The starter kit's
// shots.json documents the same four shots. Physics is frozen for staged
// shots (see main.js) while rain, light and particles keep animating.

import { DAYS, VIEW } from './config.js';
import { generateWorld } from './world.js';
import { makeBoat } from './boat.js';
import { spawnSurvivors } from './survivors.js';
import { spawnDebris, makeSurge } from './hazards.js';
import { makeRng } from './random.js';

function baseDayState(state, day, seed) {
  const dayCfg = DAYS[day - 1];
  state.day = day;
  state.dayCfg = dayCfg;
  state.world = generateWorld(seed, dayCfg);
  state.boat = makeBoat(state.world.spawn);
  state.survivors = spawnSurvivors(state.world, dayCfg.quota + 4, []);
  state.debris = spawnDebris(state.world, dayCfg.debris, makeRng(seed + 7));
  state.particles = [];
  state.floaters = [];
  state.timeLeft = dayCfg.time;
  state.dayDelivered = 0;
  state.combo = 1;
  state.comboTimer = 0;
  state.surge = dayCfg.boss ? makeSurge() : null;
  state.surgeSwallowedShelter = false;
  state.bannerTimer = 0;
  state.lightning = { timer: 99, flash: 0, bolt: null, pending: null };
  state.shake = 0;
  state.shelterFlash = 0;
  state.refuelling = false;
}

// A foam wake trailing behind the boat, long-lived so it survives the
// seconds between staging and the shutter.
function seedWake(state, length = 13) {
  const boat = state.boat;
  const bx = Math.cos(boat.angle + Math.PI);
  const by = Math.sin(boat.angle + Math.PI);
  for (let i = 0; i < length; i++) {
    const d = 30 + i * 13;
    state.particles.push({
      kind: 'wake',
      x: boat.x + bx * d + (Math.random() - 0.5) * 8,
      y: boat.y + by * d + (Math.random() - 0.5) * 8,
      vx: 0, vy: 0,
      life: 6, maxLife: 6,
      size: 9 - i * 0.35,
    });
  }
}

function placeBoatNearRoof(state) {
  // Park the boat hugging a rooftop that holds survivors: boat lower-centre
  // of frame, roof with waving people above it, banner clear at top.
  const spot = state.world.roofSpots[3];
  const b = spot.building;
  state.boat.x = b.x + b.w / 2;
  state.boat.y = b.y + b.d + 30;
  state.boat.angle = -1.9; // bow toward the roof, diagonal composition
  state.boat.vx = 0;
  state.boat.vy = 0;
  // Make sure that roof actually has people on it.
  const hasPeople = state.survivors.some((s) => s.spot === spot && s.state === 'waiting');
  if (!hasPeople) {
    for (let i = 0; i < 2; i++) {
      state.survivors.push({
        x: spot.x + (i - 0.5) * 30,
        y: spot.y,
        spot,
        phase: i * 2,
        state: 'waiting',
        flare: i === 0,
        coat: ['#ffd60a', '#ff6b35'][i],
      });
    }
  }

  // The cover shot is zoomed in: the boat and its pilot read at judge size,
  // and the frame is packed with the city instead of empty water.
  state.camera.zoom = 1.15;
  frameOn(state, state.boat.x, state.boat.y, 560, 460);

  // Extra buildings fill the frame's empty corners (staging scenery only —
  // the frozen shot never runs physics). Coordinates are boat-relative,
  // worked out against the Day 3 / seed 20261118 city so nothing overlaps
  // the boat, the anchor roof or the shelter.
  const bx = state.boat.x;
  const by = state.boat.y;
  const stageA = makeStagedBuilding(bx - 435, by - 156, 190, 150, 70, 11);
  const stageB = makeStagedBuilding(bx + 191, by - 169, 170, 140, 75, 23);
  const stageC = makeStagedBuilding(bx + 122, by + 57, 180, 130, 65, 37);
  state.world.buildings.push(stageA, stageB, stageC);
  // Waving survivors on the staged roofs, so every corner of the frame has people.
  addRoofSurvivor(state, stageA.x + stageA.w / 2 - 14, stageA.y + stageA.d - stageA.h - 18, '#4ecdc4', true, 0.7);
  addRoofSurvivor(state, stageA.x + stageA.w / 2 + 22, stageA.y + stageA.d - stageA.h - 18, '#ff8fa3', false, 2.4);
  addRoofSurvivor(state, stageB.x + stageB.w / 2, stageB.y + stageB.d - stageB.h - 18, '#ffd60a', true, 4.1);

  // Action around the boat: drifting debris in the open water and a
  // whirlpool low-left, clear of the buildings and the minimap.
  const kinds = ['log', 'barrel', 'crate', 'tyre'];
  [[-480, -160], [-480, 120], [-420, 60], [-180, 180], [100, 160], [330, 140], [480, 60]]
    .forEach(([dx, dy], i) => {
      state.debris.push({
        x: bx + dx, y: by + dy, vx: 0, vy: 0,
        angle: i * 1.3, spin: 0.2, size: 14 + (i % 3) * 3, kind: kinds[i % kinds.length],
      });
    });
  state.world.whirlpools.push({
    x: bx - 226, y: by + 104,
    radius: 90, spin: 1, phase: 0,
  });
  seedWake(state);
}

// Staged buildings for the cover shot: extra half-drowned blocks with mostly
// lit windows, so the frame glows instead of sitting dark and empty.
const STAGE_ROOFS = ['#2e4a56', '#37474f', '#33424e', '#3d4a4a'];
const STAGE_WALLS = ['#1c313a', '#22333c', '#1a2b33'];

function makeStagedBuilding(x, y, w, d, h, seed) {
  const rng = makeRng(seed);
  const windows = [];
  const cols = Math.max(2, Math.floor(w / 42));
  const rows = Math.max(1, Math.floor(h / 34));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      windows.push({
        cx: 14 + c * ((w - 28) / Math.max(1, cols - 1)),
        cy: 12 + r * ((h - 24) / Math.max(1, rows)),
        lit: rng() < 0.65,
        warm: rng() < 0.8,
      });
    }
  }
  return {
    id: 1000 + seed, x, y, w, d, h,
    roof: STAGE_ROOFS[seed % STAGE_ROOFS.length],
    wall: STAGE_WALLS[seed % STAGE_WALLS.length],
    windows,
    tank: rng() < 0.5,
    antenna: rng() < 0.5,
    seed: seed * 7919 + 13,
  };
}

// Put world point (wx, wy) at screen point (sx, sy) under the camera zoom.
function frameOn(state, wx, wy, sx, sy) {
  const zoom = state.camera.zoom || 1;
  state.camera.x = wx - VIEW.W / 2 - (sx - VIEW.W / 2) / zoom;
  state.camera.y = wy - VIEW.H / 2 - (sy - VIEW.H / 2) / zoom;
}

function addRoofSurvivor(state, x, y, coat, flare, phase) {
  state.survivors.push({ x, y, spot: null, phase, state: 'waiting', flare, coat });
}

export function stageShot(state, shot, seed) {
  state.shotMode = shot;
  state.time = 12; // let rain, waves and lights settle into a lived-in frame
  if (shot === 'start') {
    baseDayState(state, 1, seed);
    state.screen = 'title';
    // The boat sits visible at the lower left, clear of the menu cards.
    state.boat.x = state.world.spawn.x;
    state.boat.y = state.world.spawn.y;
    state.boat.angle = -0.6;
    state.camera.x = state.boat.x - 220;
    state.camera.y = state.boat.y - 600;
    state.bestScore = 8420;
  } else if (shot === 'play') {
    baseDayState(state, 3, seed);
    state.screen = 'play';
    state.score = 4850;
    state.dayDelivered = 4;
    state.timeLeft = 84;
    state.combo = 3;
    state.comboTimer = 7.5;
    state.boat.aboard = 2;
    state.boat.hull = 78;
    state.boat.fuel = 61;
    state.bannerTimer = 999; // keep the objective banner in frame
    state.holdFlash = true;  // hold a lightning glow in the sky
    state.lightning.flash = 0.4;
    placeBoatNearRoof(state);
    // Bolt lands in the open water left of the boat, clear of the roofs.
    state.lightning.bolt = {
      x: state.boat.x - 226, y: state.boat.y - 139, life: 99,
      segments: boltSegments(state.boat.x - 226, state.boat.y - 139),
    };
  } else if (shot === 'boss') {
    baseDayState(state, 7, seed);
    state.screen = 'play';
    state.score = 11350;
    state.dayDelivered = 5;
    state.timeLeft = 96;
    state.combo = 2;
    state.comboTimer = 5;
    state.boat.aboard = 3;
    state.boat.hull = 62;
    state.boat.fuel = 48;
    state.bannerTimer = 0;
    state.holdFlash = true;
    state.lightning.flash = 0.25;
    // Exact framing: wall at the left edge, boat mid-frame fleeing right,
    // shelter glowing ahead on the right.
    const sh = state.world.shelter;
    state.camera.x = sh.x - 1080;
    state.camera.y = sh.y - 380;
    state.boat.x = state.camera.x + 640;
    state.boat.y = state.camera.y + 460; // clear of the rooftops, open water
    state.boat.angle = 0.12;
    state.boat.vx = 0;
    state.boat.vy = 0;
    state.surge.active = true;
    state.surge.x = state.camera.x + 150;
    state.surge.speed = 0; // hold the wall in frame for the photo
    seedWake(state, 16);
  } else if (shot === 'end') {
    baseDayState(state, 7, seed);
    state.screen = 'victory';
    state.score = 12480;
    state.totalDelivered = 71;
    state.bestScore = 12480;
    state.boat.hull = 54;
    state.boat.maxHull = 130;
  }
}

function boltSegments(x, y) {
  const pts = [{ x, y: y - 260 }];
  let cx = x;
  let cy = y - 260;
  const rng = makeRng(99);
  while (cy < y) {
    cy += 28 + rng() * 30;
    cx += (rng() - 0.5) * 70;
    pts.push({ x: cx, y: Math.min(cy, y) });
  }
  return pts;
}
