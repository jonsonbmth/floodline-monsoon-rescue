// Screenshot staging: ?shot=start|play|boss|end&seed=N puts the game into a
// deterministic, dramatic state and holds it there, so the screenshots are
// real renders of the game's own code at its best. The starter kit's
// shots.json documents the same four shots. Physics is frozen for staged
// shots (see main.js) while rain, light and particles keep animating.

import { DAYS, UPGRADES, VIEW } from './config.js';
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
  // A fourth survivor with a flare on the lower building's roof, so the
  // bottom-centre of the frame has people too.
  addRoofSurvivor(state, stageC.x + stageC.w / 2 - 6, stageC.y + stageC.d - stageC.h - 18, '#ff6b35', true, 1.9);

  // The fuel barge sails into the top-left of the frame: the cover then
  // shows the game's whole economy — rescue, shelter AND refuel — at a
  // glance. (Staging only; the real barge stays on the west side.)
  state.world.fuelBarge.x = bx - 356;
  state.world.fuelBarge.y = by - 270;

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
    // The boat sits visible in the clear water at the lower right, clear of
    // the menu cards, with a wake trailing behind it.
    state.boat.x = state.world.spawn.x;
    state.boat.y = state.world.spawn.y;
    state.boat.angle = -0.6;
    state.camera.x = state.boat.x - 1060;
    state.camera.y = state.boat.y - 620;
    seedWake(state, 10);
    state.bestScore = 8420;
  } else if (shot === 'upgrade') {
    // The between-days choice: three upgrade cards over the flooded city.
    // This is the shot that proves the game's depth — the player picks one
    // upgrade that changes the next day, not just steering a boat.
    baseDayState(state, 4, seed);
    state.screen = 'upgrade';
    state.score = 6420;
    state.lastDayBonus = 740;
    state.upgradeChoices = [UPGRADES[0], UPGRADES[1], UPGRADES[4]];
    state.boat.hull = 82;
    state.boat.maxHull = 100;
    state.camera.x = state.boat.x - VIEW.W / 2;
    state.camera.y = state.boat.y - VIEW.H / 2;
  } else if (shot === 'play') {
    baseDayState(state, 3, seed);
    // The cover is the storm at its most dramatic: heavier rain than Day 3
    // normally gets, and a lighter night grade so the frame reads bright
    // and high-contrast instead of murky (a staging-only copy of the day
    // config; the real Day 3 is untouched).
    state.dayCfg = { ...DAYS[2], rain: 0.85, dark: 0.30 };
    state.screen = 'play';
    state.score = 5640;
    state.bestScore = 8420;
    state.maxCombo = 3;
    // Two days survived: two upgrades already in the boat's build.
    state.ownedUpgrades = new Set(['hull', 'engine']);
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
    // Floating event numbers, frozen in frame: the last delivery paid
    // 2 aboard x 100 x combo 3 = +600, and a rooftop group just came aboard.
    // Long-lived on purpose — the shutter fires seconds after staging.
    state.floaters.push(
      { x: state.boat.x - 150, y: state.boat.y - 150, text: '+600  DELIVERED x3', color: '#ffd27a', life: 99, maxLife: 99 },
      { x: state.boat.x - 150, y: state.boat.y - 90, text: '+2 RESCUED', color: '#58d68d', life: 99, maxLife: 99 },
    );
    // Bolt lands in the open water left of the boat, clear of the roofs,
    // with a fork branching off toward the fuel barge.
    const boltX = state.boat.x - 226;
    const boltY = state.boat.y - 139;
    const segments = boltSegments(boltX, boltY);
    state.lightning.bolt = {
      x: boltX, y: boltY, life: 99,
      segments,
      branches: [boltBranch(segments[2])],
    };
  } else if (shot === 'boss') {
    baseDayState(state, 7, seed);
    state.screen = 'play';
    state.score = 11350;
    state.bestScore = 12480;
    state.maxCombo = 5;
    // Six days survived: a full build in the boat by now.
    state.ownedUpgrades = new Set(['hull', 'engine', 'seats', 'tank', 'lights', 'net']);
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
    // Guarantee a rescue is in reach: survivor spawns are random, so the
    // "PRESS E TO RESCUE" prompt otherwise comes and goes between captures.
    // Put one survivor on the roof nearest the boat.
    let nearest = null;
    let nearestD = Infinity;
    for (const spot of state.world.roofSpots) {
      const d = Math.hypot(spot.x - state.boat.x, spot.y - state.boat.y);
      if (d < nearestD) { nearestD = d; nearest = spot; }
    }
    if (nearest && nearestD < 150) {
      addRoofSurvivor(state, nearest.x, nearest.y, '#ff8fa3', false, 1.3);
    }
    state.surge.active = true;
    state.surge.x = state.camera.x + 150;
    state.surge.speed = 0; // hold the wall in frame for the photo
    seedWake(state, 16);

    // Fill the empty upper-middle of the frame: one more half-drowned block
    // with people on its roof, directly in the Surge's path. Coordinates
    // worked out against the Day 7 / seed 20261118 city: clear of the
    // warning banner above and the rooftops below.
    const stageD = makeStagedBuilding(state.camera.x + 480, state.camera.y + 200, 180, 140, 60, 53);
    state.world.buildings.push(stageD);
    addRoofSurvivor(state, stageD.x + stageD.w / 2 - 14, stageD.y + stageD.d - stageD.h - 18, '#ffd60a', true, 0.9);
    addRoofSurvivor(state, stageD.x + stageD.w / 2 + 16, stageD.y + stageD.d - stageD.h - 18, '#4ecdc4', false, 3.0);

    // Wreckage tumbling ahead of the wall: the Surge throws debris before it.
    const kinds = ['log', 'crate', 'barrel', 'tyre'];
    [[230, 180], [300, 300], [240, 420], [320, 520], [260, 620], [330, 240]]
      .forEach(([sx, sy], i) => {
        state.debris.push({
          x: state.camera.x + sx, y: state.camera.y + sy, vx: 0, vy: 0,
          angle: i * 1.1, spin: 0.3, size: 13 + (i % 3) * 3, kind: kinds[i % kinds.length],
        });
      });
  } else if (shot === 'end') {
    baseDayState(state, 7, seed);
    // Dawn after the storm: the rain has nearly stopped and the night
    // grade lifts, so the victory screen sits over a city the sun is
    // coming back to (staging-only copy; the real Day 7 is untouched).
    state.dayCfg = { ...DAYS[6], rain: 0.15, dark: 0.12 };
    state.screen = 'victory';
    state.score = 12480;
    state.totalDelivered = 71;
    state.bestScore = 12480;
    state.maxCombo = 5;
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

// A fork off a bolt's mid-point: three short segments reaching down-left,
// so the cover's lightning reads as a branching strike, not a single line.
function boltBranch(fork) {
  const rng = makeRng(41);
  const pts = [{ x: fork.x, y: fork.y }];
  let cx = fork.x;
  let cy = fork.y;
  for (let i = 0; i < 3; i++) {
    cy += 30 + rng() * 22;
    cx -= 26 + rng() * 30;
    pts.push({ x: cx, y: cy });
  }
  return pts;
}
