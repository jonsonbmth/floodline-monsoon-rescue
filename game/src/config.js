// FLOODLINE — Monsoon Rescue: balance, days, upgrades and palette.
// Every tuning number lives here so the rest of the game reads like a design doc.

export const VIEW = { W: 1280, H: 720 };

export const WORLD = { W: 3400, H: 2500 };

// One day of the flood. quota = survivors to deliver before the clock runs out.
// rain 0..1, dark 0..1 (0 = dusk, 1 = pitch-black storm night).
export const DAYS = [
  {
    day: 1, name: 'FIRST RAIN', quota: 5, time: 120, debris: 10, whirlpools: 1,
    rain: 0.45, dark: 0.15, lightning: false, current: 1.0,
    briefing: 'The river broke its banks at dawn. Get the boat out — rooftops are already calling.',
  },
  {
    day: 2, name: 'RISING WATER', quota: 7, time: 130, debris: 14, whirlpools: 2,
    rain: 0.55, dark: 0.25, lightning: false, current: 1.1,
    briefing: 'The water is a metre higher and still climbing. Debris is drifting into the canals.',
  },
  {
    day: 3, name: 'THE LONG NIGHT', quota: 9, time: 140, debris: 18, whirlpools: 2,
    rain: 0.65, dark: 0.45, lightning: true, current: 1.2,
    briefing: 'Night falls and the storm finds its voice. Lightning hunts the open water — watch the sky.',
  },
  {
    day: 4, name: 'BROKEN LEVEE', quota: 11, time: 150, debris: 22, whirlpools: 3,
    rain: 0.7, dark: 0.5, lightning: true, current: 1.35,
    briefing: 'The north levee gave way. Currents are tearing through the streets — ride them, don\'t fight them.',
  },
  {
    day: 5, name: 'BLACK WATER', quota: 13, time: 160, debris: 26, whirlpools: 3,
    rain: 0.8, dark: 0.65, lightning: true, current: 1.45,
    briefing: 'No moon tonight. Your searchlight is the only sunrise this city gets.',
  },
  {
    day: 6, name: 'THE LAST LIGHT', quota: 15, time: 170, debris: 30, whirlpools: 4,
    rain: 0.9, dark: 0.8, lightning: true, current: 1.55,
    briefing: 'The dam upstream is groaning. Rescue everyone you can — tomorrow the river comes for the city.',
  },
  {
    day: 7, name: 'THE SURGE', quota: 8, time: 200, debris: 34, whirlpools: 4,
    rain: 1.0, dark: 0.9, lightning: true, current: 1.7, boss: true,
    briefing: 'THE DAM HAS BROKEN. A wall of water is crossing the city. Rescue the last eight and outrun it.',
  },
];

export const BOAT = {
  radius: 22,
  accel: 420,          // px/s^2
  maxSpeed: 265,       // px/s
  boostMult: 1.55,
  drag: 1.6,           // exponential damping
  turnRate: 7.5,       // rad/s toward velocity
  hull: 100,
  fuel: 100,
  fuelDrain: 0.85,     // per second
  boostDrain: 1.6,     // extra per second while boosting
  capacity: 4,
  rescueRadius: 150, // generous: the line is thrown from the waterline
  invulnTime: 1.1,     // seconds of grace after a hit
};

export const SCORE = {
  perSurvivor: 100,
  comboWindow: 12,     // seconds to chain deliveries
  maxCombo: 5,
  timeBonusPerSec: 10,
  hullBonusPerPoint: 5,
  dayClearBonus: 250,
};

export const HAZARDS = {
  debrisDamage: 12,
  debrisKnockback: 320,
  lightningDamage: 20,
  lightningRadius: 70,
  lightningWarnTime: 1.4,
  surgeSpeed: 62,      // px/s, slower than the boat but relentless
  surgeDamage: 40,
  whirlpoolPull: 190,
  whirlpoolRadius: 110,
};

// Upgrades offered between days. Each can be owned once; apply() mutates the boat.
export const UPGRADES = [
  {
    id: 'hull', name: 'STEEL HULL PLATING', icon: 'SHIELD',
    desc: '+30 max hull and repair 50 right now. The river hits back — hit back harder.',
    apply: (boat) => { boat.maxHull += 30; boat.hull = Math.min(boat.maxHull, boat.hull + 50); },
  },
  {
    id: 'engine', name: 'TURBO OUTBOARD', icon: 'ENGINE',
    desc: '+18% top speed and faster acceleration. Outrun the water, not just the clock.',
    apply: (boat) => { boat.maxSpeed *= 1.18; boat.accel *= 1.18; },
  },
  {
    id: 'seats', name: 'EXTRA BENCH SEATS', icon: 'SEATS',
    desc: '+2 passenger capacity. Fewer trips, bigger deliveries, bigger combos.',
    apply: (boat) => { boat.capacity += 2; },
  },
  {
    id: 'tank', name: 'AUX FUEL TANK', icon: 'FUEL',
    desc: '+40 max fuel and a full tank. Range is life when the barges are far apart.',
    apply: (boat) => { boat.maxFuel += 40; boat.fuel = boat.maxFuel; },
  },
  {
    id: 'lights', name: 'SEARCHLIGHT ARRAY', icon: 'LIGHT',
    desc: 'Wider light cone and survivors glow from further away. Night stops hiding people.',
    apply: (boat) => { boat.lightRadius *= 1.5; boat.spotRadius *= 1.5; },
  },
  {
    id: 'net', name: 'RESCUE NET', icon: 'NET',
    desc: '+45% rescue reach. Pull people in without kissing every rooftop.',
    apply: (boat) => { boat.rescueRadius *= 1.45; },
  },
  {
    id: 'bow', name: 'REINFORCED BOW', icon: 'BOW',
    desc: 'Debris hits deal half damage. Plough through the wreckage.',
    apply: (boat) => { boat.debrisArmor = 0.5; },
  },
  {
    id: 'pump', name: 'BILGE PUMP', icon: 'PUMP',
    desc: 'Slowly repairs the hull while you sail. The boat looks after itself.',
    apply: (boat) => { boat.regen += 0.6; },
  },
];

export const PALETTE = {
  waterDeep: '#0a2a3d',
  waterMid: '#0e3a52',
  waterLight: '#175a73',
  foam: '#cfe9ef',
  amber: '#ffb347',
  amberHot: '#ffd27a',
  rescue: '#ff6b35',
  rescueDark: '#c94a1e',
  raincoat: '#ffd60a',
  helmet: '#f2f5f7',
  danger: '#ff4d4d',
  ok: '#58d68d',
  ink: '#eaf6f8',
  dim: '#8fb3bd',
};
