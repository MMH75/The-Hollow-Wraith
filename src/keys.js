// The keys to the front door: a number set by the difficulty is hidden at random each game, half in the
// manor's rooms and half in the hotel's guest rooms, and any four of them open the door. Half of them lie inside drawers (only
// visible once the drawer is pulled open); the rest lie on the floor. Each one glints faintly.
import * as THREE from 'three';
import * as TX from './textures.js';

export const KEY_COUNT = 4;     // keys needed to unlock the front door
const PICK_RANGE = 2.2;   // metres
const AIM_SLACK = 0.28;   // how far (m) the line of sight may pass from a key and still pick it up

// Ground-floor rooms worth searching (not the hall, corridors or the Foyer you start in).
const MANOR_ROOMS = new Set(['master', 'mbath', 'library', 'nursery', 'nebed', 'kitchen', 'dining', 'parlor',
  'guest', 'child', 'storage', 'wash', 'linen', 'laundry', 'servant', 'ebed']);

export function keyModel(brass) {
  const g = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 16), brass);
  bow.rotation.x = Math.PI / 2;
  g.add(bow);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6), brass);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.096;
  g.add(shaft);
  for (const [x, h] of [[0.142, 0.03], [0.124, 0.022]]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, h), brass);
    tooth.position.set(x, 0, h / 2);
    g.add(tooth);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

export class DoorKeys {
  // `cells` are walkable floor cells (from the Wraiths' navigation map) the player can reach.
  constructor(scene, house, nav, cells, upperY, drawers = []) {
    this.scene = scene;
    this.nav = nav;
    this.brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.85, roughness: 0.3, emissive: 0x2a1c06 });
    this.glintMat = new THREE.SpriteMaterial({ map: TX.halo(), color: 0xffd890, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    // floor spots grouped by room, so each key can go in a different room
    this.byRoom = new Map();
    for (const i of cells) {
      const p = nav.point(i);
      const room = house.roomAt(p.x, p.z, p.level ? upperY : 0);
      if (!room || !(p.level ? room.id.startsWith('r') : MANOR_ROOMS.has(room.id))) continue;
      if (!this.byRoom.has(room)) this.byRoom.set(room, []);
      this.byRoom.get(room).push({ ...p, y: p.level ? upperY : 0 });
    }
    // drawers grouped by room, for keys tucked away inside them
    this.drawersByRoom = new Map();
    for (const dr of drawers) {
      const room = dr.room;
      if (!room || !(room.level ? room.id.startsWith('r') : MANOR_ROOMS.has(room.id))) continue;
      if (!this.drawersByRoom.has(room)) this.drawersByRoom.set(room, []);
      this.drawersByRoom.get(room).push(dr);
    }
    this.items = [];
    this.found = 0;
  }

  // Hides a fresh set of `total` keys: half on each floor, and on each floor half inside drawers and
  // half on the floor. Keys are spread over as many different rooms as possible; a room only gets a
  // second key once every room on that floor already has one.
  scatter(total = 10) {
    for (const it of this.items) { it.group.removeFromParent(); it.glint.removeFromParent(); }
    this.items = [];
    this.found = 0;
    const shuffle = (a) => a.sort(() => Math.random() - 0.5);
    const rooms = shuffle([...new Set([...this.byRoom.keys(), ...this.drawersByRoom.keys()])]);
    const perFloor = [Math.ceil(total / 2), Math.floor(total / 2)];
    // exactly half of all keys (rounded down) go in drawers, split as evenly as possible between floors
    const drawerTotal = Math.floor(total / 2);
    const drawerSplit = shuffle([Math.ceil(drawerTotal / 2), Math.floor(drawerTotal / 2)]);
    const usedDrawers = new Set(), floorSpots = [];
    const roomUse = new Map();
    // the least-used room in a list (ties broken by the shuffled order)
    const leastUsed = (list) => list.reduce((best, r) => ((roomUse.get(r) || 0) < (roomUse.get(best) || 0) ? r : best), list[0]);
    perFloor.forEach((count, level) => {
      const here = rooms.filter((r) => r.level === level);
      const withDrawers = here.filter((r) => this.drawersByRoom.has(r));
      const withFloor = here.filter((r) => this.byRoom.has(r));
      const inDrawers = Math.min(drawerSplit[level], count);
      for (let k = 0; k < count; k++) {
        const wantDrawer = k < inDrawers;
        const free = withDrawers.filter((r) => this.drawersByRoom.get(r).some((d) => !usedDrawers.has(d)));
        if (wantDrawer && free.length) {
          const room = leastUsed(free);
          const options = this.drawersByRoom.get(room).filter((d) => !usedDrawers.has(d));
          const drawer = options[Math.floor(Math.random() * options.length)];
          usedDrawers.add(drawer);
          this.hideInDrawer(drawer, room);
          roomUse.set(room, (roomUse.get(room) || 0) + 1);
        } else if (withFloor.length) {
          const room = leastUsed(withFloor);
          floorSpots.push(room);
          roomUse.set(room, (roomUse.get(room) || 0) + 1);
        }
      }
    });
    const placed = [];
    for (const room of floorSpots) {
      const spots = this.byRoom.get(room);
      // keep two keys in the same room at least a metre apart
      let s = spots[Math.floor(Math.random() * spots.length)];
      for (let tries = 0; tries < 20 && placed.some((p) => p.room === room && Math.hypot(p.x - s.x, p.z - s.z) < 1); tries++) {
        s = spots[Math.floor(Math.random() * spots.length)];
      }
      placed.push({ room, x: s.x, z: s.z });
      const group = keyModel(this.brass);
      group.position.set(s.x, s.y + 0.012, s.z);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(group);
      const glint = new THREE.Sprite(this.glintMat.clone());
      glint.position.set(s.x, s.y + 0.06, s.z);
      glint.scale.setScalar(0.4);
      this.scene.add(glint);
      this.items.push({ group, glint, room, pos: new THREE.Vector3(s.x, s.y + 0.03, s.z), taken: false, phase: Math.random() * 6 });
    }
  }

  // A key lying in the bottom of a drawer; it rides along when the drawer slides open.
  hideInDrawer(drawer, room) {
    const group = keyModel(this.brass);
    const local = new THREE.Vector3(
      (Math.random() - 0.5) * Math.max(0, drawer.w - 0.28),
      -drawer.h / 2 + 0.03,
      (Math.random() - 0.5) * Math.max(0, drawer.d - 0.2));
    group.position.copy(local);
    group.rotation.y = Math.random() * Math.PI * 2;
    drawer.anchor.add(group);
    const glint = new THREE.Sprite(this.glintMat.clone());
    glint.position.copy(local).add(new THREE.Vector3(0, 0.04, 0));
    glint.scale.setScalar(0.3);
    drawer.anchor.add(glint);
    const item = { group, glint, room, drawer, local, taken: false, phase: Math.random() * 6 };
    Object.defineProperty(item, 'pos', { get: () => drawer.anchor.localToWorld(local.clone()) });
    this.items.push(item);
  }

  // The key the camera is aimed at, if it is within reach and not hidden behind a wall.
  aimedAt(camera, occluders, raycaster) {
    const origin = camera.position, dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let best = null, bestDist = Infinity;
    for (const it of this.items) {
      if (it.taken || (it.drawer && it.drawer.open < 0.7)) continue;   // a key in a shut drawer can't be seen
      const to = it.pos.clone().sub(origin);
      const dist = to.length();
      if (dist > PICK_RANGE) continue;
      const along = to.dot(dir);
      if (along <= 0) continue;
      const off = Math.sqrt(Math.max(0, dist * dist - along * along));
      if (off > AIM_SLACK || dist >= bestDist) continue;
      raycaster.set(origin, to.clone().normalize());
      raycaster.far = dist;
      if (raycaster.intersectObjects(occluders, false).some((h) => h.distance < dist - 0.05)) continue;
      best = it;
      bestDist = dist;
    }
    return best;
  }

  take(it) {
    it.taken = true;
    it.group.removeFromParent();
    it.glint.removeFromParent();
    this.found++;
    // once enough are found the rest are no longer needed, so they vanish
    if (this.all) for (const other of this.items) if (!other.taken) { other.taken = true; other.group.removeFromParent(); other.glint.removeFromParent(); }
  }

  get all() { return this.found >= KEY_COUNT; }

  update(time) {
    // a slow, uneven glimmer
    for (const it of this.items) {
      if (it.taken) continue;
      it.glint.visible = !it.drawer || it.drawer.open > 0.5;
      it.glint.material.opacity = 0.18 + 0.22 * Math.max(0, Math.sin(time * 1.7 + it.phase)) ** 3 + 0.05 * Math.sin(time * 5 + it.phase);
    }
  }
}
