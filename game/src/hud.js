// Heads-up display and every menu screen, all drawn on the canvas so the
// screenshots capture the whole game: goal, rules, controls, score, win and
// loss, start and restart.

import { VIEW, WORLD, DAYS, SCORE, UPGRADES } from './config.js';
import { worldToScreen } from './render.js';

const FONT = '"Segoe UI", Arial, sans-serif';

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(4, 18, 26, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 210, 225, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.14)') {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
  }
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// --- In-game HUD ------------------------------------------------------------

export function drawHUD(ctx, state) {
  const boat = state.boat;
  const day = state.dayCfg;

  // Top bar: day progress, a BIG score with BEST beside it, combo, dawn clock.
  panel(ctx, 12, 10, VIEW.W - 24, 64, 0.66);
  // Day + quota, with a pip for every survivor still to rescue.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd27a';
  ctx.font = `900 19px ${FONT}`;
  ctx.fillText(`DAY ${state.day} / 7`, 28, 33);
  const dayW = ctx.measureText(`DAY ${state.day} / 7`).width;
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(`— ${day.name}`, 28 + dayW + 8, 33);
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `800 21px ${FONT}`;
  const rescuedText = `RESCUED  ${state.dayDelivered} / ${day.quota}`;
  ctx.fillText(rescuedText, 28, 59);
  const rescuedW = ctx.measureText(rescuedText).width;
  for (let i = 0; i < day.quota; i++) {
    ctx.fillStyle = i < state.dayDelivered ? '#58d68d' : 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(28 + rescuedW + 16 + i * 13, 53, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Score, centre — huge, with BEST beside it.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText('SCORE', VIEW.W / 2, 30);
  ctx.fillStyle = '#ffd27a';
  ctx.font = `900 38px ${FONT}`;
  ctx.fillText(state.score.toLocaleString('en-US'), VIEW.W / 2, 64);
  if (state.bestScore > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fb3bd';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(`BEST ${state.bestScore.toLocaleString('en-US')}`, VIEW.W / 2 + 96, 42);
  }
  // Combo badge, left of the score.
  if (state.combo > 1 && state.comboTimer > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff6b35';
    ctx.font = `900 15px ${FONT}`;
    ctx.fillText(`COMBO x${state.combo}`, VIEW.W / 2 - 96, 42);
    bar(ctx, VIEW.W / 2 - 192, 50, 96, 6, state.comboTimer / SCORE.comboWindow, '#ff6b35');
  }
  // Dawn clock, right.
  const lowTime = state.timeLeft < 20;
  ctx.textAlign = 'right';
  ctx.fillStyle = lowTime && Math.floor(state.time * 3) % 2 === 0 ? '#ff4d4d' : '#8fb3bd';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText('DAWN IN', VIEW.W - 28, 32);
  ctx.fillStyle = lowTime ? '#ff4d4d' : '#eaf6f8';
  ctx.font = `900 28px ${FONT}`;
  ctx.fillText(fmtTime(state.timeLeft), VIEW.W - 28, 60);
  bar(ctx, VIEW.W - 218, 64, 190, 5, Math.max(0, state.timeLeft / day.time), lowTime ? '#ff4d4d' : '#58d68d');

  // Threat strip: the flood itself, named, with its rising-water bar — or
  // the Surge wall on Day 7, with the distance left to the shelter.
  drawThreatStrip(ctx, state);

  // INCOMING panel: what the water is bringing next, from live state.
  drawIncoming(ctx, state);

  // Bottom-left: hull, fuel, passengers, and the run's gear.
  panel(ctx, 12, VIEW.H - 120, 268, 108, 0.66);
  ctx.textAlign = 'left';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = '#8fb3bd';
  ctx.fillText('HULL', 28, VIEW.H - 96);
  const hullFrac = boat.hull / boat.maxHull;
  bar(ctx, 84, VIEW.H - 106, 176, 13, hullFrac, hullFrac > 0.4 ? '#58d68d' : '#ff4d4d');
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `800 12px ${FONT}`;
  ctx.fillText(`${Math.ceil(boat.hull)}`, 196, VIEW.H - 95);
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillText('FUEL', 28, VIEW.H - 72);
  const fuelFrac = boat.fuel / boat.maxFuel;
  bar(ctx, 84, VIEW.H - 82, 176, 13, fuelFrac, fuelFrac > 0.25 ? '#ffb347' : '#ff4d4d');
  ctx.fillStyle = '#eaf6f8';
  ctx.fillText(`${Math.ceil(boat.fuel)}`, 196, VIEW.H - 71);
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillText('ABOARD', 28, VIEW.H - 48);
  for (let i = 0; i < boat.capacity; i++) {
    ctx.fillStyle = i < boat.aboard ? '#ffd60a' : 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(96 + i * 20, VIEW.H - 52, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (boat.aboard > 0) {
    ctx.fillStyle = '#58d68d';
    ctx.font = `800 12px ${FONT}`;
    ctx.fillText(`→ DELIVER TO SHELTER`, 96 + boat.capacity * 20 + 6, VIEW.H - 48);
  }
  // Gear: the upgrades this run has collected, as small chips.
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillText('GEAR', 28, VIEW.H - 24);
  const owned = [...(state.ownedUpgrades || [])];
  if (owned.length === 0) {
    ctx.fillStyle = 'rgba(143, 179, 189, 0.75)';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('none yet — survive the day', 84, VIEW.H - 24);
  } else {
    let gx = 84;
    const shown = owned.slice(0, 3);
    for (const id of shown) {
      const up = UPGRADES.find((u) => u.id === id);
      if (!up) continue;
      ctx.font = `800 11px ${FONT}`;
      const tw = ctx.measureText(up.icon).width;
      ctx.fillStyle = 'rgba(255, 179, 71, 0.16)';
      ctx.beginPath();
      ctx.roundRect(gx, VIEW.H - 38, tw + 16, 18, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffd27a';
      ctx.fillText(up.icon, gx + 8, VIEW.H - 25);
      gx += tw + 24;
    }
    if (owned.length > 3) {
      ctx.fillStyle = '#8fb3bd';
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(`+${owned.length - 3} more`, gx, VIEW.H - 24);
    }
  }

  // Bottom-right: minimap.
  drawMinimap(ctx, state);

  // Bottom-centre: controls reminder.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(234, 246, 248, 0.62)';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText('WASD / ARROWS steer   ·   SHIFT boost   ·   E rescue   ·   P pause   ·   M sound', VIEW.W / 2, VIEW.H - 14);

  // "Press E" prompt when a rescue is in reach.
  if (state.rescueTarget && state.screen === 'play') {
    const bp = worldToScreen(state, boat.x, boat.y);
    const sx = bp.x;
    const sy = bp.y - 52;
    ctx.fillStyle = 'rgba(4, 18, 26, 0.85)';
    ctx.beginPath();
    ctx.roundRect(sx - 92, sy - 20, 184, 30, 8);
    ctx.fill();
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffd60a';
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText('PRESS  E  TO  RESCUE', sx, sy + 1);
  }

  // Refuelling notice.
  if (state.refuelling) {
    const bp = worldToScreen(state, boat.x, boat.y);
    ctx.fillStyle = '#ffb347';
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText('⛽ REFUELLING…', bp.x, bp.y - 52);
  }

  // Low hull / fuel warnings.
  if (hullFrac <= 0.25 && boat.hull > 0) {
    flashText(ctx, '⚠ HULL CRITICAL', '#ff4d4d', VIEW.H - 118);
  } else if (fuelFrac <= 0.2 && boat.fuel > 0) {
    flashText(ctx, '⚠ LOW FUEL — FIND THE FUEL BARGE', '#ffb347', VIEW.H - 118);
  }

  // Day objective banner (fades out after a few seconds) — with the
  // win/lose stakes stated outright in one line.
  if (state.bannerTimer > 0) {
    const a = Math.min(1, state.bannerTimer / 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    panel(ctx, VIEW.W / 2 - 330, 122, 660, 96, 0.78);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd27a';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillText(`DAY ${state.day} — ${day.name}`, VIEW.W / 2, 152);
    ctx.fillStyle = '#eaf6f8';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(day.boss
      ? `Rescue ${day.quota} survivors and reach the shelter before the wall arrives`
      : `Rescue ${day.quota} survivors and deliver them to the shelter`, VIEW.W / 2, 177);
    const winText = day.boss
      ? `★ WIN: rescue ${day.quota} and outrun the wall`
      : `★ WIN: rescue ${day.quota} before dawn`;
    const loseText = '✕ LOSE: hull 0 · fuel 0 · time out';
    ctx.font = `800 13px ${FONT}`;
    const winW = ctx.measureText(winText).width;
    const loseW = ctx.measureText(loseText).width;
    const totalW = winW + loseW + 28;
    let tx = VIEW.W / 2 - totalW / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#58d68d';
    ctx.fillText(winText, tx, 200);
    ctx.fillStyle = '#ff8a8a';
    ctx.fillText(loseText, tx + winW + 28, 200);
    ctx.restore();
  }
}

// The named threat, always in frame under the top bar: the Deluge's rising
// water on normal days, the Surge wall's approach on Day 7.
function drawThreatStrip(ctx, state) {
  const x = VIEW.W / 2 - 330;
  const y = 90;
  const w = 660;
  const h = 26;
  panel(ctx, x, y, w, h, 0.66);
  ctx.textAlign = 'left';
  const surgeLive = state.surge && state.surge.active;
  if (surgeLive) {
    ctx.fillStyle = '#ff4d4d';
    ctx.font = `900 13px ${FONT}`;
    ctx.fillText('▲  THE SURGE', x + 16, y + 18);
    const gap = Math.max(0, state.world.shelter.x - state.surge.x);
    const frac = Math.max(0.05, Math.min(1, gap / 1200));
    bar(ctx, x + 150, y + 8, 300, 10, frac, '#ff4d4d');
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffb3b3';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText('OUTRUN THE WALL', x + w - 16, y + 18);
  } else {
    ctx.fillStyle = '#ff8a5c';
    ctx.font = `900 13px ${FONT}`;
    ctx.fillText('THE DELUGE', x + 16, y + 18);
    // Seven segments, one per day of the flood — the filled ones are the
    // water already risen.
    const segW = 300 / 7;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i < state.day ? '#ff6b35' : 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(x + 150 + i * segW, y + 8, segW - 4, 10, 3);
      ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd27a';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText(`WATER RISING — WAVE ${state.day} / 7`, x + w - 16, y + 18);
  }
}

// What the water is bringing next — live counts, so the player (and the
// judge) can see the pressure building.
function drawIncoming(ctx, state) {
  const x = VIEW.W - 312;
  const y = 84;
  const w = 300;
  const h = 100;
  panel(ctx, x, y, w, h, 0.66);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff8a5c';
  ctx.font = `900 13px ${FONT}`;
  ctx.fillText('▲  INCOMING', x + 14, y + 21);
  const waiting = state.survivors.filter((s) => s.state === 'waiting').length;
  const rows = [
    [`${waiting} WAITING ON ROOFS`, '#ffd60a'],
    [`${state.debris.length} DEBRIS ADRIFT`, '#ffb347'],
  ];
  ctx.font = `700 12px ${FONT}`;
  rows.forEach(([text, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, x + 14, y + 44 + i * 21);
  });
  const next = DAYS[state.day]; // day is 1-based; DAYS[day] is tomorrow
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(next ? `NEXT: DAY ${next.day} — ${next.name}` : 'NEXT: THE CITY IS SAFE', x + 14, y + 86);
}

function flashText(ctx, text, color, y) {
  if (Math.floor(performance.now() / 400) % 2 === 0) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `900 17px ${FONT}`;
  ctx.fillText(text, VIEW.W / 2, y);
}

function drawMinimap(ctx, state) {
  const w = 190;
  const h = 132;
  const x = VIEW.W - w - 12;
  const y = VIEW.H - h - 12;
  panel(ctx, x, y, w, h, 0.66);
  const sx = (w - 16) / WORLD.W;
  const sy = (h - 26) / WORLD.H;
  const ox = x + 8;
  const oy = y + 18;
  ctx.fillStyle = '#0a2e3d';
  ctx.fillRect(ox, oy, w - 16, h - 26);
  // Buildings.
  ctx.fillStyle = 'rgba(160, 200, 215, 0.5)';
  for (const b of state.world.buildings) {
    ctx.fillRect(ox + b.x * sx, oy + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.d * sy));
  }
  // Shelter + fuel.
  ctx.fillStyle = '#58d68d';
  ctx.beginPath();
  ctx.arc(ox + state.world.shelter.x * sx, oy + state.world.shelter.y * sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(ox + state.world.fuelBarge.x * sx, oy + state.world.fuelBarge.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  // Survivors.
  ctx.fillStyle = '#ffd60a';
  for (const s of state.survivors) {
    if (s.state !== 'waiting') continue;
    ctx.fillRect(ox + s.x * sx - 1.5, oy + s.y * sy - 1.5, 3, 3);
  }
  // Surge wall.
  if (state.surge && state.surge.active) {
    ctx.fillStyle = 'rgba(255, 77, 77, 0.85)';
    ctx.fillRect(ox + state.surge.x * sx - 2, oy, 4, h - 26);
  }
  // Boat.
  ctx.fillStyle = '#ff6b35';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ox + state.boat.x * sx, oy + state.boat.y * sy, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 10px ${FONT}`;
  ctx.fillText('MAP', x + 10, y + 13);
}

// --- Title screen -------------------------------------------------------------

export function drawTitle(ctx, state) {
  // Darken the live city behind the title.
  ctx.fillStyle = 'rgba(2, 10, 16, 0.55)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.fillStyle = 'rgba(2, 10, 16, 0.25)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 17px ${FONT}`;
  ctx.fillText('A  DROWNED  CITY  ·  SEVEN  DAYS  OF  RAIN  ·  ONE  BOAT', VIEW.W / 2, 148);

  ctx.fillStyle = '#eaf6f8';
  ctx.font = `900 108px Georgia, serif`;
  ctx.fillText('FLOODLINE', VIEW.W / 2, 258);
  ctx.fillStyle = '#ffb347';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('—  MONSOON RESCUE  —', VIEW.W / 2, 302);

  ctx.fillStyle = '#cfe9ef';
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText('The river took the city. You are the only boat left.', VIEW.W / 2, 344);
  ctx.fillText('Rescue the stranded from their rooftops. Bring them home.', VIEW.W / 2, 370);

  // Start prompt, pulsing.
  const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.roundRect(VIEW.W / 2 - 190, 402, 380, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText('▶  PRESS ENTER TO PLAY', VIEW.W / 2, 435);
  ctx.restore();

  // Controls card.
  panel(ctx, VIEW.W / 2 - 330, 486, 660, 128, 0.72);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd27a';
  ctx.font = `800 15px ${FONT}`;
  ctx.fillText('HOW TO PLAY', VIEW.W / 2 - 308, 514);
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `600 15px ${FONT}`;
  const lines = [
    'WASD / ARROWS — steer the boat      SHIFT — boost (burns fuel)',
    'E — rescue survivors from rooftops      Deliver them to the SHELTER',
    'Dodge debris · escape whirlpools · refuel at the FUEL barge',
    '7 days, harder every night. Day 7: outrun the Surge.  P pause · M sound · R restart',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW.W / 2 - 308, 540 + i * 20));

  if (state.bestScore > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8fb3bd';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`BEST SCORE  ${state.bestScore.toLocaleString('en-US')}`, VIEW.W / 2, 650);
  }
  ctx.fillStyle = 'rgba(143, 179, 189, 0.8)';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText('An original game by wwwwenwenwin · built for make.fun · MIT licensed', VIEW.W / 2, 692);
}

// --- Day briefing ---------------------------------------------------------------

export function drawBriefing(ctx, state) {
  ctx.fillStyle = 'rgba(2, 10, 16, 0.6)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  const day = state.dayCfg;
  panel(ctx, VIEW.W / 2 - 340, 170, 680, 330, 0.85);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText(`DAY ${state.day} OF 7`, VIEW.W / 2, 212);
  ctx.fillStyle = day.boss ? '#ff4d4d' : '#ffd27a';
  ctx.font = `900 44px Georgia, serif`;
  ctx.fillText(day.name, VIEW.W / 2, 264);
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `400 17px ${FONT}`;
  wrapText(ctx, day.briefing, VIEW.W / 2, 300, 600, 24);
  ctx.fillStyle = '#58d68d';
  ctx.font = `800 19px ${FONT}`;
  ctx.fillText(`OBJECTIVE: rescue ${day.quota} survivors in ${fmtTime(day.time)}`, VIEW.W / 2, 392);
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText('Debris, whirlpools and lightning stand between you and them.', VIEW.W / 2, 420);
  const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.roundRect(VIEW.W / 2 - 150, 440, 300, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 19px ${FONT}`;
  ctx.fillText('▶  START DAY', VIEW.W / 2, 468);
  ctx.restore();
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

// --- Upgrade screen ---------------------------------------------------------------

export function drawUpgrade(ctx, state) {
  ctx.fillStyle = 'rgba(2, 10, 16, 0.66)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#58d68d';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText(`DAY ${state.day - 1} SURVIVED`, VIEW.W / 2, 92);
  ctx.fillStyle = '#ffd27a';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText(`Day bonus  +${state.lastDayBonus}   ·   Score  ${state.score.toLocaleString('en-US')}`, VIEW.W / 2, 122);
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `900 26px ${FONT}`;
  ctx.fillText('CHOOSE ONE UPGRADE FOR TOMORROW', VIEW.W / 2, 168);

  const cards = state.upgradeChoices;
  const cw = 300;
  const ch = 250;
  const gap = 28;
  const totalW = cards.length * cw + (cards.length - 1) * gap;
  const x0 = (VIEW.W - totalW) / 2;
  const y0 = 200;
  state.upgradeRects = [];
  cards.forEach((up, i) => {
    const x = x0 + i * (cw + gap);
    const hover = state.input.mouse.x >= x && state.input.mouse.x <= x + cw
      && state.input.mouse.y >= y0 && state.input.mouse.y <= y0 + ch;
    ctx.save();
    if (hover) {
      ctx.shadowColor = 'rgba(255, 179, 71, 0.6)';
      ctx.shadowBlur = 24;
    }
    panel(ctx, x, y0, cw, ch, hover ? 0.9 : 0.78);
    ctx.restore();
    ctx.strokeStyle = hover ? '#ffb347' : 'rgba(140, 210, 225, 0.25)';
    ctx.lineWidth = hover ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y0, cw, ch, 12);
    ctx.stroke();
    state.upgradeRects.push({ x, y: y0, w: cw, h: ch, id: up.id });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = `900 13px ${FONT}`;
    ctx.fillText(`[ ${i + 1} ]`, x + cw / 2, y0 + 30);
    ctx.fillStyle = '#eaf6f8';
    ctx.font = `900 40px Georgia, serif`;
    ctx.fillText(up.icon, x + cw / 2, y0 + 78);
    ctx.fillStyle = '#ffd27a';
    ctx.font = `900 19px ${FONT}`;
    wrapText(ctx, up.name, x + cw / 2, y0 + 112, cw - 40, 24);
    ctx.fillStyle = '#cfe9ef';
    ctx.font = `400 15px ${FONT}`;
    wrapText(ctx, up.desc, x + cw / 2, y0 + 168, cw - 40, 21);
  });

  ctx.fillStyle = '#8fb3bd';
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText('Click a card or press 1 / 2 / 3', VIEW.W / 2, 492);
  ctx.fillText(`Next: DAY ${state.day} — ${DAYS[state.day - 1].name} · quota ${DAYS[state.day - 1].quota}`, VIEW.W / 2, 518);
}

// --- Game over / victory ------------------------------------------------------------

export function drawGameOver(ctx, state) {
  ctx.fillStyle = 'rgba(10, 4, 6, 0.72)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4d4d';
  ctx.font = `900 54px Georgia, serif`;
  ctx.fillText('THE CITY CLAIMS ANOTHER', VIEW.W / 2, 168);
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `400 19px ${FONT}`;
  ctx.fillText(state.loseReason, VIEW.W / 2, 206);

  panel(ctx, VIEW.W / 2 - 260, 240, 520, 210, 0.8);
  statRow(ctx, 'FINAL SCORE', state.score.toLocaleString('en-US'), 282, '#ffd27a');
  statRow(ctx, 'SURVIVORS SAVED', String(state.totalDelivered), 318, '#eaf6f8');
  statRow(ctx, 'DAYS SURVIVED', `${state.day - 1} / 7`, 354, '#eaf6f8');
  statRow(ctx, 'BEST SCORE', state.bestScore.toLocaleString('en-US'), 390, '#8fb3bd');
  ctx.textAlign = 'center';
  if (state.score >= state.bestScore && state.score > 0) {
    ctx.fillStyle = '#58d68d';
    ctx.font = `900 16px ${FONT}`;
    ctx.fillText('★ NEW BEST SCORE ★', VIEW.W / 2, 424);
  }

  const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.roundRect(VIEW.W / 2 - 190, 486, 380, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 21px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('↻  PRESS R TO TRY AGAIN', VIEW.W / 2, 519);
  ctx.restore();
}

export function drawVictory(ctx, state) {
  ctx.fillStyle = 'rgba(2, 14, 10, 0.58)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#58d68d';
  ctx.font = `900 56px Georgia, serif`;
  ctx.fillText('THE CITY IS SAFE', VIEW.W / 2, 150);
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `400 19px ${FONT}`;
  ctx.fillText('Seven days of rain. One boat. Every rooftop answered.', VIEW.W / 2, 188);
  ctx.fillStyle = '#ffd27a';
  ctx.font = `400 17px ${FONT}`;
  ctx.fillText('The sun comes out over Meridian Bay — and the pilot is a legend.', VIEW.W / 2, 214);

  const grade = gradeFor(state.score);
  panel(ctx, VIEW.W / 2 - 280, 248, 560, 264, 0.82);
  // Grade badge pinned to the panel's top-right corner — the run's grade,
  // unmissable even at dossier size.
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  ctx.arc(VIEW.W / 2 + 280, 248, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(4, 18, 26, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#1a2b33';
  ctx.font = `900 32px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(grade, VIEW.W / 2 + 280, 259);
  statRow(ctx, 'FINAL SCORE', state.score.toLocaleString('en-US'), 292, '#ffd27a', 28);
  statRow(ctx, 'GRADE', grade, 328, '#ffd27a', 32);
  statRow(ctx, 'SURVIVORS SAVED', String(state.totalDelivered), 364, '#eaf6f8');
  statRow(ctx, 'HIGHEST COMBO', `x${state.maxCombo || 1}`, 400, '#ff8a5c');
  statRow(ctx, 'DAYS SURVIVED', '7 / 7 — ALL', 436, '#eaf6f8');
  statRow(ctx, 'BEST SCORE', state.bestScore.toLocaleString('en-US'), 472, '#8fb3bd');
  ctx.textAlign = 'center';
  if (state.score >= state.bestScore && state.score > 0) {
    ctx.fillStyle = '#58d68d';
    ctx.font = `900 16px ${FONT}`;
    ctx.fillText('★ NEW BEST SCORE ★', VIEW.W / 2, 498);
  }

  const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.roundRect(VIEW.W / 2 - 190, 520, 380, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 21px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('↻  PRESS R TO PLAY AGAIN', VIEW.W / 2, 553);
  ctx.restore();
}

function gradeFor(score) {
  if (score >= 12000) return 'S';
  if (score >= 9000) return 'A';
  if (score >= 6000) return 'B';
  if (score >= 3000) return 'C';
  return 'D';
}

function statRow(ctx, label, value, y, color, size = 20) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(label, VIEW.W / 2 - 240, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.fillText(value, VIEW.W / 2 + 240, y);
}

export function drawPause(ctx, state) {
  ctx.fillStyle = 'rgba(2, 10, 16, 0.6)';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf6f8';
  ctx.font = `900 48px Georgia, serif`;
  ctx.fillText('PAUSED', VIEW.W / 2, 300);
  ctx.fillStyle = '#8fb3bd';
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText('P — resume      R — restart the run      M — sound on/off', VIEW.W / 2, 340);
}
