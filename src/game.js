// Сюжет «Последнего маршрута»: квест, Слушатель 2.0, Пустые, метро, концовки
import * as THREE from 'three';

// ---------- Пустой (фаза 1): силуэт, исчезающий от взгляда ----------
class Empty {
  constructor(scene, x, z) {
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.15, 4, 8), mat);
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
    head.position.y = 1.88;
    this.group.add(body, head);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.scene = scene;
    this.alive = true;
    this.lookT = 0;
  }
  update(dt, player, camera, onVanish) {
    if (!this.alive) return;
    const dx = this.group.position.x - player.pos.x;
    const dz = this.group.position.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 90) return;
    this.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
    if (dist < 10) { this.vanish(onVanish); return; }
    const camDir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const toIt = new THREE.Vector3(dx, 0, dz).normalize();
    if (camDir.dot(toIt) > 0.955) {
      this.lookT += dt;
      if (this.lookT > 1.1) this.vanish(onVanish);
    } else this.lookT = Math.max(0, this.lookT - dt);
  }
  vanish(onVanish) {
    this.alive = false;
    this.scene.remove(this.group);
    if (onVanish) onVanish();
  }
  remove() { this.scene.remove(this.group); }
}

// ---------- Пустой-ангел (фаза 2): идёт, пока не смотришь, крадёт время ----------
export class Angel {
  constructor(scene, x, z) {
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x060708, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.5, 4, 8), mat);
    body.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat);
    head.position.y = 2.2;
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.0, 3, 6), mat);
      arm.position.set(0.34 * s, 1.35, 0);
      arm.rotation.z = 0.12 * s;
      this.group.add(arm);
    }
    this.group.add(body, head);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.scene = scene;
    this.swayT = Math.random() * 9;
  }
  update(dt, player, camera) {
    const p = this.group.position;
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 160) return null;
    this.group.rotation.y = Math.atan2(dx, dz);
    const camDir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const toIt = new THREE.Vector3(-dx, 0, -dz).normalize();
    const seen = camDir.dot(toIt) > 0.45; // в поле зрения — замирает
    if (seen) {
      this.swayT += dt;
      this.group.rotation.y += Math.sin(this.swayT * 1.7) * 0.012;
      return null;
    }
    if (dist < 2.2) return 'strike';
    const speed = dist > 45 ? 3.4 : 2.5;
    p.x += dx / dist * speed * dt;
    p.z += dz / dist * speed * dt;
    return null;
  }
  place(x, z) { this.group.position.set(x, 0, z); }
  remove() { this.scene.remove(this.group); }
}

// ---------- Слушатель 2.0: состояния, прислушивание, рывки ----------
export class Listener {
  constructor(scene) {
    this.group = new THREE.Group();
    // не чисто чёрный: холодный отлив, чтобы силуэт читался в тумане
    const mat = new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.85, emissive: 0x1b2335, emissiveIntensity: 0.7 });
    const bodyParts = [];
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.7, 4, 8), mat);
    torso.position.y = 1.85;
    bodyParts.push(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat);
    head.position.y = 3.05;
    this.head = head;
    bodyParts.push(head);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.45, 3, 6), mat);
      arm.position.set(0.42 * s, 1.8, 0);
      arm.rotation.z = 0.18 * s;
      this.group.add(arm);
      bodyParts.push(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 1.0, 3, 6), mat);
      leg.position.set(0.18 * s, 0.62, 0);
      this.group.add(leg);
      bodyParts.push(leg);
    }
    // бледный контур-оболочка: силуэт виден даже в полной темноте
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x27344f, side: THREE.BackSide });
    for (const m of bodyParts) {
      const hull = new THREE.Mesh(m.geometry, rimMat);
      hull.position.copy(m.position);
      hull.rotation.copy(m.rotation);
      hull.scale.setScalar(1.12);
      this.group.add(hull);
    }
    const earMat = new THREE.MeshBasicMaterial({ color: 0xe8f1ff });
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), earMat);
      ear.position.set(0.22 * s, 3.06, 0);
      this.group.add(ear);
    }
    // холодный ореол над головой — виден сквозь туман издалека
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const hctx = hc.getContext('2d');
    const hg = hctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    hg.addColorStop(0, 'rgba(170,195,235,0.8)');
    hg.addColorStop(1, 'rgba(170,195,235,0)');
    hctx.fillStyle = hg; hctx.fillRect(0, 0, 64, 64);
    const haloTex = new THREE.CanvasTexture(hc);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(2.2, 2.2, 1);
    halo.position.y = 3.05;
    this.group.add(halo);
    this.group.add(torso, head);
    scene.add(this.group);
    this.scene = scene;
    this.state = 'idle';
    this.target = new THREE.Vector2();
    this.stepT = 0;
    this.stateT = 0;
    this.idleT = 0;
    this.clickT = 0;
    this.twitchT = 0;
    this.targetT = 0; // снапшот цели при ходьбе игрока
    this.deafT = 0;   // глухота после смерти игрока — передышка
    this.thudT = 0;
  }
  place(x, z) { this.group.position.set(x, 0, z); }
  setState(s, t = 0) { this.state = s; this.stateT = t; }

  update(dt, player, audio, pan) {
    const p = this.group.position;
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    const noise = player.noise;
    this.deafT = Math.max(0, this.deafT - dt);
    this.targetT = Math.max(0, this.targetT - dt);

    // слух: бег слышно издалека, шаг — только рядом, на корточках — никак
    const hearR = noise >= 1 ? 240 : noise > 0 ? 45 : 0;
    if (this.deafT <= 0 && hearR > 0 && dist < hearR) {
      if (noise >= 1 || dist < 20) {
        // бег или совсем рядом — ведёт точно
        this.target.set(player.pos.x, player.pos.z);
        if (noise >= 1 && dist < 70 && this.state !== 'lunge') {
          this.setState('lunge', 6);
          audio.screech();
        } else if (this.state !== 'lunge') this.setState('investigate');
      } else if (this.targetT <= 0) {
        // шаг: идёт на МЕСТО звука, а не на тебя — можно уйти вбок
        this.target.set(player.pos.x, player.pos.z);
        this.targetT = 5;
        if (this.state !== 'lunge') this.setState('investigate');
      }
    }

    let speed = 0;
    if (this.state === 'idle') {
      // кружит в тумане неподалёку — присутствие, а не конвой
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 5 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2, r = 75 + Math.random() * 45;
        this.target.set(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r);
      }
      speed = 1.2;
    } else if (this.state === 'investigate') {
      // медленнее шага игрока: уйти можно, если не топтаться на месте
      speed = dist > 200 ? 6.0 : 3.4;
    } else if (this.state === 'lunge') {
      speed = 8.3;
      if (noise >= 1) this.target.set(player.pos.x, player.pos.z);
      this.stateT -= dt;
      if (this.stateT <= 0) this.setState('investigate');
    } else if (this.state === 'pause') {
      // прислушивается: медленно вращается
      this.group.rotation.y += dt * 0.7;
      this.stateT -= dt;
      if (this.stateT <= 0) {
        const a = Math.random() * Math.PI * 2;
        this.target.set(p.x + Math.cos(a) * 70, p.z + Math.sin(a) * 70);
        this.setState('retreat');
      }
    } else if (this.state === 'retreat') {
      speed = 2.0;
    }

    if (speed > 0) {
      const tx = this.target.x - p.x, tz = this.target.y - p.z;
      const td = Math.hypot(tx, tz);
      if (td > 1.2) {
        p.x += tx / td * speed * dt;
        p.z += tz / td * speed * dt;
        this.group.rotation.y = Math.atan2(tx, tz);
        this.stepT += dt * speed * (this.state === 'lunge' ? 3.2 : 2.4);
        this.group.position.y = Math.abs(Math.sin(this.stepT)) * (this.state === 'lunge' ? 0.16 : 0.09);
        this.group.rotation.z = Math.sin(this.stepT) * (this.state === 'lunge' ? 0.1 : 0.05);
      } else {
        if (this.state === 'investigate' || this.state === 'lunge') this.setState('pause', 2.5 + Math.random() * 2);
        else if (this.state === 'retreat') this.setState('idle');
      }
    }

    // дёргается
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = 0.7 + Math.random() * 2.2;
      this.group.rotation.y += (Math.random() - 0.5) * 0.5;
      this.head.position.x = (Math.random() - 0.5) * 0.12;
    }
    // щёлкает в темноте — чем ближе, тем чаще, и слышно, С КАКОЙ СТОРОНЫ
    this.clickT -= dt;
    if (dist < 70 && this.clickT <= 0) {
      this.clickT = 0.8 + (dist / 70) * 1.8;
      audio.clicks(pan);
    }
    // тяжёлые шаги, когда он близко и движется
    this.thudT -= dt;
    if (dist < 45 && speed > 0 && this.thudT <= 0) {
      this.thudT = speed > 5 ? 0.34 : 0.66;
      audio.thud(pan, Math.min(1, (45 - dist) / 35));
    }
    return dist;
  }
  remove() { this.scene.remove(this.group); }
}

// ---------- игра ----------
const ENDINGS = {
  good: {
    h: 'ПОСЛЕДНИЙ МАРШРУТ',
    p: 'Двери закрылись. Поезд тронулся.<br>Все пропавшие сидели молча. Никто не смотрел на тебя.<br>На схеме осталась одна станция.<br><br>Ты успел. Но Дима остался там.<br><br>ХОРОШАЯ КОНЦОВКА&nbsp;&nbsp;·&nbsp;&nbsp;НАЖМИ, ЧТОБЫ ВЕРНУТЬСЯ',
  },
  mid: {
    h: 'ПОЧТИ ДОМА',
    p: 'Поезд вёз тебя сквозь темноту.<br>В чёрном стекле напротив ты увидел своё отражение.<br>Оно улыбалось. Ты — нет.<br><br>Оно услышало тебя там, в районе. И запомнило.<br><br>СРЕДНЯЯ КОНЦОВКА&nbsp;&nbsp;·&nbsp;&nbsp;НАЖМИ, ЧТОБЫ ВЕРНУТЬСЯ',
  },
  bad: {
    h: 'ПОЕЗД УШЁЛ',
    p: 'Полночь. Огни станции погасли один за другим.<br>Ты больше не слышишь собственных шагов.<br>Пустые не шумят.<br><br>Теперь ты дома.<br><br>ПЛОХАЯ КОНЦОВКА&nbsp;&nbsp;·&nbsp;&nbsp;НАЖМИ, ЧТОБЫ ВЕРНУТЬСЯ',
  },
};

export class Game {
  constructor({ scene, camera, player, map, landmarks, metro, audio, ui }) {
    this.scene = scene; this.camera = camera; this.player = player;
    this.map = map; this.audio = audio; this.ui = ui; this.metroIn = metro;
    this.plaques = landmarks.plaques;
    this.friend = landmarks.friend;
    this.metro = { x: map.spawn.x, z: map.spawn.z };
    this.state = 'title';
    this.clockMin = 23 * 60 + 40;
    this.listener = null;
    this.empties = [];
    this.angels = [];
    this.killed = 0;
    this.plaqueT = 0;
    this.toastQueue = [];
    this.toastT = 0;
    this.stingerT = 30;
    this.gateToastDone = false;
    this.angelToastDone = false;
    this.endingDone = false;

    player.onStep = (running) => audio.footstep(running);

    if (this.friend) {
      for (const t of [0.45, 0.72]) {
        const x = map.spawn.x + (this.friend.x - map.spawn.x) * t;
        const z = map.spawn.z + (this.friend.z - map.spawn.z) * t;
        const v = this.snapToRoad(x, z);
        this.empties.push(new Empty(scene, v[0], v[1]));
      }
    }
  }

  // указатель «М» на краю экрана
  updateMarker() {
    const v = new THREE.Vector3(this.metro.x, 10, this.metro.z).project(this.camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -1; }
    x = Math.max(-0.92, Math.min(0.92, x));
    y = Math.max(-0.85, Math.min(0.85, y));
    const el = this.ui.marker;
    el.style.left = ((x * 0.5 + 0.5) * innerWidth - 15) + 'px';
    el.style.top = ((-y * 0.5 + 0.5) * innerHeight - 15) + 'px';
    const offCenter = behind ? 1 : Math.min(1, Math.hypot(v.x, v.y));
    el.style.opacity = 0.25 + 0.5 * offCenter;
  }

  snapToRoad(x, z) {
    let best = [x, z], bd = 1e18;
    for (const r of this.map.roads) {
      if (r.c === 'path') continue;
      for (const [px, pz] of r.p) {
        const d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bd) { bd = d; best = [px, pz]; }
      }
    }
    return best;
  }

  toast(text, dur = 4.5) { this.toastQueue.push([text, dur]); }

  setObjective(text) {
    this.ui.objective.innerHTML = text;
    this.ui.objective.style.opacity = 1;
  }

  flickerScreen() {
    this.ui.flicker.style.animation = 'none';
    void this.ui.flicker.offsetWidth;
    this.ui.flicker.style.animation = 'flicker 0.7s';
  }

  begin() {
    this.state = 'walk1';
    this.player.frozen = false;
    const addr = this.friend ? this.friend.address : 'Тепловозная улица';
    this.setObjective('НАЙДИ КВАРТИРУ ДИМЫ<br><span class="sub">' + addr + ' — ищи по синим табличкам на домах</span>');
    this.toast('F — фонарик, Shift — бег, Ctrl — красться');
    this.toast('Синие таблички на домах подскажут адрес', 6);
    if (addr.includes('Прибрежная')) this.toast('Прибрежная улица тянется вдоль Невы', 6);
    this.hintT = 0;
  }

  onKill() {
    this.killed++;
    this.clockMin += 2;
    this.audio.jumpscare();
    this.ui.flash.style.display = 'flex';
    this.player.frozen = true;
    setTimeout(() => {
      this.ui.flash.style.display = 'none';
      this.player.frozen = false;
      this.player.pos.set(this.friend.doorX, 1.7, this.friend.doorZ);
      this.player.vel.set(0, 0, 0);
      const dx = this.metro.x - this.friend.x, dz = this.metro.z - this.friend.z;
      const d = Math.hypot(dx, dz);
      this.listener.place(this.friend.x + dx / d * 150, this.friend.z + dz / d * 150);
      this.listener.setState('idle');
      this.listener.deafT = 10; // передышка после смерти
      this.toast('Минус две минуты. Слушай щелчки: это он. Замри или крадись (Ctrl).', 7);
    }, 2200);
  }

  ending(type) {
    if (this.endingDone) return;
    this.endingDone = true;
    this.state = 'end';
    this.player.frozen = true;
    this.audio.setDrone(0);
    if (this.listener) this.listener.remove();
    for (const a of this.angels) a.remove();
    this.ui.marker.style.display = 'none';
    this.ui.noise.style.opacity = 0;
    if (type === 'bad') this.audio.steal(); else { this.audio.doorHiss(); this.audio.setRumble(1); }
    this.ui.fade.style.opacity = 1;
    setTimeout(() => {
      this.audio.setRumble(0);
      const e = ENDINGS[type];
      this.ui.endscreen.querySelector('h1').textContent = e.h;
      this.ui.endscreen.querySelector('p').innerHTML = e.p;
      this.ui.endscreen.style.display = 'flex';
      this.ui.fade.style.opacity = 0;
      document.exitPointerLock();
    }, 2400);
  }

  enterPlatform() {
    this.state = 'fadeDown';
    this.player.frozen = true;
    this.ui.fade.style.opacity = 1;
    this.audio.doorHiss();
    setTimeout(() => {
      const s = this.metroIn.platformSpawn;
      this.player.pos.set(s.x, 1.7, s.z);
      this.player.vel.set(0, 0, 0);
      this.player.yaw = s.yaw;
      this.scene.fog.density = 0.004;
      if (this.listener) { this.listener.remove(); this.listener = null; }
      for (const a of this.angels) a.remove();
      this.angels = [];
      this.ui.marker.style.display = 'none';
      this.ui.noise.style.opacity = 0;
      this.audio.setDrone(0);
      this.audio.setRumble(0.5);
      this.setObjective('ПОСЛЕДНИЙ ПОЕЗД ЖДЁТ<br><span class="sub">Сядь в вагон</span>');
      this.ui.fade.style.opacity = 0;
      this.player.frozen = false;
      this.state = 'platform';
    }, 1600);
  }

  update(dt) {
    // таблички: только ближние
    this.plaqueT -= dt;
    if (this.plaqueT <= 0) {
      this.plaqueT = 0.5;
      const px = this.player.pos.x, pz = this.player.pos.z;
      for (const m of this.plaques) {
        const dx = m.position.x - px, dz = m.position.z - pz;
        m.visible = dx * dx + dz * dz < 130 * 130;
      }
    }
    // тосты
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.ui.toast.style.opacity = 0;
    } else if (this.toastQueue.length) {
      const [text, dur] = this.toastQueue.shift();
      this.ui.toast.textContent = text;
      this.ui.toast.style.opacity = 1;
      this.toastT = dur;
    }
    // случайные жуткие звуки
    if (this.state === 'walk1' || this.state === 'phase2') {
      this.stingerT -= dt;
      if (this.stingerT <= 0) {
        this.stingerT = (this.state === 'phase2' ? 18 : 30) + Math.random() * 35;
        this.audio.stinger(this.state === 'phase2');
      }
    }
    // Пустые фазы 1
    for (const e of this.empties) {
      e.update(dt, this.player, this.camera, () => { this.audio.whisper(); this.flickerScreen(); });
    }

    const distTo = (x, z) => Math.hypot(this.player.pos.x - x, this.player.pos.z - z);
    const t = this.metroIn.escTrigger;

    if (this.state === 'walk1' && this.friend) {
      this.hintT = (this.hintT || 0) + dt;
      if (this.hintT > 160) {
        this.hintT = -1e9;
        this.toast('Дом Димы — ' + this.friend.address + '. У его двери горит свет.', 7);
      }
      if (!this.gateToastDone && distTo(t.x, t.z) < 4) {
        this.gateToastDone = true;
        this.toast('Решётка опущена. Поезда — после полуночи. Странно.', 6);
      }
      if (distTo(this.friend.doorX, this.friend.doorZ) < 9) {
        this.state = 'note';
        this.player.frozen = true;
        this.audio.paper();
        this.ui.paper.style.display = 'flex';
      }
    } else if (this.state === 'phase2') {
      // часы: ~4 игровых минуты за реальную
      this.clockMin += dt * (4.0 / 60);
      const total = Math.min(this.clockMin, 24 * 60);
      const h = Math.floor(total / 60) % 24, mm = Math.floor(total % 60);
      this.ui.clock.textContent = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      if (this.clockMin >= 24 * 60) { this.ending('bad'); return; }

      // стереопозиция Слушателя: pan = проекция направления на «право» камеры
      const ldx = this.listener.group.position.x - this.player.pos.x;
      const ldz = this.listener.group.position.z - this.player.pos.z;
      const ld = Math.hypot(ldx, ldz) || 1;
      const pan = Math.max(-1, Math.min(1,
        (ldx * Math.cos(this.player.yaw) - ldz * Math.sin(this.player.yaw)) / ld));
      const dist = this.listener.update(dt, this.player, this.audio, pan);
      this.audio.setDrone(dist < 90 ? Math.min(1, (90 - dist) / 75) : 0, pan);
      // на корточках и без шума тебя надо буквально задеть
      const killR = this.player.crouching && this.player.noise === 0 ? 0.8 : 1.7;
      if (dist < killR) this.onKill();
      // первая близкая встреча — объяснить правило выживания прямо на экране
      if (!this.encounterToastDone && dist < 40) {
        this.encounterToastDone = true;
        this.toast('ОН НЕ ВИДИТ. Замри или присядь (Ctrl) — и он пройдёт мимо.', 8);
      }
      // индикатор шума
      const n = this.ui.noise;
      n.style.opacity = 0.85;
      if (this.player.crouching) { n.textContent = 'КРАДЁШЬСЯ'; n.style.color = '#7fa3d8'; }
      else if (this.player.noise >= 1) { n.textContent = 'БЕГ — ОН СЛЫШИТ'; n.style.color = '#c43a2e'; }
      else if (this.player.noise > 0) { n.textContent = 'ШАГ'; n.style.color = '#b59a55'; }
      else { n.textContent = 'ТИХО'; n.style.color = '#6a7280'; }

      // ангелы крадут время
      for (const a of this.angels) {
        if (a.update(dt, this.player, this.camera) === 'strike') {
          this.clockMin += 3;
          this.audio.steal();
          this.flickerScreen();
          const ang = Math.random() * Math.PI * 2;
          const v = this.snapToRoad(this.player.pos.x + Math.cos(ang) * 75, this.player.pos.z + Math.sin(ang) * 75);
          a.place(v[0], v[1]);
          if (!this.angelToastDone) {
            this.angelToastDone = true;
            this.toast('Оно украло три минуты. Не выпускай их из виду.', 6);
          }
        }
      }

      this.beamT += dt;
      if (this.beam) this.beam.material.opacity = 0.14 + 0.06 * Math.sin(this.beamT * 1.8);
      const metroDist = distTo(this.metro.x, this.metro.z);
      this.audio.setRumble(metroDist < 160 ? (160 - metroDist) / 160 * 0.7 : 0);
      this.updateMarker();

      // вход на эскалатор
      if (distTo(t.x, t.z) < 2.2) this.enterPlatform();
    } else if (this.state === 'platform') {
      this.clockMin += dt * (4.0 / 60);
      const total = Math.min(this.clockMin, 24 * 60);
      const h = Math.floor(total / 60) % 24, mm = Math.floor(total % 60);
      this.ui.clock.textContent = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      if (this.clockMin >= 24 * 60) { this.ending('bad'); return; }
      // мигающая лампа в конце зала
      this.metroIn.flickLight.intensity = Math.random() < 0.08 ? 4 : 50;
      const z = this.metroIn.trainZone;
      const p = this.player.pos;
      if (p.x > z.minX && p.x < z.maxX && p.z > z.minZ && p.z < z.maxZ) {
        this.ending(this.killed > 0 ? 'mid' : 'good');
      }
    }
  }

  closeNote() {
    if (this.state !== 'note') return;
    this.state = 'phase2';
    this.player.frozen = false;
    this.ui.paper.style.display = 'none';
    this.setObjective('УСПЕЙ К МЕТРО ДО ПОЛУНОЧИ<br><span class="sub">Иди на столб света. Беги — и оно услышит. Ctrl — красться.</span>');
    this.ui.clock.style.opacity = 1;
    this.ui.marker.style.display = 'block';
    this.scene.fog.density = 0.013;
    this.metroIn.openGate();
    // маяк
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 110, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xbfd4ff, transparent: true, opacity: 0.17, fog: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.beam.position.set(this.metro.x, 55, this.metro.z);
    this.scene.add(this.beam);
    this.beamT = 0;
    // Слушатель за спиной
    this.listener = new Listener(this.scene);
    const dx = this.metro.x - this.player.pos.x, dz = this.metro.z - this.player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.listener.place(this.player.pos.x - dx / d * 90, this.player.pos.z - dz / d * 90);
    this.toast('Щелчки в темноте — это он. Иди шагом, а рядом — замри или крадись.', 8);
    // ангелы на обратном пути
    for (const tt of [0.35, 0.6]) {
      const mx = this.player.pos.x + (this.metro.x - this.player.pos.x) * tt;
      const mz = this.player.pos.z + (this.metro.z - this.player.pos.z) * tt;
      const v = this.snapToRoad(mx + (Math.random() - 0.5) * 60, mz + (Math.random() - 0.5) * 60);
      this.angels.push(new Angel(this.scene, v[0], v[1]));
    }
    this.audio.whisper();
  }
}
