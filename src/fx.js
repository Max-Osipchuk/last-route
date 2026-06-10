// Атмосфера: пул живых фонарей вокруг игрока, морось, ветер
import * as THREE from 'three';

// Из ~2-3 тыс. фонарей реальным светом горят только ближайшие к игроку
export class LampPool {
  constructor(scene, lampPositions, count = 7) {
    this.positions = lampPositions;
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xff9a45, 0, 34, 1.8);
      l.position.y = 7.0;
      scene.add(l);
      this.lights.push(l);
    }
    this.timer = 0;
    this.flickerIdx = -1;
    this.flickerT = 0;
  }
  update(px, pz, dt, time) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.4;
      const near = [];
      for (let i = 0; i < this.positions.length; i++) {
        const [x, z] = this.positions[i];
        const d = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (d < 110 * 110) near.push([d, x, z]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        if (i < near.length) {
          l.position.x = near[i][1]; l.position.z = near[i][2];
          l.intensity = 78;
        } else l.intensity = 0;
      }
      // изредка один фонарь начинает дёргаться
      if (this.flickerIdx < 0 && Math.random() < 0.13 && near.length > 1) {
        this.flickerIdx = 1 + ((Math.random() * Math.min(4, near.length - 1)) | 0);
        this.flickerT = 1.6 + Math.random() * 2.5;
      }
    }
    if (this.flickerIdx >= 0 && this.flickerIdx < this.lights.length) {
      const l = this.lights[this.flickerIdx];
      if (l.intensity > 0) {
        const n = Math.sin(time * 41) * Math.sin(time * 17.3) > 0.55 ? 0.1 : 1;
        l.intensity = 78 * n;
      }
      this.flickerT -= dt;
      if (this.flickerT <= 0) this.flickerIdx = -1;
    }
  }
}

// Мелкая морось вокруг камеры
export class Rain {
  constructor(scene, count = 1100) {
    this.count = count;
    this.r = 20;
    const pos = new Float32Array(count * 6);
    this.drops = [];
    for (let i = 0; i < count; i++) {
      this.drops.push([
        (Math.random() - 0.5) * this.r * 2,
        Math.random() * 18,
        (Math.random() - 0.5) * this.r * 2,
        7.5 + Math.random() * 4,
      ]);
    }
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(pos, 3);
    this.geo.setAttribute('position', this.attr);
    this.mesh = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({
      color: 0x55606e, transparent: true, opacity: 0.27,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(cam, dt) {
    const a = this.attr.array;
    for (let i = 0; i < this.count; i++) {
      const d = this.drops[i];
      d[1] -= d[3] * dt;
      d[0] += dt * 0.9; // лёгкий ветер
      if (d[1] < -2) { d[1] = 14 + Math.random() * 5; d[0] = (Math.random() - 0.5) * this.r * 2; d[2] = (Math.random() - 0.5) * this.r * 2; }
      const x = cam.position.x + d[0], y = cam.position.y + d[1] - 6, z = cam.position.z + d[2];
      a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z;
      a[i * 6 + 3] = x - 0.02; a[i * 6 + 4] = y - 0.32; a[i * 6 + 5] = z;
    }
    this.attr.needsUpdate = true;
  }
}

// Все звуки игры через WebAudio (запускается после клика)
export class GameAudio {
  start() {
    if (this.ctx) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      const len = ctx.sampleRate * 3;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { // коричневый шум
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 280; filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      // медленное дыхание ветра
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain).connect(gain.gain);
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.11;
      const lfo2Gain = ctx.createGain();
      lfo2Gain.gain.value = 90;
      lfo2.connect(lfo2Gain).connect(filter.frequency);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(); lfo.start(); lfo2.start();

      // гул метро — слышен при приближении к станции
      const rLen = ctx.sampleRate * 2;
      const rBuf = ctx.createBuffer(1, rLen, ctx.sampleRate);
      const rData = rBuf.getChannelData(0);
      let rl = 0;
      for (let i = 0; i < rLen; i++) {
        const w = Math.random() * 2 - 1;
        rl = (rl + 0.015 * w) / 1.015;
        rData[i] = rl * 3.5;
      }
      const rSrc = ctx.createBufferSource();
      rSrc.buffer = rBuf; rSrc.loop = true;
      const rFil = ctx.createBiquadFilter();
      rFil.type = 'lowpass'; rFil.frequency.value = 95; rFil.Q.value = 1.2;
      this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
      rSrc.connect(rFil).connect(this.rumbleGain).connect(ctx.destination);
      rSrc.start();

      // гул опасности (Слушатель рядом) — два расстроенных низких тона
      const d1 = ctx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 46;
      const d2 = ctx.createOscillator(); d2.type = 'sine'; d2.frequency.value = 49.5;
      this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
      d1.connect(this.droneGain); d2.connect(this.droneGain);
      this.droneGain.connect(ctx.destination);
      d1.start(); d2.start();
    } catch (e) { /* нет звука — не страшно */ }
  }

  _noiseBurst(dur, freq, type, vol, freqEnd) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = 1.1;
    f.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  footstep(running) {
    this._noiseBurst(0.09, 380 + Math.random() * 250, 'bandpass', running ? 0.16 : 0.07);
  }
  whisper() {
    this._noiseBurst(0.9, 2600, 'highpass', 0.10);
    this._noiseBurst(1.4, 1800, 'bandpass', 0.06);
  }
  paper() { this._noiseBurst(0.25, 1200, 'highpass', 0.12); }
  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(34, ctx.currentTime + 0.9);
    const g = ctx.createGain(); g.gain.value = 0.5;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 1.15);
    this._noiseBurst(0.7, 300, 'lowpass', 0.55, 60);
  }
  setDrone(level) { // 0..1 — близость Слушателя
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.25);
  }
  setRumble(level) { // 0..1 — близость метро
    if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(level * 0.3, this.ctx.currentTime, 0.4);
  }
  // визг Слушателя при рывке — резкий и противный
  screech() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(2100, ctx.currentTime + 0.28);
    o.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.55);
    const g = ctx.createGain(); g.gain.value = 0.22;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.65);
    this._noiseBurst(0.5, 2400, 'highpass', 0.18);
  }
  // эхолокационные щелчки Слушателя рядом
  clicks() {
    if (!this.ctx) return;
    const n = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      setTimeout(() => this._noiseBurst(0.035, 1500 + Math.random() * 700, 'bandpass', 0.12), i * (60 + Math.random() * 50));
    }
  }
  // крик Пустого, укравшего время
  steal() {
    this._noiseBurst(0.9, 3000, 'highpass', 0.3);
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.5);
    const g = ctx.createGain(); g.gain.value = 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
  }
  doorHiss() { this._noiseBurst(1.3, 1400, 'lowpass', 0.22, 300); }
  // случайные жуткие звуки района
  stinger(loud) {
    if (!this.ctx) return;
    const v = loud ? 1.6 : 1;
    const kind = Math.random();
    if (kind < 0.3) { // металлический лязг
      this._noiseBurst(0.4, 880, 'bandpass', 0.22 * v, 200);
      const o = this.ctx.createOscillator(); o.frequency.value = 620 + Math.random() * 300;
      const g = this.ctx.createGain(); g.gain.value = 0.07 * v;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
      o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.85);
    } else if (kind < 0.55) { // далёкий вой
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(420, this.ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 1.8);
      const g = this.ctx.createGain(); g.gain.value = 0.055 * v;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.0);
      o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 2.1);
    } else if (kind < 0.8) { // три глухих удара
      for (let i = 0; i < 3; i++) setTimeout(() => this._noiseBurst(0.1, 130, 'lowpass', 0.3 * v), i * 320);
    } else { // шёпот за спиной
      this.whisper();
    }
  }
}
