// РЫБАЦКОЕ: ПОСЛЕДНИЙ МАРШРУТ — точка входа
import * as THREE from 'three';
import { buildWorld, addLandmarks } from './world.js';
import { buildMetro } from './metro.js';
import { Player } from './player.js';
import { LampPool, Rain, GameAudio } from './fx.js';
import { Game, Listener, Angel } from './game.js';

const params = new URLSearchParams(location.search);
const SHOT_MODE = params.has('shot'); // режим скриншота без pointer lock

const ui = {
  overlay: document.getElementById('ui'),
  status: document.getElementById('status'),
  hint: document.getElementById('hint'),
  intro: document.getElementById('intro'),
  introText: document.getElementById('introtext'),
  paper: document.getElementById('paper'),
  endscreen: document.getElementById('endscreen'),
  flash: document.getElementById('flash'),
  flicker: document.getElementById('flicker'),
  objective: document.getElementById('objective'),
  clock: document.getElementById('clock'),
  toast: document.getElementById('toast'),
  street: document.getElementById('streetname'),
  marker: document.getElementById('marker'),
  fade: document.getElementById('fade'),
  noise: document.getElementById('noise'),
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x11151d, 0.0105);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1500);

scene.add(new THREE.AmbientLight(0x3a4866, 1.5));
const moon = new THREE.DirectionalLight(0x55688f, 1.1);
moon.position.set(-300, 500, -200);
scene.add(moon);

let player = null, lampPool = null, rain = null, game = null, namedRoadPts = [];
const audio = new GameAudio();

const INTRO_MSG = (addr) =>
  `«...я знаю, что ты это услышишь. Я в Рыбацком.\n` +
  `Только это... не Рыбацкое. Здесь никого нет. Вообще никого.\n\n` +
  `Я всё оставил у себя в квартире. ${addr}. Дверь открыта.\n\n` +
  `И если ты всё-таки приедешь — запомни одно.\n` +
  `НЕ ДОВЕРЯЙ МЕТРО ПОСЛЕ ПОЛУНОЧИ.»`;

async function boot() {
  ui.status.textContent = 'ЗАГРУЗКА КАРТЫ РАЙОНА…';
  const map = await (await fetch('./data/map.json')).json();
  ui.status.textContent = 'ПОСТРОЙКА РАЙОНА…';
  await new Promise(r => setTimeout(r, 30));
  const world = buildWorld(scene, map);
  const landmarks = addLandmarks(scene, map);
  console.log('WORLD: lamps=' + world.lampPositions.length + ' plaques=' + landmarks.plaques.length +
    ' friend=' + (landmarks.friend ? landmarks.friend.address : 'нет'));

  // спавн: ближайшая к метро точка дороги
  let best = null, bestD = 1e18;
  for (const r of map.roads) {
    if (r.c === 'primary') continue;
    for (const [x, z] of r.p) {
      const d = x * x + z * z;
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
  }
  const spawn = best ? { x: best[0], z: best[1] } : { x: map.spawn.x + 15, z: map.spawn.z + 15 };
  spawn.yaw = Math.atan2(spawn.x - map.spawn.x, spawn.z - map.spawn.z) + Math.PI;
  const metroIn = buildMetro(scene, map, spawn);
  player = new Player(camera, scene, world.colliderEdges, map.bounds, spawn);
  player.frozen = true; // отпустит интро
  player.addEdges(metroIn.edges);
  player.blockers = metroIn.blockers;
  lampPool = new LampPool(scene, world.lampPositions);
  rain = new Rain(scene);
  game = new Game({ scene, camera, player, map, landmarks, metro: metroIn, audio, ui });

  for (const r of map.roads) {
    if (!r.n) continue;
    for (const [x, z] of r.p) namedRoadPts.push([x, z, r.n]);
  }

  ui.status.textContent = '';
  ui.hint.style.opacity = 1;

  if (SHOT_MODE) {
    ui.overlay.style.display = 'none';
    player.enabled = false;
    player.frozen = true;
    player.pos.x = parseFloat(params.get('x') ?? spawn.x);
    player.pos.z = parseFloat(params.get('z') ?? spawn.z);
    player.yaw = parseFloat(params.get('ry') ?? spawn.yaw);
    player.pitch = parseFloat(params.get('rp') ?? 0);
    player.torchOn = params.has('torch');
    if (params.has('listener')) { // дебаг: Слушатель в кадре
      const l = new Listener(scene);
      const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw);
      l.place(player.pos.x + dx * 10, player.pos.z + dz * 10);
      l.group.rotation.y = player.yaw + Math.PI;
    }
    if (params.has('angel')) { // дебаг: Пустой-ангел в кадре
      const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw);
      new Angel(scene, player.pos.x + dx * 8, player.pos.z + dz * 8);
    }
    if (params.has('platform')) { // дебаг: платформа метро
      const s = metroIn.platformSpawn;
      if (!params.has('x')) { // явные координаты важнее
        player.pos.set(s.x, 1.7, s.z);
        player.yaw = parseFloat(params.get('ry') ?? s.yaw);
      }
      scene.fog.density = 0.004;
    }
    if (params.has('beam')) { // дебаг: фаза побега с маяком
      game.state = 'note';
      game.closeNote();
    } else {
      game.state = 'shot';
    }
  }
}

// --- pointer lock ---
function lock() {
  const el = renderer.domElement;
  // unadjustedMovement лечит дёргание/замирание мыши в Chrome на Windows
  const p = el.requestPointerLock({ unadjustedMovement: true });
  if (p && p.catch) p.catch(() => el.requestPointerLock());
}
// единая обработка кликов: при pointer lock события уходят в canvas,
// поэтому маршрутизируем сами по видимому оверлею
function uiClick() {
  if (!player || SHOT_MODE || !game) return;
  if (ui.flash.style.display === 'flex') return; // скример не пропускается
  if (ui.endscreen.style.display === 'flex') { location.reload(); return; }
  if (ui.paper.style.display === 'flex') { game.closeNote(); return; }
  if (ui.intro.style.display === 'flex') { introAdvance(); return; }
  if (ui.overlay.style.display !== 'none') { // титул или пауза
    audio.start();
    lock();
    if (game.state === 'title') {
      ui.overlay.style.display = 'none';
      showIntro();
    }
    return;
  }
  if (!player.enabled && game.state !== 'end') lock(); // потеряли мышь — вернуть
}
document.addEventListener('mousedown', uiClick);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' || e.code === 'Enter') uiClick();
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (player) player.enabled = locked;
  const paused = game && (game.state === 'walk1' || game.state === 'phase2' || game.state === 'platform');
  if (!locked && paused) {
    ui.overlay.style.display = 'flex'; // пауза
  } else if (locked) {
    ui.overlay.style.display = 'none';
  }
});

// --- интро-сообщение с печатью текста ---
let typing = null;
function showIntro() {
  if (!game.friend) { game.begin(); return; }
  const full = INTRO_MSG(game.friend.address);
  ui.intro.style.display = 'flex';
  let i = 0;
  ui.introText.textContent = '';
  typing = setInterval(() => {
    i += 1;
    ui.introText.textContent = full.slice(0, i);
    if (i >= full.length) { clearInterval(typing); typing = null; }
  }, 28);
  ui.intro._full = full;
}
function introAdvance() {
  if (typing) { // первый клик — показать всё сразу
    clearInterval(typing); typing = null;
    ui.introText.textContent = ui.intro._full;
    return;
  }
  ui.intro.style.display = 'none';
  game.begin();
}

// --- табличка с названием улицы ---
let streetTimer = 0, lastStreet = '';
function updateStreet(dt) {
  streetTimer -= dt;
  if (streetTimer > 0 || !player) return;
  streetTimer = 0.8;
  let best = '', bestD = 26 * 26;
  const px = player.pos.x, pz = player.pos.z;
  for (const [x, z, n] of namedRoadPts) {
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < bestD) { bestD = d; best = n; }
  }
  if (best && best !== lastStreet) {
    lastStreet = best;
    ui.street.textContent = best;
    ui.street.style.opacity = 0.85;
    clearTimeout(ui.street._t);
    ui.street._t = setTimeout(() => { ui.street.style.opacity = 0; }, 4000);
  } else if (!best) lastStreet = '';
}

// --- цикл ---
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (player) {
    player.update(dt);
    if (SHOT_MODE && params.has('py')) camera.position.y = parseFloat(params.get('py'));
    lampPool.update(player.pos.x, player.pos.z, dt, t);
    rain.mesh.visible = !game || game.state !== 'platform'; // под землёй дождя нет
    if (rain.mesh.visible) rain.update(camera, dt);
    updateStreet(dt);
    if (game) game.update(dt);
  }
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

boot().catch(e => { ui.status.textContent = 'ОШИБКА: ' + e.message; console.error(e); });
loop();
