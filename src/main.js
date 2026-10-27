import * as THREE from 'three';
import { buildHouse, Y2 } from './house.js';
import { AudioSys } from './audio.js';
import { HollowWraith, NavGrid } from './entity.js';
import { DoorKeys, KEY_COUNT, keyModel } from './keys.js';

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- quality presets ----------
// lights: how many lamps are lit at once; reach: flashlight beam (and shadow) range; res: dynamic resolution range; aa: edge smoothing (needs a restart).
const QUALITY = {
  low: { lights: 6, shadowSize: 512, shadowType: THREE.PCFShadowMap, reach: 14, resMin: 0.55, resMax: 0.85, maxDpr: 1, aa: false },
  medium: { lights: 10, shadowSize: 1024, shadowType: THREE.PCFShadowMap, reach: 18, resMin: 0.7, resMax: 1, maxDpr: 1, aa: false },
  high: { lights: 14, shadowSize: 1024, shadowType: THREE.PCFSoftShadowMap, reach: 22, resMin: 0.85, resMax: 1, maxDpr: 1.5, aa: true },
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
};
let qualityName = QUALITY[store.get('hotel36.quality')] ? store.get('hotel36.quality') : 'medium';
const startedWithAA = QUALITY[qualityName].aa;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: startedWithAA, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x090503, 0.05);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

const house = buildHouse(scene);
const audio = new AudioSys();

// ---------- the Hollow Wraiths ----------
// Walking speed is the same on every difficulty; only how fast they run changes (the player runs at 3.6).
const DIFFICULTY = {
  // keys: how many are hidden in the house (any four unlock the front door)
  easy: { run: 3.0, keys: 30, note: 'The Wraiths run slower than you. 30 keys are hidden.' },
  medium: { run: 3.6, keys: 20, note: 'The Wraiths run exactly as fast as you. 20 keys are hidden.' },
  hard: { run: 4.3, keys: 10, note: 'The Wraiths run faster than you. Only 10 keys are hidden.' },
};
let difficulty = DIFFICULTY[store.get('hotel36.difficulty')] ? store.get('hotel36.difficulty') : 'medium';
let wraithCount = clamp(parseInt(store.get('hotel36.wraiths'), 10) || 1, 1, 10);

// The house is mapped once and shared by every Wraith.
const nav = new NavGrid(house);
const reachable = nav.reachableFrom(nav.index(0, -2.6, -14.5));
// They can start anywhere in the ground-floor rooms behind the Great Hall (rooms 1-5 on the map)
// or anywhere on the second floor, as long as the spot is reachable.
const SPAWN_ROOMS = new Set(['master', 'mbath', 'library', 'nursery', 'nebed']);
const spawnCells = reachable.filter((i) => {
  const p = nav.point(i);
  const room = house.roomAt(p.x, p.z, p.level ? Y2 : 0);
  return room && (p.level === 1 ? room.floor !== 'void' : SPAWN_ROOMS.has(room.id));
});
function pickSpawns(n) {
  const spots = [];
  for (let tries = 0; spots.length < n && tries < 2000; tries++) {
    const p = nav.point(spawnCells[Math.floor(Math.random() * spawnCells.length)]);
    // keep them a few metres apart so they don't start on top of each other
    if (spots.some((s) => s.level === p.level && Math.hypot(s.x - p.x, s.z - p.z) < 4)) continue;
    spots.push({ ...p, floorY: p.level ? Y2 : 0, heading: rand(-Math.PI, Math.PI) });
  }
  return spots;
}

let lastSpottedSound = -99;
let wraiths = [];
let catcher = null;   // the Wraith that caught the player, for the jumpscare
function spawnWraiths() {
  for (const w of wraiths) { w.dispose(); audio.removePresence(w.voice); }
  wraiths = pickSpawns(wraithCount).map((s) => {
    const w = new HollowWraith(scene, house, {
      x: s.x, z: s.z, heading: s.heading, floorY: s.floorY, nav, reachable, runSpeed: DIFFICULTY[difficulty].run,
      onDoor: (d) => audio.door(d.pos),
      // the "seen" sting, but not again if a Wraith spots the player within a few seconds of the last one
      onSpotted: () => { if (time - lastSpottedSound > 3) { audio.seenByWraith(); lastSpottedSound = time; } },
    });
    w.voice = audio.addPresence();
    return w;
  });
}
spawnWraiths();

// ---------- the mission: find the keys, unlock the front door ----------
const doorKeys = new DoorKeys(scene, house, nav, reachable, Y2, house.drawers);
// hiding in a cupboard: where the player is hidden (null when not), and the torch state to restore
let hiding = null, flashBeforeHiding = true;
doorKeys.scatter(DIFFICULTY[difficulty].keys);
const frontDoor = house.doors.find((d) => d.o.type === 'front');
let won = false, winT = 0, wonShown = false, playTime = 0, roundStarted = false;

// Four keyholes on the inside of the front door. Keys can be put in as they are found; the door
// only opens once all four locks are filled. `inserted` keys are in the door, the rest are carried.
let inserted = 0, unlockT = -1;
const lockSlots = [];
{
  const panel = frontDoor.panel;
  const { width: pw, height: ph } = panel.geometry.parameters;
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.9, roughness: 0.35, emissive: 0x1a1206 });
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.85, roughness: 0.3, emissive: 0x2a1c06 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  // the panel is centred on its own origin; its inside (foyer) face is at local z = -0.03
  for (let i = 0; i < KEY_COUNT; i++) {
    const x = pw / 2 - 0.22, y = 1.5 - i * 0.18 - ph / 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.012), plateMat);
    plate.position.set(x, y, -0.036);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 10), holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(x, y + 0.02, -0.043);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.004), holeMat);
    slot.position.set(x, y + 0.002, -0.043);
    // the key, bow outwards, shaft in the lock; turned upright when inserted, level once unlocked
    const holder = new THREE.Group();
    holder.position.set(x, y + 0.012, -0.044);
    const key = keyModel(keyMat);
    key.rotation.y = -Math.PI / 2;     // shaft along +z, into the door
    key.position.z = -0.14;
    holder.add(key);
    holder.rotation.z = Math.PI / 2;
    holder.visible = false;
    panel.add(plate, hole, slot, holder);
    lockSlots.push({ holder, turned: false });
  }
}
function resetLocks() {
  inserted = 0;
  unlockT = -1;
  for (const s of lockSlots) { s.holder.visible = false; s.holder.rotation.z = Math.PI / 2; s.turned = false; }
}
const keyRay = new THREE.Raycaster();

// Barely-there moonlight so the darkness is not a flat black.
const AMBIENT = 0.14;
const ambient = new THREE.AmbientLight(0x3a3040, AMBIENT);
scene.add(ambient);

// ---------- flashlight ----------
const FLASH_INTENSITY = 55;
const flash = new THREE.SpotLight(0xffe2b8, FLASH_INTENSITY, 28, 0.45, 0.5, 1.45);
flash.castShadow = true;
flash.shadow.camera.near = 0.15;
flash.shadow.bias = -0.0004;
flash.shadow.normalBias = 0.02;
flash.position.set(0.2, -0.22, 0.05);
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, -0.1, -5);
camera.add(flash, flashTarget);
flash.target = flashTarget;
// faint glow around the player so nearby walls are just readable with the torch off
const nearGlow = new THREE.PointLight(0x6a7aa0, 0.35, 3.5, 2);
camera.add(nearGlow);

// ---------- dust motes, only visible inside the flashlight beam ----------
const dustUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3() }, uOn: { value: 1 }, uScale: { value: window.innerHeight } };
{
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pos[i] = rand(-4, 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform vec3 uCam; uniform vec3 uDir; uniform float uOn; uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.11 + position.y * 3.0) * 0.4, sin(uTime * 0.05 + position.x) * 0.3 - uTime * 0.02, cos(uTime * 0.09 + position.z * 2.0) * 0.4);
        p = mod(p - uCam + 4.0, 8.0) - 4.0 + uCam;
        vec3 d = p - uCam;
        float dist = length(d);
        float c = dot(d / max(dist, 0.001), uDir);
        vA = smoothstep(0.9, 0.975, c) * (1.0 - smoothstep(1.5, 4.0, dist)) * smoothstep(0.3, 0.8, dist) * uOn;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 0.012 * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * vA * (1.0 - r * 2.0) * 0.5, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
}

// ---------- film grain + vignette, drawn as a last full-screen pass ----------
const fxUniforms = { uTime: { value: 0 } };
const fxScene = new THREE.Scene();
const fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
{
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: fxUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      // well-mixed 2D hash: no repeating pattern along rows or columns (the previous one produced vertical stripes)
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);
        float vig = smoothstep(0.28, 0.72, length(d)) * 0.92;
        float frame = floor(uTime * 14.0);
        float n = hash(floor(gl_FragCoord.xy) + vec2(frame * 61.7, frame * 23.3));
        float a = vig + 0.04;
        gl_FragColor = vec4(vec3(n * 0.06) / a, a);   // darken edges, add a little grain
      }`,
  }));
  quad.frustumCulled = false;
  fxScene.add(quad);
}

// ---------- player ----------
const player = {
  pos: new THREE.Vector3(0, 0, 18.3),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, roll: 0,
  radius: 0.28,
  vy: 0, camY: 0,
  eye: 1.65,
  stepDist: 0, bobPhase: 0,
  stamina: 1, exhausted: false, restT: 0,
};
const SPAWN = { x: 0, z: 18.3, yaw: 0 };
// Stamina: a full bar lasts this many seconds of running; it refills after a short rest,
// faster when standing still. Once empty, running is impossible until it is back to 30%.
const STAMINA_RUN_TIME = 6, STAMINA_REFILL_WALKING = 10, STAMINA_REFILL_RESTING = 6, STAMINA_RECOVER = 0.3;
const CATCH_RANGE = 1.25;   // the Wraith stops 1.1 m away when chasing, so this is "it reached you"
let caught = false, catchT = 0, caughtShown = false;
const keys = new Set();
let playing = false;
let flashOn = true;
let currentRoom = null;

// ---------- UI ----------
const overlay = document.getElementById('overlay');
const promptEl = document.getElementById('prompt');
const roomEl = document.getElementById('roomName');
const msgEl = document.getElementById('message');
const staminaEl = document.getElementById('stamina');
const staminaFill = document.getElementById('staminaFill');
const redEl = document.getElementById('flashRed');
const caughtEl = document.getElementById('caught');
const keysHud = document.getElementById('keysHud');
const wonEl = document.getElementById('won');
let roomTimer = 0, msgTimer = 0;
function showRoom(name) {
  roomEl.textContent = name;
  roomEl.classList.add('show');
  roomTimer = 2.8;
}
function showMessage(text, seconds = 2.2) {
  msgEl.textContent = text;
  msgEl.classList.add('show');
  msgTimer = seconds;
}

// ---------- input ----------
const canvas = renderer.domElement;
let locked = false;
function setPlaying(v) {
  playing = v;
  overlay.classList.toggle('hidden', v);
  if (!v) keys.clear();
  if (audio.ready) audio.setMusicPlaying(v);
}
function lockPointer() {
  // Pointer lock can be refused (some browsers/embeds); the game still runs, with click-and-drag look.
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (err) { /* ignore */ }
}
document.getElementById('startBtn').addEventListener('click', () => {
  try { audio.start(house.clockPos, house.bounds); } catch (err) { console.warn('Audio unavailable', err); }
  if (caught || won) { restartAfterCatch(); return; }
  if (wraiths.length !== wraithCount) spawnWraiths();   // the count was changed in the menu
  setPlaying(true);
  if (!roundStarted) {
    roundStarted = true;
    showMessage(`${doorKeys.items.length} keys are hidden in the house. Find any ${KEY_COUNT}, then escape through the front door.`, 6);
  }
  lockPointer();
});
document.getElementById('retryBtn').addEventListener('click', restartAfterCatch);
document.getElementById('againBtn').addEventListener('click', restartAfterCatch);

// ---------- getting caught ----------
function startCatch() {
  caught = true;
  catchT = 0;
  caughtShown = false;
  keys.clear();
  flashOn = true;           // so the face is lit
  flash.visible = true;
  audio.caught();
}
// The front door swings open and the player gets out.
function startWin() {
  won = true;
  winT = 0;
  wonShown = false;
  keys.clear();
  const s = Math.floor(playTime);
  document.getElementById('winStats').textContent =
    `Escaped in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}  ·  ${wraiths.length} ${wraiths.length === 1 ? 'Wraith' : 'Wraiths'}  ·  ${difficulty[0].toUpperCase() + difficulty.slice(1)}`;
}
// Back to the start: player in the Foyer, the Wraiths at fresh random spots, the keys hidden
// somewhere new and the front door locked again. Used after being caught and after winning.
function restartAfterCatch() {
  caught = false;
  won = false;
  caughtEl.classList.remove('show');
  wonEl.classList.remove('show');
  if (hiding) leaveHiding();
  house.resetDrawers();
  doorKeys.scatter(DIFFICULTY[difficulty].keys);
  frontDoor.locked = true;
  resetLocks();
  frontDoor.angle = frontDoor.from = frontDoor.to = 0;
  frontDoor.t = 1;
  frontDoor.dirty = true;
  playTime = 0;
  showMessage(`${doorKeys.items.length} keys are hidden in the house. Find any ${KEY_COUNT}, then escape through the front door.`, 6);
  redEl.style.opacity = 0;
  camera.fov = 72;
  camera.updateProjectionMatrix();
  player.pos.set(SPAWN.x, 0, SPAWN.z);
  player.camY = 0;
  player.yaw = SPAWN.yaw;
  player.pitch = 0;
  player.vel.set(0, 0, 0);
  player.stamina = 1;
  player.exhausted = false;
  currentRoom = null;
  spawnWraiths();
  setPlaying(true);
  lockPointer();
}
canvas.addEventListener('mousedown', () => { if (playing && !locked) lockPointer(); });
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === canvas;
  if (was && !locked) setPlaying(false); // Esc releases the mouse: pause
});
document.addEventListener('mousemove', (e) => {
  if (!playing || (!locked && !(e.buttons & 1))) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch = clamp(player.pitch - e.movementY * 0.0021, -1.45, 1.45);
});
document.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.code === 'Escape' && !locked) { setPlaying(false); return; }
  keys.add(e.code);
  if (e.code === 'KeyE' && !e.repeat) interact();
  if (e.code === 'KeyP' && !e.repeat) toggleFps();
  if (e.code === 'KeyF' && !e.repeat) {
    flashOn = !flashOn;
    flash.visible = flashOn;
    if (audio.ready) audio.play(audio.tickBuf, null, 0.5, 0.7);
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('resize', () => {
  if (!window.innerWidth || !window.innerHeight) return;   // minimised window: keep the last good size
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyPixelRatio();
});

// ---------- quality, dynamic resolution and FPS counter ----------
let resScale = 1;
function applyPixelRatio() {
  const q = QUALITY[qualityName];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxDpr) * resScale);
  dustUniforms.uScale.value = window.innerHeight * renderer.getPixelRatio();
  house.setViewHeight(window.innerHeight * renderer.getPixelRatio());
}
function applyQuality(name) {
  qualityName = name;
  store.set('hotel36.quality', name);
  const q = QUALITY[name];
  house.setLightCount(q.lights);
  flash.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  if (flash.shadow.map) { flash.shadow.map.dispose(); flash.shadow.map = null; }
  // the shadow camera's far plane follows the beam's reach, so a shorter beam culls more geometry
  flash.distance = q.reach;
  if (renderer.shadowMap.type !== q.shadowType) {
    renderer.shadowMap.type = q.shadowType;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  resScale = q.resMax;
  applyPixelRatio();
  document.querySelectorAll('[data-quality]').forEach((b) => b.classList.toggle('active', b.dataset.quality === name));
  const note = document.getElementById('qualityNote');
  if (note) note.textContent = q.aa !== startedWithAA ? 'Edge smoothing changes the next time the game is opened.' : '';
}
document.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => applyQuality(b.dataset.quality)));

// ---------- menu: number of Wraiths and difficulty ----------
function showWraithSettings() {
  document.getElementById('wraithCount').textContent = wraithCount;
  document.getElementById('wraithMinus').disabled = wraithCount <= 1;
  document.getElementById('wraithPlus').disabled = wraithCount >= 10;
  // a warning under the count once it gets dangerous
  const [warning, level] = wraithCount >= 10 ? ['Nightmare!', 'nightmare'] : wraithCount === 9 ? ['Impossible', 'impossible']
    : wraithCount >= 7 ? ['Very Hard', 'veryhard'] : wraithCount >= 4 ? ['Not recommended', 'warn'] : ['', ''];
  const note = document.getElementById('wraithNote');
  note.textContent = warning;
  note.className = level;
  document.querySelectorAll('[data-difficulty]').forEach((b) => b.classList.toggle('active', b.dataset.difficulty === difficulty));
  document.getElementById('difficultyNote').textContent = DIFFICULTY[difficulty].note;
}
function setWraithCount(n) {
  wraithCount = clamp(n, 1, 10);
  store.set('hotel36.wraiths', String(wraithCount));
  showWraithSettings();
}
document.getElementById('wraithMinus').addEventListener('click', () => setWraithCount(wraithCount - 1));
document.getElementById('wraithPlus').addEventListener('click', () => setWraithCount(wraithCount + 1));
document.querySelectorAll('[data-difficulty]').forEach((b) => b.addEventListener('click', () => {
  difficulty = b.dataset.difficulty;
  store.set('hotel36.difficulty', difficulty);
  for (const w of wraiths) w.runSpeed = DIFFICULTY[difficulty].run;
  // re-hide the keys for the new difficulty, unless the player has already started collecting them
  if (doorKeys.found === 0) doorKeys.scatter(DIFFICULTY[difficulty].keys);
  showWraithSettings();
}));
showWraithSettings();

const fpsEl = document.getElementById('fps');
let showFps = store.get('hotel36.fps') === '1';
fpsEl.classList.toggle('show', showFps);
function toggleFps() {
  showFps = !showFps;
  fpsEl.classList.toggle('show', showFps);
  store.set('hotel36.fps', showFps ? '1' : '0');
}
let fpsFrames = 0, fpsTime = 0, fpsSlow = 0, fpsFast = 0;
// Measures the real frame rate; while playing, lowers the render resolution when the game
// struggles and raises it again when there is headroom.
function trackFps(realDt) {
  fpsFrames++;
  fpsTime += realDt;
  if (fpsTime < 0.5) return;
  const fps = fpsFrames / fpsTime;
  fpsEl.textContent = `${Math.round(fps)} FPS · ${Math.round(resScale * 100)}% res · ${qualityName}`;
  fpsFrames = 0; fpsTime = 0;
  if (!playing) return;
  const q = QUALITY[qualityName];
  fpsSlow = fps < 45 ? fpsSlow + 1 : 0;
  fpsFast = fps > 57 ? fpsFast + 1 : 0;
  if (fpsSlow >= 2 && resScale > q.resMin) { resScale = Math.max(q.resMin, resScale - 0.1); applyPixelRatio(); fpsSlow = 0; }
  else if (fpsFast >= 6 && resScale < q.resMax) { resScale = Math.min(q.resMax, resScale + 0.05); applyPixelRatio(); fpsFast = 0; }
}

// ---------- doors ----------
const ray = new THREE.Raycaster();
ray.far = 2.4;
const center = new THREE.Vector2(0, 0);
// What the player is looking at and could use with E: a key, a drawer, a hiding cupboard or a door
// (whichever is nearest), or, while hidden, the way back out.
function lookTarget() {
  if (hiding) return { kind: 'leave' };
  const key = doorKeys.aimedAt(camera, house.occluders, keyRay);
  if (key) return { kind: 'key', key };
  ray.setFromCamera(center, camera);
  const hit = ray.intersectObjects([...house.interactables, ...house.drawerMeshes, ...house.occluders], true)[0];
  let target = null, dist = Infinity;
  if (hit) {
    const drawer = house.drawerFromHit(hit);
    let o = hit.object;
    while (o && !o.userData.door) o = o.parent;
    if (drawer) target = { kind: 'drawer', drawer };
    else if (o) target = { kind: 'door', door: o.userData.door };
    if (target) dist = hit.distance;
  }
  const spot = aimedHidingSpot();
  if (spot && spot.dist < dist) target = { kind: 'hide', spot: spot.spot };
  return target;
}
function aimedHidingSpot() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const level = player.pos.y > 1.75 ? 1 : 0;
  let best = null;
  for (const spot of house.hidingSpots) {
    if (spot.level !== level) continue;
    const to = spot.aim.clone().sub(camera.position);
    const dist = to.length(), along = to.dot(dir);
    if (dist > 2.0 || along <= 0) continue;
    if (Math.sqrt(Math.max(0, dist * dist - along * along)) > 0.55) continue;
    keyRay.set(camera.position, to.clone().normalize());
    keyRay.far = dist;
    if (keyRay.intersectObjects(house.occluders, false).some((h) => h.distance < dist - 0.1)) continue;
    if (!best || dist < best.dist) best = { spot, dist };
  }
  return best;
}
// Step into a cupboard: the torch goes off and the Wraiths can no longer see you.
function enterHiding(spot) {
  hiding = spot;
  flashBeforeHiding = flashOn;
  flashOn = false;
  flash.visible = false;
  player.vel.set(0, 0, 0);
  player.pos.set(spot.inside.x, spot.floorY, spot.inside.z);
  player.camY = spot.floorY;
  player.yaw = spot.yaw;
  player.pitch = 0;
  audio.door(spot.aim);
  showMessage('You are hidden. The Wraiths can\'t see you in here.', 3);
}
function leaveHiding() {
  const spot = hiding;
  hiding = null;
  player.pos.set(spot.front.x, spot.floorY, spot.front.z);
  player.camY = spot.floorY;
  flashOn = flashBeforeHiding;
  flash.visible = flashOn;
  audio.door(spot.aim);
}
function interact() {
  const target = lookTarget();
  if (!target) return;
  if (target.kind === 'leave') { leaveHiding(); return; }
  if (target.kind === 'hide') { enterHiding(target.spot); return; }
  if (target.kind === 'drawer') {
    target.drawer.toggle();
    audio.drawer(target.drawer.pos);
    return;
  }
  if (target.kind === 'key') {
    doorKeys.take(target.key);
    audio.play(audio.rattleBuf, null, 0.5, 1.8);   // a little metallic jingle
    showMessage(doorKeys.all ? 'That\'s every key you need. Put them in the front door.' : `You found a key.  ${doorKeys.found} / ${KEY_COUNT}`, 3);
    return;
  }
  const door = target.door;
  if (door === frontDoor && door.locked) {
    if (unlockT >= 0) return;   // the locks are already turning
    const carried = doorKeys.found - inserted;
    if (carried > 0) {
      // put every key being carried into the next empty keyholes
      for (let i = 0; i < carried && inserted < KEY_COUNT; i++) lockSlots[inserted++].holder.visible = true;
      audio.play(audio.tickBuf, door.pos, 1, 0.7);
      audio.play(audio.rattleBuf, door.pos, 0.35, 1.6);
      if (inserted >= KEY_COUNT) {
        unlockT = 0;
        showMessage('The last key goes in. The locks begin to turn...', 3);
      } else {
        const left = KEY_COUNT - inserted;
        showMessage(`${inserted} of ${KEY_COUNT} keys are in the door. Find ${left} more.`, 3);
      }
    } else {
      door.toggle(player.pos.x, player.pos.z);   // rattles
      audio.rattle(door.pos);
      showMessage(`The front door has ${KEY_COUNT} locks.  ${inserted} / ${KEY_COUNT} keys in place.`);
    }
    return;
  }
  const res = door.toggle(player.pos.x, player.pos.z);
  if (res === 'locked') {
    audio.rattle(door.pos);
    showMessage(door.o.type === 'front' ? 'The front door won\'t budge.' : 'It\'s locked.');
  } else audio.door(door.pos);
}

// ---------- collision ----------
// Static colliders are bucketed into a 2 m grid so each frame only checks what is near the player.
const CELL = 2;
const grid = new Map();
for (const b of house.colliders) {
  for (let ix = Math.floor(b.min.x / CELL); ix <= Math.floor(b.max.x / CELL); ix++) {
    for (let iz = Math.floor(b.min.z / CELL); iz <= Math.floor(b.max.z / CELL); iz++) {
      const k = ix * 1000 + iz;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(b);
    }
  }
}
const nearby = [];
function gatherNearby(p, r) {
  nearby.length = 0;
  const seen = new Set();
  for (let ix = Math.floor((p.x - r - 0.5) / CELL); ix <= Math.floor((p.x + r + 0.5) / CELL); ix++) {
    for (let iz = Math.floor((p.z - r - 0.5) / CELL); iz <= Math.floor((p.z + r + 0.5) / CELL); iz++) {
      const list = grid.get(ix * 1000 + iz);
      if (list) for (const b of list) if (!seen.has(b)) { seen.add(b); nearby.push(b); }
    }
  }
  for (const d of house.doors) if (Math.abs(d.pos.x - p.x) < 2.5 && Math.abs(d.pos.z - p.z) < 2.5) nearby.push(d.box);
}
function resolveCollisions(p, r) {
  gatherNearby(p, r);
  for (let it = 0; it < 3; it++) {
    for (const b of nearby) {
      if (b.max.y < p.y + 0.25 || b.min.y > p.y + 1.7) continue; // only things at body height
      if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r) continue;
      const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        const l = p.x - b.min.x, rr = b.max.x - p.x, t = p.z - b.min.z, bb = b.max.z - p.z;
        const m = Math.min(l, rr, t, bb);
        if (m === l) p.x = b.min.x - r; else if (m === rr) p.x = b.max.x + r;
        else if (m === t) p.z = b.min.z - r; else p.z = b.max.z + r;
      }
    }
  }
}

// ---------- events: lightning, flashlight hiccups ----------
let time = 0;
let nextLightning = rand(18, 35), lightningT = -1, thunderAt = 0;
let nextFlashGlitch = rand(25, 60), flashGlitch = 0;
let lastYaw = 0, lastPitch = 0;
const camDir = new THREE.Vector3();

function update(dt) {
  time += dt;

  // movement
  if (playing && !caught && !won) playTime += dt;
  if (hiding) {
    // peering out through the slats: no walking, only a limited look around, and a chance to catch breath
    const off = Math.atan2(Math.sin(player.yaw - hiding.yaw), Math.cos(player.yaw - hiding.yaw));
    player.yaw = hiding.yaw + clamp(off, -1.0, 1.0);
    player.pitch = clamp(player.pitch, -0.6, 0.5);
    player.vel.set(0, 0, 0);
    player.stamina = Math.min(1, player.stamina + dt / STAMINA_REFILL_RESTING);
    if (player.exhausted && player.stamina >= STAMINA_RECOVER) player.exhausted = false;
  }
  if (playing && !caught && !won && !hiding) {
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const str = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const crouch = keys.has('KeyC') || keys.has('ControlLeft');
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    let dx = -s * fwd + c * str, dz = -c * fwd - s * str;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }
    const run = !crouch && !player.exhausted && len > 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    if (run) {
      player.stamina = Math.max(0, player.stamina - dt / STAMINA_RUN_TIME);
      player.restT = 0;
      if (player.stamina === 0) player.exhausted = true;
    } else {
      player.restT += dt;
      if (player.restT > 0.6) player.stamina = Math.min(1, player.stamina + dt / (len > 0 ? STAMINA_REFILL_WALKING : STAMINA_REFILL_RESTING));
      if (player.exhausted && player.stamina >= STAMINA_RECOVER) player.exhausted = false;
    }
    const speed = crouch ? 1.1 : run ? 3.6 : 1.9;
    const k = 1 - Math.exp(-dt * 9);
    player.vel.x += (dx * speed - player.vel.x) * k;
    player.vel.z += (dz * speed - player.vel.z) * k;
    player.eye += ((crouch ? 1.0 : 1.65) - player.eye) * (1 - Math.exp(-dt * 8));

    const before = player.pos.clone();
    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
    resolveCollisions(player.pos, player.radius);
    // stairs and floors: step up small rises, refuse anything taller, fall down drops
    let ground = house.floorAt(player.pos.x, player.pos.z, player.pos.y);
    if (ground - player.pos.y > 0.5) {
      player.pos.x = before.x;
      player.pos.z = before.z;
      ground = house.floorAt(player.pos.x, player.pos.z, player.pos.y);
    }
    if (ground >= player.pos.y || player.pos.y - ground < 0.35) {
      player.pos.y = ground;
      player.vy = 0;
    } else {
      player.vy -= 9.8 * dt;
      player.pos.y = Math.max(ground, player.pos.y + player.vy * dt);
    }
    const moved = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);

    const stepLen = crouch ? 0.55 : run ? 0.95 : 0.75;
    player.stepDist += moved;
    player.bobPhase += (moved / stepLen) * Math.PI;
    if (player.stepDist > stepLen) {
      player.stepDist = 0;
      const surface = currentRoom && currentRoom.floor === 'tile' ? 'tile' : 'wood';
      const soft = currentRoom && currentRoom.floor.startsWith('carpet') ? 0.55 : 1;
      audio.footstep(surface, (crouch ? 0.12 : run ? 0.5 : 0.3) * soft);
    }
  } else {
    player.vel.set(0, 0, 0);
  }
  const moveAmt = clamp(Math.hypot(player.vel.x, player.vel.z) / 2, 0, 1.6);
  const bob = Math.abs(Math.sin(player.bobPhase)) * 0.045 * moveAmt;
  player.roll += (Math.sin(player.bobPhase) * 0.006 * moveAmt - player.roll) * 0.2;

  // smooth the camera over each stair step instead of snapping
  player.camY += (player.pos.y - player.camY) * (1 - Math.exp(-dt * 14));
  camera.position.set(player.pos.x, player.camY + player.eye + bob, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, player.roll);
  if (caught) {
    // jumpscare: the face lunges in, the view snaps level, zooms and shakes
    catchT += dt;
    player.pitch += (0 - player.pitch) * Math.min(1, dt * 12);
    const shake = 0.05 * Math.exp(-catchT * 1.5);
    camera.position.x += rand(-shake, shake);
    camera.position.y += rand(-shake, shake);
    camera.rotation.z += rand(-shake, shake) * 0.6;
    camera.fov = 72 - 16 * Math.min(1, catchT / 0.15);
    camera.updateProjectionMatrix();
    const lunge = catchT < 0.14 ? 1.8 - (1.3 * catchT) / 0.14 : 0.5;
    catcher.scare(new THREE.Vector3(player.pos.x, 0, player.pos.z), player.yaw, lunge, player.pos.y);
    redEl.style.opacity = Math.max(0, 0.55 - catchT * 0.9) * (0.7 + Math.random() * 0.3);
    if (catchT > 1.7 && !caughtShown) {
      caughtShown = true;
      caughtEl.classList.add('show');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  // all four keys are in: they turn one after another, then the door swings open
  if (unlockT >= 0 && !caught) {
    unlockT += dt;
    lockSlots.forEach((s, i) => {
      const k = clamp((unlockT - i * 0.25) / 0.2, 0, 1);
      s.holder.rotation.z = (Math.PI / 2) * (1 - k);
      if (k === 1 && !s.turned) { s.turned = true; audio.play(audio.tickBuf, frontDoor.pos, 1, 0.55); }
    });
    if (unlockT > KEY_COUNT * 0.25 + 0.35) {
      unlockT = -1;
      frontDoor.locked = false;
      frontDoor.toggle(player.pos.x, player.pos.z);
      audio.door(frontDoor.pos);
      startWin();
    }
  }
  if (won && (winT += dt) > 1.4 && !wonShown) {
    // the door has swung open: out into the night
    wonShown = true;
    wonEl.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  camera.updateMatrixWorld();

  // flashlight lags slightly behind head movement
  const yawVel = (player.yaw - lastYaw) / Math.max(dt, 1e-3), pitchVel = (player.pitch - lastPitch) / Math.max(dt, 1e-3);
  lastYaw = player.yaw; lastPitch = player.pitch;
  const lag = 1 - Math.exp(-dt * 6);
  flashTarget.position.x += (clamp(yawVel * 0.25, -1.2, 1.2) - flashTarget.position.x) * lag;
  flashTarget.position.y += (clamp(-pitchVel * 0.25, -1.2, 1.2) - 0.1 + Math.sin(player.bobPhase * 2) * 0.04 * moveAmt - flashTarget.position.y) * lag;

  // the torch occasionally sputters
  if (time > nextFlashGlitch) { flashGlitch = rand(0.3, 0.9); nextFlashGlitch = time + rand(30, 70); }
  if (flashGlitch > 0) {
    flashGlitch -= dt;
    flash.intensity = FLASH_INTENSITY * (Math.random() < 0.5 ? rand(0, 0.25) : rand(0.6, 1));
  } else flash.intensity = FLASH_INTENSITY;

  // lightning through the windows, thunder a moment later
  if (time > nextLightning) {
    lightningT = 0;
    thunderAt = time + rand(0.8, 2.6);
    nextLightning = time + rand(35, 80);
  }
  let flashK = 0;
  if (lightningT >= 0) {
    lightningT += dt;
    const L = lightningT;
    flashK = L < 0.07 ? 1 : L < 0.15 ? 0.05 : L < 0.24 ? 0.8 : L < 0.9 ? 0.8 * Math.exp(-(L - 0.24) * 9) : 0;
    if (L > 0.9) lightningT = -1;
  }
  ambient.intensity = AMBIENT + flashK * 1.4;
  house.windowMat.emissiveIntensity = 0.5 + flashK * 7;
  if (thunderAt && time > thunderAt) { audio.thunder(); thunderAt = 0; }

  // doors
  for (const d of house.doors) d.update(dt);
  for (const w of wraiths) {
    // a hidden player can't be seen at all
    w.update(dt, time, playing && !caught && !won, hiding ? null : player.pos, camera.position);
    audio.setPresencePosition(w.voice, { x: w.pos.x, y: w.floorY + 1.6, z: w.pos.z });
    // its sound only carries on the player's own floor
    audio.setPresenceAudible(w.voice, w.level === (player.pos.y > 1.75 ? 1 : 0));
    if (playing && !caught && !won && !hiding && w.state === 'chase' && w.level === (player.pos.y > 1.75 ? 1 : 0)
        && Math.hypot(w.pos.x - player.pos.x, w.pos.z - player.pos.z) < CATCH_RANGE) {
      catcher = w;
      startCatch();
    }
  }

  // stamina bar: only shown while it isn't full
  staminaFill.style.width = `${player.stamina * 100}%`;
  staminaEl.classList.toggle('show', playing && !caught && player.stamina < 0.999);
  staminaEl.classList.toggle('tired', player.exhausted);
  house.update(time, dt, player.pos, camera);

  // keys: glimmer, counter, and the interaction prompt (a key in view takes priority over a door)
  doorKeys.update(time);
  const carried = doorKeys.found - inserted;
  keysHud.textContent = `Keys in door  ${inserted} / ${KEY_COUNT}` + (carried > 0 ? `   ·   Carrying ${carried}` : '');
  keysHud.classList.toggle('show', playing && !caught && !won);
  keysHud.classList.toggle('all', doorKeys.all);
  const active = playing && !caught && !won;
  const target = active ? lookTarget() : null;
  let label = '';
  if (target) {
    if (target.kind === 'leave') label = '[E] Leave the cupboard';
    else if (target.kind === 'hide') label = '[E] Hide';
    else if (target.kind === 'key') label = '[E] Pick up key';
    else if (target.kind === 'drawer') label = target.drawer.isOpen() ? '[E] Close drawer' : '[E] Open drawer';
    else {
      const door = target.door;
      label = door === frontDoor && door.locked
        ? (unlockT >= 0 ? '' : carried > 0 ? `[E] Insert ${carried === 1 ? 'key' : `${carried} keys`}` : '[E] Try the front door')
        : door.locked ? '[E] Try the door' : door.isOpen() ? '[E] Close' : '[E] Open';
    }
  }
  promptEl.textContent = label;
  promptEl.classList.toggle('show', !!label);

  // room names
  const room = house.roomAt(player.pos.x, player.pos.z, player.pos.y);
  if (room && room !== currentRoom) {
    currentRoom = room;
    showRoom(room.name);
  }
  if (roomTimer > 0 && (roomTimer -= dt) <= 0) roomEl.classList.remove('show');
  if (msgTimer > 0 && (msgTimer -= dt) <= 0) msgEl.classList.remove('show');

  camera.getWorldDirection(camDir);
  dustUniforms.uTime.value = time;
  dustUniforms.uCam.value.copy(camera.position);
  dustUniforms.uDir.value.copy(camDir);
  dustUniforms.uOn.value = flashOn ? flash.intensity / FLASH_INTENSITY : 0;
  audio.update(camera, camDir);
}

function render() {
  renderer.clear();
  renderer.render(scene, camera);
  renderer.render(fxScene, fxCam);
}

applyQuality(qualityName);
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const realDt = clock.getDelta();
  trackFps(realDt);
  update(Math.min(realDt, 0.05));
  fxUniforms.uTime.value = time;
  render();
}
loop();

// handy for debugging from the console
window.game = { player, camera, house, scene, renderer, audio, get wraith() { return wraiths[0]; }, get wraiths() { return wraiths; }, setWraithCount, spawnWraiths, frame: (dt = 0.016) => { update(dt); render(); }, setPlaying, applyQuality, isCaught: () => caught, isWon: () => won, isHiding: () => !!hiding, doorKeys, frontDoor, lockSlots, restartAfterCatch };
