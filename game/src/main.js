// FLOODLINE — Monsoon Rescue: entry point. Owns the game state, the screen
// state machine (title / briefing / play / upgrade / gameover / victory),
// the fixed-clamp loop, day flow, scoring and the camera.

import { VIEW, WORLD, DAYS, UPGRADES, SCORE } from './config.js';
import { makeRng, shuffle } from './random.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { generateWorld } from './world.js';
import { makeBoat, updateBoat } from './boat.js';
import { spawnSurvivors, tryRescue, tryDeliver, tryRefuel, nearestRescuable } from './survivors.js';
import { spawnDebris, updateDebris, updateLightning, makeSurge, updateSurge } from './hazards.js';
import { render } from './render.js';
import { drawHUD, drawTitle, drawBriefing, drawUpgrade, drawGameOver, drawVictory, drawPause } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.W;
canvas.height = VIEW.H;

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number(params.get('seed')) || 20261118;

const audio = new AudioEngine();
const input = new Input(canvas);

const state = {
  screen: 'title',
  paused: false,
  day: 1,
  dayCfg: DAYS[0],
  timeLeft: DAYS[0].time,
  score: 0,
  combo: 1,
  comboTimer: 0,
  dayDelivered: 0,
  totalDelivered: 0,
  lastDayBonus: 0,
  loseReason: '',
  boat: null,
  world: null,
  survivors: [],
  debris: [],
  particles: [],
  floaters: [],
  lightning: { timer: 8, flash: 0, bolt: null, pending: null },
  surge: null,
  surgeSwallowedShelter: false,
  camera: { x: 0, y: 0, zoom: 1 },
  time: 0,
  dt: 0,
  shake: 0,
  shelterFlash: 0,
  refuelling: false,
  rescueTarget: null,
  bannerTimer: 0,
  upgradeChoices: [],
  upgradeRects: [],
  bestScore: loadBest(),
  runSeed: (Math.random() * 1e9) | 0,
  input,
  audio,
  shotMode: null,
  holdFlash: false,
  strandedTimer: 0,
  ownedUpgrades: new Set(),
};

function loadBest() {
  try {
    return Number(window.localStorage.getItem('floodline-best') || 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    try {
      window.localStorage.setItem('floodline-best', String(state.bestScore));
    } catch { /* storage unavailable: best score just lives for the session */ }
  }
}

// --- Run and day flow ---------------------------------------------------------

function newRun() {
  state.score = 0;
  state.totalDelivered = 0;
  state.ownedUpgrades = new Set();
  state.runSeed = (Math.random() * 1e9) | 0;
  state.day = 1;
  startDay(1, true);
}

function startDay(day, firstRun = false) {
  const dayCfg = DAYS[day - 1];
  state.day = day;
  state.dayCfg = dayCfg;
  state.world = generateWorld(state.runSeed + day * 7919, dayCfg);
  const oldBoat = state.boat;
  state.boat = makeBoat(state.world.spawn);
  if (oldBoat && !firstRun) {
    // Upgrades and wear carry over; the depot refuels and patches overnight.
    const b = state.boat;
    b.maxHull = oldBoat.maxHull;
    b.hull = Math.min(b.maxHull, oldBoat.hull + 25);
    b.maxFuel = oldBoat.maxFuel;
    b.fuel = b.maxFuel;
    b.capacity = oldBoat.capacity;
    b.accel = oldBoat.accel;
    b.maxSpeed = oldBoat.maxSpeed;
    b.rescueRadius = oldBoat.rescueRadius;
    b.lightRadius = oldBoat.lightRadius;
    b.spotRadius = oldBoat.spotRadius;
    b.debrisArmor = oldBoat.debrisArmor;
    b.regen = oldBoat.regen;
  }
  state.survivors = spawnSurvivors(state.world, dayCfg.quota + 4, []);
  state.debris = spawnDebris(state.world, dayCfg.debris, makeRng(state.runSeed + day));
  state.particles = [];
  state.floaters = [];
  state.timeLeft = dayCfg.time;
  state.dayDelivered = 0;
  state.combo = 1;
  state.comboTimer = 0;
  state.lightning = { timer: 6 + Math.random() * 6, flash: 0, bolt: null, pending: null };
  state.surge = dayCfg.boss ? makeSurge() : null;
  state.surgeSwallowedShelter = false;
  state.bannerTimer = 4.5;
  state.strandedTimer = 0;
  state.screen = 'briefing';
  state.paused = false;
  snapCamera();
}

function dayComplete() {
  const boat = state.boat;
  const timeBonus = Math.round(state.timeLeft) * SCORE.timeBonusPerSec;
  const hullBonus = Math.round(boat.hull) * SCORE.hullBonusPerPoint;
  const bonus = timeBonus + hullBonus + SCORE.dayClearBonus;
  state.score += bonus;
  state.lastDayBonus = bonus;
  if (state.day >= 7) {
    state.screen = 'victory';
    audio.victory();
    saveBest();
    return;
  }
  // Offer 3 upgrades the player does not own yet (plus fallbacks).
  const pool = UPGRADES.filter((u) => !state.ownedUpgrades.has(u.id));
  const choices = shuffle(makeRng((Math.random() * 1e9) | 0), pool).slice(0, 3);
  const fallbacks = [
    { id: 'repair', name: 'EMERGENCY REPAIRS', icon: 'WRENCH', desc: 'Restore 60 hull right now. The depot works through the night.', apply: (b) => { b.hull = Math.min(b.maxHull, b.hull + 60); } },
    { id: 'cache', name: 'SUPPLY CACHE', icon: 'CRATE', desc: 'Salvage worth +500 points, found floating near the shelter.', apply: () => { state.score += 500; } },
    { id: 'fuel', name: 'FUEL DRUMS', icon: 'DRUM', desc: 'A full tank plus +20 max fuel, strapped to the stern.', apply: (b) => { b.maxFuel += 20; b.fuel = b.maxFuel; } },
  ];
  while (choices.length < 3) choices.push(fallbacks[choices.length]);
  state.upgradeChoices = choices;
  state.screen = 'upgrade';
  audio.upgrade();
}

function gameOver(reason) {
  state.loseReason = reason;
  state.screen = 'gameover';
  audio.gameover();
  saveBest();
}

// --- Camera -------------------------------------------------------------------

function snapCamera() {
  state.camera.x = clamp(state.boat.x - VIEW.W / 2, 0, WORLD.W - VIEW.W);
  state.camera.y = clamp(state.boat.y - VIEW.H / 2, 0, WORLD.H - VIEW.H);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function updateCamera(dt) {
  if (state.shotMode) return; // staged shots hold their framing
  const boat = state.boat;
  const lookX = boat.x + boat.vx * 0.35 - VIEW.W / 2;
  const lookY = boat.y + boat.vy * 0.35 - VIEW.H / 2;
  const k = Math.min(1, 3.2 * dt);
  state.camera.x = clamp(state.camera.x + (lookX - state.camera.x) * k, 0, WORLD.W - VIEW.W);
  state.camera.y = clamp(state.camera.y + (lookY - state.camera.y) * k, 0, WORLD.H - VIEW.H);
}

// --- Per-frame update -----------------------------------------------------------

function update(dt) {
  state.dt = dt;
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 26);
  state.shelterFlash = Math.max(0, state.shelterFlash - dt * 1.5);
  state.refuelling = false;

  // Particles and floating text always animate.
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-1.5 * dt);
    p.vy *= Math.exp(-1.5 * dt);
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) f.life -= dt;
  state.floaters = state.floaters.filter((f) => f.life > 0);

  if (input.anyGesture) audio.ensure();
  audio.updatePad(dt, state.screen === 'play');

  if (input.wasPressed('KeyM')) {
    audio.setMuted(!audio.muted);
  }

  switch (state.screen) {
    case 'title': {
      // Slow cinematic pan over the flooded city behind the title.
      if (!state.shotMode) {
        state.camera.x = clamp(500 + Math.sin(state.time * 0.07) * 420, 0, WORLD.W - VIEW.W);
        state.camera.y = clamp(700 + Math.cos(state.time * 0.05) * 260, 0, WORLD.H - VIEW.H);
      }
      updateLightning(state, dt);
      if (input.wasPressed('Enter') || input.wasClicked()) {
        audio.click();
        audio.siren();
        state.screen = 'briefing';
      }
      break;
    }
    case 'briefing': {
      if (input.wasPressed('Enter') || input.wasClicked()) {
        audio.click();
        state.screen = 'play';
      }
      break;
    }
    case 'play': {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        state.paused = !state.paused;
        audio.click();
      }
      if (input.wasPressed('KeyR')) {
        newRun();
        break;
      }
      if (state.paused) break;

      // Staged screenshots freeze the physics so the composition holds
      // exactly as framed; rain, light and particles still animate.
      state.rescueTarget = nearestRescuable(state);
      if (state.holdFlash) state.lightning.flash = 0.35;
      if (state.shotMode) break;

      state.timeLeft -= dt;
      if (state.comboTimer > 0) state.comboTimer -= dt;
      if (state.bannerTimer > 0 && state.bannerTimer < 900) state.bannerTimer -= dt;

      updateBoat(state.boat, state.world, input, dt, state);
      updateDebris(state, dt);
      updateLightning(state, dt);

      // The Surge arrives partway through Day 7.
      if (state.surge && !state.surge.active) {
        state.surge.delay -= dt;
        if (state.surge.delay <= 0) {
          state.surge.active = true;
          audio.siren();
          audio.thunder();
          state.shake = 12;
        }
      }
      updateSurge(state, dt);

      // Rescue / deliver / refuel.
      if (input.wasPressed('KeyE') || input.wasPressed('Space')) tryRescue(state);
      if (tryDeliver(state)) { /* delivered: score and combo updated inside */ }
      tryRefuel(state);

      // Engine sound follows the boat.
      const speed01 = Math.hypot(state.boat.vx, state.boat.vy) / state.boat.maxSpeed;
      audio.setEngine(Math.min(1, speed01), state.boat.throttling, state.boat.boosting);
      audio.setRainLevel(state.dayCfg.rain);

      // Lose conditions.
      if (state.boat.hull <= 0) {
        gameOver('Your boat broke apart in the flood. The city keeps its silence.');
      } else if (state.boat.fuel <= 0) {
        state.strandedTimer += dt;
        if (state.strandedTimer > 8) {
          gameOver('Out of fuel, adrift in the black water. The current decides now.');
        }
      } else {
        state.strandedTimer = 0;
      }
      if (state.surgeSwallowedShelter) {
        gameOver('The Surge swallowed the shelter. There was nowhere left to run.');
      } else if (state.timeLeft <= 0 && state.screen === 'play') {
        if (state.dayDelivered >= state.dayCfg.quota) dayComplete();
        else gameOver(`The water rose past the rooftops. ${state.dayCfg.quota - state.dayDelivered} souls were left behind.`);
      }
      // Win condition: quota met before the clock runs out.
      if (state.screen === 'play' && state.dayDelivered >= state.dayCfg.quota) {
        dayComplete();
      }

      updateCamera(dt);
      break;
    }
    case 'upgrade': {
      const idx = input.wasPressed('Digit1') ? 0
        : input.wasPressed('Digit2') ? 1
        : input.wasPressed('Digit3') ? 2 : -1;
      let chosen = idx >= 0 ? state.upgradeChoices[idx] : null;
      if (!chosen && input.wasClicked()) {
        for (const r of state.upgradeRects) {
          if (input.pointInRect(input.mouse.x, input.mouse.y, r)) {
            chosen = state.upgradeChoices.find((u) => u.id === r.id);
          }
        }
      }
      if (chosen) {
        chosen.apply(state.boat);
        state.ownedUpgrades.add(chosen.id);
        audio.click();
        startDay(state.day + 1);
      }
      break;
    }
    case 'gameover':
    case 'victory': {
      if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasClicked()) {
        audio.click();
        newRun();
      }
      break;
    }
  }
}

function draw() {
  render(ctx, state);
  if (state.screen === 'title') drawTitle(ctx, state);
  else if (state.screen === 'briefing') drawBriefing(ctx, state);
  else if (state.screen === 'upgrade') drawUpgrade(ctx, state);
  else if (state.screen === 'gameover') drawGameOver(ctx, state);
  else if (state.screen === 'victory') drawVictory(ctx, state);
  else if (state.screen === 'play') {
    drawHUD(ctx, state);
    if (state.paused) drawPause(ctx, state);
  }
}

// --- Boot -----------------------------------------------------------------------

// A world behind the title screen, so the menu is alive from frame one.
state.world = generateWorld(state.runSeed, DAYS[0]);
state.boat = makeBoat(state.world.spawn);
state.survivors = spawnSurvivors(state.world, 6, []);
state.debris = spawnDebris(state.world, 12, makeRng(state.runSeed + 3));
snapCamera();

if (shotParam) {
  stageShot(state, shotParam, seedParam);
}

let last = performance.now();
let frames = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  input.endFrame();
  frames++;
  if (frames === 3) window.__floodlineReady = true;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
