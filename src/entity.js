// The Hollow Wraith: a hooded, skull-masked wraith with a serpent's tail, hovering above the floor.
// Prototype: it wanders the building at walking pace, stopping and looking around at random.
// It cannot harm the player yet.
import * as THREE from 'three';
import { STAIR, Y2 } from './house.js';

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const PI = Math.PI;
const WALK_SPEED = 1.9;  // same as the player's walking speed
const TURN_SPEED = 2.4;  // radians per second while travelling
const RUN_SPEED = 3.6;   // default running speed (same as the player); the game sets it per difficulty
const CHASE_TURN_SPEED = 4.5;
const SIGHT_RANGE = 20;
const SIGHT_HALF_ANGLE = PI / 4;   // sees 45 degrees to either side of straight ahead
const LOOK_AROUND_TIME = 5;
const CATCH_DISTANCE = 1.1;
const FAR_DETAIL = 30;   // metres; beyond this the fog hides it, so its body isn't re-shaped
// Jumpscare pose: bent forward so the mask comes down to the player's eye level.
const SCARE_LEAN = 0.55;
const SCARE_REACH = 1.42;   // how far in front of its own position the head ends up at that lean
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Does the segment (ax,az)-(bx,bz) cross the box's footprint? (slab test on x and z)
function segmentHitsBox(ax, az, bx, bz, box) {
  let t0 = 0, t1 = 1;
  for (const [a, d, lo, hi] of [[ax, bx - ax, box.min.x, box.max.x], [az, bz - az, box.min.z, box.max.z]]) {
    if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) return false; continue; }
    let u0 = (lo - a) / d, u1 = (hi - a) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

// ---------- tapered tubes (body, arms, claws, cloth) ----------
// Builds a tube whose radius varies along its length, with frames carried along the curve
// (parallel transport) so nearly vertical sections don't twist.
function makeTube(n, radial) {
  const geo = new THREE.BufferGeometry();
  const count = n * (radial + 1);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < n; i++) for (let j = 0; j <= radial; j++) {
    const k = i * (radial + 1) + j;
    uv[k * 2] = (i / (n - 1)) * 8;
    uv[k * 2 + 1] = j / radial;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  geo.setIndex(idx);
  geo.userData = { n, radial };
  return geo;
}
const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _B = new THREE.Vector3(), _v = new THREE.Vector3();
function shapeTube(geo, pts, radiusAt, lumpy = 0) {
  const { n, radial } = geo.userData;
  const pos = geo.attributes.position.array;
  _T.subVectors(pts[1], pts[0]).normalize();
  _N.set(1, 0, 0);
  if (Math.abs(_T.x) > 0.9) _N.set(0, 1, 0);
  _N.addScaledVector(_T, -_N.dot(_T)).normalize();
  for (let i = 0; i < n; i++) {
    if (i < n - 1) _T.subVectors(pts[i + 1], pts[i]); else _T.subVectors(pts[i], pts[i - 1]);
    _T.normalize();
    _N.addScaledVector(_T, -_N.dot(_T)).normalize();
    _B.crossVectors(_T, _N);
    const t = i / (n - 1), r = radiusAt(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * PI * 2;
      const rr = r * (1 + lumpy * (Math.sin(t * 70 + a * 2) * 0.6 + Math.sin(t * 31 - a * 5) * 0.4));
      _v.copy(pts[i]).addScaledVector(_N, Math.cos(a) * rr).addScaledVector(_B, Math.sin(a) * rr);
      const k = (i * (radial + 1) + j) * 3;
      pos[k] = _v.x; pos[k + 1] = _v.y; pos[k + 2] = _v.z;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}
function staticTube(points, r0, r1, mat, n = 12, radial = 8, lumpy = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = makeTube(n, radial);
  shapeTube(geo, curve.getSpacedPoints(n - 1), (t) => r0 + (r1 - r0) * t, lumpy);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function skinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,40,48' : '0,0,0'},${rand(0.3, 0.8)})`;
    g.lineWidth = rand(1, 3);
    g.beginPath();
    let x = rand(0, 256), y = rand(0, 256);
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rand(-30, 30); y += rand(-12, 12); g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- navigation ----------
// Both floors are rasterised into 25 cm cells from the house's colliders. The staircase is a
// single link between a cell at its foot and a cell at its head.
const CELL = 0.25, GX0 = -24, GZ0 = -20, NX = 192, NZ = 160, PER = NX * NZ;

export class NavGrid {
  constructor(house) {
    this.blocked = new Uint8Array(PER * 2);
    this.sight = new Uint8Array(PER * 2);   // things it cannot see through
    const clear = 0.22;
    for (const b of house.colliders) {
      for (let level = 0; level < 2; level++) {
        const fy = level ? Y2 : 0;
        if (b.max.y < fy + 0.3 || b.min.y > fy + 2.2) continue;
        this.fill(level, b.min.x - clear, b.max.x + clear, b.min.z - clear, b.max.z + clear);
        // grown by half a cell so thin walls can never slip between cell centres
        if (b.max.y > fy + 1.6 && b.min.y < fy + 1.0) this.fill(level, b.min.x - CELL / 2, b.max.x + CELL / 2, b.min.z - CELL / 2, b.max.z + CELL / 2, this.sight);
      }
    }
    for (const d of house.doors) {
      if (!d.locked) continue;
      const { axis, c, at, w, level } = d.o;
      if (axis === 'h') this.fill(level, at - w / 2, at + w / 2, c - 0.3, c + 0.3);
      else this.fill(level, c - 0.3, c + 0.3, at - w / 2, at + w / 2);
    }
    // the stairs themselves and the open shafts upstairs are only crossed via the stair link
    this.fill(0, STAIR.x0 - 0.1, STAIR.x1 + 0.1, STAIR.zTop - 0.1, STAIR.zBot);
    this.fill(1, 5.1, 7.1, 0.95, 7.1);
    this.fill(1, -1.6, 1.6, 12.9, 20);
    const sx = (STAIR.x0 + STAIR.x1) / 2;
    this.stairFoot = this.index(0, sx, STAIR.zBot + 0.45);
    this.stairHead = this.index(1, sx, STAIR.zTop - 0.45);
    this.blocked[this.stairFoot] = 0;
    this.blocked[this.stairHead] = 0;
  }
  fill(level, x0, x1, z0, z1, grid = this.blocked) {
    const ix0 = Math.max(0, Math.ceil((x0 - GX0) / CELL - 0.5)), ix1 = Math.min(NX - 1, Math.floor((x1 - GX0) / CELL - 0.5));
    const iz0 = Math.max(0, Math.ceil((z0 - GZ0) / CELL - 0.5)), iz1 = Math.min(NZ - 1, Math.floor((z1 - GZ0) / CELL - 0.5));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) grid[level * PER + iz * NX + ix] = 1;
  }
  index(level, x, z) {
    const ix = Math.min(NX - 1, Math.max(0, Math.floor((x - GX0) / CELL)));
    const iz = Math.min(NZ - 1, Math.max(0, Math.floor((z - GZ0) / CELL)));
    return level * PER + iz * NX + ix;
  }
  point(i) {
    const level = i >= PER ? 1 : 0, r = i - level * PER;
    return { level, x: GX0 + ((r % NX) + 0.5) * CELL, z: GZ0 + (Math.floor(r / NX) + 0.5) * CELL };
  }
  // Calls fn(neighbour, cost) for every walkable neighbour (8 directions, no corner cutting, plus the stairs).
  neighbours(i, fn) {
    const level = i >= PER ? 1 : 0, r = i - level * PER, ix = r % NX, iz = Math.floor(r / NX), base = level * PER;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = ix + dx, nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
      const j = base + nz * NX + nx;
      if (this.blocked[j]) continue;
      if (dx && dz && (this.blocked[base + iz * NX + nx] || this.blocked[base + nz * NX + ix])) continue;
      fn(j, dx && dz ? 1.414 : 1);
    }
    if (i === this.stairFoot) fn(this.stairHead, 26);
    else if (i === this.stairHead) fn(this.stairFoot, 26);
  }
  reachableFrom(start) {
    const seen = new Uint8Array(PER * 2), out = [start], queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const i = queue.pop();
      this.neighbours(i, (j) => { if (!seen[j]) { seen[j] = 1; out.push(j); queue.push(j); } });
    }
    return out;
  }
  findPath(start, goal) {
    const g = new Float32Array(PER * 2).fill(Infinity), came = new Int32Array(PER * 2).fill(-1), closed = new Uint8Array(PER * 2);
    const gp = this.point(goal);
    const h = (i) => {
      const p = this.point(i);
      if (p.level === gp.level) return Math.hypot(p.x - gp.x, p.z - gp.z) / CELL;
      const a = this.point(p.level ? this.stairHead : this.stairFoot), b = this.point(p.level ? this.stairFoot : this.stairHead);
      return (Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(b.x - gp.x, b.z - gp.z)) / CELL + 26;
    };
    // binary min-heap of [f, index]
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    g[start] = 0;
    push(h(start), start);
    while (heap.length) {
      const [, i] = pop();
      if (i === goal) break;
      if (closed[i]) continue;
      closed[i] = 1;
      this.neighbours(i, (j, cost) => {
        const ng = g[i] + cost;
        if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + h(j), j); }
      });
    }
    if (came[goal] < 0 && goal !== start) return null;
    const cells = [goal];
    while (cells[cells.length - 1] !== start) cells.push(came[cells[cells.length - 1]]);
    return cells.reverse();
  }
  // straight line between two points on one floor stays clear of obstacles?
  clear(level, ax, az, bx, bz, grid = this.blocked) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (grid[this.index(level, ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }
  // nearest walkable cell to a point (the player may stand closer to furniture than the creature fits)
  nearestFree(level, x, z) {
    const c = this.index(level, x, z);
    if (!this.blocked[c]) return c;
    const r0 = c - level * PER, cx = r0 % NX, cz = Math.floor(r0 / NX);
    for (let r = 1; r <= 8; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
        const j = level * PER + nz * NX + nx;
        if (!this.blocked[j]) return j;
      }
    }
    return -1;
  }
  // Turns a cell path into a few waypoints, cutting corners wherever the straight line is clear.
  waypoints(cells) {
    const pts = cells.map((i) => this.point(i));
    const out = [];
    let a = 0;
    while (a < pts.length - 1) {
      if (pts[a + 1].level !== pts[a].level) {
        out.push({ ...pts[a + 1], stairs: true });
        a++;
        continue;
      }
      let b = a + 1;
      while (b + 1 < pts.length && pts[b + 1].level === pts[a].level && this.clear(pts[a].level, pts[a].x, pts[a].z, pts[b + 1].x, pts[b + 1].z)) b++;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }
}

// ---------- the creature ----------
export class HollowWraith {
  // `nav` and `reachable` can be shared between several Wraiths so the house is only mapped once.
  constructor(scene, house, {
    x = 0, z = 15.5, heading = 0, floorY = 0, runSpeed = RUN_SPEED, nav = null, reachable = null,
    onDoor = () => {}, onSpotted = () => {}, onGaveUp = () => {},
  } = {}) {
    this.house = house;
    this.onDoor = onDoor;
    this.onSpotted = onSpotted;
    this.onGaveUp = onGaveUp;
    this.runSpeed = runSpeed;
    this.nav = nav || new NavGrid(house);
    this.pos = new THREE.Vector3(x, floorY, z);
    this.heading = heading;
    this.floorY = floorY;
    this.time = 0;

    const skin = new THREE.MeshStandardMaterial({ map: skinTexture(), color: 0x3a3a3a, roughness: 0.55 });
    skin.map.repeat.set(1, 2);
    const cloth = new THREE.MeshStandardMaterial({ map: skin.map, color: 0x333333, roughness: 0.9, side: THREE.DoubleSide });
    const bone = new THREE.MeshStandardMaterial({ color: 0xb9b8ae, roughness: 0.38, metalness: 0.15, emissive: 0x141412 });
    const mask = new THREE.MeshStandardMaterial({ color: 0xd9d5c8, roughness: 0.5, emissive: 0x1c1b18 });
    const hollow = new THREE.MeshBasicMaterial({ color: 0x000000 });

    // the body: one long tube from the neck down through the torso to the tip of the tail,
    // rebuilt every frame from the path the creature has travelled
    this.bodyGeo = makeTube(72, 12);
    this.body = new THREE.Mesh(this.bodyGeo, skin);
    this.body.castShadow = this.body.receiveShadow = true;
    this.body.frustumCulled = false;
    scene.add(this.body);

    // everything above the waist turns with the heading
    this.root = new THREE.Group();
    scene.add(this.root);

    // head: hood, skull mask, and the cloth point hanging under the chin
    const head = this.head = new THREE.Group();
    head.position.set(0, 2.12, 0.36);
    this.root.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), skin);
    hood.scale.set(0.82, 1.45, 1.1);
    hood.position.set(0, 0.06, -0.04);
    head.add(hood);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), skin);
    rim.scale.set(0.95, 1.6, 1);
    rim.position.set(0, 0.01, 0.2);
    head.add(rim);
    head.add(staticTube([V(0, 0.24, -0.06), V(0, 0.38, -0.12), V(0, 0.5, -0.24)], 0.1, 0.006, skin, 8, 8));
    head.add(staticTube([V(0, -0.08, 0.1), V(0, -0.26, 0.2), V(0, -0.46, 0.22), V(0, -0.66, 0.14)], 0.085, 0.006, cloth, 10, 8));
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mask);
    skull.scale.set(0.085, 0.15, 0.07);
    skull.position.set(0, 0.02, 0.17);
    head.add(skull);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 6), mask);
    jaw.rotation.x = PI;
    jaw.position.set(0, -0.15, 0.185);
    jaw.scale.set(1, 1, 0.75);
    head.add(jaw);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), hollow);
      eye.scale.set(0.02, 0.048, 0.02);
      eye.position.set(s * 0.033, 0.045, 0.226);
      eye.rotation.z = s * 0.55;
      head.add(eye);
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.07, 0.01), hollow);
      cheek.position.set(s * 0.045, -0.04, 0.218);
      cheek.rotation.z = -s * 0.3;
      head.add(cheek);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.11, 0.02), mask);
    ridge.position.set(0, 0.08, 0.232);
    head.add(ridge);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 3), hollow);
    nose.position.set(0, -0.035, 0.238);
    nose.rotation.z = PI;
    head.add(nose);
    for (let k = -2; k <= 2; k++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.045, 0.01), hollow);
      tooth.position.set(k * 0.012, -0.11, 0.21);
      head.add(tooth);
    }

    // arms: thin and black, bone blades at the elbows, long hooked claws
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      const S = V(s * 0.22, 1.86, 0.16);
      arm.position.copy(S);
      const E = V(s * 0.46, 1.42, 0.38).sub(S), W = V(s * 0.36, 1.22, 0.92).sub(S);
      arm.add(staticTube([V(0, 0, 0), E.clone().multiplyScalar(0.5).add(V(s * 0.04, 0.02, -0.03)), E], 0.045, 0.032, skin, 10, 8, 0.05));
      arm.add(staticTube([E, E.clone().lerp(W, 0.5).add(V(0, -0.03, 0)), W], 0.032, 0.022, skin, 10, 8, 0.05));
      arm.add(staticTube([E, E.clone().add(V(s * 0.12, 0.12, -0.18)), E.clone().add(V(s * 0.2, 0.3, -0.36))], 0.035, 0.002, bone, 8, 6));
      arm.add(staticTube([E.clone().lerp(W, 0.3), E.clone().lerp(W, 0.3).add(V(s * 0.1, 0.05, -0.12)), E.clone().lerp(W, 0.3).add(V(s * 0.17, 0.14, -0.25))], 0.022, 0.002, bone, 8, 6));
      const knuckles = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), skin);
      knuckles.position.copy(W);
      arm.add(knuckles);
      const fwd = W.clone().sub(E).normalize(), up = V(0, 1, 0), right = new THREE.Vector3().crossVectors(fwd, up).normalize();
      for (let k = 0; k < 5; k++) {
        const thumb = k === 4;
        const spread = right.clone().multiplyScalar(thumb ? -s * 0.07 : (k - 1.5) * 0.06);
        const f = thumb ? fwd.clone().add(V(-s * 0.5, 0.15, 0)).normalize() : fwd;
        const L = thumb ? 0.65 : 1;
        arm.add(staticTube([
          W.clone(),
          W.clone().addScaledVector(f, 0.1 * L).add(spread).add(V(0, 0.03, 0)),
          W.clone().addScaledVector(f, 0.22 * L).addScaledVector(spread, 1.6),
          W.clone().addScaledVector(f, 0.28 * L).addScaledVector(spread, 1.9).add(V(0, -0.1, 0)),
          W.clone().addScaledVector(f, 0.22 * L).addScaledVector(spread, 2.0).add(V(0, -0.2, 0)),
        ], 0.024, 0.002, bone, 14, 6));
      }
      this.root.add(arm);
      this.arms.push({ arm, s });
    }

    // torn strips of shroud hanging from the shoulders
    this.strips = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const sx = (i % 2 ? 1 : -1) * rand(0.08, 0.22);
      g.position.set(sx, rand(1.6, 1.8), rand(-0.05, 0.15));
      const len = rand(0.5, 0.9);
      g.add(staticTube([V(0, 0, 0), V(sx * 0.3, -len * 0.4, -0.05), V(sx * 0.5, -len, -0.12)], 0.035, 0.004, cloth, 8, 6));
      this.root.add(g);
      this.strips.push({ g, ph: rand(0, 6) });
    }

    // the end of the tail: a curved bone blade and a few trailing tendrils
    this.tailEnd = new THREE.Group();
    const blade = new THREE.Shape();
    blade.moveTo(0, 0);
    blade.quadraticCurveTo(0.28, 0.02, 0.62, 0.34);
    blade.quadraticCurveTo(0.26, 0.13, 0, 0.07);
    const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.014, bevelEnabled: false });
    bladeGeo.rotateY(-PI / 2);
    const b1 = new THREE.Mesh(bladeGeo, bone);
    b1.castShadow = true;
    this.tailEnd.add(b1);
    const b2 = b1.clone();
    b2.scale.setScalar(0.55);
    b2.rotation.z = 0.6;
    this.tailEnd.add(b2);
    for (let k = 0; k < 4; k++) {
      this.tailEnd.add(staticTube([V(0, 0, 0), V(rand(-0.12, 0.12), rand(-0.1, 0.05), 0.2), V(rand(-0.25, 0.25), rand(-0.2, 0), rand(0.35, 0.5))], 0.014, 0.002, skin, 6, 5));
    }
    scene.add(this.tailEnd);
    this.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });

    this.spawn = { x, z, heading, floorY };
    this.reachable = reachable || this.nav.reachableFrom(this.nav.index(floorY > 1.75 ? 1 : 0, x, z));
    this.pointsCache = Array.from({ length: 72 }, () => new THREE.Vector3());
    this.reset();
  }

  // Back to its starting point, calm and unaware of the player.
  reset() {
    const { x, z, heading, floorY } = this.spawn;
    this.pos.set(x, floorY, z);
    this.floorY = floorY;
    this.heading = heading;
    this.resetTrail();
    this.path = [];
    this.wp = 0;
    this.state = 'idle';
    this.timer = rand(4, 6);
    this.lookTarget = heading;
    this.doorWait = 0;
    this.seeTimer = 0;
    this.seesPlayer = false;
    this.lastSeen = null;
    this.repath = rand(0, 0.4);   // staggered so several Wraiths don't all re-plan on the same frame
    this.moving = false;
    this.run = 0;          // 0..1, eases into the running pose
    this.swayPhase = 0;
    this.scaring = false;
  }

  // Takes it out of the scene for good.
  dispose() {
    for (const o of [this.body, this.root, this.tailEnd]) o.removeFromParent();
    this.bodyGeo.dispose();
  }

  // the path behind it, which the tail follows: a straight line back from where it is now
  resetTrail() {
    this.trail = [];
    const bx = -Math.sin(this.heading), bz = -Math.cos(this.heading);
    for (let d = 4.5; d > 0; d -= 0.1) this.trail.push(V(this.pos.x + bx * d, this.floorY, this.pos.z + bz * d));
  }

  // Jumpscare: puts its mask `dist` metres in front of the camera, staring straight into it.
  scare(camPos, yaw, dist, floorY) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // the camera's forward direction
    this.heading = yaw;                               // facing back at the camera
    this.floorY = floorY;
    this.pos.set(camPos.x + fx * (dist + SCARE_REACH), floorY, camPos.z + fz * (dist + SCARE_REACH));
    if (!this.scaring) { this.scaring = true; this.resetTrail(); }
  }

  get level() { return this.floorY > 1.75 ? 1 : 0; }

  pickDestination() {
    for (let tries = 0; tries < 8; tries++) {
      const goal = this.reachable[Math.floor(Math.random() * this.reachable.length)];
      const start = this.nav.nearestFree(this.level, this.pos.x, this.pos.z);
      const cells = start >= 0 ? this.nav.findPath(start, goal) : null;
      if (cells && cells.length > 8) {
        this.path = this.nav.waypoints(cells);
        this.wp = 0;
        this.state = 'move';
        return;
      }
    }
    this.timer = 1;
  }

  turnToward(target, dt, rate) {
    const d = angleDiff(target, this.heading);
    this.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    return d;
  }

  // Opens a closed door its route passes through, then waits a moment for it to swing.
  handleDoors(wp) {
    const sx = wp.x - this.pos.x, sz = wp.z - this.pos.z, len2 = sx * sx + sz * sz || 1;
    for (const d of this.house.doors) {
      if (d.o.level !== this.level || d.locked || d.isOpen()) continue;
      const dx = d.pos.x - this.pos.x, dz = d.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 1.3) continue;
      const t = Math.max(0, Math.min(1, (dx * sx + dz * sz) / len2));
      if (Math.hypot(dx - sx * t, dz - sz * t) < 0.5) {
        d.toggle(this.pos.x, this.pos.z);
        this.onDoor(d);
        this.doorWait = 0.7;
        return true;
      }
    }
    return false;
  }

  // ---------- senses ----------
  // Sees the player only on the same floor, within range, inside a 90 degree cone in front of it
  // (45 degrees either side), and with no wall, tall furniture or closed door in between.
  canSee(p) {
    const level = p.y > 1.75 ? 1 : 0;
    if (level !== this.level) return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist > SIGHT_RANGE) return false;
    if (dist > 0.5 && Math.abs(angleDiff(Math.atan2(dx, dz), this.heading)) > SIGHT_HALF_ANGLE) return false;
    if (!this.nav.clear(level, this.pos.x, this.pos.z, p.x, p.z, this.nav.sight)) return false;
    for (const d of this.house.doors) {
      if (d.o.level === level && !d.isOpen() && segmentHitsBox(this.pos.x, this.pos.z, p.x, p.z, d.box)) return false;
    }
    return true;
  }

  // ---------- movement helpers ----------
  // Plans a route to the walkable cell nearest (x, z) on the given floor.
  goTo(level, x, z) {
    const goal = this.nav.nearestFree(level, x, z);
    const start = this.nav.nearestFree(this.level, this.pos.x, this.pos.z);
    const cells = goal >= 0 && start >= 0 ? this.nav.findPath(start, goal) : null;
    this.path = cells ? this.nav.waypoints(cells) : [];
    this.wp = 0;
    return this.path.length > 0;
  }

  // Moves along the planned route; returns true once the end is reached.
  followPath(dt, speed, turnRate) {
    if (this.wp >= this.path.length) return true;
    const wp = this.path[this.wp];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      this.wp++;
      return this.wp >= this.path.length;
    }
    const diff = this.turnToward(Math.atan2(dx, dz), dt, turnRate);
    if (this.handleDoors(wp)) return false;
    // slow down for sharp turns, turning almost on the spot when facing away
    this.step(dx / dist, dz / dist, Math.min(dist, speed * Math.max(0, Math.cos(diff)) ** 2 * dt));
    return false;
  }

  step(ux, uz, len) {
    this.pos.x += ux * len;
    this.pos.z += uz * len;
    this.floorY = this.house.floorAt(this.pos.x, this.pos.z, this.floorY);
    this.moving = len > 0;
  }

  // ---------- behaviour ----------
  // wander: idle <-> move.  Seeing the player -> chase.  Losing sight -> search (run to where it
  // was last seen) -> look (glance left and right for 5 s) -> back to wandering.
  think(dt, player) {
    this.moving = false;
    if (!player) this.seesPlayer = false;   // e.g. hidden in a cupboard: lost from view at once
    if ((this.seeTimer -= dt) <= 0) {
      this.seeTimer = 0.1;
      this.seesPlayer = player ? this.canSee(player) : false;
      // remember exactly where the player was at the moment it last saw them
      if (this.seesPlayer) this.lastSeen = { level: player.y > 1.75 ? 1 : 0, x: player.x, z: player.z };
    }
    if (this.seesPlayer) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.repath = 0;
        this.doorWait = 0;
        this.onSpotted();
      }
    }
    if (this.doorWait > 0) { this.doorWait -= dt; return; }

    switch (this.state) {
      case 'chase': {
        if (!this.seesPlayer) {
          // it lost sight: run to the exact spot it last saw the player
          this.state = 'search';
          if (!this.goTo(this.lastSeen.level, this.lastSeen.x, this.lastSeen.z)) this.startLooking();
          return;
        }
        const dx = player.x - this.pos.x, dz = player.z - this.pos.z, dist = Math.hypot(dx, dz);
        const direct = dist < CATCH_DISTANCE || this.nav.clear(this.level, this.pos.x, this.pos.z, player.x, player.z);
        // face the player only when heading straight for them; around obstacles the route decides the facing
        const diff = direct ? this.turnToward(Math.atan2(dx, dz), dt, CHASE_TURN_SPEED) : 0;
        if (dist < CATCH_DISTANCE) return;   // right in front of the player
        if (direct) {
          // open ground between them: straight at the player
          this.path = [];
          this.step(dx / dist, dz / dist, Math.min(dist - CATCH_DISTANCE, this.runSpeed * Math.max(0, Math.cos(diff)) ** 2 * dt));
        } else {
          if ((this.repath -= dt) <= 0 || this.wp >= this.path.length) {
            this.repath = 0.4;
            this.goTo(this.lastSeen.level, player.x, player.z);
          }
          this.followPath(dt, this.runSpeed, CHASE_TURN_SPEED);
        }
        return;
      }
      case 'search':
        if (this.followPath(dt, this.runSpeed, CHASE_TURN_SPEED)) this.startLooking();
        return;
      case 'look':
        // glance left and right for a few seconds, then give up
        if (Math.abs(this.turnToward(this.lookTarget, dt, 2.2)) < 0.05) {
          this.lookSide = -this.lookSide;
          this.lookTarget = this.lookBase + this.lookSide * 1.1;
        }
        if ((this.timer -= dt) <= 0) {
          this.state = 'idle';
          this.timer = rand(1, 2.5);
          this.path = [];
          this.lookTarget = this.heading;
          this.onGaveUp();
        }
        return;
      case 'idle':
        // stopped: hover in place, now and then turning to look around
        if (Math.random() < dt * 0.5) this.lookTarget = this.heading + rand(-1.8, 1.8);
        this.turnToward(this.lookTarget, dt, 1.1);
        if ((this.timer -= dt) <= 0) {
          if (this.wp < this.path.length) this.state = 'move';
          else this.pickDestination();
        }
        return;
      case 'move': {
        if (this.followPath(dt, WALK_SPEED, TURN_SPEED)) {
          this.path = [];
          this.state = 'idle';
          this.timer = rand(2, 6);
          this.lookTarget = this.heading;
          return;
        }
        // every so often it simply stops mid-journey
        const wp = this.path[this.wp];
        if (wp && !wp.stairs && Math.random() < dt * 0.05) {
          this.state = 'idle';
          this.timer = rand(1.5, 4);
          this.lookTarget = this.heading + rand(-1.2, 1.2);
        }
      }
    }
  }

  startLooking() {
    this.state = 'look';
    this.timer = LOOK_AROUND_TIME;
    this.lookBase = this.heading;
    this.lookSide = 1;
    this.lookTarget = this.heading + 1.1;
    this.path = [];
  }

  // point on the travelled path `d` metres behind the creature
  trailPoint(d, out) {
    let prev = _v.set(this.pos.x, this.floorY, this.pos.z), acc = 0;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i], seg = prev.distanceTo(p);
      if (seg < 1e-6) continue;
      if (acc + seg >= d) return out.copy(prev).lerp(p, (d - acc) / seg);
      acc += seg;
      prev = p;
    }
    return out.copy(this.trail[0]);
  }

  // `viewer` (the camera position) is optional; when given, the body isn't re-shaped while the
  // creature is lost in the fog far away, which matters when there are many of them.
  update(dt, time, active, player, viewer = null) {
    this.time = time;
    if (active && !this.scaring) this.think(dt, player);
    const running = this.state === 'chase' || this.state === 'search';
    this.run += ((running ? 1 : 0) - this.run) * Math.min(1, dt * 4);
    this.swayPhase += dt * (1.6 + this.run * 2.6);

    // record the path for the tail
    const last = this.trail[this.trail.length - 1];
    const here = V(this.pos.x, this.floorY, this.pos.z);
    if (here.distanceTo(last) > 0.08) {
      this.trail.push(here);
      if (this.trail.length > 90) this.trail.shift();
    }

    // upper body: hovering, gently bobbing
    const bob = this.scaring ? 0 : Math.sin(time * 1.4) * 0.06;
    this.root.position.set(this.pos.x, this.floorY + bob, this.pos.z);
    this.root.rotation.order = 'YXZ';
    if (this.scaring) {
      // bent down to eye level, head twitching, claws thrown up at the camera
      this.root.rotation.set(SCARE_LEAN, this.heading, 0);
      this.head.rotation.set(-SCARE_LEAN + 0.12 + rand(-0.04, 0.04), rand(-0.05, 0.05), Math.sin(time * 9) * 0.12);
      for (const { arm, s } of this.arms) {
        arm.rotation.x = -1.15 + rand(-0.05, 0.05);
        arm.rotation.z = -s * 0.35;
      }
    } else {
      this.root.rotation.set(this.run * 0.28, this.heading, 0);   // leans forward when running
      this.head.rotation.set(0.32 + Math.sin(time * 0.7) * 0.05, Math.sin(time * 0.3) * 0.25, Math.sin(time * 0.45) * 0.18);
      for (const { arm, s } of this.arms) {
        arm.rotation.x = Math.sin(time * (0.9 + this.run * 3) + s) * (0.12 + this.run * 0.1) - this.run * 0.35;
        arm.rotation.z = s * Math.sin(time * 0.6 + s * 2) * 0.06;
      }
    }
    for (const { g, ph } of this.strips) g.rotation.x = Math.sin(time * 1.7 + ph) * 0.15;

    // body curve: neck and chest follow the heading, the tail lies along the travelled path
    if (viewer && Math.hypot(viewer.x - this.pos.x, viewer.z - this.pos.z) > FAR_DETAIL && !this.scaring) return;
    this.root.updateMatrixWorld(true);
    const ctrl = [V(0, 2.05, 0.3), V(0, 1.75, 0.12), V(0, 1.25, -0.12)].map((p) => p.applyMatrix4(this.root.matrixWorld));
    const tail = [[0.6, 0.78], [1.25, 0.62], [1.9, 0.58], [2.55, 0.62], [3.15, 0.56], [3.7, 0.52]];
    const sway = (d) => Math.sin(this.swayPhase - d * 1.9) * Math.min(0.32, d * 0.09);
    tail.forEach(([d, lift], k) => {
      const p = this.trailPoint(d, new THREE.Vector3());
      const q = this.trailPoint(d + 0.1, new THREE.Vector3());
      const dir = q.sub(p);
      const len = Math.hypot(dir.x, dir.z) || 1;
      p.x += (-dir.z / len) * sway(d);
      p.z += (dir.x / len) * sway(d);
      p.y += lift + bob * (1 - k / 6) + Math.sin(time * 1.2 - d * 2.2) * 0.04;
      ctrl.push(p);
    });
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const pts = this.pointsCache;
    for (let i = 0; i < pts.length; i++) curve.getPoint(i / (pts.length - 1), pts[i]);
    shapeTube(this.bodyGeo, pts, (t) => {
      if (t < 0.04) return 0.11 + (t / 0.04) * 0.1;
      if (t < 0.16) return 0.21 - ((t - 0.04) / 0.12) * 0.04;
      return 0.17 * Math.pow(1 - (t - 0.16) / 0.84, 0.85) + 0.012;
    }, 0.07);

    // blade at the tip, pointing along the tail
    const tip = pts[pts.length - 1], before = pts[pts.length - 4];
    this.tailEnd.position.copy(tip);
    this.tailEnd.lookAt(tip.clone().multiplyScalar(2).sub(before));
  }
}
