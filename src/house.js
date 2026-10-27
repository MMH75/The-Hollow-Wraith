// Builds the haunted house: two floors of layout, walls, doors, windows, furniture and practical lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

export const H = 3.2;    // ground floor wall height
export const T = 0.2;    // wall thickness
export const Y2 = 3.5;   // second floor level (top of the floor slab)
const H2 = 3.0;          // second floor ceiling height
// The grand staircase rises north along the east wall of the Great Hall.
export const STAIR = { x0: 5.3, x1: 6.9, zBot: 6.0, zTop: 1.0, steps: 18 };
const PI = Math.PI;
const DOOR_OPEN = 1.75; // radians a door swings when fully open
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

// ---------- ground floor: the old manor ----------
// [id, display name, x0, x1, z0, z1, floor]. North is -z.
const GROUND_ROOMS = [
  ['hall', 'The Great Hall', -7, 7, -7, 7, 'wood'],
  ['nc', 'North Corridor', -24, 24, -9.5, -7, 'carpet'],
  ['sc', 'South Corridor', -24, 24, 7, 9.5, 'carpet'],
  ['wc', 'West Corridor', -9.5, -7, -7, 7, 'carpet'],
  ['ec', 'East Corridor', 7, 9.5, -7, 7, 'carpet'],
  ['master', 'Master Bedroom', -24, -13, -20, -9.5, 'wood'],
  ['mbath', 'Master Bathroom', -13, -6, -20, -9.5, 'tile'],
  ['library', 'Library', -6, 6, -20, -9.5, 'wood'],
  ['nursery', 'Nursery', 6, 14, -20, -9.5, 'wood'],
  ['nebed', "Eleanor's Bedroom", 14, 24, -20, -9.5, 'wood'],
  ['kitchen', 'Kitchen', -24, -14, 9.5, 20, 'tile'],
  ['dining', 'Dining Room', -14, -4, 9.5, 20, 'wood'],
  ['foyer', 'Foyer', -4, 4, 9.5, 20, 'wood'],
  ['parlor', 'Parlor', 4, 14, 9.5, 20, 'wood'],
  ['guest', 'Guest Bedroom', 14, 24, 9.5, 20, 'wood'],
  ['child', "Child's Bedroom", -24, -15, -7, 2, 'wood'],
  ['storage', 'Storage Room', -24, -15, 2, 7, 'dark'],
  ['wash', 'Washroom', -15, -9.5, -7, 0, 'tile'],
  ['linen', 'Linen Closet', -15, -9.5, 0, 7, 'dark'],
  ['laundry', 'Laundry Room', 9.5, 16, -7, 0, 'tile'],
  ['servant', "Servant's Quarters", 9.5, 16, 0, 7, 'dark'],
  ['ebed', 'East Bedroom', 16, 24, -7, 7, 'wood'],
];

// [type, axis, line coord, center along the line, width, options]
// axis 'h' = wall running along x at z = c; 'v' = wall running along z at x = c.
const GROUND_OPENINGS = [
  // Great hall, one door on each side
  ['door', 'h', -7, 0, 1.4], ['door', 'h', 7, 0, 1.4], ['door', 'v', -7, 0, 1.4], ['door', 'v', 7, 0, 1.4],
  // corridor junctions
  ['open', 'h', -7, -8.25, 2.5], ['open', 'h', 7, -8.25, 2.5], ['open', 'h', -7, 8.25, 2.5], ['open', 'h', 7, 8.25, 2.5],
  // north wing
  ['door', 'h', -9.5, -17, 1.1], ['door', 'v', -13, -12, 1.0], ['door', 'h', -9.5, 0, 1.4],
  ['door', 'h', -9.5, 10, 1.1, { open: 0.3 }], ['door', 'h', -9.5, 19, 1.1],
  // south wing
  ['door', 'h', 9.5, -19, 1.1], ['arch', 'v', -14, 15, 1.6], ['door', 'h', 9.5, -9, 1.1],
  ['arch', 'h', 9.5, 0, 2.4], ['door', 'h', 9.5, 9, 1.1], ['door', 'h', 9.5, 19, 1.1],
  ['front', 'h', 20, 0, 1.6, { locked: true }],
  // west wing
  ['door', 'h', -7, -19.5, 1.1], ['door', 'v', -15, -3.5, 1.0], ['door', 'h', 7, -19.5, 1.1],
  ['door', 'v', -9.5, -3.5, 1.1], ['door', 'v', -9.5, 3.5, 1.0],
  // east wing
  ['door', 'v', 9.5, -3.5, 1.1, { open: 0.45 }], ['door', 'v', 9.5, 3.5, 1.1],
  ['door', 'h', -7, 20, 1.1], ['door', 'v', 16, 3.5, 1.0],
];

// ---------- second floor: the hotel ----------
// Three long east-west corridors joined by passages at both ends and in the middle,
// with numbered guest rooms packed along both sides of every corridor.
function hotelLayout() {
  const rooms = [], openings = [], guestRooms = [];
  const corridor = (id, name, x0, x1, z0, z1) => rooms.push([id, name, x0, x1, z0, z1, 'carpet3']);
  corridor('h_cn', 'North Wing', -24, 24, -13, -11);
  corridor('h_cm', 'Main Corridor', -24, 24, -1, 1);
  corridor('h_cs', 'South Wing', -24, 24, 11, 13);
  for (const [k, x0, x1] of [['w', -24, -22], ['m', -1, 1], ['e', 22, 24]]) {
    corridor(`h_${k}n`, 'Passage', x0, x1, -11, -1);
    corridor(`h_${k}s`, 'Passage', x0, x1, 1, 11);
    for (const z of [-11, -1, 1, 11]) openings.push(['open', 'h', z, (x0 + x1) / 2, 2]);
  }
  // the stairwell arriving from the Great Hall, and a dead elevator shaft
  rooms.push(['h_void', 'Grand Staircase', 5.2, 7, 1, 7, 'void']);
  openings.push(['open', 'h', 1, 6.1, 1.8]);
  rooms.push(['h_elev', 'Elevator Shaft', -1.5, 1.5, 13, 20, 'void']);

  const west = [[-22, -17.8], [-17.8, -13.6], [-13.6, -9.4], [-9.4, -5.2], [-5.2, -1]];
  const std = [...west, ...west.map(([a, b]) => [-b, -a]).reverse()];
  const bands = [
    { z0: -20, z1: -13, door: -13, cols: [[-24, -16], [-16, -8], [-8, 0], [0, 8], [8, 16], [16, 24]] },
    { z0: -11, z1: -7, door: -11, cols: std },
    { z0: -7, z1: -1, door: -1, cols: std },
    { z0: 1, z1: 7, door: 1, cols: [...west, [1, 5.2], [7, 11.4], [11.4, 15], [15, 18.5], [18.5, 22]] },
    { z0: 7, z1: 11, door: 11, cols: std },
    { z0: 13, z1: 20, door: 13, cols: [[-24, -16], [-16, -8], [-8, -1.5], [1.5, 8], [8, 16], [16, 24]] },
  ];
  let n = 201;
  for (const b of bands) {
    for (const [x0, x1] of b.cols) {
      const id = `r${n}`;
      rooms.push([id, `Room ${n}`, x0, x1, b.z0, b.z1, 'carpet2']);
      const at = (x0 + x1) / 2 < 0 ? x0 + 0.9 : x1 - 0.9;
      const intoRoom = b.door === b.z0 ? -1 : 1; // swing direction that opens the door into the room
      const r = Math.random();
      const opt = { number: n, room: id };
      if (r < 0.07) opt.locked = true;
      else if (r < 0.2) opt.open = intoRoom * rand(0.25, 1.2);
      openings.push(['door', 'h', b.door, at, 1.0, opt]);
      guestRooms.push({ id, number: n, doorLine: b.door, doorAt: at, doorSide: b.door === b.z0 ? 'N' : 'S' });
      n++;
    }
  }
  return { rooms, openings, guestRooms };
}

const HOTEL = hotelLayout();
const LEVELS = [
  { y0: 0, top: H, wallBase: 0, rooms: GROUND_ROOMS, openings: GROUND_OPENINGS },
  { y0: Y2, top: Y2 + H2, wallBase: H, rooms: HOTEL.rooms, openings: HOTEL.openings },
];
const ROOMS = [], OPENINGS = [];
LEVELS.forEach((L, level) => {
  for (const [id, name, x0, x1, z0, z1, floor] of L.rooms) ROOMS.push({ id, name, x0, x1, z0, z1, floor, level, y0: L.y0, top: L.top });
  for (const [type, axis, c, at, w, opt = {}] of L.openings) OPENINGS.push({ type, axis, c, at, w, level, ...opt });
});

const TOP = { door: 2.2, front: 2.45, arch: 2.55, open: 99 };

// ---------- geometry helpers ----------

// Box with UVs scaled to world meters so textures tile at a consistent size.
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
  return g;
}

function box(p, w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  p.add(m);
  return m;
}

function cyl(p, rt, rb, h, mat, x, y, z, seg = 12, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  p.add(m);
  return m;
}

function sph(p, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75)), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  p.add(m);
  return m;
}

function plane(p, w, h, mat, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.order = 'YXZ';
  m.rotation.set(rx, ry, 0);
  p.add(m);
  return m;
}

const G = () => new THREE.Group();

// Collapse a group's meshes into one mesh per material (fewer draw calls for small moving parts).
function mergeGroup(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  return [...buckets].map(([mat, geos]) => new THREE.Mesh(mergeGeometries(geos, false), mat));
}

// ---------- the builder ----------

export function buildHouse(scene) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const woodTex = TX.furnitureWood();
  const sheetTex = TX.dustSheet();
  const doorTex = TX.doorWood();
  const M = {
    wall: std({ map: TX.wallpaper(), roughness: 0.95 }),
    wall2: std({ map: TX.hotelWallpaper(), roughness: 0.95 }),
    floor: std({ map: TX.floorWood(), roughness: 0.6 }),
    dark: std({ map: TX.darkFloor(), roughness: 0.7 }),
    tile: std({ map: TX.tiles(), roughness: 0.4 }),
    ceil: std({ map: TX.plaster(), roughness: 1 }),
    wood: std({ map: woodTex, roughness: 0.6 }),
    trim: std({ map: woodTex, color: 0x9a8070, roughness: 0.55 }),
    crate: std({ map: woodTex, color: 0xd0b090, roughness: 0.9 }),
    door: std({ map: doorTex, roughness: 0.55 }),
    door2: std({ map: doorTex, color: 0xc89070, roughness: 0.55 }),
    brass: std({ color: 0x7a5a22, metalness: 0.9, roughness: 0.4 }),
    iron: std({ color: 0x151515, metalness: 0.7, roughness: 0.6 }),
    porcelain: std({ color: 0xa8a294, roughness: 0.3 }),
    sheet: std({ map: sheetTex, roughness: 1 }),
    sheetDS: std({ map: sheetTex, roughness: 1, side: THREE.DoubleSide }),
    bedding: std({ map: TX.fabric(350, 35, 16) }),
    bedding2: std({ map: TX.fabric(215, 18, 15) }),
    bedding3: std({ map: TX.fabric(40, 25, 22) }),
    velvet: std({ map: TX.fabric(140, 25, 10) }),
    curtain: std({ map: TX.fabric(355, 45, 9), side: THREE.DoubleSide }),
    coat: std({ map: TX.fabric(30, 10, 7) }),
    linen: std({ color: 0x6e695e, roughness: 1 }),
    glass: std({ color: 0x000000, emissive: 0x24334f, emissiveIntensity: 0.5, roughness: 0.1 }),
    mirror: std({ color: 0x0b0b0d, metalness: 1, roughness: 0.12 }),
    black: std({ color: 0x050505, roughness: 0.9 }),
    stone: std({ map: TX.plaster(), color: 0x9a9080, roughness: 0.95 }),
    wax: std({ color: 0xb8ad8c, roughness: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb35a }),
    ember: std({ color: 0x1a0400, emissive: 0xff3300, emissiveIntensity: 1.5 }),
    water: std({ color: 0x0b0905, roughness: 0.05, metalness: 0.4 }),
    paper: std({ color: 0x7d7562, roughness: 1, side: THREE.DoubleSide }),
    skin: std({ color: 0xbfae9c, roughness: 0.35 }),
    dress: std({ color: 0x3a0e0e, roughness: 0.9 }),
    hair: std({ color: 0x1a120a, roughness: 0.9 }),
    teddy: std({ map: TX.fabric(28, 40, 18) }),
    clockFace: std({ color: 0x8a8068, roughness: 0.7 }),
    cobweb: new THREE.MeshStandardMaterial({ map: TX.cobweb(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1 }),
    books: [0x3a1010, 0x10261a, 0x1a1a30, 0x3a2a12, 0x222222, 0x4a3a2a].map((c) => std({ color: c, roughness: 0.8 })),
    toys: [0x5a1a1a, 0x1a3a5a, 0x5a4a1a, 0x1a4a2a].map((c) => std({ color: c, roughness: 0.7 })),
    rugs: [355, 20, 215].map((h) => std({ map: TX.rug(h), roughness: 1 })),
    paintings: ['portrait', 'land', 'scratched', 'still', 'portrait', 'land'].map((k) => std({ map: TX.painting(k), roughness: 0.75 })),
  };
  const decalMat = (map, o = {}) => std({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 1, ...o });
  Object.assign(M, {
    carpet: std({ map: TX.carpet(), roughness: 1 }),
    carpet2: std({ map: TX.roomCarpet(), roughness: 1 }),
    carpet3: std({ map: TX.carpet(350), roughness: 1 }),
    shadeOn: std({ color: 0x3a2808, emissive: 0xffb050, emissiveIntensity: 1.8, roughness: 0.4 }),
    shadeOff: std({ color: 0x2a2316, roughness: 0.35 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    plaster: std({ color: 0x6a5f50, roughness: 1 }),
    drip: decalMat(TX.dripDecal()),
    peel: decalMat(TX.peelDecal()),
    mold: decalMat(TX.moldDecal()),
    stain: decalMat(TX.floorStainDecal()),
    numbers: std({ map: TX.roomNumbers(201, 64), metalness: 0.6, roughness: 0.45 }),
  });

  const stat = G();   // static geometry, merged per material at the end
  const dyn = G();    // things that move (doors, pendulum, rocking chair...)
  scene.add(dyn);
  const colliders = [];
  const doors = [];
  const flickers = [];
  const animated = [];
  const R = {};
  for (const r of ROOMS) R[r.id] = r;
  R.hall.hole = [5.2, 7, 1, 7]; // opening in the hall ceiling above the staircase

  // ---------- placement helpers ----------
  // Point on the inside face of a room wall, plus rotation so local +z faces into the room.
  function onWall(id, side, along, out = 0) {
    const r = R[id], o = T / 2 + out;
    if (side === 'N') return [along, r.z0 + o, 0];
    if (side === 'S') return [along, r.z1 - o, PI];
    if (side === 'W') return [r.x0 + o, along, PI / 2];
    return [r.x1 - o, along, -PI / 2];
  }
  function putAt(g, x, z, rot = 0, collide = true, ex = {}) {
    g.rotation.order = 'YXZ';
    g.position.set(x, ex.y || 0, z);
    g.rotation.set(ex.rx || 0, rot, ex.rz || 0);
    (ex.parent || stat).add(g);
    if (collide) {
      g.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(g));
    }
    return g;
  }
  // Against a room wall; heights in `ex.y` are relative to that room's floor.
  function put(g, id, side, along, depth, collide = true, ex = {}) {
    const [x, z, rot] = onWall(id, side, along, 0.04 + depth / 2);
    return putAt(g, x, z, rot, collide, { ...ex, y: (ex.y || 0) + R[id].y0 });
  }
  // Lights are "virtual": a fixed pool of real lights is handed to whichever are nearest the player.
  const lights = [];
  const halos = [];
  // Painted-on pools of lamplight. Only the nearest lamps get a real (expensive) light, so every
  // lamp also lights its surroundings with one of these, which fades out when the real light takes over.
  const glows = [];
  const WALL_GLOW = [1.0, 0.52, 0.18], CEILING_GLOW = [1.0, 0.64, 0.3];
  const GLOW_WALL_STRENGTH = 0.8, GLOW_FLOOR_STRENGTH = 0.6, GLOW_CEILING_STRENGTH = 0.5;
  // a flat rectangle of glow centred on (cx, cy, cz) in the plane of `ax` and `ay`, clipped to [a0, a1] x [b0, b1]
  function addGlow(f, c, ax, ay, half, a0, a1, b0, b1, color, strength) {
    const corners = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
    glows.push({
      f, color, strength, level: c.y > 3.4 ? 1 : 0,
      pos: corners.map(([a, b]) => c.clone().addScaledVector(ax, a).addScaledVector(ay, b)),
      uv: corners.map(([a, b]) => [0.5 + a / (2 * half), 0.5 + b / (2 * half)]),
    });
  }
  function addLight(x, y, z, color, intensity, dist, mode, decay = 2) {
    const l = { position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance: dist, decay, w: 0 };
    lights.push(l);
    flickers.push({ l, base: intensity, mode, seed: rand(0, 100), off: 0 });
    return l;
  }
  const worldOf = (g, x, y, z) => { g.updateMatrixWorld(true); return g.localToWorld(new THREE.Vector3(x, y, z)); };

  // ---------- floors & ceilings ----------
  const floorMat = { wood: M.floor, dark: M.dark, tile: M.tile, carpet: M.carpet, carpet2: M.carpet2, carpet3: M.carpet3 };
  function flat(x0, x1, z0, z1, y, mat, up) {
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + x0, uv.getY(i) * d + z0);
    g.rotateX(up ? -PI / 2 : PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    stat.add(m);
  }
  for (const r of ROOMS) {
    if (r.floor !== 'void') flat(r.x0, r.x1, r.z0, r.z1, r.y0, floorMat[r.floor], true);
    let rects = [[r.x0, r.x1, r.z0, r.z1]];
    if (r.hole) {
      const [hx0, hx1, hz0, hz1] = r.hole;
      rects = [[r.x0, r.x1, r.z0, hz0], [r.x0, r.x1, hz1, r.z1], [r.x0, hx0, hz0, hz1], [hx1, r.x1, hz0, hz1]]
        .filter(([a, b, c, d]) => b - a > 0.01 && d - c > 0.01);
      // the cut edge of the floor slab around the stairwell
      box(stat, hx1 - hx0, Y2 - H, 0.06, M.trim, (hx0 + hx1) / 2, (H + Y2) / 2, hz0);
      box(stat, 0.06, Y2 - H, hz1 - hz0, M.trim, hx0, (H + Y2) / 2, (hz0 + hz1) / 2);
    }
    for (const [a, b, c, d] of rects) flat(a, b, c, d, r.top, M.ceil, false);
  }
  const bounds = { x0: -24, x1: 24, z0: -20, z1: 20 };

  // ---------- walls ----------
  function wallPiece(axis, c, s, e, y0, y1, thick, mat, collide) {
    const len = e - s, mid = (s + e) / 2, h = y1 - y0;
    const m = axis === 'h'
      ? box(stat, len, h, thick, mat, mid, (y0 + y1) / 2, c)
      : box(stat, thick, h, len, mat, c, (y0 + y1) / 2, mid);
    if (collide) colliders.push(new THREE.Box3().setFromObject(m));
  }
  const wallSegs = [];
  LEVELS.forEach((L, level) => {
    const fy = L.y0, top = L.top, wb = L.wallBase;
    const wallMat = level ? M.wall2 : M.wall;
    const lines = { h: new Map(), v: new Map() };
    const addLine = (axis, c, a, b) => {
      const k = c.toFixed(2);
      if (!lines[axis].has(k)) lines[axis].set(k, { c, iv: [] });
      lines[axis].get(k).iv.push([a, b]);
    };
    for (const r of ROOMS) {
      if (r.level !== level) continue;
      addLine('h', r.z0, r.x0, r.x1); addLine('h', r.z1, r.x0, r.x1);
      addLine('v', r.x0, r.z0, r.z1); addLine('v', r.x1, r.z0, r.z1);
    }
    for (const axis of ['h', 'v']) {
      for (const { c, iv } of lines[axis].values()) {
        iv.sort((p, q) => p[0] - q[0]);
        const merged = [];
        for (const [a, b] of iv) {
          const last = merged[merged.length - 1];
          if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
          else merged.push([a, b]);
        }
        const ops = OPENINGS.filter((o) => o.level === level && o.axis === axis && Math.abs(o.c - c) < 1e-3).sort((p, q) => p.at - q.at);
        for (const [a, b] of merged) {
          const segs = [];
          let cur = a, curEnd = true;
          for (const o of ops) {
            const s = o.at - o.w / 2, e = o.at + o.w / 2;
            if (e <= a || s >= b) continue;
            if (s > cur) segs.push([cur, s, curEnd, false]);
            cur = e; curEnd = false;
          }
          if (b > cur) segs.push([cur, b, curEnd, true]);
          for (const [s0, e0, ext0, ext1] of segs) {
            const s = s0 - (ext0 ? T / 2 : 0), e = e0 + (ext1 ? T / 2 : 0);
            wallPiece(axis, c, s, e, wb, top, T, wallMat, true);
            wallSegs.push({ axis, c, s: s0, e: e0, y0: fy, top });
            if (!level) wallPiece(axis, c, s0, e0, fy, fy + 1.0, T + 0.04, M.trim, false); // wainscoting
            wallPiece(axis, c, s0, e0, fy + 0.98, fy + 1.04, T + 0.07, M.wood, false);       // chair rail
            wallPiece(axis, c, s0, e0, fy, fy + 0.16, T + 0.06, M.wood, false);              // baseboard
            wallPiece(axis, c, s0, e0, top - 0.12, top, T + 0.08, M.trim, false);            // crown
          }
        }
        // lintels and frames
        for (const o of ops) {
          const t = fy + TOP[o.type];
          const s = o.at - o.w / 2, e = o.at + o.w / 2;
          if (t < top) wallPiece(axis, c, s, e, t, top, T, wallMat, false);
          if (o.type === 'open') continue;
          wallPiece(axis, c, s - 0.08, s, fy, t, T + 0.08, M.wood, false);
          wallPiece(axis, c, e, e + 0.08, fy, t, T + 0.08, M.wood, false);
          wallPiece(axis, c, s - 0.12, e + 0.12, t, t + 0.1, T + 0.1, M.wood, false);
        }
      }
    }
  });

  // ---------- doors ----------
  for (const o of OPENINGS) {
    if (o.type !== 'door' && o.type !== 'front') continue;
    const fy = LEVELS[o.level].y0;
    const top = TOP[o.type];
    const pivot = G();
    const hinge = o.at - o.w / 2;
    const base = o.axis === 'h' ? 0 : -PI / 2;
    if (o.axis === 'h') pivot.position.set(hinge, fy, o.c); else pivot.position.set(o.c, fy, hinge);
    const pw = o.w - 0.03, ph = top - 0.02;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.06), o.level ? M.door2 : M.door);
    panel.position.set(pw / 2 + 0.015, ph / 2 + 0.01, 0);
    pivot.add(panel);
    const hw = G();
    for (const s of [-1, 1]) {
      box(hw, 0.06, 0.16, 0.012, M.brass, pw / 2 - 0.09, 1.0 - ph / 2, s * 0.036);
      sph(hw, 0.032, M.brass, pw / 2 - 0.09, 1.02 - ph / 2, s * 0.07, 1, 1, 1, 10);
    }
    for (const hy of [0.25, ph - 0.25]) box(hw, 0.03, 0.14, 0.07, M.iron, -pw / 2 + 0.01, hy - ph / 2, 0);
    for (const m of mergeGroup(hw)) panel.add(m);
    const angle = o.open || 0;
    pivot.rotation.y = base + angle;
    dyn.add(pivot);
    const door = {
      o, pivot, panel, base, locked: !!o.locked,
      angle, from: angle, to: angle, t: 1, dur: 1, rattle: 0,
      box: new THREE.Box3(), dirty: true,
      pos: new THREE.Vector3(o.axis === 'h' ? o.at : o.c, fy + 1.1, o.axis === 'h' ? o.c : o.at),
      isOpen() { return Math.abs(this.to) > 0.01; },
      toggle(px, pz) {
        if (this.locked) { this.rattle = 0.45; return 'locked'; }
        const opening = !this.isOpen();
        let target = 0;
        if (opening) {
          const side = o.axis === 'h' ? (pz < o.c ? -1 : 1) : (px < o.c ? 1 : -1);
          target = side * DOOR_OPEN;
        }
        this.from = this.angle; this.to = target; this.t = 0;
        this.dur = 1; // seconds, matching the length of the door sound clips
        return opening ? 'open' : 'close';
      },
      update(dt) {
        let ev = null;
        if (this.t < 1) {
          this.t = Math.min(1, this.t + dt / this.dur);
          const e = -(Math.cos(PI * this.t) - 1) / 2;
          this.angle = this.from + (this.to - this.from) * e;
          if (this.t >= 1 && this.to === 0) ev = 'closed';
          this.dirty = true;
        }
        let jiggle = 0;
        if (this.rattle > 0) { this.rattle -= dt; jiggle = Math.sin(this.rattle * 70) * 0.012 * this.rattle; }
        this.pivot.rotation.y = this.base + this.angle + jiggle;
        if (this.dirty) {
          this.pivot.updateMatrixWorld(true);
          this.box.setFromObject(this.panel);
          this.dirty = false;
        }
        return ev;
      },
    };
    panel.userData.door = door;
    panel.traverse((m) => { m.castShadow = m.receiveShadow = true; });
    doors.push(door);
  }

  // ---------- reusable props (local origin at floor, front faces +z) ----------
  function candle(p, x, y, z, h = 0.14, lit = false) {
    cyl(p, 0.02, 0.022, h, M.wax, x, y + h / 2, z, 8);
    if (lit) sph(p, 0.012, M.flame, x, y + h + 0.02, z, 1, 2, 1, 6);
    else cyl(p, 0.002, 0.002, 0.015, M.black, x, y + h + 0.007, z, 4);
  }
  function bed(w = 1.5, l = 2.05, cover = M.bedding, posts = false) {
    const g = G();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.07, 0.3, 0.07, M.wood, sx * w / 2, 0.15, sz * (l / 2 - 0.04));
    box(g, w + 0.06, 0.16, l, M.wood, 0, 0.36, 0);
    box(g, w - 0.04, 0.2, l - 0.12, M.linen, 0, 0.54, 0.03);
    box(g, w + 0.08, 0.07, l * 0.62, cover, 0, 0.67, l * 0.17);
    for (const sx of [-1, 1]) box(g, 0.025, 0.4, l * 0.62, cover, sx * (w / 2 + 0.03), 0.48, l * 0.17);
    for (const sx of [-1, 1]) box(g, w * 0.4, 0.12, 0.36, M.linen, sx * w * 0.23, 0.7, -l / 2 + 0.3, 0, -0.35);
    box(g, w + 0.14, 1.3, 0.07, M.wood, 0, 0.65, -l / 2);
    box(g, w + 0.2, 0.08, 0.1, M.wood, 0, 1.32, -l / 2);
    box(g, w + 0.14, 0.75, 0.06, M.wood, 0, 0.375, l / 2 + 0.01);
    if (posts) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.04, 0.05, 2.3, M.wood, sx * (w / 2 + 0.05), 1.15, sz * (l / 2 + 0.01), 8);
      for (const sz of [-1, 1]) box(g, w + 0.16, 0.08, 0.08, M.wood, 0, 2.3, sz * (l / 2 + 0.01));
      for (const sx of [-1, 1]) box(g, 0.08, 0.08, l + 0.1, M.wood, sx * (w / 2 + 0.05), 2.3, 0);
      for (const sx of [-1, 1]) {
        box(g, 0.03, 2.0, 0.45, M.curtain, sx * (w / 2 + 0.1), 1.3, -l / 2 + 0.25);
        box(g, 0.03, 1.9, 0.3, M.curtain, sx * (w / 2 + 0.1), 1.35, l / 2 - 0.15);
      }
      box(g, w + 0.2, 0.3, 0.03, M.curtain, 0, 2.15, -l / 2 - 0.02);
    }
    return g;
  }
  // Drawers that open: furniture only records where each one sits (front face at local z = zFront);
  // the sliding drawers are created once everything is placed.
  const drawerSlots = [];
  function drawerSlot(g, w, h, d, x, y, zFront) { drawerSlots.push({ g, w, h, d, x, y, zFront }); }
  // Cupboards the player can hide in.
  const hideSlots = [];
  function hideCupboard(w = 1.1, h = 2.15, d = 0.7) {
    const g = G();
    const t = 0.03;
    box(g, w, h, t, M.wood, 0, h / 2, -d / 2 + t / 2);                     // back
    for (const s of [-1, 1]) box(g, t, h, d, M.wood, s * (w / 2 - t / 2), h / 2, 0);   // sides
    box(g, w + 0.06, 0.07, d + 0.05, M.wood, 0, h + 0.035, 0);             // top
    box(g, w, 0.08, d, M.wood, 0, 0.04, 0);                                // floor
    // two louvred doors: a frame with angled slats you can peer out between
    const z = d / 2 - 0.02;
    for (const x of [-(w / 2 - 0.03), 0, w / 2 - 0.03]) box(g, 0.05, h - 0.08, 0.04, M.wood, x, h / 2 + 0.04, z);
    for (const y of [0.12, h - 0.06, h * 0.5]) box(g, w - 0.04, 0.07, 0.04, M.wood, 0, y, z);
    for (const s of [-1, 1]) {
      for (let y = 0.22; y < h - 0.12; y += 0.11) {
        if (Math.abs(y - h * 0.5) < 0.06) continue;
        box(g, w / 2 - 0.07, 0.032, 0.01, M.wood, s * (w / 4), y, z, 0, -0.45);
      }
      sph(g, 0.02, M.brass, s * 0.06, h * 0.52, d / 2 + 0.01, 1, 1, 1, 8);
    }
    hideSlots.push({ g, w, h, d });
    return g;
  }
  function nightstand(lit = false, unlitCandle = true) {
    const g = G();
    box(g, 0.5, 0.6, 0.42, M.wood, 0, 0.3, 0);
    drawerSlot(g, 0.42, 0.12, 0.34, 0, 0.45, 0.21);
    if (lit || unlitCandle) {
      cyl(g, 0.06, 0.07, 0.015, M.brass, 0.08, 0.607, 0, 10);
      candle(g, 0.08, 0.615, 0, 0.12, lit);
    }
    return g;
  }
  function wardrobe(w = 1.2, h = 2.1, d = 0.6) {
    const g = G();
    box(g, w, h - 0.1, d, M.wood, 0, h / 2 + 0.05, 0);
    box(g, w + 0.08, 0.1, d + 0.06, M.wood, 0, h + 0.03, 0);
    box(g, w + 0.04, 0.1, d + 0.03, M.wood, 0, 0.05, 0);
    box(g, 0.012, h - 0.3, 0.01, M.black, 0, h / 2 + 0.05, d / 2 + 0.003);
    for (const s of [-1, 1]) {
      sph(g, 0.022, M.brass, s * 0.06, h * 0.52, d / 2 + 0.02, 1, 1, 1, 8);
      box(g, w / 2 - 0.12, h - 0.5, 0.008, M.black, s * w / 4, h / 2 + 0.05, d / 2 + 0.002);
      box(g, w / 2 - 0.16, h - 0.56, 0.012, M.wood, s * w / 4, h / 2 + 0.05, d / 2 + 0.006);
    }
    return g;
  }
  function dresser(w = 1.3, mirror = true) {
    const g = G();
    box(g, w, 0.85, 0.5, M.wood, 0, 0.45, 0);
    box(g, w + 0.06, 0.04, 0.54, M.wood, 0, 0.89, 0);
    for (let i = 0; i < 3; i++) drawerSlot(g, w - 0.1, 0.21, 0.42, 0, 0.2 + i * 0.25, 0.25);
    if (mirror) {
      box(g, w * 0.7, 0.95, 0.05, M.wood, 0, 1.4, -0.2);
      box(g, w * 0.6, 0.82, 0.01, M.mirror, 0, 1.4, -0.172);
    }
    return g;
  }
  function table(w, d, h = 0.76, withDrawer = false) {
    const g = G();
    box(g, w, 0.05, d, M.wood, 0, h - 0.025, 0);
    box(g, w - 0.1, 0.1, d - 0.1, M.wood, 0, h - 0.1, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, h - 0.05, 0.06, M.wood, sx * (w / 2 - 0.06), (h - 0.05) / 2, sz * (d / 2 - 0.06));
    if (withDrawer) {
      box(g, w * 0.35, 0.3, d - 0.1, M.wood, w * 0.27, h - 0.2, 0);
      drawerSlot(g, w * 0.32, 0.13, d - 0.2, w * 0.27, h - 0.14, (d - 0.1) / 2);
    }
    return g;
  }
  function roundTable(r = 0.7, h = 0.76) {
    const g = G();
    cyl(g, r, r, 0.05, M.wood, 0, h - 0.025, 0, 24);
    cyl(g, 0.06, 0.09, h - 0.05, M.wood, 0, (h - 0.05) / 2, 0, 10);
    for (let i = 0; i < 3; i++) box(g, 0.06, 0.05, 0.6, M.wood, Math.sin(i * 2.09) * 0.2, 0.025, Math.cos(i * 2.09) * 0.2, i * 2.09);
    return g;
  }
  function chair() {
    const g = G();
    box(g, 0.45, 0.05, 0.45, M.wood, 0, 0.46, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.44, 0.04, M.wood, sx * 0.19, 0.22, sz * 0.19);
    for (const sx of [-1, 1]) box(g, 0.045, 0.6, 0.045, M.wood, sx * 0.19, 0.78, -0.2);
    for (const y of [0.72, 0.88, 1.02]) box(g, 0.37, 0.06, 0.02, M.wood, 0, y, -0.2);
    return g;
  }
  function armchair(mat = M.velvet) {
    const g = G();
    box(g, 0.85, 0.35, 0.8, mat, 0, 0.3, 0);
    box(g, 0.75, 0.12, 0.65, mat, 0, 0.53, 0.05);
    box(g, 0.85, 0.7, 0.18, mat, 0, 0.75, -0.32);
    for (const s of [-1, 1]) box(g, 0.14, 0.25, 0.75, mat, s * 0.36, 0.6, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.12, 0.05, M.wood, sx * 0.36, 0.06, sz * 0.34);
    return g;
  }
  function sofa(len = 2.0, mat = M.velvet) {
    const g = G();
    box(g, len, 0.35, 0.85, mat, 0, 0.3, 0);
    box(g, len - 0.3, 0.12, 0.65, mat, 0, 0.53, 0.06);
    box(g, len, 0.6, 0.18, mat, 0, 0.75, -0.34);
    for (const s of [-1, 1]) box(g, 0.16, 0.3, 0.85, mat, s * (len / 2 - 0.08), 0.62, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.12, 0.05, M.wood, sx * (len / 2 - 0.08), 0.06, sz * 0.36);
    return g;
  }
  function rockingChair() {
    const g = chair();
    g.children.forEach((m) => { m.position.y += 0.06; });
    for (const sx of [-1, 1]) {
      const R0 = 1.1, arc = 0.62;
      const geo = new THREE.TorusGeometry(R0, 0.02, 4, 16, arc);
      geo.rotateZ(-PI / 2 - arc / 2);
      geo.translate(0, R0, 0);
      geo.rotateY(PI / 2);
      const m = new THREE.Mesh(geo, M.wood);
      m.position.set(sx * 0.19, 0, 0);
      g.add(m);
    }
    return g;
  }
  function bookshelf(w = 1.6, h = 2.3, d = 0.4) {
    const g = G();
    box(g, w, h, 0.03, M.wood, 0, h / 2, -d / 2 + 0.015);
    for (const s of [-1, 1]) box(g, 0.04, h, d, M.wood, s * (w / 2 - 0.02), h / 2, 0);
    box(g, w + 0.06, 0.06, d + 0.04, M.wood, 0, h, 0.01);
    const levels = 5;
    for (let i = 0; i < levels; i++) {
      const y0 = 0.08 + i * (h - 0.1) / levels;
      box(g, w - 0.06, 0.03, d - 0.02, M.wood, 0, y0, 0);
      let x = -w / 2 + 0.05;
      while (x < w / 2 - 0.08) {
        if (Math.random() < 0.07) { x += rand(0.08, 0.25); continue; }
        const bw = rand(0.03, 0.07), bh = rand(0.2, 0.32);
        const mat = M.books[Math.floor(Math.random() * M.books.length)];
        if (Math.random() < 0.05 && x < w / 2 - 0.3) {
          box(g, bw, bh, d * 0.75, mat, x + bh * 0.3, y0 + 0.015 + bh * 0.45, 0.02, 0, 0, -0.5);
          x += bh * 0.6;
        } else box(g, bw, bh, d * 0.72, mat, x + bw / 2, y0 + 0.015 + bh / 2, 0.02);
        x += bw + 0.003;
      }
    }
    return g;
  }
  function linenShelf(w = 1.4, h = 2.0, d = 0.45) {
    const g = G();
    for (const s of [-1, 1]) box(g, 0.04, h, d, M.wood, s * (w / 2 - 0.02), h / 2, 0);
    box(g, w, h, 0.02, M.wood, 0, h / 2, -d / 2);
    for (let i = 0; i < 4; i++) {
      const y0 = 0.1 + i * 0.5;
      box(g, w - 0.06, 0.03, d - 0.02, M.wood, 0, y0, 0);
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.35) {
        const stack = Math.floor(rand(1, 5));
        for (let k = 0; k < stack; k++) box(g, 0.3, 0.06, d * 0.7, Math.random() < 0.7 ? M.linen : M.sheet, x + 0.15 + rand(-0.02, 0.02), y0 + 0.045 + k * 0.065, 0);
        x += 0.36;
      }
    }
    return g;
  }
  function crib() {
    const g = G();
    const w = 1.3, d = 0.7;
    box(g, w, 0.06, d, M.wood, 0, 0.35, 0);
    box(g, w - 0.08, 0.1, d - 0.08, M.linen, 0, 0.42, 0);
    for (const s of [-1, 1]) {
      box(g, w, 0.04, 0.04, M.wood, 0, 0.95, s * d / 2);
      box(g, 0.05, 1.0, d, M.wood, s * w / 2, 0.5, 0);
      for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.1) cyl(g, 0.012, 0.012, 0.55, M.wood, x, 0.66, s * d / 2, 5);
    }
    return g;
  }
  function bathtub() {
    const g = G();
    const w = 1.6, d = 0.75, y0 = 0.15, h = 0.55;
    box(g, w, 0.08, d, M.porcelain, 0, y0 + 0.04, 0);
    for (const s of [-1, 1]) {
      box(g, w, h, 0.06, M.porcelain, 0, y0 + h / 2, s * (d / 2 - 0.03));
      box(g, 0.06, h, d, M.porcelain, s * (w / 2 - 0.03), y0 + h / 2, 0);
    }
    box(g, w - 0.1, 0.01, d - 0.1, M.water, 0, y0 + 0.32, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sph(g, 0.06, M.brass, sx * (w / 2 - 0.15), 0.07, sz * (d / 2 - 0.12), 1, 1.2, 1, 8);
    cyl(g, 0.015, 0.015, 0.35, M.brass, -w / 2 + 0.08, y0 + h + 0.12, -d / 2 + 0.06, 6);
    return g;
  }
  function sink() {
    const g = G();
    cyl(g, 0.07, 0.11, 0.75, M.porcelain, 0, 0.375, -0.05, 10);
    box(g, 0.58, 0.16, 0.44, M.porcelain, 0, 0.82, 0);
    box(g, 0.44, 0.01, 0.3, M.water, 0, 0.88, 0.02);
    cyl(g, 0.012, 0.012, 0.18, M.brass, 0, 0.98, -0.17, 6);
    return g;
  }
  function toilet() {
    const g = G();
    cyl(g, 0.13, 0.16, 0.38, M.porcelain, 0, 0.19, 0.05, 12);
    cyl(g, 0.21, 0.17, 0.06, M.wood, 0, 0.41, 0.08, 14);
    box(g, 0.42, 0.32, 0.18, M.porcelain, 0, 1.6, -0.12);
    cyl(g, 0.02, 0.02, 1.2, M.brass, 0.1, 0.9, -0.18, 6);
    return g;
  }
  function counter(len, upper = true) {
    const g = G();
    box(g, len, 0.86, 0.6, M.wood, 0, 0.43, 0);
    box(g, len + 0.04, 0.04, 0.64, M.stone, 0, 0.88, 0);
    for (let x = -len / 2 + 0.5; x < len / 2 - 0.1; x += 0.5) box(g, 0.01, 0.7, 0.01, M.black, x, 0.42, 0.302);
    for (let x = -len / 2 + 0.25; x < len / 2; x += 0.5) sph(g, 0.016, M.brass, x + 0.18, 0.7, 0.31, 1, 1, 1, 8);
    if (upper) {
      box(g, len, 0.7, 0.35, M.wood, 0, 1.95, -0.125);
      for (let x = -len / 2 + 0.5; x < len / 2 - 0.1; x += 0.5) box(g, 0.01, 0.6, 0.01, M.black, x, 1.95, 0.053);
    }
    for (let i = 0; i < 4; i++) {
      const x = rand(-len / 2 + 0.2, len / 2 - 0.2);
      const jh = rand(0.1, 0.25);
      cyl(g, 0.05, 0.05, jh, M.porcelain, x, 0.9 + jh / 2, rand(-0.2, 0.1), 8);
    }
    return g;
  }
  function stove() {
    const g = G();
    box(g, 0.9, 0.82, 0.65, M.iron, 0, 0.45, 0);
    box(g, 0.95, 0.04, 0.7, M.iron, 0, 0.88, 0);
    box(g, 0.45, 0.35, 0.01, M.black, -0.12, 0.45, 0.33);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.04, 0.04, 0.08, M.iron, sx * 0.38, 0.02, sz * 0.27, 6);
    cyl(g, 0.08, 0.08, H - 0.9, M.iron, 0.25, 0.9 + (H - 0.9) / 2, -0.22, 10);
    cyl(g, 0.14, 0.12, 0.16, M.iron, -0.2, 0.98, 0.05, 12);
    return g;
  }
  function piano() {
    const g = G();
    box(g, 1.5, 1.25, 0.55, M.black, 0, 0.7, -0.05);
    box(g, 1.5, 0.08, 0.32, M.black, 0, 0.72, 0.36);
    box(g, 1.32, 0.02, 0.14, M.porcelain, 0, 0.77, 0.42);
    for (let i = 0; i < 26; i++) if (i % 7 !== 2 && i % 7 !== 6) box(g, 0.022, 0.025, 0.08, M.black, -0.63 + i * 0.05 + 0.025, 0.79, 0.39);
    for (const s of [-1, 1]) box(g, 0.08, 0.68, 0.08, M.black, s * 0.68, 0.34, 0.45);
    box(g, 0.25, 0.3, 0.02, M.paper, 0.1, 1.05, 0.25, 0, -0.2);
    return g;
  }
  function fireplace(w = 1.8) {
    const g = G();
    for (const s of [-1, 1]) box(g, 0.35, 1.2, 0.45, M.stone, s * (w / 2 - 0.175), 0.6, 0);
    box(g, w, 0.35, 0.45, M.stone, 0, 1.025, 0);
    box(g, w + 0.3, 0.08, 0.55, M.wood, 0, 1.24, 0.03);
    box(g, w - 0.7, 0.85, 0.05, M.black, 0, 0.425, -0.2);
    box(g, w - 0.7, 0.02, 0.4, M.black, 0, 0.01, 0);
    box(g, w + 0.4, 0.04, 0.8, M.stone, 0, 0.02, 0.2);
    for (let i = 0; i < 9; i++) box(g, rand(0.05, 0.12), 0.04, rand(0.05, 0.1), M.ember, rand(-0.3, 0.3), 0.04, rand(-0.12, 0.1), rand(0, 3));
    cyl(g, 0.05, 0.05, 0.6, M.black, -0.05, 0.08, -0.02, 6, 0, PI / 2 + 0.2);
    cyl(g, 0.045, 0.045, 0.5, M.black, 0.05, 0.12, 0.04, 6, 0, PI / 2 - 0.3);
    for (const x of [-0.5, 0.45]) candle(g, x, 1.28, 0.05, 0.18);
    return g;
  }
  function covered(w, h, d) {
    const g = G();
    const geo = new THREE.CylinderGeometry(0.62, 0.72, h, 4, 1);
    geo.rotateY(PI / 4);
    const m = new THREE.Mesh(geo, M.sheet);
    m.scale.set(w, 1, d);
    m.position.y = h / 2;
    g.add(m);
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, PI * 2, 0, PI / 2), M.sheet);
    bump.scale.set(w * 0.8, h * 0.25, d * 0.8);
    bump.position.y = h;
    g.add(bump);
    return g;
  }
  function crate(s = 0.6) {
    const g = G();
    box(g, s, s, s, M.crate, 0, s / 2, 0);
    for (const y of [0.05, s - 0.05]) for (const sz of [-1, 1]) box(g, s + 0.02, 0.06, 0.02, M.wood, 0, y, sz * s / 2);
    return g;
  }
  function chest(w = 1.0) {
    const g = G();
    box(g, w, 0.45, 0.5, M.wood, 0, 0.225, 0);
    box(g, w + 0.03, 0.08, 0.53, M.wood, 0, 0.48, 0);
    for (const x of [-w / 3, w / 3]) box(g, 0.05, 0.53, 0.54, M.iron, x, 0.26, 0);
    box(g, 0.08, 0.1, 0.02, M.brass, 0, 0.4, 0.26);
    return g;
  }
  function clock() {
    const g = G();
    box(g, 0.5, 0.3, 0.35, M.wood, 0, 0.15, 0);
    box(g, 0.42, 1.25, 0.3, M.wood, 0, 0.92, 0);
    box(g, 0.24, 0.8, 0.01, M.black, 0, 0.98, 0.15);
    box(g, 0.55, 0.6, 0.36, M.wood, 0, 1.85, 0);
    box(g, 0.62, 0.12, 0.4, M.wood, 0, 2.2, 0);
    const face = cyl(g, 0.2, 0.2, 0.01, M.clockFace, 0, 1.85, 0.185, 24, PI / 2);
    face.rotation.x = PI / 2;
    box(g, 0.012, 0.15, 0.005, M.black, 0, 1.9, 0.195, 0, 0, 0.6);
    box(g, 0.012, 0.11, 0.005, M.black, 0, 1.87, 0.196, 0, 0, -1.9);
    return g;
  }
  function vase(dead = true) {
    const g = G();
    cyl(g, 0.08, 0.06, 0.3, M.porcelain, 0, 0.15, 0, 10);
    if (dead) for (let i = 0; i < 5; i++) cyl(g, 0.004, 0.006, rand(0.3, 0.5), M.wood, rand(-0.03, 0.03), 0.45, rand(-0.03, 0.03), 4, rand(-0.4, 0.4), rand(-0.4, 0.4));
    return g;
  }
  function candelabra(lit = false) {
    const g = G();
    cyl(g, 0.08, 0.1, 0.03, M.brass, 0, 0.015, 0, 10);
    cyl(g, 0.015, 0.02, 0.35, M.brass, 0, 0.19, 0, 6);
    box(g, 0.36, 0.02, 0.02, M.brass, 0, 0.36, 0);
    for (const x of [-0.17, 0, 0.17]) candle(g, x, 0.37, 0, rand(0.08, 0.18), lit);
    return g;
  }
  function doll() {
    const g = G();
    cyl(g, 0.04, 0.09, 0.16, M.dress, 0, 0.08, 0, 10);
    sph(g, 0.055, M.skin, 0, 0.21, 0, 1, 1, 1, 12);
    sph(g, 0.058, M.hair, 0, 0.225, -0.01, 1, 0.8, 1, 10);
    for (const s of [-1, 1]) {
      sph(g, 0.009, M.black, s * 0.02, 0.215, 0.05, 1, 1, 1, 6);
      cyl(g, 0.013, 0.013, 0.1, M.skin, s * 0.07, 0.12, 0.01, 6, 0, s * 0.4);
      cyl(g, 0.014, 0.014, 0.1, M.skin, s * 0.03, 0.01, 0.06, 6, PI / 2);
    }
    return g;
  }
  function teddy() {
    const g = G();
    sph(g, 0.1, M.teddy, 0, 0.1, 0, 1, 1.1, 0.9);
    sph(g, 0.07, M.teddy, 0, 0.25, 0.01);
    for (const s of [-1, 1]) {
      sph(g, 0.025, M.teddy, s * 0.05, 0.31, 0);
      sph(g, 0.035, M.teddy, s * 0.08, 0.04, 0.07);
      sph(g, 0.012, M.black, s * 0.025, 0.27, 0.065, 1, 1, 1, 6);
    }
    return g;
  }
  function coatRack() {
    const g = G();
    cyl(g, 0.025, 0.03, 1.8, M.wood, 0, 0.9, 0, 8);
    for (let i = 0; i < 4; i++) box(g, 0.5, 0.03, 0.03, M.wood, 0, 0.02, 0, i * PI / 4);
    cyl(g, 0.16, 0.24, 1.1, M.coat, 0.12, 1.15, 0.05, 10);
    sph(g, 0.1, M.coat, 0.1, 1.72, 0.02, 1.2, 0.6, 1);
    cyl(g, 0.12, 0.18, 0.8, M.coat, -0.1, 1.3, -0.08, 10);
    return g;
  }
  function papers(p, x, z, n = 6, spread = 0.6, y = 0) {
    for (let i = 0; i < n; i++) plane(p, 0.21, 0.29, M.paper, x + rand(-spread, spread), y + 0.004 + i * 0.001, z + rand(-spread, spread), rand(0, PI), -PI / 2);
  }
  function rugAt(x, z, w, d, mat, rot = 0, y = 0) {
    const m = plane(stat, w, d, mat, x, y + 0.006, z, rot, -PI / 2);
    m.rotation.order = 'YXZ';
    return m;
  }
  function painting(id, side, along, idx, w = 0.7, h = 0.9, y = 1.85, tilt = 0) {
    const g = G();
    const fw = 0.07;
    box(g, w + fw * 2, fw, 0.05, M.brass, 0, h / 2 + fw / 2, 0.025);
    box(g, w + fw * 2, fw, 0.05, M.brass, 0, -h / 2 - fw / 2, 0.025);
    box(g, fw, h, 0.05, M.brass, -w / 2 - fw / 2, 0, 0.025);
    box(g, fw, h, 0.05, M.brass, w / 2 + fw / 2, 0, 0.025);
    plane(g, w, h, M.paintings[idx % M.paintings.length], 0, 0, 0.012);
    const [x, z, rot] = onWall(id, side, along, 0.02);
    putAt(g, x, z, rot, false, { y: y + R[id].y0, rz: tilt });
  }
  function wallMirror(id, side, along, y = 1.65) {
    const g = G();
    box(g, 0.62, 0.82, 0.04, M.wood, 0, 0, 0.02);
    box(g, 0.5, 0.7, 0.01, M.mirror, 0, 0, 0.042);
    const [x, z, rot] = onWall(id, side, along, 0.02);
    putAt(g, x, z, rot, false, { y: y + R[id].y0 });
  }
  function windowAt(id, side, along, w = 1.1, h = 1.4, y = 1.85) {
    const g = G();
    plane(g, w, h, M.glass, 0, 0, 0.004);
    box(g, w + 0.16, 0.08, 0.1, M.wood, 0, h / 2 + 0.04, 0.05);
    box(g, w + 0.3, 0.05, 0.2, M.wood, 0, -h / 2 - 0.025, 0.08);
    for (const s of [-1, 1]) box(g, 0.08, h, 0.1, M.wood, s * (w / 2 + 0.04), 0, 0.05);
    box(g, 0.04, h, 0.05, M.wood, 0, 0, 0.025);
    box(g, w, 0.04, 0.05, M.wood, 0, h * 0.1, 0.025);
    cyl(g, 0.015, 0.015, w + 0.9, M.brass, 0, h / 2 + 0.22, 0.14, 6, 0, PI / 2);
    const cw = w > 0.8 ? 0.38 : 0.22;
    for (const s of [-1, 1]) box(g, cw, h + 0.8, 0.03, M.curtain, s * (w / 2 + cw / 2 - 0.02), -0.18, 0.15, 0, 0, s * 0.02);
    const [x, z, rot] = onWall(id, side, along, 0);
    putAt(g, x, z, rot, false, { y: y + R[id].y0 });
  }
  // Old brass wall lamp with a yellowed glass shade. state: 'on' | 'flicker' | 'off' (broken).
  // Glows around lit bulbs; collected here and drawn as one batch per floor at the end.
  const addHalo = (pos, size) => { const h = { position: pos.clone(), size, alpha: 0.35 }; halos.push(h); return h; };
  function wallLamp(id, side, along, state = 'on', intensity = 3.2) {
    const g = G();
    box(g, 0.13, 0.26, 0.025, M.brass, 0, 0, 0.012);
    sph(g, 0.03, M.brass, 0, 0, 0.03, 1, 1, 0.6, 8);
    box(g, 0.02, 0.02, 0.2, M.brass, 0, -0.05, 0.12);
    box(g, 0.02, 0.1, 0.02, M.brass, 0, -0.01, 0.22);
    cyl(g, 0.03, 0.03, 0.035, M.brass, 0, 0.05, 0.22, 8);
    const shadeMat = state === 'flicker' ? M.shadeOn.clone() : state === 'on' ? M.shadeOn : M.shadeOff;
    if (state === 'off') {
      // cracked shade hanging askew, bulb long dead
      cyl(g, 0.085, 0.045, 0.1, shadeMat, 0.02, 0.1, 0.22, 10, 0, 0.5);
    } else {
      cyl(g, 0.09, 0.045, 0.14, shadeMat, 0, 0.13, 0.22, 12);
      sph(g, 0.035, M.bulb, 0, 0.1, 0.22, 1, 1.2, 1, 8);
    }
    const [x, z, rot] = onWall(id, side, along, 0);
    putAt(g, x, z, rot, false, { y: R[id].y0 + 2.0 });
    if (state === 'off') return;
    const p = worldOf(g, 0, 0.14, 0.24);
    addLight(p.x, p.y, p.z, 0xffa040, intensity * 1.6, 10, state === 'flicker' ? 'failing' : 'lamp', 1.5);
    const halo = addHalo(p, 0.6);
    const f = flickers[flickers.length - 1];
    if (state === 'flicker') { f.mat = shadeMat; f.halo = halo; }
    // light splashed on the wall around the lamp, kept within this wall of the room
    const r = R[id];
    const normal = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)), right = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
    const c = new THREE.Vector3(x, r.y0 + 1.95, z).addScaledVector(normal, 0.045);
    const [lo, hi] = side === 'N' || side === 'S' ? [r.x0, r.x1] : [r.z0, r.z1];
    const alongOf = (v) => (side === 'N' || side === 'S' ? v.x : v.z);
    // `right` points along +x for N, -x for S, -z for W, +z for E; work out the clip in that direction
    const dirSign = alongOf(right) >= 0 ? 1 : -1;
    const toLo = (lo + T / 2 + 0.05 - alongOf(c)) * dirSign, toHi = (hi - T / 2 - 0.05 - alongOf(c)) * dirSign;
    const half = 1.7;
    addGlow(f, c, right, new THREE.Vector3(0, 1, 0), half,
      Math.max(-half, Math.min(toLo, toHi)), Math.min(half, Math.max(toLo, toHi)), -1.7, 1.7, WALL_GLOW, GLOW_WALL_STRENGTH);
    // and on the floor in front of it, kept inside the room
    const fc = new THREE.Vector3(x, r.y0 + 0.014, z).addScaledVector(normal, 0.9);
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), fh = 1.6;
    addGlow(f, fc, X, Z, fh,
      Math.max(-fh, r.x0 + T / 2 - fc.x), Math.min(fh, r.x1 - T / 2 - fc.x),
      Math.max(-fh, r.z0 + T / 2 - fc.z), Math.min(fh, r.z1 - T / 2 - fc.z), WALL_GLOW, GLOW_FLOOR_STRENGTH);
    // and on the ceiling above it
    const cc = new THREE.Vector3(x, r.top - 0.012, z).addScaledVector(normal, 0.6), ch = 1.3;
    addGlow(f, cc, X, Z, ch,
      Math.max(-ch, r.x0 + T / 2 - cc.x), Math.min(ch, r.x1 - T / 2 - cc.x),
      Math.max(-ch, r.z0 + T / 2 - cc.z), Math.min(ch, r.z1 - T / 2 - cc.z), WALL_GLOW, GLOW_CEILING_STRENGTH);
  }
  function lamps(id, list, intensity) {
    for (const [side, along, state] of list) wallLamp(id, side, along, state, Math.max(intensity || 0, 3.2));
  }
  function cobweb(x, z, rot, size = 1.0, top = H) {
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-PI / 2);
    geo.translate(size / 2, 0, size / 2);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, -1).normalize(), rand(0.35, 0.7)));
    const m = new THREE.Mesh(geo, M.cobweb);
    m.position.set(x, top - 0.13, z);
    m.rotation.y = rot;
    stat.add(m);
  }
  function webs(id, count = 2) {
    const r = R[id], o = T / 2 + 0.04;
    const corners = [[r.x0 + o, r.z0 + o, 0], [r.x1 - o, r.z0 + o, -PI / 2], [r.x1 - o, r.z1 - o, PI], [r.x0 + o, r.z1 - o, PI / 2]];
    corners.sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) cobweb(corners[i][0], corners[i][1], corners[i][2], rand(0.7, 1.2), r.top);
  }

  // ======================= ROOMS =======================

  // ----- The Great Hall -----
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = G();
    cyl(g, 0.26, 0.28, H, M.stone, 0, H / 2, 0, 16);
    box(g, 0.75, 0.25, 0.75, M.stone, 0, 0.125, 0);
    box(g, 0.75, 0.2, 0.75, M.stone, 0, H - 0.22, 0);
    putAt(g, sx * 3.8, sz * 3.8, 0);
  }
  for (let x = -6; x <= 4; x += 2.4) box(stat, 0.3, 0.3, 14, M.wood, x, H - 0.15, 0);
  rugAt(0, 0, 5, 6.5, M.rugs[0]);
  {
    putAt(roundTable(0.75), 0, 0, 0);
    putAt(candelabra(false), 0.1, 0.05, 0.4, false, { y: 0.76 });
    box(stat, 0.2, 0.05, 0.28, M.books[0], -0.35, 0.785, 0.2, 0.4);
    papers(stat, 0.9, 1.2, 4, 0.5);
  }
  let clockPos;
  {
    const g = put(clock(), 'hall', 'N', -3.2, 0.36);
    clockPos = worldOf(g, 0, 1.4, 0.15);
    // swinging pendulum behind the clock's glass
    const pend = G();
    cyl(pend, 0.006, 0.006, 0.55, M.brass, 0, -0.275, 0, 4);
    const bob = cyl(pend, 0.07, 0.07, 0.015, M.brass, 0, -0.58, 0, 16);
    bob.rotation.x = PI / 2;
    const p = worldOf(g, 0, 1.36, 0.14);
    pend.position.copy(p);
    pend.rotation.y = g.rotation.y;
    dyn.add(pend);
    animated.push((t) => { pend.rotation.z = Math.sin(t * PI) * 0.12; });
  }
  {
    // chandelier, gently swaying
    const ch = G();
    ch.position.set(0, H, 0);
    cyl(ch, 0.01, 0.01, 0.9, M.iron, 0, -0.45, 0, 4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.025, 6, 24), M.brass);
    ring.rotation.x = PI / 2;
    ring.position.y = -1.0;
    ch.add(ring);
    sph(ch, 0.1, M.brass, 0, -1.0, 0, 1, 1.4, 1, 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      const x = Math.cos(a) * 0.6, z = Math.sin(a) * 0.6;
      box(ch, 0.6, 0.015, 0.015, M.brass, x / 2, -0.98, z / 2, -a);
      cyl(ch, 0.03, 0.02, 0.02, M.brass, x, -0.98, z, 8);
      const lit = i % 3 === 0;
      const h = lit ? rand(0.06, 0.12) : rand(0.04, 0.14);
      candle(ch, x, -0.97, z, h, lit);
    }
    dyn.add(ch);
    const light = addLight(0, H - 1.25, 0, 0xff9a48, 15, 14, 'candle');
    animated.push((t) => {
      ch.rotation.z = Math.sin(t * 0.5) * 0.015;
      ch.rotation.x = Math.sin(t * 0.37 + 1) * 0.012;
      light.position.x = ch.rotation.z * -1.0;
    });
  }
  put(piano(), 'hall', 'S', -3.8, 0.6);
  {
    const b = G();
    box(b, 0.8, 0.05, 0.35, M.black, 0, 0.48, 0);
    for (const s of [-1, 1]) box(b, 0.05, 0.46, 0.33, M.black, s * 0.36, 0.23, 0);
    const [x, z] = onWall('hall', 'S', -3.8, 1.25);
    putAt(b, x, z, PI);
  }
  put(covered(2.1, 0.85, 0.9), 'hall', 'S', 3.8, 0.9);
  put(covered(0.9, 1.0, 0.9), 'hall', 'W', -3.5, 0.9);
  put(covered(0.9, 1.0, 0.9), 'hall', 'W', 3.5, 0.9);
  put(table(1.8, 0.5, 0.85), 'hall', 'E', -3.5, 0.5);
  {
    const [x, z] = onWall('hall', 'E', -3.5, 0.3);
    putAt(candelabra(false), x, z - 0.4, PI / 2, false, { y: 0.85 });
    putAt(vase(), x, z + 0.5, 0, false, { y: 0.85 });
  }
  put(vase(), 'hall', 'N', 3.2, 0.2);
  put(vase(), 'hall', 'N', 6.2, 0.2);
  painting('hall', 'N', 3.2, 0, 1.0, 1.3, 1.95);
  painting('hall', 'W', -3.5, 1, 1.2, 0.8, 1.9);
  painting('hall', 'W', 3.5, 4, 0.7, 0.9, 1.9);
  painting('hall', 'E', -3.5, 3, 0.8, 0.6, 1.8);
  painting('hall', 'S', 3.8, 5, 1.4, 0.8, 1.95);
  webs('hall', 3);

  // ----- North corridor -----
  {
    windowAt('nc', 'W', -8.25);
    windowAt('nc', 'E', -8.25);
    lamps('nc', [['S', -21.5, 'on'], ['N', -13, 'on'], ['S', -4, 'flicker'], ['N', 4, 'on'], ['S', 11, 'off'], ['N', 13.5, 'on'], ['S', 17.5, 'on'], ['N', 22.6, 'on']], 3.6);
    put(table(0.8, 0.38, 0.8), 'nc', 'N', -11.5, 0.38);
    put(vase(), 'nc', 'N', -11.5, 0.2, false, { y: 0.8 });
    put(table(0.7, 0.38, 0.8), 'nc', 'N', 5, 0.38);
    put(candelabra(false), 'nc', 'N', 5, 0.15, false, { y: 0.8 });
    painting('nc', 'N', -21, 0, 0.6, 0.8);
    painting('nc', 'N', -7.5, 1, 0.9, 0.6);
    painting('nc', 'N', 15.5, 2, 0.6, 0.8, 1.8, -0.08);
    painting('nc', 'S', -14, 3, 0.7, 0.5);
    painting('nc', 'S', 3, 4, 0.6, 0.8);
    painting('nc', 'S', 14, 5, 0.9, 0.6);
    webs('nc', 2);
  }

  // ----- South corridor -----
  {
    windowAt('sc', 'W', 8.25);
    windowAt('sc', 'E', 8.25);
    lamps('sc', [['S', -22, 'on'], ['N', -13, 'on'], ['S', -5, 'on'], ['N', 4.4, 'flicker'], ['S', 12.5, 'on'], ['N', 21, 'off']], 3.6);
    {
      const b = G();
      box(b, 1.4, 0.06, 0.4, M.wood, 0, 0.45, 0);
      for (const s of [-1, 1]) box(b, 0.06, 0.45, 0.38, M.wood, s * 0.65, 0.225, 0);
      box(b, 1.4, 0.5, 0.05, M.wood, 0, 0.75, -0.18);
      put(b, 'sc', 'N', -4.2, 0.4);
    }
    put(table(0.7, 0.38, 0.8), 'sc', 'N', 4.4, 0.38);
    put(vase(), 'sc', 'N', 4.4, 0.2, false, { y: 0.8 });
    painting('sc', 'N', -16, 2, 0.7, 0.9);
    painting('sc', 'N', 16, 0, 0.7, 0.9, 1.85, 0.06);
    painting('sc', 'S', -14, 1, 1.0, 0.6);
    painting('sc', 'S', 14, 3, 0.8, 0.6);
    // a painting that fell and leans against the wall
    {
      const g = G();
      box(g, 0.8, 1.0, 0.05, M.brass, 0, 0.5, 0);
      plane(g, 0.68, 0.88, M.paintings[2], 0, 0.5, 0.027);
      const [x, z, rot] = onWall('sc', 'S', 22.5, 0.15);
      putAt(g, x, z, rot, false, { rx: -0.25 });
    }
    webs('sc', 2);
  }

  // ----- West & East corridors -----
  painting('wc', 'E', -4, 0, 0.6, 0.8);
  painting('wc', 'E', 4, 3, 0.6, 0.8);
  put(table(0.8, 0.38, 0.8), 'wc', 'W', 0, 0.38);
  put(candelabra(false), 'wc', 'W', 0, 0.15, false, { y: 0.8 });
  painting('ec', 'W', -4, 1, 0.6, 0.8, 1.85, 0.07);
  painting('ec', 'W', 4, 4, 0.6, 0.8);
  putAt(chair(), 8.75, 0.2, -PI / 2 + PI); // a chair turned to face the wall
  webs('wc', 1);
  webs('ec', 1);

  // ----- Master bedroom -----
  {
    put(bed(1.8, 2.15, M.bedding, true), 'master', 'W', -16.5, 2.15);
    put(nightstand(true), 'master', 'W', -18.1, 0.42);
    put(nightstand(false), 'master', 'W', -14.9, 0.42);
    const [x, z] = onWall('master', 'W', -18.1, 0.25);
    addLight(x + 0.0, 0.85, z - 0.08, 0xff9440, 1.6, 5, 'candle');
    put(wardrobe(1.3, 2.2, 0.6), 'master', 'N', -22.3, 0.6);
    put(dresser(1.3, true), 'master', 'E', -17.5, 0.5);
    putAt(chest(1.1), -21.35, -16.5, PI / 2);
    putAt(armchair(), -15.6, -18.4, -PI * 0.8);
    rugAt(-21.2, -16.4, 3.2, 4.0, M.rugs[1], PI / 2);
    windowAt('master', 'N', -18.5);
    windowAt('master', 'W', -11.8);
    painting('master', 'E', -14.6, 2, 0.7, 0.9);
    painting('master', 'S', -21.5, 1, 1.0, 0.7);
    papers(stat, -15, -12, 3, 0.4);
    webs('master', 2);
  }

  // ----- Master bathroom -----
  {
    put(bathtub(), 'mbath', 'N', -9.5, 0.75);
    put(sink(), 'mbath', 'E', -15, 0.45);
    wallMirror('mbath', 'E', -15);
    put(toilet(), 'mbath', 'E', -12.6, 0.5);
    put(wardrobe(0.8, 1.8, 0.4), 'mbath', 'S', -11.2, 0.4);
    windowAt('mbath', 'N', -11.8, 0.7, 1.0, 2.0);
    webs('mbath', 2);
  }

  // ----- Library -----
  {
    for (const x of [-4.15, -2.1, 2.1, 4.15]) put(bookshelf(), 'library', 'N', x, 0.4);
    for (const z of [-18.3, -16.5, -14.7, -12.9, -11.1]) {
      put(bookshelf(), 'library', 'W', z, 0.4);
      put(bookshelf(), 'library', 'E', z, 0.4);
    }
    windowAt('library', 'N', 0, 1.0, 1.4, 1.9);
    putAt(table(1.7, 0.85, 0.78, true), 0, -15.2, 0);
    putAt(chair(), 0, -14.4, PI);
    putAt(candelabra(false), -0.5, -15.3, 0, false, { y: 0.78 });
    box(stat, 0.32, 0.04, 0.24, M.books[2], 0.3, 0.8, -15.2, 0.3);
    for (let i = 0; i < 3; i++) plane(stat, 0.21, 0.29, M.paper, rand(-0.4, 0.6), 0.787 + i * 0.001, -15.2 + rand(-0.2, 0.2), rand(0, 3), -PI / 2);
    putAt(armchair(), -3, -11.6, PI * 0.85);
    putAt(armchair(), 3, -11.6, -PI * 0.85);
    putAt(roundTable(0.35, 0.55), 0, -11.3, 0);
    {
      const g = G();
      cyl(g, 0.15, 0.2, 0.05, M.wood, 0, 0.025, 0, 12);
      cyl(g, 0.025, 0.025, 0.8, M.wood, 0, 0.4, 0, 6);
      sph(g, 0.28, M.paintings[1], 0, 1.05, 0, 1, 1, 1, 16);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.012, 4, 24), M.brass);
      ring.position.y = 1.05;
      ring.rotation.y = 0.4;
      g.add(ring);
      putAt(g, 4.2, -17.2, 0);
    }
    for (let i = 0; i < 9; i++) box(stat, rand(0.18, 0.24), rand(0.03, 0.06), rand(0.25, 0.32), M.books[i % 6], -1.8 + rand(-0.6, 0.6), 0.03 + (i % 3) * 0.045, -17.6 + rand(-0.5, 0.5), rand(0, PI));
    rugAt(0, -14.5, 4, 5, M.rugs[2]);
    webs('library', 3);
  }

  // ----- Nursery -----
  {
    const cribG = put(crib(), 'nursery', 'W', -16, 0.7);
    // mobile slowly turning above the crib
    const mob = G();
    const p = worldOf(cribG, 0, 1.6, 0);
    mob.position.copy(p);
    cyl(mob, 0.004, 0.004, H - 1.6, M.iron, 0, (H - 1.6) / 2, 0, 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      box(mob, 0.5, 0.01, 0.01, M.wood, 0, 0, 0, a);
      cyl(mob, 0.002, 0.002, 0.2, M.iron, Math.cos(a) * 0.24, -0.1, -Math.sin(a) * 0.24, 3);
      sph(mob, 0.035, M.toys[i], Math.cos(a) * 0.24, -0.22, -Math.sin(a) * 0.24, 1, 1, 1, 8);
    }
    dyn.add(mob);
    animated.push((t) => { mob.rotation.y = t * 0.15; });

    const rc = rockingChair();
    putAt(rc, 12, -17.6, -PI * 0.78, true, { parent: dyn });
    const dollG = doll();
    dollG.position.set(0, 0.545, 0.02);
    rc.add(dollG);
    animated.push((t) => { rc.rotation.x = Math.sin(t * 1.3) * 0.07; });

    put(chest(0.9), 'nursery', 'E', -12, 0.5);
    put(dresser(1.0, false), 'nursery', 'E', -16.2, 0.5);
    putAt(teddy(), 8.6, -11.9, 0.6, false);
    for (let i = 0; i < 7; i++) {
      const s = rand(0.06, 0.09);
      box(stat, s, s, s, M.toys[i % 4], 9 + rand(-0.8, 0.8), s / 2, -13 + rand(-0.8, 0.8), rand(0, PI));
    }
    rugAt(10, -15, 3, 3, M.rugs[1]);
    windowAt('nursery', 'N', 10);
    painting('nursery', 'W', -12, 2, 0.5, 0.65, 1.7);
    papers(stat, 11, -13, 3, 0.6);
    webs('nursery', 2);
  }

  // ----- Eleanor's bedroom -----
  {
    put(bed(1.6, 2.05, M.bedding2), 'nebed', 'E', -15.5, 2.05);
    put(nightstand(false), 'nebed', 'E', -17.2, 0.42);
    put(nightstand(false), 'nebed', 'E', -13.8, 0.42);
    put(wardrobe(), 'nebed', 'W', -17.6, 0.6);
    put(dresser(1.2, true), 'nebed', 'W', -13.4, 0.5);
    putAt(chair(), 15.4, -13.4, PI / 2 + PI);
    putAt(chest(1.0), 21.4, -15.5, -PI / 2);
    put(covered(0.7, 1.9, 0.4), 'nebed', 'N', 22.6, 0.4);
    rugAt(20.5, -15.2, 3, 3.8, M.rugs[0], PI / 2);
    windowAt('nebed', 'N', 19);
    painting('nebed', 'N', 16.2, 0, 0.6, 0.8);
    painting('nebed', 'S', 22, 1, 0.9, 0.6, 1.8, 0.1);
    webs('nebed', 2);
  }

  // ----- Kitchen -----
  {
    put(counter(3), 'kitchen', 'W', 12, 0.6);
    put(stove(), 'kitchen', 'W', 14.6, 0.65);
    put(counter(3), 'kitchen', 'W', 17.6, 0.6);
    {
      const [x, z] = onWall('kitchen', 'W', 17.6, 0.34);
      box(stat, 0.45, 0.02, 0.55, M.black, x + 0.02, 0.905, z);
      cyl(stat, 0.015, 0.015, 0.3, M.brass, x - 0.25, 1.05, z, 6);
    }
    put(counter(2.0, false), 'kitchen', 'S', -21.9, 0.6);
    {
      const ice = G();
      box(ice, 0.8, 1.6, 0.65, M.wood, 0, 0.8, 0);
      for (const y of [0.55, 1.25]) {
        box(ice, 0.7, 0.01, 0.01, M.black, 0, y + 0.3, 0.33);
        box(ice, 0.12, 0.04, 0.03, M.brass, 0.28, y, 0.34);
      }
      put(ice, 'kitchen', 'S', -15.6, 0.65);
    }
    putAt(table(2.0, 1.0, 0.8), -19.4, 14.6, 0);
    putAt(chair(), -19.9, 13.7, 0);
    const fallen = chair();
    putAt(fallen, -18.4, 13.4, 0.8, true, { y: 0.23, rz: PI / 2 });
    for (let i = 0; i < 3; i++) cyl(stat, 0.12, 0.09, 0.02, M.porcelain, -19.8 + i * 0.4, 0.81, 14.7 + rand(-0.2, 0.2), 14);
    cyl(stat, 0.12, 0.13, 0.18, M.iron, -18.9, 0.89, 14.5, 12);
    for (let i = 0; i < 8; i++) box(stat, rand(0.04, 0.1), 0.01, rand(0.03, 0.08), M.porcelain, -17.5 + rand(-0.6, 0.6), 0.005, 16.3 + rand(-0.6, 0.6), rand(0, PI));
    {
      const sh = G();
      for (const s of [-1, 1]) box(sh, 0.04, 1.8, 0.35, M.wood, s * 0.7, 0.9, 0);
      for (let i = 0; i < 4; i++) {
        box(sh, 1.4, 0.03, 0.35, M.wood, 0, 0.35 + i * 0.45, 0);
        for (let k = 0; k < 5; k++) if (Math.random() < 0.75) cyl(sh, 0.05, 0.05, rand(0.12, 0.22), M.porcelain, -0.55 + k * 0.27, 0.43 + i * 0.45, 0, 8);
      }
      put(sh, 'kitchen', 'N', -22.2, 0.35);
    }
    windowAt('kitchen', 'S', -19);
    webs('kitchen', 3);
  }

  // ----- Dining room -----
  {
    rugAt(-9, 15, 5, 3.2, M.rugs[0]);
    putAt(table(3.4, 1.2, 0.78), -9, 15, 0);
    for (const x of [-10.2, -9, -7.8]) {
      putAt(chair(), x, 14.15, 0);
      if (x !== -7.8) putAt(chair(), x, 15.85, PI);
    }
    putAt(chair(), -7.4, 16.5, PI + 0.9, true, { y: 0.23, rz: -PI / 2 }); // knocked over
    putAt(chair(), -11.1, 15, PI / 2);
    putAt(chair(), -6.9, 15, -PI / 2 + 0.25);
    putAt(candelabra(false), -9, 15, 0, false, { y: 0.78 });
    for (const x of [-10.2, -9.6, -8.4, -7.8]) for (const s of [-1, 1]) cyl(stat, 0.12, 0.09, 0.015, M.porcelain, x, 0.79, 15 + s * 0.38, 14);
    {
      const cab = G();
      box(cab, 1.4, 0.9, 0.5, M.wood, 0, 0.45, 0);
      box(cab, 1.4, 1.2, 0.35, M.wood, 0, 1.5, -0.07);
      box(cab, 1.2, 1.0, 0.01, M.mirror, 0, 1.5, 0.11);
      for (let k = 0; k < 4; k++) cyl(cab, 0.11, 0.11, 0.015, M.porcelain, -0.45 + k * 0.3, 1.6, 0.0, 14).rotation.x = PI / 2 - 0.2;
      box(cab, 1.46, 0.06, 0.4, M.wood, 0, 2.13, -0.05);
      put(cab, 'dining', 'E', 15, 0.5);
    }
    put(table(1.6, 0.5, 0.9, true), 'dining', 'N', -12, 0.5);
    put(table(1.4, 0.5, 0.9, true), 'dining', 'N', -5.6, 0.5);
    put(vase(), 'dining', 'N', -12.3, 0.2, false, { y: 0.9 });
    painting('dining', 'W', 12, 0, 0.7, 0.9);
    painting('dining', 'W', 18, 4, 0.7, 0.9);
    painting('dining', 'N', -9, 1, 1.4, 0.8, 2.0);
    windowAt('dining', 'S', -9);
    webs('dining', 2);
  }

  // ----- Foyer -----
  {
    rugAt(0, 16.5, 2.2, 4.2, M.rugs[2]);
    windowAt('foyer', 'S', -2.3, 0.55, 1.6, 1.6);
    windowAt('foyer', 'S', 2.3, 0.55, 1.6, 1.6);
    putAt(coatRack(), -3.4, 19.3, 0.4);
    {
      const b = G();
      box(b, 1.4, 0.06, 0.4, M.wood, 0, 0.45, 0);
      for (const s of [-1, 1]) box(b, 0.06, 0.45, 0.38, M.wood, s * 0.65, 0.225, 0);
      put(b, 'foyer', 'W', 16, 0.4);
    }
    put(table(1.0, 0.4, 0.85), 'foyer', 'E', 15.5, 0.4);
    {
      const [x, z] = onWall('foyer', 'E', 15.5, 0.24);
      cyl(stat, 0.05, 0.06, 0.015, M.brass, x, 0.857, z + 0.25, 10);
      candle(stat, x, 0.865, z + 0.25, 0.1, true);
      putAt(vase(), x, z - 0.25, 0, false, { y: 0.85 });
    }
    wallMirror('foyer', 'E', 15.5, 1.75);
    {
      const g = G();
      cyl(g, 0.12, 0.12, 0.55, M.iron, 0, 0.275, 0, 12);
      cyl(g, 0.012, 0.012, 0.85, M.black, 0.03, 0.55, 0.02, 4, 0.1, 0.1);
      putAt(g, 3.4, 19.4, 0);
    }
    painting('foyer', 'W', 12.2, 0, 0.7, 0.9);
    painting('foyer', 'N', -2.8, 3, 0.5, 0.6, 1.8);
    webs('foyer', 2);
  }

  // ----- Parlor -----
  {
    const fp = put(fireplace(), 'parlor', 'E', 15, 0.45);
    const ep = worldOf(fp, 0, 0.35, 0.25);
    addLight(ep.x, ep.y, ep.z, 0xff4a10, 3.5, 7, 'fire');
    putAt(sofa(2.0), 10.6, 15, PI / 2);
    putAt(armchair(), 12.2, 12.7, 0.25);
    putAt(armchair(), 12.2, 17.3, PI - 0.25);
    putAt(table(1.0, 0.6, 0.45), 11.7, 15, PI / 2);
    put(piano(), 'parlor', 'W', 12.6, 0.6);
    putAt(covered(1.1, 1.2, 0.9), 5.6, 18.4, 0.3);
    putAt(covered(0.8, 0.9, 0.8), 7.0, 18.7, -0.2);
    rugAt(11.3, 15, 3, 4, M.rugs[1]);
    windowAt('parlor', 'S', 9);
    painting('parlor', 'W', 17, 2, 0.7, 0.9);
    painting('parlor', 'N', 6.2, 0, 0.6, 0.8);
    painting('parlor', 'N', 12, 1, 0.9, 0.6);
    webs('parlor', 2);
  }

  // ----- Guest bedroom -----
  {
    put(bed(1.5, 2.05, M.bedding), 'guest', 'E', 12, 2.05);
    put(nightstand(false), 'guest', 'E', 10.4, 0.42);
    put(nightstand(false), 'guest', 'E', 13.6, 0.42);
    put(wardrobe(), 'guest', 'W', 17.5, 0.6);
    put(dresser(1.3, true), 'guest', 'S', 16.5, 0.5);
    putAt(chest(1.0), 21.3, 12, -PI / 2);
    putAt(covered(0.9, 1.0, 0.9), 22.4, 18.4, 0.4);
    rugAt(20.5, 12.5, 3, 3.6, M.rugs[2], PI / 2);
    windowAt('guest', 'S', 19.5);
    windowAt('guest', 'E', 15.6);
    painting('guest', 'W', 12.5, 4, 0.7, 0.9);
    webs('guest', 2);
  }

  // ----- Child's bedroom -----
  {
    put(bed(1.0, 1.8, M.bedding2), 'child', 'S', -21.5, 1.8);
    put(nightstand(false), 'child', 'S', -22.7, 0.42);
    putAt(chest(0.8), -21.5, -0.45, PI);
    put(table(1.0, 0.55, 0.65), 'child', 'E', 0.2, 0.55);
    putAt(chair(), -16.1, 0.2, -PI / 2 + PI);
    put(wardrobe(1.0, 1.8, 0.5), 'child', 'N', -22.6, 0.5);
    putAt(doll(), -21.35, 1.2, PI, false, { y: 0.64 });
    putAt(teddy(), -18.2, -2.5, 2.2, false);
    for (let i = 0; i < 6; i++) {
      const s = rand(0.06, 0.09);
      box(stat, s, s, s, M.toys[i % 4], -19 + rand(-0.8, 0.8), s / 2, -1 + rand(-0.8, 0.8), rand(0, PI));
    }
    for (let i = 0; i < 5; i++) {
      const [x, z, rot] = onWall('child', 'N', -17.6 + i * 0.35 + rand(-0.05, 0.05), 0.01);
      plane(stat, 0.24, 0.3, M.paper, x, 1.35 + rand(-0.15, 0.2), z, rot, 0).rotation.z = rand(-0.2, 0.2);
    }
    papers(stat, -17.5, -1.5, 5, 0.5);
    rugAt(-19.5, -1.5, 2.6, 2.6, M.rugs[2]);
    windowAt('child', 'W', -3);
    webs('child', 2);
  }

  // ----- Storage room -----
  {
    putAt(crate(0.7), -23.3, 2.9, 0.1);
    putAt(crate(0.6), -23.3, 3.75, -0.2);
    putAt(crate(0.5), -23.25, 2.95, 0.4, false, { y: 0.7 });
    putAt(crate(0.6), -16.2, 6.2, 0.3);
    putAt(crate(0.5), -16.9, 6.35, -0.1);
    putAt(covered(1.6, 1.0, 0.9), -21.2, 4.0, 0.15);
    putAt(covered(0.8, 1.5, 0.6), -18.2, 3.2, -0.3);
    put(bookshelf(1.4, 2.0, 0.35), 'storage', 'E', 4.2, 0.35);
    {
      const m = G();
      box(m, 0.9, 1.8, 0.2, M.linen, 0, 0.9, 0);
      const [x, z, rot] = onWall('storage', 'W', 5.8, 0.4);
      putAt(m, x, z, rot, true, { rx: -0.2 });
    }
    putAt(chair(), -20.4, 6.1, 2.5, true, { y: 0.23, rz: PI / 2 });
    webs('storage', 3);
  }

  // ----- Washroom -----
  {
    put(bathtub(), 'wash', 'N', -12.25, 0.75);
    put(sink(), 'wash', 'S', -13.6, 0.45);
    wallMirror('wash', 'S', -13.6);
    put(toilet(), 'wash', 'S', -11, 0.5);
    webs('wash', 2);
  }

  // ----- Linen closet -----
  {
    put(linenShelf(), 'linen', 'W', 1.4, 0.45);
    put(linenShelf(), 'linen', 'W', 5.4, 0.45);
    put(linenShelf(1.2), 'linen', 'S', -12.4, 0.45);
    putAt(crate(0.5), -10.4, 6.2, 0.2);
    cyl(stat, 0.14, 0.12, 0.3, M.iron, -13.6, 0.15, 3.4, 12);
    cyl(stat, 0.015, 0.015, 1.3, M.wood, -14.6, 0.68, 3.3, 6, 0, 0.15);
    webs('linen', 3);
  }

  // ----- Laundry -----
  {
    for (const z of [-5.3, -2.0]) {
      cyl(stat, 0.006, 0.006, 6.3, M.linen, 12.75, 2.15, z, 4, 0, PI / 2);
      for (let x = 10.7; x < 15.5; x += rand(1.1, 1.5)) {
        const s = G();
        s.position.set(x, 2.15, z);
        const w = rand(0.8, 1.0), h = rand(1.2, 1.5);
        plane(s, w, h, M.sheetDS, 0, -h / 2, 0);
        dyn.add(s);
        const ph = rand(0, 6);
        animated.push((t) => { s.rotation.x = Math.sin(t * 0.7 + ph) * 0.05; });
      }
    }
    {
      const tub = G();
      box(tub, 1.2, 0.7, 0.6, M.wood, 0, 0.35, 0);
      box(tub, 1.1, 0.01, 0.5, M.water, 0, 0.66, 0);
      box(tub, 0.1, 0.5, 0.1, M.iron, 0.4, 0.95, -0.1);
      put(tub, 'laundry', 'E', -5.3, 0.6);
    }
    {
      const sh = linenShelf(1.4, 1.6, 0.4);
      put(sh, 'laundry', 'N', 11.5, 0.4);
    }
    for (const [x, z] of [[14.6, -1.0], [13.8, -0.7]]) {
      const b = G();
      cyl(b, 0.25, 0.2, 0.35, M.crate, 0, 0.175, 0, 10);
      box(b, 0.4, 0.08, 0.3, M.linen, 0, 0.36, 0, 0.4);
      putAt(b, x, z, 0);
    }
    webs('laundry', 3);
  }

  // ----- Servant's quarters -----
  {
    put(bed(0.95, 1.9, M.bedding2), 'servant', 'S', 12.2, 1.9);
    put(table(0.7, 0.45, 0.75), 'servant', 'N', 11.2, 0.45);
    putAt(chair(), 11.2, 1.0, PI);
    put(chest(0.8), 'servant', 'N', 14.6, 0.5);
    {
      const [x, z] = onWall('servant', 'N', 11.2, 0.3);
      cyl(stat, 0.05, 0.06, 0.015, M.brass, x + 0.15, 0.757, z, 10);
      candle(stat, x + 0.15, 0.765, z, 0.05);
      box(stat, 0.16, 0.04, 0.22, M.books[0], x - 0.15, 0.77, z, 0.3);
    }
    painting('servant', 'E', 1.4, 2, 0.4, 0.5, 1.7, -0.1);
    webs('servant', 3);
  }

  // ----- East bedroom -----
  {
    put(bed(1.6, 2.05, M.bedding), 'ebed', 'S', 21, 2.05);
    put(nightstand(false), 'ebed', 'S', 19.7, 0.42);
    put(nightstand(false), 'ebed', 'S', 22.3, 0.42);
    put(wardrobe(), 'ebed', 'N', 22.7, 0.6);
    put(table(1.2, 0.6, 0.76, true), 'ebed', 'W', -3, 0.6);
    putAt(chair(), 17.15, -3, -PI / 2);
    putAt(chair(), 23.1, -6.1, PI * 0.75);   // facing the corner
    put(covered(0.7, 1.9, 0.4), 'ebed', 'W', 0.6, 0.4);
    rugAt(21, 3.5, 3.2, 3.6, M.rugs[0]);
    windowAt('ebed', 'E', 0);
    painting('ebed', 'N', 17.6, 0, 0.6, 0.8);
    papers(stat, 18.5, -4, 4, 0.7);
    webs('ebed', 2);
  }

  // ======================= WALL LAMPS =======================
  // Corridors are lit above; here the hall and rooms. A few rooms are left with dead lamps or none.
  lamps('hall', [['N', -5.6, 'on'], ['N', 5.6, 'off'], ['E', -5.6, 'on'], ['W', 5.6, 'on'], ['S', 1.8, 'on']], 3.8);
  lamps('wc', [['W', 0, 'on']], 3.2);
  lamps('ec', [['E', 0, 'flicker']], 3.2);
  lamps('master', [['S', -14.5, 'on'], ['N', -15.6, 'on']], 2.6);
  lamps('mbath', [['S', -8, 'flicker']], 2.4);
  lamps('library', [['S', 3, 'on'], ['S', -3, 'off']], 2.8);
  lamps('nursery', [['S', 7.3, 'on']], 1.8);
  lamps('nebed', [['S', 16, 'on']], 2.4);
  lamps('kitchen', [['E', 11.5, 'flicker']], 2.6);
  lamps('dining', [['S', -12, 'on'], ['S', -6, 'off']], 2.8);
  lamps('foyer', [['W', 18.6, 'on']], 2.8);
  lamps('parlor', [['S', 6, 'on']], 2.4);
  lamps('guest', [['N', 22.5, 'off'], ['W', 15, 'on']]);
  lamps('child', [['E', -5.5, 'flicker']], 2.2);
  lamps('laundry', [['W', -1, 'flicker']], 2.4);
  lamps('servant', [['W', 1.2, 'on']], 2.0);
  lamps('ebed', [['W', -5.5, 'on']], 2.6);
  lamps('wash', [['W', -6, 'off']]);

  // ======================= GRAND STAIRCASE =======================
  {
    const S = STAIR, n = S.steps, run = (S.zBot - S.zTop) / n, rise = Y2 / n;
    const w = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2, span = S.zBot - S.zTop;
    const railY = (z) => 0.95 + ((S.zBot - z) / span) * Y2;
    for (let i = 0; i < n; i++) {
      const zf = S.zBot - i * run;   // front edge of this step
      const top = (i + 1) * rise;
      box(stat, w, top, run, M.wood, cx, top / 2, zf - run / 2);
      box(stat, w - 0.5, 0.012, run - 0.02, M.carpet3, cx + 0.05, top + 0.006, zf - run / 2);
      box(stat, w + 0.02, 0.03, 0.04, M.trim, cx, top - 0.015, zf - 0.02);
      const bz = zf - run / 2, bh = railY(bz) - top;
      cyl(stat, 0.016, 0.016, bh, M.wood, S.x0 + 0.05, top + bh / 2, bz, 6);
    }
    box(stat, 0.08, 0.07, Math.hypot(span, Y2) + 0.1, M.wood, S.x0 + 0.05, 0.95 + Y2 / 2, (S.zBot + S.zTop) / 2, 0, Math.atan2(Y2, span));
    box(stat, 0.14, 1.15, 0.14, M.wood, S.x0 + 0.05, 0.575, S.zBot - 0.08);
    sph(stat, 0.08, M.wood, S.x0 + 0.05, 1.2, S.zBot - 0.08, 1, 1, 1, 10);
    // the banister keeps the player from stepping off the open side higher up
    colliders.push(new THREE.Box3(new THREE.Vector3(S.x0 - 0.03, 0, S.zTop), new THREE.Vector3(S.x0 + 0.12, Y2 + 1, 5.0)));
    lamps('h_void', [['E', 4, 'on']], 3.0);
    webs('h_void', 2);
  }

  // ======================= SECOND FLOOR: THE HOTEL =======================
  const TOP2 = Y2 + H2;
  Object.assign(M, {
    domeOn: std({ color: 0x302010, emissive: 0xffc070, emissiveIntensity: 1.6, roughness: 0.4 }),
    domeOff: std({ color: 0x2a261c, roughness: 0.35 }),
  });
  function ceilingLight(x, z, state) {
    const room = ROOMS.find((r) => r.level === 1 && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    const g = G();
    cyl(g, 0.2, 0.2, 0.03, M.brass, 0, -0.015, 0, 16);
    const mat = state === 'flicker' ? M.domeOn.clone() : state === 'on' ? M.domeOn : M.domeOff;
    if (state === 'off' && Math.random() < 0.5) {
      // the glass dome has fallen and smashed; only the socket is left
      cyl(g, 0.03, 0.03, 0.08, M.brass, 0, -0.06, 0, 8);
      for (let i = 0; i < 6; i++) box(stat, rand(0.03, 0.08), 0.01, rand(0.03, 0.08), M.domeOff, x + rand(-0.4, 0.4), Y2 + 0.005, z + rand(-0.4, 0.4), rand(0, PI));
    } else sph(g, 0.17, mat, 0, -0.03, 0, 1, 0.45, 1, 14);
    putAt(g, x, z, 0, false, { y: TOP2 });
    if (state === 'off') return;
    addLight(x, TOP2 - 0.35, z, 0xffb868, 5.5, 10, state === 'flicker' ? 'failing' : 'lamp', 1.5);
    const halo = addHalo(new THREE.Vector3(x, TOP2 - 0.1, z), 0.8);
    const f = flickers[flickers.length - 1];
    if (state === 'flicker') { f.mat = mat; f.halo = halo; }
    // a pool of light on the carpet below and a soft ring on the ceiling, kept inside the corridor
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    const clipX = (h) => [Math.max(-h, room.x0 + T / 2 - x), Math.min(h, room.x1 - T / 2 - x)];
    const clipZ = (h) => [Math.max(-h, room.z0 + T / 2 - z), Math.min(h, room.z1 - T / 2 - z)];
    addGlow(f, new THREE.Vector3(x, Y2 + 0.015, z), X, Z, 2.0, ...clipX(2.0), ...clipZ(2.0), CEILING_GLOW, 1.5);
    addGlow(f, new THREE.Vector3(x, TOP2 - 0.012, z), X, Z, 1.1, ...clipX(1.1), ...clipZ(1.1), CEILING_GLOW, 0.9);
  }
  const pickState = () => { const r = Math.random(); return r < 0.55 ? 'on' : r < 0.75 ? 'flicker' : 'off'; };

  // corridor ceiling lights
  for (const z of [-12, 0, 12]) for (let x = -22; x <= 22; x += 4) ceilingLight(x, z, pickState());
  for (const x of [-23, 0, 23]) for (const z of [-8, -4, 4, 8]) ceilingLight(x, z, pickState());

  // corridor walls: faded pictures and small tables between the doors
  const doorsOn = (c) => OPENINGS.filter((o) => o.level === 1 && o.axis === 'h' && Math.abs(o.c - c) < 1e-3);
  for (const [id, sides] of [['h_cn', [['N', -13], ['S', -11]]], ['h_cm', [['N', -1], ['S', 1]]], ['h_cs', [['N', 11], ['S', 13]]]]) {
    for (const [side, c] of sides) {
      const ops = doorsOn(c);
      for (let x = -21; x <= 21; x += 3) {
        if (ops.some((o) => Math.abs(o.at - x) < o.w / 2 + 0.7)) continue;
        const r = Math.random();
        if (r < 0.45) painting(id, side, x, Math.floor(rand(0, 6)), 0.6, 0.45, 1.7, rand(-0.06, 0.06));
        else if (r < 0.6) {
          put(table(0.6, 0.32, 0.75), id, side, x, 0.32);
          put(vase(), id, side, x, 0.18, false, { y: 0.75 });
        }
      }
    }
  }
  // service clutter left in the corridors
  function serviceCart() {
    const g = G();
    box(g, 0.9, 0.04, 0.5, M.brass, 0, 0.8, 0);
    box(g, 0.9, 0.03, 0.5, M.brass, 0, 0.3, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(g, 0.012, 0.012, 0.8, M.brass, sx * 0.43, 0.42, sz * 0.23, 6);
      cyl(g, 0.04, 0.04, 0.03, M.black, sx * 0.43, 0.04, sz * 0.23, 8, 0, PI / 2);
    }
    box(g, 0.95, 0.01, 0.55, M.linen, 0, 0.825, 0);
    sph(g, 0.14, M.brass, -0.2, 0.83, 0, 1, 0.7, 1, 12);
    cyl(g, 0.12, 0.09, 0.015, M.porcelain, 0.2, 0.84, 0.05, 14);
    cyl(g, 0.03, 0.035, 0.25, M.porcelain, 0.3, 0.95, -0.12, 8);
    return g;
  }
  function luggageCart() {
    const g = G();
    box(g, 1.0, 0.05, 0.55, M.trim, 0, 0.18, 0);
    for (const sx of [-1, 1]) {
      cyl(g, 0.02, 0.02, 1.6, M.brass, sx * 0.48, 0.98, 0, 8);
      for (const sz of [-1, 1]) cyl(g, 0.06, 0.06, 0.04, M.black, sx * 0.4, 0.06, sz * 0.22, 10, 0, PI / 2);
    }
    const bar = cyl(g, 0.02, 0.02, 1.0, M.brass, 0, 1.76, 0, 8);
    bar.rotation.z = PI / 2;
    box(g, 0.7, 0.45, 0.25, M.coat, -0.1, 0.43, 0);
    box(g, 0.5, 0.35, 0.22, M.bedding, 0.15, 0.82, 0.02, 0.2);
    return g;
  }
  putAt(serviceCart(), -14.8, -0.45, 0.1, true, { y: Y2 });
  putAt(serviceCart(), 17.5, 12.5, -0.3, true, { y: Y2 });
  putAt(luggageCart(), -6.5, -12.4, 0.2, true, { y: Y2 });
  putAt(luggageCart(), 23, 6.5, PI / 2, true, { y: Y2 });
  putAt(chair(), 15.4, 0.4, 2.6, true, { y: Y2 + 0.23, rz: PI / 2 });
  for (const [x, z] of [[-23, -12.2], [23, 12.2], [-23, 12.2], [23, -12.2]]) putAt(vase(), x, z, 0, true, { y: Y2 });
  windowAt('h_cn', 'W', -12); windowAt('h_cn', 'E', -12);
  windowAt('h_cm', 'W', 0); windowAt('h_cm', 'E', 0);
  windowAt('h_cs', 'W', 12); windowAt('h_cs', 'E', 12);
  for (const id of ['h_cn', 'h_cm', 'h_cs', 'h_wn', 'h_ws', 'h_mn', 'h_ms', 'h_en', 'h_es']) webs(id, 2);

  // the old elevator, doors jammed a hand's width apart
  {
    const g = G();
    box(g, 1.7, 2.5, 0.08, M.brass, 0, 1.25, 0.04);
    for (const s of [-1, 1]) box(g, 0.66, 2.2, 0.03, M.iron, s * 0.37, 1.1, 0.095);
    box(g, 0.06, 2.2, 0.02, M.black, 0, 1.1, 0.1);
    const dial = cyl(g, 0.22, 0.22, 0.02, M.brass, 0, 2.38, 0.1, 20);
    dial.rotation.x = PI / 2;
    box(g, 0.015, 0.18, 0.01, M.black, 0.05, 2.42, 0.115, 0, 0, -0.9);
    box(g, 0.26, 0.18, 0.01, M.paper, 0.45, 1.5, 0.115, 0, 0, 0.08);
    const [x, z, rot] = onWall('h_cs', 'S', 0, 0);
    putAt(g, x, z, rot, true, { y: Y2 });
  }

  // brass number plate beside every guest room door, on the corridor side
  for (const gr of HOTEL.guestRooms) {
    const r = R[gr.id];
    const toward = gr.doorAt < (r.x0 + r.x1) / 2 ? 1 : -1;
    const corridorDir = gr.doorSide === 'N' ? -1 : 1;
    const i = gr.number - 201, col = i % 8, row = Math.floor(i / 8);
    const geo = new THREE.PlaneGeometry(0.2, 0.1);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 8, 1 - (row + 1 - uv.getY(k)) / 8);
    const m = new THREE.Mesh(geo, M.numbers);
    m.position.set(gr.doorAt + toward * 0.85, Y2 + 1.55, gr.doorLine + corridorDir * (T / 2 + 0.006));
    m.rotation.y = corridorDir > 0 ? 0 : PI;
    stat.add(m);
  }

  // ----- the guest rooms -----
  const covers = [M.bedding, M.bedding2, M.bedding3];
  function hotelRoom(gr) {
    const id = gr.id, r = R[id];
    const W = r.x1 - r.x0, D = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2;
    const back = gr.doorSide === 'N' ? 'S' : 'N';        // wall opposite the door
    const doorWest = gr.doorAt < cx;
    const farSide = doorWest ? 'E' : 'W', nearSide = doorWest ? 'W' : 'E';
    // z coordinate at a fraction of the depth, measured from the door wall
    const zAt = (f) => (gr.doorSide === 'N' ? r.z0 + D * f : r.z1 - D * f);
    const suite = D > 6.5;
    const bedW = suite ? 1.7 : 1.4;
    const bedX = cx + (doorWest ? 0.4 : -0.4);
    const ransacked = Math.random() < 0.3;

    put(bed(bedW, 2.0, covers[Math.floor(rand(0, 3))], suite && Math.random() < 0.5), id, back, bedX, 2.0);
    for (const s of [-1, 1]) put(nightstand(false, Math.random() < 0.4), id, back, bedX + s * (bedW / 2 + 0.33), 0.42);
    if (Math.random() < 0.35) put(hideCupboard(suite ? 1.2 : 1.05, 2.05, 0.65), id, farSide, zAt(0.22 + (suite ? 0.05 : 0)), 0.65);
    else put(wardrobe(suite ? 1.2 : 1.0, 2.0, 0.6), id, farSide, zAt(0.22 + (suite ? 0.05 : 0)), 0.6);
    if (Math.random() < 0.6) {
      put(table(1.0, 0.55, 0.75, true), id, nearSide, zAt(0.65), 0.55);
      const [x, z, rot] = onWall(id, nearSide, zAt(0.65), 0.04 + 0.55 + 0.35);
      if (ransacked) putAt(chair(), x, z, rot + PI + 0.7, true, { y: Y2 + 0.23, rz: PI / 2 });
      else putAt(chair(), x, z, rot + PI, true, { y: Y2 });
    } else put(dresser(1.1, true), id, nearSide, zAt(0.65), 0.5);
    lamps(id, [[back, bedX - (doorWest ? 1 : -1) * (bedW / 2 + 0.33), pickState()]], 2.6);
    if (Math.random() < 0.7) painting(id, back, bedX, Math.floor(rand(0, 6)), 0.8, 0.5, 2.05, rand(-0.05, 0.05));
    if (suite) {
      windowAt(id, back, doorWest ? r.x1 - 1.2 : r.x0 + 1.2);
      putAt(armchair(Math.random() < 0.5 ? M.velvet : M.bedding), doorWest ? r.x1 - 1.4 : r.x0 + 1.4, zAt(0.5), doorWest ? -PI / 2 - 0.4 : PI / 2 + 0.4, true, { y: Y2 });
      rugAt(bedX, zAt(0.6), 2.4, 1.8, M.rugs[Math.floor(rand(0, 3))], 0, Y2);
    }
    if (Math.random() < 0.4) {
      const sc = G();
      box(sc, 0.65, 0.42, 0.2, Math.random() < 0.5 ? M.coat : M.bedding2, 0, 0.21, 0);
      box(sc, 0.18, 0.03, 0.03, M.black, 0, 0.45, 0);
      putAt(sc, cx + rand(-0.6, 0.6), zAt(0.45), rand(0, PI), true, { y: Y2, rz: Math.random() < 0.5 ? PI / 2 : 0 });
    }
    if (ransacked) {
      papers(stat, cx, zAt(0.45), 5, 0.8, Y2);
      plane(stat, 1.4, 1.0, M.sheet, bedX + rand(-0.5, 0.5), Y2 + 0.012, zAt(0.4), rand(0, PI), -PI / 2);
    }
    webs(id, Math.random() < 0.5 ? 1 : 2);
  }
  for (const gr of HOTEL.guestRooms) hotelRoom(gr);

  // ======================= HIDING CUPBOARDS =======================
  put(hideCupboard(), 'nc', 'N', -3.5, 0.7);
  put(hideCupboard(), 'sc', 'N', 11.5, 0.7);
  put(hideCupboard(), 'guest', 'N', 16.5, 0.7);
  put(hideCupboard(), 'child', 'W', -5.5, 0.7);
  put(hideCupboard(), 'kitchen', 'N', -16, 0.7);
  put(hideCupboard(), 'h_wn', 'W', -6, 0.7);
  put(hideCupboard(), 'h_ws', 'W', 6, 0.7);
  put(hideCupboard(), 'h_en', 'E', -6, 0.7);
  put(hideCupboard(), 'h_es', 'E', 3, 0.7);

  // ======================= DECAY =======================
  // Water damage, torn wallpaper and mold scattered over both faces of every wall.
  for (const seg of wallSegs) {
    const len = seg.e - seg.s;
    if (len < 0.8) continue;
    for (const side of [-1, 1]) {
      const n = Math.floor((len / 2.2) * rand(0.4, 1.4));
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        let mat, w, h, y;
        if (r < 0.45) { mat = M.drip; w = rand(0.6, 1.4); h = rand(0.9, 1.9); y = seg.top - 0.12 - h / 2; }
        else if (r < 0.8) { mat = M.peel; w = rand(0.25, 0.7); h = w * rand(0.8, 1.4); y = rand(seg.y0 + 1.15 + h / 2, seg.top - 0.2 - h / 2); }
        else { mat = M.mold; w = rand(0.4, 1.0); h = w * rand(0.6, 1.0); y = Math.random() < 0.5 ? seg.top - 0.12 - h / 2 : rand(seg.y0 + 1.1 + h / 2, seg.y0 + 2.2); }
        if (len < w + 0.1) continue;
        const along = rand(seg.s + w / 2 + 0.05, seg.e - w / 2 - 0.05);
        const o = T / 2 + 0.002;
        if (seg.axis === 'h') plane(stat, w, h, mat, along, y, seg.c + side * o, side > 0 ? 0 : PI);
        else plane(stat, w, h, mat, seg.c + side * o, y, along, side > 0 ? PI / 2 : -PI / 2);
      }
    }
  }
  // Stains on the floors and crumbled plaster along the skirting boards.
  for (const r of ROOMS) {
    if (r.floor === 'void') continue;
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    const n = Math.min(6, Math.ceil(area / 18));
    for (let i = 0; i < n; i++) {
      const s = rand(0.7, 2.0);
      plane(stat, s, s * rand(0.6, 1.2), M.stain, rand(r.x0 + 0.5, r.x1 - 0.5), r.y0 + 0.009, rand(r.z0 + 0.5, r.z1 - 0.5), rand(0, PI), -PI / 2);
    }
    for (let i = 0; i < n * 3; i++) {
      const sz = rand(0.02, 0.07), edge = Math.floor(rand(0, 4));
      const x = edge < 2 ? rand(r.x0 + 0.2, r.x1 - 0.2) : edge === 2 ? r.x0 + 0.16 : r.x1 - 0.16;
      const z = edge >= 2 ? rand(r.z0 + 0.2, r.z1 - 0.2) : edge === 0 ? r.z0 + 0.16 : r.z1 - 0.16;
      box(stat, sz, sz * 0.6, sz * rand(0.7, 1.3), M.plaster, x + rand(-0.05, 0.05), r.y0 + sz * 0.3, z + rand(-0.05, 0.05), rand(0, PI));
    }
  }
  // Places where the ceiling has given way: a stained hole above, a pile of plaster below.
  function collapse(x, z, fy, top) {
    plane(stat, 1.8, 1.8, M.stain, x, top - 0.008, z, rand(0, PI), PI / 2);
    plane(stat, rand(0.5, 0.8), rand(0.4, 0.6), M.black, x, top - 0.004, z, rand(0, PI), PI / 2);
    for (let i = 0; i < 16; i++) {
      const sz = rand(0.04, 0.2);
      box(stat, sz, sz * 0.4, sz * rand(0.6, 1.4), M.plaster, x + rand(-0.55, 0.55), fy + sz * 0.2, z + rand(-0.55, 0.55), rand(0, PI), rand(-0.3, 0.3), rand(-0.3, 0.3));
    }
    box(stat, 0.04, 0.015, 0.7, M.wood, x + 0.1, top - 0.25, z, rand(0, PI), 0.6);
    box(stat, 0.04, 0.015, 0.5, M.wood, x - 0.15, top - 0.18, z + 0.1, rand(0, PI), -0.45);
  }
  for (const [x, z] of [[2.5, -2.5], [-19, -13.5], [20, -2], [-16.8, 12], [-2.8, -13], [11.5, -4.5]]) collapse(x, z, 0, H);
  for (const [x, z] of [[-14.5, 0], [10.5, -12], [-19.5, 4], [12.5, 16.5], [-3, -16]]) collapse(x, z, Y2, Y2 + H2);

  // ---------- merge static meshes per material, per area, per floor ----------
  // Merging keeps draw calls low; splitting by area and floor lets the renderer skip whatever is
  // off-screen (and the shadow pass skip whatever is outside the flashlight beam).
  const levelOfY = (y) => (y > 3.4 ? 1 : 0);
  stat.updateMatrixWorld(true);

  // ---------- drawers ----------
  // One instanced mesh per drawer size (plus one for the knobs), so ~240 drawers cost a few draw calls.
  const drawers = [];
  const drawerMeshes = [];
  {
    const bySize = new Map();
    for (const s of drawerSlots) {
      const key = `${s.w.toFixed(3)}|${s.h.toFixed(3)}|${s.d.toFixed(3)}`;
      if (!bySize.has(key)) bySize.set(key, []);
      bySize.get(key).push(s);
    }
    const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const list of bySize.values()) {
      const { w, h, d } = list[0];
      const t = 0.014;
      const parts = [
        [w, h, 0.022, 0, 0, d / 2 - 0.011],                 // front
        [w - 0.02, t, d - 0.02, 0, -h / 2 + t / 2 + 0.01, 0], // bottom
        [t, h * 0.75, d - 0.02, -(w / 2 - 0.02), -h * 0.1, 0],
        [t, h * 0.75, d - 0.02, w / 2 - 0.02, -h * 0.1, 0],
        [w - 0.04, h * 0.75, t, 0, -h * 0.1, -d / 2 + 0.02],  // back
      ].map(([bw, bh, bd, x, y, z]) => boxGeo(bw, bh, bd).translate(x, y, z));
      const trayGeo = mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
      const knobGeo = new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0, d / 2 + 0.012);
      const tray = new THREE.InstancedMesh(trayGeo, M.wood, list.length);
      const knob = new THREE.InstancedMesh(knobGeo, M.brass, list.length);
      for (const m of [tray, knob]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
      list.forEach((s, i) => {
        const base = s.g.matrixWorld.clone().multiply(tmp.makeTranslation(s.x, s.y, s.zFront + 0.012 - s.d / 2));
        const pos = new THREE.Vector3();
        base.decompose(pos, q, sc);
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const anchor = new THREE.Object3D();   // things kept inside the drawer ride along with it
        anchor.position.copy(pos);
        anchor.quaternion.copy(q);
        scene.add(anchor);
        const drawer = {
          tray, knob, index: i, base, pos, dir, w: s.w, h: s.h, d: s.d, anchor,
          open: 0, target: 0, room: roomAt(pos.x, pos.z, pos.y),
          isOpen() { return this.target > 0; },
          toggle() { this.target = this.target > 0 ? 0 : 1; return this.target > 0 ? 'open' : 'close'; },
        };
        tray.setMatrixAt(i, base);
        knob.setMatrixAt(i, base);
        drawers.push(drawer);
      });
      tray.userData.drawers = knob.userData.drawers = drawers.slice(drawers.length - list.length);
      drawerMeshes.push(tray, knob);
    }
  }
  const slideM = new THREE.Matrix4();
  function updateDrawers(dt) {
    for (const dr of drawers) {
      if (dr.open === dr.target) continue;
      dr.open = dr.target > dr.open ? Math.min(dr.target, dr.open + dt / 0.3) : Math.max(dr.target, dr.open - dt / 0.3);
      const pull = dr.d * 0.75 * (1 - (1 - dr.open) ** 2);   // eases out as it slides
      slideM.makeTranslation(dr.dir.x * pull, dr.dir.y * pull, dr.dir.z * pull).multiply(dr.base);
      dr.tray.setMatrixAt(dr.index, slideM);
      dr.knob.setMatrixAt(dr.index, slideM);
      dr.tray.instanceMatrix.needsUpdate = dr.knob.instanceMatrix.needsUpdate = true;
      dr.anchor.position.copy(dr.pos).addScaledVector(dr.dir, pull);
    }
  }
  function resetDrawers() {
    for (const dr of drawers) { dr.target = 0; dr.open = Math.min(dr.open, 0.001); }
    updateDrawers(1);
    for (const dr of drawers) { dr.open = 0; dr.anchor.position.copy(dr.pos); dr.tray.setMatrixAt(dr.index, dr.base); dr.knob.setMatrixAt(dr.index, dr.base); }
    for (const m of drawerMeshes) m.instanceMatrix.needsUpdate = true;
  }

  // ---------- hiding spots ----------
  const hidingSpots = hideSlots.map(({ g, h, d }) => {
    const at = (x, y, z) => g.localToWorld(new THREE.Vector3(x, y, z));
    return {
      level: g.position.y > 1.75 ? 1 : 0,
      floorY: g.position.y,
      inside: at(0, 1.55, d / 2 - 0.42),        // where the eyes go when hiding
      front: at(0, 0, d / 2 + 0.6),             // where the player steps out
      aim: at(0, h * 0.55, d / 2),              // centre of the doors, for "look at it to hide"
      yaw: g.rotation.y + Math.PI,              // facing out through the slats
    };
  });

  const buckets = new Map();
  const center = new THREE.Vector3();
  // Plain untextured colours share one material, with each object's colour stored per vertex.
  const tinted = std({ vertexColors: true, roughness: 0.8 });
  const tintable = new Set([...M.books, ...M.toys, M.linen, M.black, M.wax, M.skin, M.dress, M.hair, M.clockFace, M.plaster, M.shadeOff, M.domeOff]);
  stat.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    let mat = o.material;
    if (tintable.has(mat)) {
      const n = g.attributes.position.count, c = mat.color, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      mat = tinted;
    }
    g.computeBoundingBox();
    g.boundingBox.getCenter(center);
    const level = levelOfY(center.y);
    const key = `${mat.id}:${level}:${Math.floor((center.x + 24) / 24)}:${Math.floor((center.z + 20) / 20)}`;
    if (!buckets.has(key)) buckets.set(key, { mat, level, geos: [] });
    buckets.get(key).geos.push(g);
  });
  // surfaces that stop the "look at a door" ray, so doors behind walls or floors can't be used
  const occluderMats = new Set([M.wall, M.wall2, M.ceil, ...Object.values(floorMat)]);
  const levelObjects = [[], []];   // everything that belongs to one floor, shown/hidden together
  const occluders = [[], []];
  for (const { mat, level, geos } of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = !mat.transparent && mat !== M.glass && mat !== M.ceil;
    m.receiveShadow = !mat.transparent;
    scene.add(m);
    levelObjects[level].push(m);
    if (occluderMats.has(mat)) occluders[level].push(m);
  }
  // Moving props (chandelier, pendulum, rocking chair, mobile) are rigid, so each one is collapsed
  // into one mesh per material while keeping its own transform for animation.
  for (const o of dyn.children) {
    if (o.children.some((c) => c.userData.door)) continue;
    o.updateMatrixWorld(true);
    const inv = o.matrixWorld.clone().invert();
    const parts = new Map();
    o.traverse((m) => {
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (!parts.has(m.material)) parts.set(m.material, []);
      parts.get(m.material).push(g);
    });
    if (parts.size === 0) continue;
    for (const c of [...o.children]) o.remove(c);
    for (const [mat, geos] of parts) o.add(new THREE.Mesh(mergeGeometries(geos, false), mat));
  }
  for (const o of dyn.children) levelObjects[levelOfY(o.position.y)].push(o);
  // all bulb glows on a floor share one draw call
  const haloTex = TX.halo();
  const haloBatches = [0, 1].map((level) => {
    const list = halos.filter((h) => levelOfY(h.position.y) === level);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((h) => h.position.toArray()), 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(list.map((h) => h.size), 1));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(list.map((h) => h.alpha), 1));
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: haloTex }, uScale: { value: window.innerHeight } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha;
        uniform float uScale;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          vA = aAlpha * exp(-pow(0.05 * d, 2.0));   // match the scene fog
          gl_PointSize = aSize * uScale * 0.69 / d;   // 0.69 = 1 / (2 tan(fov / 2)) for the 72 degree camera
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(1.0, 0.69, 0.38) * texture2D(uMap, gl_PointCoord).a * vA, 1.0); }`,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    levelObjects[level].push(pts);
    return { list, pts };
  });
  // all painted lamplight on a floor is one mesh; its per-vertex brightness is updated every frame
  const glowTex = TX.softGlow();
  const glowBatches = [0, 1].map((level) => {
    const list = glows.filter((q) => q.level === level);
    const pos = [], uv = [], col = [], idx = [];
    list.forEach((q, i) => {
      for (let k = 0; k < 4; k++) {
        pos.push(q.pos[k].x, q.pos[k].y, q.pos[k].z);
        uv.push(...q.uv[k]);
        col.push(...q.color.map((v) => v * q.strength));
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(new Float32Array(list.length * 4), 1));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTex } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      vertexShader: `
        attribute vec3 aColor; attribute float aAlpha;
        varying vec3 vC; varying vec2 vUv;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vC = aColor * aAlpha * exp(-pow(0.05 * -mv.z, 2.0));   // match the scene fog
          vUv = uv;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vC; varying vec2 vUv;
        void main() { gl_FragColor = vec4(vC * texture2D(uMap, vUv).a, 1.0); }`,
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    levelObjects[level].push(mesh);
    return { list, mesh };
  });
  dyn.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  for (const d of doors) d.update(0);
  for (const l of lights) l.level = levelOfY(l.position.y);

  // ---------- which floors to draw ----------
  // Only the player's floor is drawn, except when the other floor can be seen through the stairwell.
  const stairwell = [
    new THREE.Box3(new THREE.Vector3(5.2, 3.0, 1), new THREE.Vector3(7, 6.5, 7)),  // seen from the hall, looking up
    new THREE.Box3(new THREE.Vector3(5.2, 0, 1), new THREE.Vector3(7, 3.5, 7)),    // seen from upstairs, looking down
  ];
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const shown = [true, true];
  let activeOccluders = [...occluders[0], ...occluders[1]];
  function updateVisibility(camera, pos) {
    const level = pos.y > 1.75 ? 1 : 0;
    const room = roomAt(pos.x, pos.z, pos.y);
    const onStairs = pos.x > STAIR.x0 - 0.3 && pos.x < STAIR.x1 && pos.z > STAIR.zTop - 1 && pos.z < STAIR.zBot + 0.6;
    let both = onStairs;
    if (!both && room && (room.id === 'hall' || room.id === 'h_cm' || room.id === 'h_void')) {
      projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projView);
      both = frustum.intersectsBox(stairwell[level]);
    }
    for (const l of [0, 1]) {
      const v = l === level || both;
      if (v === shown[l]) continue;
      shown[l] = v;
      for (const o of levelObjects[l]) o.visible = v;
    }
    activeOccluders = shown[0] && shown[1] ? [...occluders[0], ...occluders[1]] : occluders[level];
  }

  // ---------- light pool ----------
  // The house has far more lamps than a forward renderer can shade at once, so a fixed set of
  // real lights is handed to the lamps nearest the player (re-chosen a few times per second).
  const POOL_MAX = 14;
  const pool = [];
  let poolSize = 10;
  for (let i = 0; i < POOL_MAX; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.visible = i < poolSize;
    scene.add(l);
    pool.push(l);
  }
  let nearest = [], reassignIn = 0;
  function assignLights(p, dt) {
    if ((reassignIn -= dt) <= 0) {
      reassignIn = 0.2;
      const cands = lights.filter((l) => shown[l.level]);
      for (const l of cands) {
        const dx = l.position.x - p.x, dz = l.position.z - p.z, dy = (l.position.y - p.y - 1.6) * 3;
        l.score = dx * dx + dz * dz + dy * dy;
      }
      cands.sort((a, b) => a.score - b.score);
      const next = cands.slice(0, poolSize);
      for (const l of nearest) if (!next.includes(l)) l.w = 0;
      nearest = next;
    }
    for (let i = 0; i < POOL_MAX; i++) {
      const pl = pool[i], l = nearest[i];
      if (!l || i >= poolSize) { pl.intensity = 0; continue; }
      l.w = Math.min(1, l.w + dt * 2.5);
      pl.position.copy(l.position);
      pl.color.copy(l.color);
      pl.intensity = l.intensity * l.w;
      pl.distance = l.distance;
      pl.decay = l.decay;
    }
  }

  function roomAt(x, z, y = 0) {
    const level = y > 1.75 ? 1 : 0;
    for (const r of ROOMS) if (r.level === level && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
    return null;
  }

  return {
    colliders,
    doors,
    bounds,
    clockPos,
    windowMat: M.glass,
    interactables: doors.map((d) => d.panel),
    get occluders() { return activeOccluders; },
    // glow size is in pixels, so it must follow the render resolution
    setViewHeight(px) { for (const { pts } of haloBatches) pts.material.uniforms.uScale.value = px; },
    setLightCount(n) {
      poolSize = Math.min(POOL_MAX, n);
      pool.forEach((l, i) => { l.visible = i < poolSize; });
      reassignIn = 0;
    },
    // Height of the walkable surface under (x, z) for someone whose feet are at y.
    floorAt(x, z, y) {
      const S = STAIR;
      if (x > S.x0 && x < S.x1 && z > S.zTop - 0.02 && z < S.zBot) {
        return Math.min(Y2, Math.max(0, ((S.zBot - z) / (S.zBot - S.zTop)) * Y2));
      }
      return y > 1.75 ? Y2 : 0;
    },
    roomAt,
    drawers,
    drawerMeshes,
    resetDrawers,
    hidingSpots,
    // the drawer a raycast hit belongs to (drawers are instanced, so the hit carries an instanceId)
    drawerFromHit(hit) { return hit.object.userData.drawers ? hit.object.userData.drawers[hit.instanceId] : null; },
    update(t, dt, playerPos, camera) {
      for (const f of animated) f(t, dt);
      updateDrawers(dt);
      for (const f of flickers) {
        const s = t + f.seed;
        let k;
        if (f.mode === 'fire') k = 0.75 + 0.15 * Math.sin(s * 3.1) + 0.1 * Math.sin(s * 8.7) + 0.08 * (Math.random() - 0.5);
        else if (f.mode === 'failing') {
          if (f.off > 0) { f.off -= dt; k = Math.random() < 0.1 ? 0.5 : 0.0; }
          else {
            k = 0.85 + 0.1 * Math.sin(s * 40) + 0.05 * Math.random();
            if (Math.random() < dt * 0.4) f.off = rand(0.05, 1.2);
          }
        } else if (f.mode === 'lamp') k = 0.96 + 0.03 * Math.sin(s * 2.3) + 0.02 * Math.sin(s * 31);
        else k = 0.85 + 0.08 * Math.sin(s * 7.3) + 0.06 * Math.sin(s * 13.1 + 1) + 0.06 * (Math.random() - 0.5);
        f.l.intensity = f.base * k;
        if (f.mat) f.mat.emissiveIntensity = 1.8 * k;
        if (f.halo) f.halo.alpha = 0.35 * k;
      }
      for (const { list, pts } of haloBatches) {
        const a = pts.geometry.attributes.aAlpha;
        list.forEach((h, i) => { a.array[i] = h.alpha; });
        a.needsUpdate = true;
      }
      if (playerPos && camera) updateVisibility(camera, playerPos);
      if (playerPos) assignLights(playerPos, dt);
      // painted lamplight follows each lamp's flicker and gives way to the real light when it has one
      for (const { list, mesh } of glowBatches) {
        const a = mesh.geometry.attributes.aAlpha.array;
        list.forEach((q, i) => {
          const v = (q.f.l.intensity / q.f.base) * (1 - (q.f.l.w || 0));
          a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = a[i * 4 + 3] = v;
        });
        mesh.geometry.attributes.aAlpha.needsUpdate = true;
      }
    },
  };
}
