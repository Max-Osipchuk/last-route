// Игрок от первого лица: WASD + мышь, бег, коллизии со зданиями, фонарик
import * as THREE from 'three';

const EYE = 1.7, RADIUS = 0.35, CELL = 12;

export class Player {
  constructor(camera, scene, colliderEdges, bounds, spawn) {
    this.camera = camera;
    this.pos = new THREE.Vector3(spawn.x, EYE, spawn.z);
    this.vel = new THREE.Vector3();
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.keys = {};
    this.bobT = 0;
    this.bounds = bounds;
    this.noise = 0; // уровень шума игрока — пригодится Слушателю
    this.enabled = false;

    // spatial hash рёбер зданий
    this.edges = colliderEdges;
    this.hash = new Map();
    for (let i = 0; i < colliderEdges.length; i += 4) {
      const x1 = colliderEdges[i], z1 = colliderEdges[i + 1], x2 = colliderEdges[i + 2], z2 = colliderEdges[i + 3];
      const cx1 = Math.floor(Math.min(x1, x2) / CELL), cx2 = Math.floor(Math.max(x1, x2) / CELL);
      const cz1 = Math.floor(Math.min(z1, z2) / CELL), cz2 = Math.floor(Math.max(z1, z2) / CELL);
      for (let cx = cx1; cx <= cx2; cx++) for (let cz = cz1; cz <= cz2; cz++) {
        const key = cx + ',' + cz;
        let arr = this.hash.get(key);
        if (!arr) { arr = []; this.hash.set(key, arr); }
        arr.push(i);
      }
    }

    // фонарик
    this.torch = new THREE.SpotLight(0xfff1d6, 0, 65, 0.38, 0.6, 1.6);
    this.torch.position.copy(this.pos);
    this.torchTarget = new THREE.Object3D();
    this.torch.target = this.torchTarget;
    scene.add(this.torch, this.torchTarget);
    this.torchOn = true;
    this.torchDir = new THREE.Vector3(0, 0, -1);
    this.frozen = false;
    this.onStep = null;
    this.stepDist = 0;
    this.blockers = []; // переключаемые преграды (решётка метро)
    this.eyeY = EYE;
    this.crouching = false;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF' && this.enabled) this.torchOn = !this.torchOn;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      // фильтр скачков pointer lock в Chrome
      const mx = Math.abs(e.movementX) > 250 ? 0 : e.movementX;
      const my = Math.abs(e.movementY) > 250 ? 0 : e.movementY;
      this.yaw -= mx * 0.0022;
      this.pitch -= my * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    });
  }

  // добавить рёбра коллизий после постройки (интерьер метро)
  addEdges(edges) {
    const start = this.edges.length;
    this.edges = this.edges.concat(edges);
    for (let i = start; i < this.edges.length; i += 4) {
      const x1 = this.edges[i], z1 = this.edges[i + 1], x2 = this.edges[i + 2], z2 = this.edges[i + 3];
      const cx1 = Math.floor(Math.min(x1, x2) / CELL), cx2 = Math.floor(Math.max(x1, x2) / CELL);
      const cz1 = Math.floor(Math.min(z1, z2) / CELL), cz2 = Math.floor(Math.max(z1, z2) / CELL);
      for (let cx = cx1; cx <= cx2; cx++) for (let cz = cz1; cz <= cz2; cz++) {
        const key = cx + ',' + cz;
        let arr = this.hash.get(key);
        if (!arr) { arr = []; this.hash.set(key, arr); }
        arr.push(i);
      }
    }
  }

  collide() {
    const p = this.pos;
    for (let iter = 0; iter < 2; iter++) {
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const arr = this.hash.get((cx + ox) + ',' + (cz + oz));
        if (!arr) continue;
        for (const i of arr) {
          const x1 = this.edges[i], z1 = this.edges[i + 1], x2 = this.edges[i + 2], z2 = this.edges[i + 3];
          const dx = x2 - x1, dz = z2 - z1;
          const lenSq = dx * dx + dz * dz;
          if (lenSq < 1e-6) continue;
          let t = ((p.x - x1) * dx + (p.z - z1) * dz) / lenSq;
          t = Math.max(0, Math.min(1, t));
          const qx = x1 + dx * t, qz = z1 + dz * t;
          let ex = p.x - qx, ez = p.z - qz;
          const d = Math.hypot(ex, ez);
          if (d < RADIUS && d > 1e-5) {
            const push = (RADIUS - d) / d;
            p.x += ex * push; p.z += ez * push;
          }
        }
      }
    }
    for (const b of this.blockers) {
      if (!b.on) continue;
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-6) continue;
      let t = ((p.x - b.x1) * dx + (p.z - b.z1) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const qx = b.x1 + dx * t, qz = b.z1 + dz * t;
      const ex = p.x - qx, ez = p.z - qz;
      const d = Math.hypot(ex, ez);
      if (d < RADIUS && d > 1e-5) {
        const push = (RADIUS - d) / d;
        p.x += ex * push; p.z += ez * push;
      }
    }
    const B = this.bounds, PAD = 60;
    p.x = Math.max(B.minX - PAD, Math.min(B.maxX + PAD, p.x));
    p.z = Math.max(B.minZ - PAD, Math.min(B.maxZ + PAD, p.z));
  }

  update(dt) {
    const k = this.frozen ? {} : this.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    this.crouching = !!(k.ControlLeft || k.KeyC);
    const running = !this.crouching && !!(k.ShiftLeft || k.ShiftRight);
    const speed = this.crouching ? 1.7 : running ? 7.0 : 4.0;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = (-sin * fwd + cos * side), mz = (-cos * fwd - sin * side);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, dt * 9);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, dt * 9);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide();

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.noise = sp < 0.3 || this.crouching ? 0 : running ? 1 : 0.35;
    this.eyeY += ((this.crouching ? 1.12 : EYE) - this.eyeY) * Math.min(1, dt * 8);
    this.stepDist += sp * dt;
    const stepLen = running ? 2.9 : 2.2;
    if (this.stepDist > stepLen && sp > 0.5) {
      this.stepDist = 0;
      if (this.onStep) this.onStep(running);
    }
    this.bobT += sp * dt * 1.4;
    const bob = Math.sin(this.bobT * 2.1) * 0.032 * Math.min(1, sp / 4);

    this.camera.position.set(this.pos.x, this.eyeY + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // фонарик с лёгким запаздыванием
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    this.torchDir.lerp(dir, Math.min(1, dt * 11)).normalize();
    this.torch.position.copy(this.camera.position);
    this.torchTarget.position.copy(this.camera.position).addScaledVector(this.torchDir, 12);
    const want = this.torchOn ? 290 : 0;
    this.torch.intensity += (want - this.torch.intensity) * Math.min(1, dt * 14);
  }
}
