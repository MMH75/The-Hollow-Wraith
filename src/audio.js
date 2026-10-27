// All sounds are synthesized at startup with the Web Audio API (no audio files needed).
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
// Music and the catch scream skip the compressor (which flattens loud sounds) and go straight out.
const MUSIC_PLAYING = 0.3, MUSIC_PAUSED = 0.1;   // after the track is normalised to full scale
const CATCH_GAIN = 1.0;
const PRESENCE_RANGE = 16;   // metres at which the Wraith's sound fades to nothing

function peakOf(buf) {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m;
}

// Time (s) where a recording first gets loud (60% of its peak), minus a few ms so the attack isn't clipped.
function screamOnset(buf) {
  const limit = peakOf(buf) * 0.6;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) >= limit) return Math.max(0, i / buf.sampleRate - 0.03);
  }
  return 0;
}

// Two-pole resonator bank applied to an excitation signal.
function resonate(exc, sr, modes) {
  const n = exc.length;
  const out = new Float32Array(n);
  for (const [f, bw, gain] of modes) {
    const r = Math.exp(-Math.PI * bw / sr);
    const a1 = 2 * r * Math.cos(2 * Math.PI * f / sr), a2 = -r * r;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = exc[i] * gain + a1 * y1 + a2 * y2;
      out[i] += y;
      y2 = y1; y1 = y;
    }
  }
  return out;
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

function highpass(d, sr, f) {
  const rc = 1 / (2 * Math.PI * f), a = rc / (rc + 1 / sr);
  let px = 0, py = 0;
  for (let i = 0; i < d.length; i++) { const y = a * (py + d[i] - px); px = d[i]; py = y; d[i] = y; }
  return d;
}

export class AudioSys {
  constructor() { this.ctx = null; this.ready = false; }

  start(clockPos, bounds) {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.clockPos = clockPos;
    this.bounds = bounds;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.direct = ctx.createGain();
    this.direct.connect(ctx.destination);

    this.creaks = Array.from({ length: 6 }, () => this.makeCreak(rand(1.3, 1.9), 20, 60, 80, 220));
    this.boardCreaks = Array.from({ length: 4 }, () => this.makeCreak(rand(0.35, 0.6), 30, 50, 60, 140));
    this.thudBuf = this.makeThud();
    this.rattleBuf = this.makeRattle();
    this.steps = {
      wood: Array.from({ length: 4 }, () => this.makeStep(false)),
      tile: Array.from({ length: 4 }, () => this.makeStep(true)),
    };
    this.tickBuf = this.makeTick(2600, 4100);
    this.tockBuf = this.makeTick(1900, 3100);
    this.thunderBuf = this.makeThunder();
    this.drawerBufs = Array.from({ length: 3 }, () => this.makeDrawer());
    this.loadDoorClips();
    this.loadNamedClips();

    this.nextTick = ctx.currentTime + 0.5;
    this.tickFlip = false;
    this.nextAmbient = ctx.currentTime + rand(8, 15);
    this.ready = true;
  }

  buffer(data) {
    const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.copyToChannel(data, 0);
    return b;
  }

  // Door creak: a stick-slip impulse train (the "teeth" of the creak) through wood resonances.
  makeCreak(dur, rLo, rLoVar, rHi, rHiVar) {
    const sr = this.ctx.sampleRate, n = Math.floor(dur * sr);
    const exc = new Float32Array(n);
    const r0 = rLo + rand(0, rLoVar), r1 = rHi + rand(0, rHiVar);
    const ph = rand(0, 6.28), wob = rand(2, 6), sweep = rand(0.8, 1.6);
    let next = 0;
    for (let i = 0; i < n; i++) {
      if (i >= next) {
        const u = i / n;
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.12)), 0.5) * (0.65 + 0.35 * Math.sin(u * wob * 6.283 + ph));
        const rate = r0 + (r1 - r0) * (0.5 + 0.5 * Math.sin(u * Math.PI * sweep + ph));
        exc[i] = Math.max(0, env) * rand(0.6, 1.3);
        next = i + (sr / rate) * rand(0.88, 1.12);
      }
    }
    const modes = [
      [rand(340, 460), 28, 1], [rand(880, 1100), 40, 0.75],
      [rand(1600, 2000), 60, 0.45], [rand(2700, 3300), 90, 0.25],
    ];
    const out = resonate(exc, sr, modes);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] += (Math.random() - 0.5) * 0.002 * Math.sin(Math.PI * Math.min(1, u * 1.12));
    }
    return this.buffer(normalize(highpass(out, sr, 120), 0.9));
  }

  makeThud() {
    const sr = this.ctx.sampleRate, n = Math.floor(0.7 * sr);
    const d = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 45 + 70 * Math.exp(-t * 14);
      ph += 2 * Math.PI * f / sr;
      d[i] = Math.sin(ph) * Math.exp(-t * 8) + (Math.random() - 0.5) * Math.exp(-t * 70) * 0.8;
    }
    const knock = new Float32Array(n);
    for (let i = 0; i < 300; i++) knock[i] = (Math.random() - 0.5) * (1 - i / 300);
    const body = resonate(knock, sr, [[190, 30, 1], [420, 50, 0.5]]);
    normalize(body, 0.6);
    for (let i = 0; i < n; i++) d[i] += body[i];
    return this.buffer(normalize(d, 0.95));
  }

  makeRattle() {
    const sr = this.ctx.sampleRate, n = Math.floor(0.7 * sr);
    const exc = new Float32Array(n);
    [0, 0.07, 0.16, 0.24, 0.35, 0.42].forEach((t, k) => {
      const i0 = Math.floor(t * sr);
      for (let i = 0; i < 80; i++) exc[i0 + i] = (Math.random() - 0.5) * (1 - i / 80) * (k % 2 ? 0.7 : 1);
    });
    const metal = resonate(exc, sr, [[2300, 60, 1], [3700, 80, 0.7], [5200, 120, 0.4]]);
    const wood = resonate(exc, sr, [[180, 40, 1], [380, 60, 0.6]]);
    normalize(metal, 0.5); normalize(wood, 0.8);
    for (let i = 0; i < n; i++) metal[i] += wood[i];
    return this.buffer(normalize(metal, 0.9));
  }

  makeStep(tile) {
    const sr = this.ctx.sampleRate, n = Math.floor(0.22 * sr);
    const exc = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; exc[i] = (Math.random() - 0.5) * Math.exp(-t * (tile ? 90 : 55)); }
    const modes = tile
      ? [[180, 50, 0.6], [900, 150, 0.4], [2200, 300, 0.35]]
      : [[rand(95, 130), 35, 1], [rand(220, 280), 60, 0.6], [700, 200, 0.15]];
    return this.buffer(normalize(highpass(resonate(exc, sr, modes), sr, 50), 0.8));
  }

  makeTick(f1, f2) {
    const sr = this.ctx.sampleRate, n = Math.floor(0.08 * sr);
    const exc = new Float32Array(n);
    for (let i = 0; i < 40; i++) exc[i] = (Math.random() - 0.5) * (1 - i / 40);
    return this.buffer(normalize(resonate(exc, sr, [[f1, 120, 1], [f2, 200, 0.6], [600, 80, 0.4]]), 0.9));
  }

  makeThunder() {
    const sr = this.ctx.sampleRate, n = Math.floor(7 * sr);
    const d = new Float32Array(n);
    const bumps = Array.from({ length: 7 }, (_, k) => [k === 0 ? 0.05 : rand(0.2, 4), rand(0.3, 1), rand(0.6, 2)]);
    let b = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      lp += (b - lp) * 0.08;
      let env = 0;
      for (const [t0, a, dec] of bumps) if (t > t0) env += a * Math.min(1, (t - t0) * 12) * Math.exp(-(t - t0) / dec);
      d[i] = lp * env;
    }
    return this.buffer(normalize(d, 0.9));
  }

  // maxDur > 0 cuts the sound off at that many seconds, with a short fade so it doesn't click.
  play(buf, pos, gain = 1, rate = 1, when = 0, maxDur = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.2;
      p.rolloffFactor = 1.4;
      p.maxDistance = 60;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    const t0 = when || ctx.currentTime;
    src.start(t0);
    if (maxDur > 0 && buf.duration / rate > maxDur) {
      const fade = 0.12;
      g.gain.setValueAtTime(gain, t0 + maxDur - fade);
      g.gain.linearRampToValueAtTime(0.0001, t0 + maxDur);
      src.stop(t0 + maxDur);
    }
  }

  // Recorded sounds are embedded in the page as base64 by build.py.
  decode(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return this.ctx.decodeAudioData(bytes.buffer);
  }

  loadDoorClips() {
    this.doorClips = [];
    this.lastDoorClip = -1;
    const data = (window.HOTEL_SOUNDS && window.HOTEL_SOUNDS.doors) || [];
    for (const b64 of data) this.decode(b64).then((buf) => this.doorClips.push(buf)).catch(() => {});
  }

  // Background music, and the Wraith's own sounds.
  loadNamedClips() {
    this.clips = {};
    const data = window.HOTEL_SOUNDS || {};
    for (const name of ['music', 'presence', 'seen', 'catch']) {
      if (!data[name]) continue;
      this.decode(data[name]).then((buf) => {
        this.clips[name] = buf;
        if (name === 'catch') this.catchStart = screamOnset(buf);
        if (name === 'music') this.startMusic(buf);
        if (name === 'presence') this.startPresence(buf);
      }).catch(() => {});
    }
  }

  startMusic(buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // the recording itself is very quiet, so bring its loudest point up to full scale first
    this.musicNorm = 0.9 / Math.max(0.01, peakOf(buf));
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = (this.musicLevel ?? MUSIC_PLAYING) * this.musicNorm;
    src.connect(this.musicGain);
    this.musicGain.connect(this.direct);
    src.start();
  }

  // Quieter while the game is paused, full level while playing.
  setMusicPlaying(playing) {
    this.musicLevel = playing ? MUSIC_PLAYING : MUSIC_PAUSED;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(this.musicLevel * this.musicNorm, this.ctx.currentTime, 0.4);
  }

  // Each Wraith's sound loops forever at its position; it fades to silence with distance,
  // so it is only heard when the creature is close. Voices can be added before the sound has loaded.
  addPresence() {
    const voice = { src: null, panner: null, gain: null, audible: true };
    (this.presences = this.presences || []).push(voice);
    if (this.clips && this.clips.presence) this.startPresenceVoice(voice, this.clips.presence);
    return voice;
  }

  removePresence(voice) {
    if (!voice) return;
    if (voice.src) { voice.src.stop(); voice.panner.disconnect(); }
    this.presences = (this.presences || []).filter((v) => v !== voice);
  }

  startPresence(buf) {
    for (const v of this.presences || []) if (!v.src) this.startPresenceVoice(v, buf);
  }

  startPresenceVoice(voice, buf) {
    const src = voice.src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const p = voice.panner = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'linear';
    p.refDistance = 1.5;
    p.maxDistance = PRESENCE_RANGE;
    p.rolloffFactor = 1;
    const g = voice.gain = this.ctx.createGain();
    g.gain.value = voice.audible ? 1.0 : 0;
    src.connect(g);
    g.connect(p);
    p.connect(this.master);
    // start each voice at a different point in the loop so several Wraiths don't sound in unison
    src.start(0, Math.random() * buf.duration);
  }

  // Silences a Wraith's sound (with a short fade) while it is on a different floor from the player.
  setPresenceAudible(voice, audible) {
    if (!voice || voice.audible === audible) return;
    voice.audible = audible;
    if (voice.gain) voice.gain.gain.setTargetAtTime(audible ? 1 : 0, this.ctx.currentTime, 0.15);
  }

  setPresencePosition(voice, pos) {
    const p = voice && voice.panner;
    if (!p) return;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
  }

  seenByWraith() { if (this.ready && this.clips.seen) this.play(this.clips.seen, null, 0.9); }
  // starts right at the scream, skipping the quiet lead-in of the recording
  caught() {
    if (!this.ready || !this.clips.catch) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.clips.catch;
    const g = this.ctx.createGain();
    g.gain.value = CATCH_GAIN;
    src.connect(g);
    g.connect(this.direct);
    src.start(0, this.catchStart || 0);
  }

  // A random recorded creak (never the same one twice in a row); synthesized if none are available.
  door(pos) { if (!this.ready) return;
    const n = this.doorClips ? this.doorClips.length : 0;
    if (!n) { this.creak(pos); return; }
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.lastDoorClip) i = (i + 1) % n;
    this.lastDoorClip = i;
    this.play(this.doorClips[i], pos, 1.0, 1, 0, 1.0); // ends exactly when the door stops moving
  }

  creak(pos) { if (!this.ready) return; this.play(this.creaks[Math.floor(Math.random() * this.creaks.length)], pos, 0.9, rand(0.85, 1.1)); }
  thud(pos) { if (!this.ready) return; this.play(this.thudBuf, pos, 0.8, rand(0.9, 1.1)); }
  rattle(pos) { if (!this.ready) return; this.play(this.rattleBuf, pos, 0.8, rand(0.95, 1.05)); }
  thunder() { if (!this.ready) return; this.play(this.thunderBuf, null, 0.75, rand(0.8, 1.05)); }
  drawer(pos) { if (!this.ready) return; this.play(this.drawerBufs[Math.floor(Math.random() * this.drawerBufs.length)], pos, 0.8, rand(0.9, 1.1)); }

  // A wooden drawer sliding: a short scraping burst through a few woody resonances, ending in a soft knock.
  makeDrawer() {
    const sr = this.ctx.sampleRate, n = Math.floor(0.34 * sr);
    const exc = new Float32Array(n);
    const ph = rand(0, 6);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.2)), 0.7) * (0.6 + 0.4 * Math.sin(t * 45 + ph));
      exc[i] = (Math.random() - 0.5) * env * (Math.random() < 0.015 ? 5 : 1);
    }
    const stop = Math.floor(0.8 * n);
    for (let i = 0; i < 200 && stop + i < n; i++) exc[stop + i] += (Math.random() - 0.5) * 6 * (1 - i / 200);
    const out = resonate(exc, sr, [[rand(170, 230), 60, 1], [rand(460, 580), 110, 0.6], [rand(1150, 1450), 260, 0.3]]);
    return this.buffer(normalize(highpass(out, sr, 80), 0.75));
  }

  footstep(surface, gain) {
    if (!this.ready) return;
    const set = this.steps[surface] || this.steps.wood;
    this.play(set[Math.floor(Math.random() * set.length)], null, gain, rand(0.9, 1.1));
    if (surface === 'wood' && Math.random() < 0.12) {
      this.play(this.boardCreaks[Math.floor(Math.random() * this.boardCreaks.length)], null, gain * 0.35, rand(0.8, 1.1));
    }
  }

  update(camera, dir) {
    if (!this.ready) return;
    const ctx = this.ctx, L = ctx.listener, p = camera.position;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = dir.x; L.forwardY.value = dir.y; L.forwardZ.value = dir.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(dir.x, dir.y, dir.z, 0, 1, 0);
    }
    // Grandfather clock in the hall.
    while (this.nextTick < ctx.currentTime + 0.15) {
      this.play(this.tickFlip ? this.tockBuf : this.tickBuf, this.clockPos, 0.25, 1, this.nextTick);
      this.tickFlip = !this.tickFlip;
      this.nextTick += 1;
    }
    // The house settling: distant creaks and knocks somewhere else in the building.
    if (ctx.currentTime > this.nextAmbient) {
      const b = this.bounds;
      const pos = { x: rand(b.x0, b.x1), y: rand(0.5, 3), z: rand(b.z0, b.z1) };
      const r = Math.random();
      if (r < 0.55) this.play(this.creaks[Math.floor(Math.random() * this.creaks.length)], pos, 0.45, rand(0.55, 0.8));
      else if (r < 0.85) this.play(this.thudBuf, pos, 0.5, rand(0.6, 0.9));
      else this.play(this.boardCreaks[0], pos, 0.5, rand(0.7, 0.9));
      this.nextAmbient = ctx.currentTime + rand(12, 35);
    }
  }
}
