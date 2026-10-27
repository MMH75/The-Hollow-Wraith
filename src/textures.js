// Procedurally generated canvas textures, so the game needs no image assets.
import * as THREE from 'three';

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

// meters: how many world meters one tile of the texture covers (used with world-scaled UVs).
function make(w, h, draw, metersX = 1, metersY = metersX) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / metersX, 1 / metersY);
  return t;
}

function noise(g, w, h, amt) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function blotches(g, w, h, count, color, maxR, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(maxR * 0.2, maxR);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${color},${alpha * rand(0.4, 1)})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function woodGrain(g, x, y, w, h, vertical, alpha = 0.25) {
  const lines = vertical ? w / 3 : h / 3;
  for (let i = 0; i < lines; i++) {
    g.strokeStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(0.05, alpha)})` : `rgba(255,220,180,${rand(0.02, alpha * 0.3)})`;
    g.lineWidth = rand(0.5, 2);
    g.beginPath();
    const amp = rand(0.5, 3), freq = rand(0.005, 0.03), ph = rand(0, 6);
    if (vertical) {
      const lx = x + rand(0, w);
      for (let yy = y; yy <= y + h; yy += 6) g.lineTo(lx + Math.sin(yy * freq + ph) * amp, yy);
    } else {
      const ly = y + rand(0, h);
      for (let xx = x; xx <= x + w; xx += 6) g.lineTo(xx, ly + Math.sin(xx * freq + ph) * amp);
    }
    g.stroke();
  }
}


// Wear and tear: scratches, scuffs, dust and old stains.
function age(g, w, h, k = 1) {
  for (let i = 0; i < 60 * k; i++) {
    g.strokeStyle = Math.random() < 0.7 ? `rgba(0,0,0,${rand(0.15, 0.4)})` : `rgba(210,190,150,${rand(0.05, 0.14)})`;
    g.lineWidth = rand(0.5, 1.5);
    const x = rand(0, w), y = rand(0, h), a = rand(0, Math.PI * 2), l = rand(6, 40);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  blotches(g, w, h, 14 * k, '25,15,5', 70, 0.35);
  blotches(g, w, h, 8 * k, '140,125,100', 50, 0.08);
  for (let i = 0; i < 500 * k; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '180,165,140'},${rand(0.1, 0.3)})`;
    g.fillRect(rand(0, w), rand(0, h), 1.5, 1.5);
  }
}

// Torn-away patches of wallpaper showing the plaster underneath.
function peel(g, w, h, count) {
  for (let i = 0; i < count; i++) {
    const cx = rand(0, w), cy = rand(0, h), r = rand(20, 70);
    const pts = [];
    const n = Math.floor(rand(7, 12));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, rr = r * rand(0.45, 1.15);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * rand(0.7, 1.5)]);
    }
    const path = () => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    path(); g.fillStyle = `hsl(35,${rand(10, 18)}%,${rand(24, 32)}%)`; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(200,180,140,0.25)'; g.lineWidth = 1; g.stroke();
    g.save(); path(); g.clip();
    for (let k = 0; k < 8; k++) {
      g.fillStyle = `rgba(30,20,10,${rand(0.1, 0.3)})`;
      g.beginPath(); g.arc(cx + rand(-r, r), cy + rand(-r, r), rand(3, 15), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
}

export function floorWood() {
  return make(512, 512, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand(0, 200);
      while (x < w) {
        const len = rand(160, 360);
        const l = rand(9, 17);
        g.fillStyle = `hsl(${rand(20, 30)},${rand(30, 45)}%,${l}%)`;
        g.fillRect(x, r * rh, len, rh);
        woodGrain(g, x, r * rh, len, rh, false, 0.3);
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.9)';
      g.fillRect(0, r * rh, w, 2);
    }
    blotches(g, w, h, 18, '0,0,0', 90, 0.35);
    blotches(g, w, h, 6, '60,50,40', 60, 0.2);
    age(g, w, h, 1.5);
    noise(g, w, h, 18);
  }, 2.4);
}

export function darkFloor() {
  return make(512, 512, (g, w, h) => {
    const rows = 10, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand(0, 200);
      while (x < w) {
        const len = rand(200, 400);
        g.fillStyle = `hsl(${rand(15, 25)},${rand(20, 30)}%,${rand(6, 11)}%)`;
        g.fillRect(x, r * rh, len, rh);
        woodGrain(g, x, r * rh, len, rh, false, 0.35);
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = '#000';
      g.fillRect(0, r * rh, w, 2);
    }
    blotches(g, w, h, 25, '0,0,0', 80, 0.4);
    age(g, w, h, 1.5);
    noise(g, w, h, 14);
  }, 2.4);
}

export function tiles() {
  return make(512, 512, (g, w, h) => {
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const light = (i + j) % 2 === 0;
      const l = light ? rand(45, 58) : rand(7, 12);
      g.fillStyle = `hsl(40,${light ? 12 : 5}%,${l}%)`;
      g.fillRect(i * s, j * s, s, s);
      if (Math.random() < 0.12) { // cracked tile
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        let cx = i * s + rand(0, s), cy = j * s;
        g.moveTo(cx, cy);
        for (let k = 0; k < 5; k++) { cx += rand(-12, 12); cy += s / 5; g.lineTo(cx, cy); }
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(30,25,20,0.9)';
    g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
    blotches(g, w, h, 30, '40,30,15', 70, 0.45);
    blotches(g, w, h, 10, '0,0,0', 50, 0.5);
    age(g, w, h, 1.2);
    noise(g, w, h, 16);
  }, 2);
}

export function wallpaper() {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#4a3820';
    g.fillRect(0, 0, w, h);
    const sw = w / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(120,95,50,0.07)';
      g.fillRect(i * sw, 0, sw, h);
    }
    // faded ogee / damask motif
    g.strokeStyle = 'rgba(150,120,70,0.16)';
    g.lineWidth = 4;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const cx = i * 128, cy = j * 128 + (i % 2) * 64;
      g.beginPath();
      g.moveTo(cx, cy - 56);
      g.bezierCurveTo(cx + 40, cy - 30, cx + 20, cy + 10, cx, cy + 56);
      g.bezierCurveTo(cx - 20, cy + 10, cx - 40, cy - 30, cx, cy - 56);
      g.stroke();
      g.fillStyle = 'rgba(150,120,70,0.1)';
      g.beginPath(); g.ellipse(cx, cy, 7, 16, 0, 0, Math.PI * 2); g.fill();
    }
    // uneven fading of the paper
    blotches(g, w, h, 10, '110,85,45', 160, 0.18);
    blotches(g, w, h, 10, '10,6,2', 140, 0.3);
    // water streaks running down
    for (let i = 0; i < 18; i++) {
      const x = rand(0, w), sw2 = rand(4, 26), len = rand(80, h);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(25,15,5,0.5)');
      grd.addColorStop(1, 'rgba(25,15,5,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, sw2, len);
    }
    // mold speckles
    for (let i = 0; i < 5; i++) {
      const cx = rand(0, w), cy = rand(0, h);
      for (let k = 0; k < 120; k++) {
        g.fillStyle = `rgba(${rand(5, 20)},${rand(15, 25)},${rand(5, 12)},${rand(0.2, 0.5)})`;
        const r = rand(0, 40) * Math.random();
        const a = rand(0, Math.PI * 2);
        g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r, rand(0.5, 2.5), 0, Math.PI * 2); g.fill();
      }
    }
    peel(g, w, h, 3);
    age(g, w, h, 0.8);
    noise(g, w, h, 20);
  }, 1.6);
}

export function plaster() {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#34312c';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, '15,12,8', 110, 0.5);
    blotches(g, w, h, 10, '70,65,55', 60, 0.15);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < 6; i++) {
      g.lineWidth = rand(0.5, 1.5);
      g.beginPath();
      let x = rand(0, w), y = rand(0, h);
      g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += rand(-25, 25); y += rand(-25, 25); g.lineTo(x, y); }
      g.stroke();
    }
    noise(g, w, h, 18);
  }, 3);
}

export function furnitureWood() {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = '#24160d';
    g.fillRect(0, 0, w, h);
    woodGrain(g, 0, 0, w, h, true, 0.35);
    blotches(g, w, h, 6, '0,0,0', 50, 0.3);
    age(g, w, h, 0.6);
    noise(g, w, h, 12);
  }, 1);
}

export function doorWood() {
  // Mapped once across the whole door face (UVs 0..1).
  const t = make(256, 512, (g, w, h) => {
    g.fillStyle = '#2c1b10';
    g.fillRect(0, 0, w, h);
    woodGrain(g, 0, 0, w, h, true, 0.35);
    const px = 30, pw = (w - px * 3) / 2;
    const rowsY = [30, 200, 370], rowsH = [150, 150, 112];
    for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) {
      const x = px + c * (pw + px), y = rowsY[r], hh = rowsH[r];
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, y, pw, hh);
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 4;
      g.strokeRect(x, y, pw, hh);
      g.strokeStyle = 'rgba(255,210,160,0.08)';
      g.lineWidth = 2;
      g.strokeRect(x + 8, y + 8, pw - 16, hh - 16);
    }
    blotches(g, w, h, 10, '0,0,0', 60, 0.4);
    age(g, w, h, 1.0);
    noise(g, w, h, 14);
  }, 1, 1);
  return t;
}

export function fabric(hue = 350, sat = 40, light = 14) {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = `hsl(${hue},${sat}%,${light}%)`;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 4) {
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fillRect(x, 0, 1, h);
    }
    blotches(g, w, h, 8, '0,0,0', 50, 0.35);
    noise(g, w, h, 16);
  }, 0.8);
}

export function dustSheet() {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = '#8d877a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      const x = rand(0, w), ww = rand(6, 30);
      const grd = g.createLinearGradient(x, 0, x + ww, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, `rgba(0,0,0,${rand(0.1, 0.3)})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, ww, h);
    }
    blotches(g, w, h, 14, '40,32,20', 50, 0.35);
    noise(g, w, h, 18);
  }, 1.2);
}

export function rug(hue = 355) {
  const t = make(512, 512, (g, w, h) => {
    g.fillStyle = `hsl(${hue},45%,13%)`;
    g.fillRect(0, 0, w, h);
    const bands = [[0, 30, `hsl(${hue + 20},30%,8%)`], [30, 14, 'hsl(40,40%,22%)'], [44, 40, `hsl(${hue},40%,9%)`], [84, 6, 'hsl(40,40%,20%)']];
    for (const [o, s, col] of bands) {
      g.fillStyle = col;
      g.fillRect(o, o, w - o * 2, s); g.fillRect(o, h - o - s, w - o * 2, s);
      g.fillRect(o, o, s, h - o * 2); g.fillRect(w - o - s, o, s, h - o * 2);
    }
    g.save(); g.translate(w / 2, h / 2);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? 'hsl(40,40%,20%)' : `hsl(${hue + 10},40%,9%)`;
      const s = 140 - k * 32;
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.8, 0); g.lineTo(0, s); g.lineTo(-s * 0.8, 0); g.closePath(); g.fill();
    }
    g.restore();
    blotches(g, w, h, 20, '0,0,0', 80, 0.45);
    blotches(g, w, h, 6, '120,110,90', 60, 0.15);
    noise(g, w, h, 22);
  }, 1, 1);
  return t;
}

export function painting(kind) {
  const t = make(256, 320, (g, w, h) => {
    const bg = g.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h / 2, h * 0.7);
    bg.addColorStop(0, kind === 'land' ? '#2a3038' : '#3a2a1c');
    bg.addColorStop(1, '#070504');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (kind === 'portrait' || kind === 'scratched') {
      g.fillStyle = '#0c0907';
      g.beginPath(); g.ellipse(w / 2, h, 95, 110, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#6d5a48';
      g.beginPath(); g.ellipse(w / 2, h * 0.42, 46, 60, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#120c08';
      g.beginPath(); g.ellipse(w / 2, h * 0.33, 52, 40, 0, Math.PI, 0); g.fill();
      if (kind === 'scratched') {
        g.strokeStyle = 'rgba(220,210,190,0.7)';
        g.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          g.beginPath();
          g.moveTo(w / 2 + rand(-40, 40), h * 0.38 + rand(-14, 4));
          g.lineTo(w / 2 + rand(-40, 40), h * 0.42 + rand(-4, 14));
          g.stroke();
        }
      } else {
        g.fillStyle = '#000';
        g.beginPath(); g.arc(w / 2 - 16, h * 0.42, 5, 0, Math.PI * 2); g.arc(w / 2 + 16, h * 0.42, 5, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'land') {
      g.fillStyle = '#c9c7b0';
      g.beginPath(); g.arc(w * 0.7, h * 0.25, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#050608';
      g.beginPath(); g.moveTo(0, h * 0.7);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.65 + rand(-12, 12));
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillRect(w * 0.3, h * 0.48, 40, 70);
      g.beginPath(); g.moveTo(w * 0.3 - 6, h * 0.48); g.lineTo(w * 0.3 + 20, h * 0.38); g.lineTo(w * 0.3 + 46, h * 0.48); g.fill();
      g.fillStyle = '#d8b25a';
      g.fillRect(w * 0.3 + 16, h * 0.53, 6, 8);
    } else {
      g.fillStyle = '#4a3d2c';
      g.fillRect(w * 0.2, h * 0.7, w * 0.6, 8);
      g.fillStyle = '#5a1c14';
      g.beginPath(); g.arc(w * 0.4, h * 0.62, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b2a20';
      g.beginPath(); g.arc(w * 0.6, h * 0.64, 20, 0, Math.PI * 2); g.fill();
    }
    blotches(g, w, h, 12, '0,0,0', 60, 0.4);
    noise(g, w, h, 24);
  }, 1, 1);
  return t;
}

export function cobweb() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(220,220,210,0.55)';
  g.lineWidth = 1;
  const spokes = 9;
  const angs = [];
  for (let i = 0; i < spokes; i++) angs.push((i / (spokes - 1)) * Math.PI / 2 + rand(-0.05, 0.05));
  for (const a of angs) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 256, Math.sin(a) * 256); g.stroke();
  }
  for (let r = 20; r < 250; r += rand(14, 26)) {
    g.beginPath();
    angs.forEach((a, i) => {
      const rr = r * rand(0.92, 1.05);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, x, y);
    });
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Worn hotel-style corridor carpet with a repeating trellis pattern.
export function carpet(hue = 32) {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = `hsl(${hue - 12},45%,11%)`;
    g.fillRect(0, 0, w, h);
    const cell = 64;
    g.lineWidth = 6;
    g.strokeStyle = `hsl(${hue},45%,30%)`;
    for (let i = 0; i <= w / cell; i++) for (let j = 0; j <= h / cell; j++) {
      const cx = i * cell, cy = j * cell;
      g.beginPath();
      g.moveTo(cx, cy - cell / 2);
      g.quadraticCurveTo(cx + cell / 2, cy - cell / 4, cx, cy);
      g.quadraticCurveTo(cx - cell / 2, cy + cell / 4, cx, cy + cell / 2);
      g.moveTo(cx, cy - cell / 2);
      g.quadraticCurveTo(cx - cell / 2, cy - cell / 4, cx, cy);
      g.quadraticCurveTo(cx + cell / 2, cy + cell / 4, cx, cy + cell / 2);
      g.stroke();
      g.fillStyle = `hsl(${hue - 17},35%,16%)`;
      g.beginPath(); g.arc(cx + cell / 2, cy + cell / 2, 6, 0, Math.PI * 2); g.fill();
    }
    blotches(g, w, h, 12, '150,120,90', 90, 0.12);   // worn, flattened areas
    blotches(g, w, h, 16, '10,5,2', 60, 0.5);        // old stains
    age(g, w, h, 1);
    noise(g, w, h, 34);
  }, 1.4);
}

function decal(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Water damage running down a wall from the ceiling.
export function dripDecal() {
  return decal(256, (g, s) => {
    for (let i = 0; i < 14; i++) {
      const x = rand(s * 0.15, s * 0.85), wd = rand(6, 40), len = rand(s * 0.3, s);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, `rgba(30,18,6,${rand(0.4, 0.7)})`);
      grd.addColorStop(0.7, `rgba(30,18,6,${rand(0.15, 0.3)})`);
      grd.addColorStop(1, 'rgba(30,18,6,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - wd / 2, 0);
      g.lineTo(x + wd / 2, 0);
      g.lineTo(x + wd * 0.2, len);
      g.lineTo(x - wd * 0.2, len);
      g.fill();
    }
    const grd = g.createRadialGradient(s / 2, 0, 0, s / 2, 0, s * 0.45);
    grd.addColorStop(0, 'rgba(25,14,4,0.65)');
    grd.addColorStop(1, 'rgba(25,14,4,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

// A patch where the wallpaper has torn away, showing plaster beneath.
export function peelDecal() {
  return decal(256, (g, s) => {
    const pts = [];
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, r = s * 0.4 * rand(0.5, 1);
      pts.push([s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r]);
    }
    const path = () => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    g.shadowColor = 'rgba(0,0,0,0.9)';
    g.shadowBlur = 10;
    path(); g.fillStyle = '#6b5f4c'; g.fill();
    g.shadowBlur = 0;
    g.save(); path(); g.clip();
    blotches(g, s, s, 10, '30,22,12', 50, 0.5);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = rand(0, s), y = rand(0, s);
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rand(-20, 20); y += rand(-20, 20); g.lineTo(x, y); }
      g.stroke();
    }
    g.restore();
    path(); g.strokeStyle = 'rgba(190,165,120,0.5)'; g.lineWidth = 2; g.stroke();
  });
}

// Black mold creeping across a wall.
export function moldDecal() {
  return decal(256, (g, s) => {
    for (let i = 0; i < 1400; i++) {
      const r = Math.pow(Math.random(), 1.6) * s * 0.48, a = rand(0, Math.PI * 2);
      g.fillStyle = `rgba(${rand(4, 14)},${rand(10, 20)},${rand(4, 10)},${rand(0.25, 0.7)})`;
      g.beginPath(); g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, rand(0.8, 4), 0, Math.PI * 2); g.fill();
    }
  });
}

// Irregular dark patch for floors (old spills, dirt, rot).
export function floorStainDecal() {
  return decal(256, (g, s) => {
    for (let i = 0; i < 9; i++) {
      const x = s / 2 + rand(-50, 50), y = s / 2 + rand(-50, 50), r = rand(30, 80);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(15,8,2,${rand(0.3, 0.55)})`);
      grd.addColorStop(1, 'rgba(15,8,2,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
  });
}

// Soft pool of lamplight painted onto walls, floors and ceilings around every lit lamp.
export function softGlow() {
  return decal(256, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

// Soft glow drawn around lamp bulbs.
export function halo() {
  return decal(128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, 'rgba(255,255,255,0.45)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

// Second floor: faded green striped hotel wallpaper, stained and peeling.
export function hotelWallpaper() {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#2f3524';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = 'rgba(150,140,90,0.13)';
      g.fillRect(x, 0, 10, h);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x + 14, 0, 2, h);
    }
    blotches(g, w, h, 10, '120,110,60', 160, 0.15);
    blotches(g, w, h, 12, '20,14,4', 140, 0.35);
    for (let i = 0; i < 16; i++) {
      const x = rand(0, w), sw = rand(4, 24), len = rand(80, h);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(40,25,8,0.5)');
      grd.addColorStop(1, 'rgba(40,25,8,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, sw, len);
    }
    peel(g, w, h, 3);
    age(g, w, h, 0.8);
    noise(g, w, h, 20);
  }, 1.6);
}

// Wall-to-wall carpet for the guest rooms: dull wine red with a small diamond motif.
export function roomCarpet() {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#3a1416';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(170,130,70,0.25)';
    for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) {
      const ox = (y / 32) % 2 ? 16 : 0;
      g.beginPath(); g.moveTo(x + ox, y - 5); g.lineTo(x + ox + 5, y); g.lineTo(x + ox, y + 5); g.lineTo(x + ox - 5, y); g.fill();
    }
    blotches(g, w, h, 14, '150,110,90', 90, 0.1);
    blotches(g, w, h, 18, '10,3,2', 70, 0.5);
    age(g, w, h, 1);
    noise(g, w, h, 34);
  }, 1.4);
}

// Atlas of brass door plates "201", "202"... in an 8 x 8 grid of 2:1 cells.
export function roomNumbers(first, count) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const x = (i % 8) * 128, y = Math.floor(i / 8) * 64;
    const grd = g.createLinearGradient(x, y, x, y + 64);
    grd.addColorStop(0, '#b08a44');
    grd.addColorStop(1, '#6a4f22');
    g.fillStyle = grd;
    g.fillRect(x, y, 128, 64);
    g.strokeStyle = '#3a2a10';
    g.lineWidth = 4;
    g.strokeRect(x + 4, y + 4, 120, 56);
    g.fillStyle = '#1a1206';
    g.font = 'bold 40px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(first + i), x + 64, y + 34);
    for (let k = 0; k < 4; k++) {
      const gx = x + rand(0, 128), gy = y + rand(0, 64), r = rand(8, 24);
      const tg = g.createRadialGradient(gx, gy, 0, gx, gy, r);
      tg.addColorStop(0, 'rgba(30,40,20,0.5)');
      tg.addColorStop(1, 'rgba(30,40,20,0)');
      g.fillStyle = tg;
      g.fillRect(x, y, 128, 64);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
