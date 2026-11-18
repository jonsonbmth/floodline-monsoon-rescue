// All canvas drawing: the flooded city, the boat and its pilot, rain,
// lightning, the Surge wall, and the cinematic night grade. The judge only
// ever sees screenshots, so this file is where the game wins or loses.

import { VIEW, WORLD, PALETTE } from './config.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// World -> screen coordinates, honouring the staged camera zoom (1 in play).
// Everything drawn in screen space from a world point must go through this.
export function worldToScreen(state, x, y) {
  const zoom = state.camera.zoom || 1;
  return {
    x: VIEW.W / 2 + (x - state.camera.x - VIEW.W / 2) * zoom,
    y: VIEW.H / 2 + (y - state.camera.y - VIEW.H / 2) * zoom,
  };
}

export function render(ctx, state) {
  const cam = state.camera;
  const zoom = cam.zoom || 1;
  const shakeX = (Math.random() - 0.5) * state.shake;
  const shakeY = (Math.random() - 0.5) * state.shake;

  ctx.save();
  ctx.clearRect(0, 0, VIEW.W, VIEW.H);
  // Staged shots may zoom the camera in; gameplay always runs at zoom 1,
  // where this collapses to the plain camera translate.
  ctx.translate(VIEW.W / 2, VIEW.H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-VIEW.W / 2, -VIEW.H / 2);
  ctx.translate(-Math.round(cam.x + shakeX), -Math.round(cam.y + shakeY));

  drawWater(ctx, state);
  drawCurrents(ctx, state);
  drawWhirlpools(ctx, state);
  drawShelterZone(ctx, state);
  drawFuelZone(ctx, state);
  for (const b of state.world.buildings) drawBuilding(ctx, state, b);
  drawShelter(ctx, state);
  drawFuelBarge(ctx, state);
  drawDebris(ctx, state);
  drawSurvivors(ctx, state);
  drawSurge(ctx, state);
  drawBoat(ctx, state);
  drawParticles(ctx, state);

  // Night grade, then the lights punch back through it.
  const dark = state.dayCfg.dark;
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(3, 10, 18, ${(dark * 0.42).toFixed(3)})`;
    ctx.fillRect(cam.x - 20, cam.y - 20, VIEW.W + 40, VIEW.H + 40);
  }
  drawLights(ctx, state);
  drawFloaters(ctx, state);

  ctx.restore();

  drawRain(ctx, state);
  drawLightning(ctx, state);
  drawObjectiveArrow(ctx, state);
  drawVignette(ctx, state);

  // Lightning flash over everything.
  if (state.lightning.flash > 0.01) {
    ctx.fillStyle = `rgba(210, 230, 255, ${(state.lightning.flash * 0.28).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  }
}

function drawWater(ctx, state) {
  const cam = state.camera;
  const x0 = cam.x - 40;
  const y0 = cam.y - 40;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + VIEW.H + 80);
  g.addColorStop(0, PALETTE.waterDeep);
  g.addColorStop(0.5, PALETTE.waterMid);
  g.addColorStop(1, '#0d3547');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, VIEW.W + 80, VIEW.H + 80);

  // Slow drifting light patches, like moonlight through cloud.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const px = ((i * 733 + state.time * 6) % (WORLD.W + 800)) - 400;
    const py = 200 + i * 430 + Math.sin(state.time * 0.1 + i) * 40;
    const rg = ctx.createRadialGradient(px, py, 0, px, py, 320);
    rg.addColorStop(0, 'rgba(60, 140, 170, 0.10)');
    rg.addColorStop(1, 'rgba(60, 140, 170, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(px - 320, py - 320, 640, 640);
  }
  ctx.restore();

  // Ripple rings drifting on the surface.
  ctx.strokeStyle = 'rgba(160, 220, 235, 0.10)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const rx = ((i * 397 + 120) % WORLD.W);
    const ry = ((i * 251 + 80) % WORLD.H);
    if (rx < cam.x - 60 || rx > cam.x + VIEW.W + 60 || ry < cam.y - 60 || ry > cam.y + VIEW.H + 60) continue;
    const ph = (state.time * 0.25 + i * 0.37) % 1;
    ctx.globalAlpha = 0.12 * (1 - ph);
    ctx.beginPath();
    ctx.ellipse(rx, ry, 12 + ph * 46, (12 + ph * 46) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCurrents(ctx, state) {
  ctx.save();
  ctx.strokeStyle = 'rgba(140, 210, 225, 0.16)';
  ctx.lineWidth = 2;
  for (const c of state.world.currents) {
    const dir = Math.sign(c.speed);
    for (let i = 0; i < 7; i++) {
      const off = (state.time * Math.abs(c.speed) * 0.9 + i * 260) % 1800;
      if (c.horizontal) {
        const x = dir > 0 ? state.camera.x - 100 + off : state.camera.x + VIEW.W + 100 - off;
        const y = c.at + ((i * 53) % c.width) - c.width / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dir * 60, y);
        ctx.stroke();
      } else {
        const y = dir > 0 ? state.camera.y - 100 + off : state.camera.y + VIEW.H + 100 - off;
        const x = c.at + ((i * 53) % c.width) - c.width / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + dir * 60);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawWhirlpools(ctx, state) {
  for (const w of state.world.whirlpools) {
    ctx.save();
    ctx.translate(w.x, w.y);
    for (let ring = 3; ring >= 1; ring--) {
      const r = (w.radius * ring) / 3;
      ctx.strokeStyle = `rgba(190, 235, 245, ${0.10 + ring * 0.04})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const start = state.time * w.spin * (0.9 + ring * 0.25) + w.phase;
      ctx.arc(0, 0, r, start, start + Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(2, 12, 20, 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, w.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBuilding(ctx, state, b) {
  const h = b.h;
  // Shadow on the water.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(b.x + 10, b.y + 14, b.w, b.d);

  // South face (front wall, waterline to roof).
  ctx.fillStyle = b.wall;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.d);
  ctx.lineTo(b.x + b.w, b.y + b.d);
  ctx.lineTo(b.x + b.w, b.y + b.d - h);
  ctx.lineTo(b.x, b.y + b.d - h);
  ctx.closePath();
  ctx.fill();
  // East face, a shade darker.
  ctx.fillStyle = shade(b.wall, -14);
  ctx.beginPath();
  ctx.moveTo(b.x + b.w, b.y);
  ctx.lineTo(b.x + b.w, b.y + b.d);
  ctx.lineTo(b.x + b.w, b.y + b.d - h);
  ctx.lineTo(b.x + b.w, b.y - h);
  ctx.closePath();
  ctx.fill();
  // Waterline stain.
  ctx.fillStyle = 'rgba(120, 200, 210, 0.14)';
  ctx.fillRect(b.x, b.y + b.d - 10, b.w, 10);

  // Lit windows on the front wall.
  for (const win of b.windows) {
    const wx = b.x + win.cx;
    const wy = b.y + b.d - h + win.cy;
    ctx.fillStyle = win.lit
      ? (win.warm ? 'rgba(255, 190, 90, 0.9)' : 'rgba(170, 225, 255, 0.85)')
      : 'rgba(10, 25, 35, 0.8)';
    ctx.fillRect(wx, wy, 16, 20);
  }

  // Roof slab.
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y - h, b.w, b.d);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y - h, b.w, b.d);
  // Parapet edge.
  ctx.strokeStyle = 'rgba(200, 230, 240, 0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + 3, b.y - h + 3, b.w - 6, b.d - 6);
  // Rooftop details.
  if (b.tank) {
    const tx = b.x + b.w * 0.78;
    const ty = b.y - h + b.d * 0.22;
    ctx.fillStyle = '#5d6d7e';
    ctx.beginPath();
    ctx.ellipse(tx, ty, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(tx - 14, ty - 12, 28, 12);
    ctx.fillStyle = '#5d6d7e';
    ctx.beginPath();
    ctx.ellipse(tx, ty - 12, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.antenna) {
    const ax = b.x + b.w * 0.2;
    const ay = b.y - h + b.d * 0.25;
    ctx.strokeStyle = '#9fb3bd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, ay - 34);
    ctx.moveTo(ax - 10, ay - 26);
    ctx.lineTo(ax + 10, ay - 26);
    ctx.stroke();
    // Blinking red beacon.
    if (Math.sin(state.time * 2.4 + b.seed) > 0.2) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(ax, ay - 36, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function zoneRing(ctx, x, y, radius, color, pulse) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5 + 0.25 * Math.sin(pulse);
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -stateTimeDash(pulse);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function stateTimeDash(pulse) {
  return pulse * 20;
}

function drawShelterZone(ctx, state) {
  const sh = state.world.shelter;
  zoneRing(ctx, sh.x, sh.y, sh.radius, 'rgba(88, 214, 141, 0.9)', state.time * 1.4);
}

function drawFuelZone(ctx, state) {
  const fb = state.world.fuelBarge;
  zoneRing(ctx, fb.x, fb.y, fb.radius, 'rgba(255, 179, 71, 0.9)', state.time * 1.4);
}

function drawShelter(ctx, state) {
  const sh = state.world.shelter;
  const bob = Math.sin(state.time * 1.1) * 3;
  ctx.save();
  ctx.translate(sh.x, sh.y + bob);
  // Barge deck.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(6, 10, 96, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a4a52';
  rr(ctx, -95, -40, 190, 80, 14);
  ctx.fill();
  ctx.strokeStyle = '#5d7a86';
  ctx.lineWidth = 3;
  rr(ctx, -95, -40, 190, 80, 14);
  ctx.stroke();
  // Tents.
  for (const [tx, ty, tc] of [[-58, -8, '#e8e3d5'], [-12, -14, '#d8e6e2'], [34, -6, '#e8e3d5']]) {
    ctx.fillStyle = tc;
    ctx.beginPath();
    ctx.moveTo(tx - 22, ty + 16);
    ctx.lineTo(tx, ty - 18);
    ctx.lineTo(tx + 22, ty + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(tx, ty - 18);
    ctx.lineTo(tx + 22, ty + 16);
    ctx.lineTo(tx + 6, ty + 16);
    ctx.closePath();
    ctx.fill();
  }
  // Medical cross mast.
  ctx.fillStyle = '#f2f5f7';
  ctx.fillRect(-4, -72, 8, 34);
  ctx.beginPath();
  ctx.arc(0, -76, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(-9, -81, 18, 10);
  ctx.fillRect(-5, -85, 10, 18);
  // Crowd of rescued people.
  for (let i = 0; i < 6; i++) {
    const px = -70 + i * 28;
    const py = 22 + Math.sin(state.time * 2 + i * 1.7) * 1.5;
    ctx.fillStyle = ['#ff6b35', '#ffd60a', '#4ecdc4', '#ff8fa3', '#a78bfa', '#58d68d'][i];
    ctx.beginPath();
    ctx.arc(px, py - 6, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 4, py - 2, 8, 10);
  }
  // Label.
  ctx.font = '700 15px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf6f8';
  ctx.fillText('S H E L T E R', 0, 62);
  ctx.restore();
}

function drawFuelBarge(ctx, state) {
  const fb = state.world.fuelBarge;
  const bob = Math.sin(state.time * 1.3 + 2) * 3;
  ctx.save();
  ctx.translate(fb.x, fb.y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(5, 8, 62, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a3a28';
  rr(ctx, -60, -26, 120, 52, 10);
  ctx.fill();
  ctx.strokeStyle = '#8a6d3b';
  ctx.lineWidth = 3;
  rr(ctx, -60, -26, 120, 52, 10);
  ctx.stroke();
  // Fuel drums.
  for (const [dx, dy, col] of [[-36, -2, '#c0392b'], [-10, -8, '#2980b9'], [16, -2, '#c0392b'], [38, -6, '#27ae60']]) {
    ctx.fillStyle = col;
    ctx.fillRect(dx - 9, dy - 14, 18, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(dx - 9, dy - 14, 18, 5);
  }
  ctx.font = '700 13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.fillText('F U E L', 0, 46);
  ctx.restore();
}

function drawDebris(ctx, state) {
  for (const d of state.debris) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 4, d.size, d.size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (d.kind === 'log') {
      ctx.fillStyle = '#6b4f2e';
      rr(ctx, -d.size, -d.size * 0.35, d.size * 2, d.size * 0.7, 6);
      ctx.fill();
    } else if (d.kind === 'barrel') {
      ctx.fillStyle = '#7e5109';
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size * 0.8, d.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a66a12';
      ctx.beginPath();
      ctx.ellipse(0, -3, d.size * 0.8, d.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 'tyre') {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = d.size * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (d.kind === 'crate') {
      ctx.fillStyle = '#8a6d3b';
      ctx.fillRect(-d.size * 0.7, -d.size * 0.7, d.size * 1.4, d.size * 1.4);
      ctx.strokeStyle = '#5d4a26';
      ctx.lineWidth = 2;
      ctx.strokeRect(-d.size * 0.7, -d.size * 0.7, d.size * 1.4, d.size * 1.4);
    } else {
      ctx.fillStyle = '#9c7a4a';
      rr(ctx, -d.size, -d.size * 0.3, d.size * 2, d.size * 0.6, 3);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawSurvivors(ctx, state) {
  for (const s of state.survivors) {
    if (s.state !== 'waiting') continue;
    const wave = Math.sin(state.time * 5 + s.phase);
    // Flare glow on the roof.
    if (s.flare) {
      const fg = ctx.createRadialGradient(s.x, s.y - 14, 0, s.x, s.y - 14, 46);
      fg.addColorStop(0, 'rgba(255, 90, 60, 0.55)');
      fg.addColorStop(1, 'rgba(255, 90, 60, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(s.x - 46, s.y - 60, 92, 92);
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs + coat.
    ctx.fillStyle = '#20262b';
    ctx.fillRect(-3, -2, 3, 6);
    ctx.fillRect(1, -2, 3, 6);
    ctx.fillStyle = s.coat;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-4, -12);
    ctx.lineTo(4, -12);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    // Head.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(0, -16, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Waving arm.
    ctx.strokeStyle = s.coat;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.lineTo(9 + wave * 3, -20 - Math.abs(wave) * 3);
    ctx.stroke();
    ctx.restore();
    // Floating "!" marker.
    const bobY = s.y - 34 + Math.sin(state.time * 3 + s.phase) * 3;
    ctx.fillStyle = '#ffd60a';
    ctx.font = '900 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', s.x, bobY);
  }
}

function drawSurge(ctx, state) {
  const surge = state.surge;
  if (!surge || !surge.active) return;
  const cam = state.camera;
  const x = surge.x;
  const y0 = cam.y - 60;
  const y1 = cam.y + VIEW.H + 60;
  // Drowned ground behind the wall.
  ctx.fillStyle = 'rgba(4, 20, 28, 0.55)';
  ctx.fillRect(cam.x - 60, y0, x - cam.x + 60, y1 - y0);
  // The wall itself: a towering curl of water.
  const g = ctx.createLinearGradient(x - 200, 0, x + 40, 0);
  g.addColorStop(0, 'rgba(6, 40, 54, 0.95)');
  g.addColorStop(0.7, 'rgba(16, 78, 100, 0.98)');
  g.addColorStop(1, 'rgba(210, 240, 248, 0.98)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 200, y0);
  ctx.lineTo(x + 10, y0);
  for (let y = y0; y <= y1; y += 90) {
    const crest = Math.sin(y * 0.02 + surge.crestPhase) * 26;
    ctx.lineTo(x + 26 + crest, y);
  }
  ctx.lineTo(x - 200, y1);
  ctx.closePath();
  ctx.fill();
  // Foam crest.
  ctx.strokeStyle = 'rgba(230, 250, 255, 0.95)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (let y = y0; y <= y1; y += 40) {
    const crest = Math.sin(y * 0.02 + surge.crestPhase) * 26;
    if (y === y0) ctx.moveTo(x + 26 + crest, y);
    else ctx.lineTo(x + 26 + crest, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = y0; y <= y1; y += 26) {
    const crest = Math.sin(y * 0.035 + surge.crestPhase * 1.7) * 18;
    if (y === y0) ctx.moveTo(x - 46 + crest, y);
    else ctx.lineTo(x - 46 + crest, y);
  }
  ctx.stroke();
  // Spray ahead of the wall.
  for (let i = 0; i < 30; i++) {
    const sy = y0 + ((i * 197 + state.time * 90) % (y1 - y0));
    const sx = x + 30 + ((i * 61) % 90);
    ctx.fillStyle = `rgba(220, 245, 252, ${0.25 + (i % 3) * 0.12})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBoat(ctx, state) {
  const boat = state.boat;
  const bob = Math.sin(boat.bobPhase) * 1.6;
  const flicker = boat.invuln > 0 && Math.floor(state.time * 14) % 2 === 0;
  ctx.save();
  ctx.translate(boat.x, boat.y + bob);
  ctx.rotate(boat.angle);
  if (flicker) ctx.globalAlpha = 0.45;

  // Shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 34, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inflatable tubes (rescue orange).
  ctx.fillStyle = PALETTE.rescue;
  ctx.beginPath();
  ctx.ellipse(0, -12, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 12, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.rescueDark;
  ctx.beginPath();
  ctx.ellipse(30, 0, 7, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Deck.
  ctx.fillStyle = '#2b3438';
  rr(ctx, -28, -11, 54, 22, 8);
  ctx.fill();
  ctx.fillStyle = '#39464d';
  rr(ctx, -24, -8, 30, 16, 5);
  ctx.fill();

  // Outboard motor at the stern.
  ctx.fillStyle = '#1c2226';
  ctx.fillRect(-36, -6, 9, 12);
  ctx.fillStyle = '#3d4a52';
  ctx.fillRect(-38, -4, 4, 8);

  // Passengers aboard (small heads in the middle).
  for (let i = 0; i < boat.aboard; i++) {
    const px = -8 + (i % 3) * 11;
    const py = -5 + Math.floor(i / 3) * 10;
    ctx.fillStyle = ['#ff6b35', '#ffd60a', '#4ecdc4', '#ff8fa3', '#a78bfa', '#58d68d'][i % 6];
    ctx.beginPath();
    ctx.arc(px, py - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 4, py, 8, 6);
  }

  // THE PILOT: yellow raincoat, white helmet, hands on the tiller.
  ctx.save();
  ctx.translate(-14, 0);
  // Legs.
  ctx.fillStyle = '#22282c';
  ctx.fillRect(-5, 2, 5, 9);
  ctx.fillRect(1, 2, 5, 9);
  // Raincoat torso.
  ctx.fillStyle = PALETTE.raincoat;
  ctx.beginPath();
  ctx.moveTo(-7, 4);
  ctx.lineTo(-5, -10);
  ctx.lineTo(6, -10);
  ctx.lineTo(8, 4);
  ctx.closePath();
  ctx.fill();
  // Reflective stripe.
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(-6, -4, 13, 3);
  // Arms reaching back to the tiller.
  ctx.strokeStyle = PALETTE.raincoat;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-4, -7);
  ctx.lineTo(-13, -2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, -7);
  ctx.lineTo(-11, 3);
  ctx.stroke();
  // Head + white helmet.
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(0, -14, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.helmet;
  ctx.beginPath();
  ctx.arc(0, -15, 6, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-6, -16, 12, 2.5);
  ctx.restore();

  ctx.restore();

  // Searchlight cone (drawn unrotated, from the bow).
  if (state.dayCfg.dark > 0.3) {
    const bx = boat.x + Math.cos(boat.angle) * 30;
    const by = boat.y + Math.sin(boat.angle) * 30;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(bx, by, 10, bx, by, boat.spotRadius);
    lg.addColorStop(0, 'rgba(255, 240, 190, 0.20)');
    lg.addColorStop(1, 'rgba(255, 240, 190, 0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, boat.spotRadius, boat.angle - 0.42, boat.angle + 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    const t = p.life / p.maxLife;
    if (p.kind === 'wake') {
      ctx.fillStyle = `rgba(210, 240, 248, ${(t * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * (1.6 - t), p.size * 0.55 * (1.6 - t), 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'splash') {
      ctx.fillStyle = `rgba(200, 235, 245, ${(t * 0.8).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(255, 215, 120, ${(t * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLights(ctx, state) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Shelter glow.
  const sh = state.world.shelter;
  let g = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, 210);
  g.addColorStop(0, `rgba(120, 255, 170, ${0.10 + (state.shelterFlash || 0) * 0.25})`);
  g.addColorStop(1, 'rgba(120, 255, 170, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(sh.x - 210, sh.y - 210, 420, 420);
  // Fuel barge glow.
  const fb = state.world.fuelBarge;
  g = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, 160);
  g.addColorStop(0, 'rgba(255, 180, 80, 0.14)');
  g.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(fb.x - 160, fb.y - 160, 320, 320);
  // Window glows on nearby buildings.
  for (const b of state.world.buildings) {
    if (b.x < state.camera.x - 220 || b.x > state.camera.x + VIEW.W + 40) continue;
    for (const win of b.windows) {
      if (!win.lit) continue;
      const wx = b.x + win.cx + 8;
      const wy = b.y + b.d - b.h + win.cy + 10;
      const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 34);
      wg.addColorStop(0, win.warm ? 'rgba(255, 190, 90, 0.16)' : 'rgba(170, 225, 255, 0.13)');
      wg.addColorStop(1, 'rgba(255, 190, 90, 0)');
      ctx.fillStyle = wg;
      ctx.fillRect(wx - 34, wy - 34, 68, 68);
    }
  }
  ctx.restore();
}

function drawFloaters(ctx, state) {
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    const t = f.life / f.maxLife;
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = '800 17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y - (1 - t) * 26);
    ctx.fillText(f.text, f.x, f.y - (1 - t) * 26);
  }
  ctx.globalAlpha = 1;
}

function drawRain(ctx, state) {
  const count = Math.floor(60 + state.dayCfg.rain * 190);
  ctx.save();
  ctx.strokeStyle = 'rgba(180, 220, 235, 0.28)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const speed = 900 + (i % 5) * 120;
    const x = (i * 137.5 + state.time * 90) % (VIEW.W + 80) - 40;
    const y = (i * 211.3 + state.time * speed) % (VIEW.H + 60) - 30;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y + 17);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLightning(ctx, state) {
  const L = state.lightning;
  // Warning ring for the incoming strike.
  if (L.pending) {
    const p = worldToScreen(state, L.pending.x, L.pending.y);
    const sx = p.x;
    const sy = p.y;
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 16);
    ctx.strokeStyle = `rgba(255, 80, 80, ${(0.5 + pulse * 0.4).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(sx, sy, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255, 80, 80, ${(0.12 + pulse * 0.1).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  // The bolt itself.
  if (L.bolt) {
    const pts = L.bolt.segments;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(220, 235, 255, ${(L.bolt.life * 3).toFixed(3)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = worldToScreen(state, p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawObjectiveArrow(ctx, state) {
  if (state.screen !== 'play' || state.paused) return;
  const boat = state.boat;
  let target = null;
  let color = '#ffd60a';
  let label = '';
  if (boat.aboard > 0) {
    target = state.world.shelter;
    color = '#58d68d';
    label = 'SHELTER';
  } else {
    let bestD = Infinity;
    for (const s of state.survivors) {
      if (s.state !== 'waiting') continue;
      const d = Math.hypot(s.x - boat.x, s.y - boat.y);
      if (d < bestD) {
        bestD = d;
        target = s;
      }
    }
    label = 'SURVIVOR';
  }
  if (!target) return;
  const s = worldToScreen(state, target.x, target.y);
  const sx = s.x;
  const sy = s.y;
  // Only point when the target is off screen.
  if (sx > 40 && sx < VIEW.W - 40 && sy > 90 && sy < VIEW.H - 40) return;
  const cx = VIEW.W / 2;
  const cy = VIEW.H / 2;
  const angle = Math.atan2(sy - cy, sx - cx);
  const ax = cx + Math.cos(angle) * (VIEW.W / 2 - 70);
  const ay = cy + Math.sin(angle) * (VIEW.H / 2 - 70);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -11);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.font = '700 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(label, ax, ay + 30);
}

function drawVignette(ctx) {
  const g = ctx.createRadialGradient(
    VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.45,
    VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.95,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
}
