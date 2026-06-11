// Метро «Рыбацкое» внутри: вестибюль, платформа, поезд с финалом
import * as THREE from 'three';
import { MeshBuf, glowTex } from './world.js';

// Платформа строится в пустом юго-западном углу карты (внутри границ,
// иначе физика игрока прижмёт телепорт обратно) — попадаем туда «эскалатором»
const PX = -2000, PZ = -3700;

// ---------- процедурные текстуры метро ----------

function makeTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, w, h, n, lo, hi, alpha) {
  for (let i = 0; i < n; i++) {
    const v = lo + Math.random() * (hi - lo) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// Кафельная стена на всю высоту: v=0 низ (цоколь), v=1 верх (фриз)
function tileWallTex(opts) {
  const { base, joint, plinthH = 90, grime = 0.3 } = opts;
  return makeTex(512, 512, (ctx, w, h) => {
    // фриз сверху
    ctx.fillStyle = '#6f7368'; ctx.fillRect(0, 0, w, 30);
    // поле плитки
    const ty0 = 30, ty1 = h - plinthH;
    ctx.fillStyle = base; ctx.fillRect(0, ty0, w, ty1 - ty0);
    const cols = 8, rows = 7;
    const tw = w / cols, th = (ty1 - ty0) / rows;
    for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
      const dv = (Math.random() - 0.5) * 16;
      ctx.fillStyle = `rgba(${128 + dv | 0},${128 + dv | 0},${128 + dv | 0},0.18)`;
      ctx.fillRect(cI * tw, ty0 + r * th, tw, th);
      if (Math.random() < 0.05) { // потемневшая/треснувшая плитка
        ctx.fillStyle = 'rgba(60,64,58,0.35)';
        ctx.fillRect(cI * tw + 2, ty0 + r * th + 2, tw - 4, th - 4);
      }
    }
    // швы
    ctx.strokeStyle = joint; ctx.lineWidth = 2;
    for (let cI = 0; cI <= cols; cI++) { ctx.beginPath(); ctx.moveTo(cI * tw, ty0); ctx.lineTo(cI * tw, ty1); ctx.stroke(); }
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, ty0 + r * th); ctx.lineTo(w, ty0 + r * th); ctx.stroke(); }
    // потёки сверху
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * w;
      const g = ctx.createLinearGradient(0, ty0, 0, ty0 + 140);
      g.addColorStop(0, `rgba(38,42,38,${grime})`); g.addColorStop(1, 'rgba(38,42,38,0)');
      ctx.fillStyle = g; ctx.fillRect(x, ty0, 3 + Math.random() * 7, 140);
    }
    // цоколь — тёмный гранит, заляпанный у пола
    ctx.fillStyle = '#3c4046'; ctx.fillRect(0, ty1, w, plinthH);
    speckle(ctx, w, plinthH, 500, 30, 90, 0.5);
    const g = ctx.createLinearGradient(0, ty1, 0, h);
    g.addColorStop(0, 'rgba(20,22,20,0)'); g.addColorStop(1, `rgba(20,22,20,${grime + 0.15})`);
    ctx.fillStyle = g; ctx.fillRect(0, ty1, w, plinthH);
    ctx.save(); ctx.translate(0, ty1); speckle(ctx, w, plinthH, 600, 25, 80, 0.4); ctx.restore();
  });
}

// Гранитный пол: плиты ~1м с крошкой
function graniteTex() {
  return makeTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#56595f'; ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let cI = 0; cI < 4; cI++) {
      const dv = (Math.random() - 0.5) * 18;
      ctx.fillStyle = `rgba(${86 + dv | 0},${89 + dv | 0},${95 + dv | 0},0.7)`;
      ctx.fillRect(cI * 128, r * 128, 128, 128);
      if (Math.random() < 0.2) { // красноватая гранитная вставка
        ctx.fillStyle = 'rgba(96,64,58,0.45)';
        ctx.fillRect(cI * 128, r * 128, 128, 128);
      }
    }
    speckle(ctx, w, h, 5200, 30, 160, 0.25);
    ctx.strokeStyle = 'rgba(28,30,34,0.8)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
    }
    // мокрые пятна
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(20,22,26,0.3)';
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 25 + Math.random() * 50, 16 + Math.random() * 30, Math.random() * 3, 0, 7);
      ctx.fill();
    }
  });
}

// Светлый мрамор с прожилками — колонны и стены зала
function marbleTex() {
  return makeTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c9c2b2'; ctx.fillRect(0, 0, w, h);
    // мягкие облака тона
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(${165 + Math.random() * 30 | 0},${158 + Math.random() * 25 | 0},${140 + Math.random() * 22 | 0},0.25)`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 60 + Math.random() * 120, 35 + Math.random() * 70, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    // прожилки — ломаные случайного блуждания
    for (let i = 0; i < 30; i++) {
      const strong = Math.random() < 0.22;
      ctx.strokeStyle = strong ? 'rgba(86,76,66,0.30)' : 'rgba(108,98,86,0.16)';
      ctx.lineWidth = strong ? 2.2 : 1.2;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      const dirX = (Math.random() - 0.5) * 30, dirY = (Math.random() - 0.5) * 30;
      for (let k = 0; k < 14; k++) {
        x += dirX + (Math.random() - 0.5) * 26;
        y += dirY + (Math.random() - 0.5) * 26;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    speckle(ctx, w, h, 600, 120, 190, 0.12);
  });
}

// Бетонный потолок с панельными швами
function concreteTex() {
  return makeTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#71747a'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 1400, 60, 130, 0.18);
    ctx.strokeStyle = 'rgba(50,53,58,0.8)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
    }
    // ржавые подтёки у швов
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * w;
      const g = ctx.createLinearGradient(0, 0, 0, 60);
      g.addColorStop(0, 'rgba(110,66,34,0.3)'); g.addColorStop(1, 'rgba(110,66,34,0)');
      ctx.fillStyle = g; ctx.fillRect(x, (Math.random() * 2 | 0) * 128, 4 + Math.random() * 8, 60);
    }
  });
}

// Борт «номерного» вагона: период 4 м — окно + двустворчатая дверь
function trainSideTex() {
  const draw = (emissive) => makeTex(512, 352, (ctx, w, h) => {
    if (emissive) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
    else {
      // крыша / борт / юбка
      ctx.fillStyle = '#666a6c'; ctx.fillRect(0, 0, w, 28);
      ctx.fillStyle = '#27525c'; ctx.fillRect(0, 28, w, 274);
      ctx.fillStyle = '#2c2f33'; ctx.fillRect(0, 302, w, 50);
      // молдинги
      ctx.fillStyle = 'rgba(16,34,40,0.8)'; ctx.fillRect(0, 28, w, 4);
      ctx.fillStyle = 'rgba(180,200,205,0.12)'; ctx.fillRect(0, 210, w, 6);
      speckle(ctx, w, h, 900, 20, 70, 0.12);
      // грязь по юбке
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = 'rgba(18,20,22,0.35)';
        ctx.fillRect(Math.random() * w, 295 + Math.random() * 50, 8 + Math.random() * 30, 4 + Math.random() * 10);
      }
    }
    // окно
    if (emissive) { ctx.fillStyle = '#d8e8f0'; ctx.fillRect(86, 70, 130, 106); }
    else {
      ctx.fillStyle = '#10181c'; ctx.fillRect(80, 64, 142, 118);
      ctx.strokeStyle = '#1b2e34'; ctx.lineWidth = 7; ctx.strokeRect(80, 64, 142, 118);
    }
    // дверь с двумя стёклами
    if (!emissive) {
      ctx.fillStyle = '#235058'; ctx.fillRect(300, 40, 180, 312);
      ctx.strokeStyle = '#14282e'; ctx.lineWidth = 5; ctx.strokeRect(300, 40, 180, 312);
      ctx.beginPath(); ctx.moveTo(390, 40); ctx.lineTo(390, 352); ctx.stroke(); // щель створок
      ctx.fillStyle = '#10181c'; ctx.fillRect(315, 70, 58, 120); ctx.fillRect(407, 70, 58, 120);
    } else {
      ctx.fillStyle = '#cfe2ee'; ctx.fillRect(318, 74, 52, 112); ctx.fillRect(410, 74, 52, 112);
    }
  });
  return { map: draw(false), emissive: draw(true) };
}

// Интерьер вагона: светлые панели
function trainInteriorTex() {
  return makeTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c8ccc4'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 700, 150, 210, 0.15);
    ctx.strokeStyle = 'rgba(140,144,138,0.7)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke(); }
    // потёртость по низу
    const g = ctx.createLinearGradient(0, h - 60, 0, h);
    g.addColorStop(0, 'rgba(70,72,68,0)'); g.addColorStop(1, 'rgba(70,72,68,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, h - 60, w, 60);
  });
}

function textPlane(text, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#0a0c10';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = opts.fg || '#e8ecf4';
  ctx.font = (opts.weight || '300') + ' ' + (opts.size || 110) + 'px ' + (opts.font || 'Arial');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, fog: false }));
}

// схема линии метро: одна станция
function schemeTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e7df'; ctx.fillRect(0, 0, 1024, 160);
  ctx.strokeStyle = '#1e9b48'; ctx.lineWidth = 10; // зелёная линия, как настоящая третья
  ctx.beginPath(); ctx.moveTo(60, 80); ctx.lineTo(964, 80); ctx.stroke();
  // все станции стёрты
  for (let i = 0; i < 8; i++) {
    const x = 90 + i * 115;
    ctx.fillStyle = '#b9b5aa';
    ctx.beginPath(); ctx.arc(x, 80, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#c9c5ba';
    ctx.fillRect(x - 42, 100, 84, 16); // смазанное название
  }
  // кроме одной
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(895, 80, 15, 0, 7); ctx.fill();
  ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
  ctx.fillText('РЫБАЦКОЕ', 880, 134);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sittingFigure(mat) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.5, 4, 8), mat);
  torso.position.y = 0.82;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat);
  head.position.y = 1.32;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.5), mat);
  legs.position.set(0, 0.5, 0.25);
  g.add(torso, head, legs);
  return g;
}

export function buildMetro(scene, map, spawnPoint) {
  const edges = [];
  const wall = (buf, x1, z1, x2, z2, y0, y1, r, g, b, collide = true) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const nx = -dz / len, nz = dx / len;
    buf.quad(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y1, z1, nx, 0, nz, 0, 0, len / 4, 1, r, g, b);
    if (collide) edges.push(x1, z1, x2, z2);
  };
  // пол/потолок с UV по мировым координатам (тайлится каждые 4 м)
  const floorQuad = (buf, x1, z1, x2, z2, y, r, g, b) => {
    buf.quad(x1, y, z1, x2, y, z1, x2, y, z2, x1, y, z2, 0, 1, 0, x1 / 4, z1 / 4, x2 / 4, z2 / 4, r, g, b);
  };

  // материалы
  const train = trainSideTex();
  const matVestWall = new THREE.MeshStandardMaterial({ map: tileWallTex({ base: '#aeb8a8', joint: '#7e8a7c', grime: 0.35 }), vertexColors: true, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide });
  const matTrackWall = new THREE.MeshStandardMaterial({ map: tileWallTex({ base: '#c2c8cc', joint: '#8d949a', plinthH: 60, grime: 0.5 }), vertexColors: true, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide });
  const matMarble = new THREE.MeshStandardMaterial({ map: marbleTex(), vertexColors: true, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
  const matFloor = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.3, metalness: 0.08, side: THREE.DoubleSide });
  const matCeil = new THREE.MeshStandardMaterial({ map: concreteTex(), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const matTrainOut = new THREE.MeshStandardMaterial({ map: train.map, emissive: 0xffffff, emissiveMap: train.emissive, emissiveIntensity: 1.1, vertexColors: true, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
  const matTrainIn = new THREE.MeshStandardMaterial({ map: trainInteriorTex(), vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  const matPlain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  const matSteel = new THREE.MeshStandardMaterial({ color: 0xb6bcc6, roughness: 0.3, metalness: 0.85 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.85 });
  const matLightStrip = new THREE.MeshBasicMaterial({ color: 0xe6eef6 });

  // ===== ВЕСТИБЮЛЬ у точки метро =====
  const m = { x: map.spawn.x, z: map.spawn.z };
  // дверь смотрит в сторону спавна игрока
  const toSpawn = Math.atan2(spawnPoint.x - m.x, spawnPoint.z - m.z);
  const south = Math.abs(Math.sin(toSpawn)) < Math.abs(Math.cos(toSpawn)); // дверь по оси z?
  const vbWall = new MeshBuf(), vbFloor = new MeshBuf(), vbCeil = new MeshBuf(), vbMetal = new MeshBuf();
  const W = 10, D = 7, H = 4.6; // полуразмеры и высота
  const c1 = [1, 1, 1], c2 = [0.55, 0.57, 0.6];
  // стены с дверным проёмом (ширина 3) в стене, обращённой к спавну
  const doorOnZ = south ? (spawnPoint.z > m.z ? 1 : -1) : 0;
  const doorOnX = south ? 0 : (spawnPoint.x > m.x ? 1 : -1);
  // четыре стены, у одной — проём
  const segs = [];
  if (doorOnZ !== 0) {
    const zw = m.z + D * doorOnZ;
    segs.push([m.x - W, zw, m.x - 1.5, zw], [m.x + 1.5, zw, m.x + W, zw]); // стена с дверью
    segs.push([m.x - W, m.z - D * doorOnZ, m.x + W, m.z - D * doorOnZ]);
    segs.push([m.x - W, m.z - D, m.x - W, m.z + D], [m.x + W, m.z - D, m.x + W, m.z + D]);
  } else {
    const xw = m.x + W * doorOnX;
    segs.push([xw, m.z - D, xw, m.z - 1.5], [xw, m.z + 1.5, xw, m.z + D]);
    segs.push([m.x - W * doorOnX, m.z - D, m.x - W * doorOnX, m.z + D]);
    segs.push([m.x - W, m.z - D, m.x + W, m.z - D], [m.x - W, m.z + D, m.x + W, m.z + D]);
  }
  for (const [x1, z1, x2, z2] of segs) wall(vbWall, x1, z1, x2, z2, 0, H, ...c1);
  // пол и потолок
  floorQuad(vbFloor, m.x - W, m.z - D, m.x + W, m.z + D, 0.06, 1, 1, 1);
  floorQuad(vbCeil, m.x - W, m.z - D, m.x + W, m.z + D, H, 0.8, 0.82, 0.86);
  // турникеты в ряд
  for (let i = -1; i <= 1; i++) {
    const px = doorOnZ !== 0 ? m.x + i * 1.6 : m.x + doorOnX * 2;
    const pz = doorOnZ !== 0 ? m.z + doorOnZ * 2 : m.z + i * 1.6;
    wall(vbMetal, px - 0.4, pz - 0.18, px + 0.4, pz - 0.18, 0, 1.05, ...c2);
    wall(vbMetal, px - 0.4, pz + 0.18, px + 0.4, pz + 0.18, 0, 1.05, ...c2);
  }
  scene.add(vbWall.build(matVestWall), vbFloor.build(matFloor), vbCeil.build(matCeil), vbMetal.build(matPlain));

  // кассы на боковой стене: тёмные окошки, табличка, расписание
  {
    const onX = doorOnZ !== 0; // кассы на стене x = m.x - W (или z = m.z - D)
    const kx = onX ? m.x - W + 0.07 : m.x;
    const kz = onX ? m.z : m.z - D + 0.07;
    const rotY = onX ? Math.PI / 2 : 0;
    const off = (d) => onX ? [kx, kz + d] : [kx + d, kz];
    for (const d of [-2.2, 0.2]) {
      const [x, z] = off(d);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.2, metalness: 0.4 }));
      win.position.set(x, 1.65, z); win.rotation.y = rotY;
      scene.add(win);
    }
    const kassa = textPlane('К А С С Ы', 2.6, 0.5, { fg: '#cdd6e6', size: 78 });
    const [kax, kaz] = off(-1);
    kassa.position.set(kax, 2.9, kaz);
    kassa.rotation.y = rotY;
    scene.add(kassa);
    const sched = textPlane('ПОСЛЕДНИЙ ПОЕЗД — 00:00', 3.4, 0.42, { fg: '#b8c2d4', size: 64 });
    const [sx, sz] = off(2.6);
    sched.position.set(sx, 2.2, sz);
    sched.rotation.y = rotY;
    scene.add(sched);
  }

  // светильники вестибюля — две люминесцентные полосы
  for (const d of [-2.5, 2.5]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.3), matLightStrip);
    strip.position.set(m.x, H - 0.04, m.z + d);
    strip.rotation.x = Math.PI / 2;
    scene.add(strip);
  }

  // эскалаторный проём — в стене напротив двери, тёмный зев
  const esc = { x: doorOnZ !== 0 ? m.x : m.x - (W - 0.4) * doorOnX, z: doorOnZ !== 0 ? m.z - (D - 0.4) * doorOnZ : m.z };
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide }));
  dark.position.set(esc.x, 1.8, esc.z);
  dark.rotation.y = doorOnZ !== 0 ? 0 : Math.PI / 2;
  scene.add(dark);
  const escLabel = textPlane('▼  К ПОЕЗДАМ', 3.0, 0.5, { fg: '#aebadf', size: 80 });
  escLabel.position.set(esc.x, 3.9, esc.z);
  escLabel.lookAt(m.x, 3.9, m.z); // текстом внутрь вестибюля
  scene.add(escLabel);

  // решётка: до фазы 2 спуск закрыт
  const grate = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.85 }));
  grate.position.copy(dark.position);
  grate.rotation.y = dark.rotation.y;
  grate.position.x += (doorOnZ !== 0 ? 0 : 0.1 * -doorOnX);
  grate.position.z += (doorOnZ !== 0 ? 0.1 * -doorOnZ : 0);
  scene.add(grate);
  const grateBlocker = doorOnZ !== 0
    ? { x1: esc.x - 1.8, z1: esc.z, x2: esc.x + 1.8, z2: esc.z, on: true }
    : { x1: esc.x, z1: esc.z - 1.8, x2: esc.x, z2: esc.z + 1.8, on: true };

  // свет вестибюля
  const vl = new THREE.PointLight(0xcfe0ff, 26, 24, 1.7);
  vl.position.set(m.x, H - 0.6, m.z);
  scene.add(vl);

  // ===== ПЛАТФОРМА =====
  const pbMarble = new MeshBuf(), pbFloor = new MeshBuf(), pbCeil = new MeshBuf(), pbTrack = new MeshBuf(), pbPlain = new MeshBuf();
  const HL = 50, HD = 6, HZ = 12; // x: -50..50, z: -6..12 — зал
  floorQuad(pbFloor, PX - HL, PZ - HD, PX + HL, PZ + HZ, 0, 1, 1, 1);
  floorQuad(pbCeil, PX - HL, PZ - HD, PX + HL, PZ + HZ + 5, 4.6, 0.55, 0.57, 0.62); // потолок накрывает и пути
  wall(pbMarble, PX - HL, PZ - HD, PX + HL, PZ - HD, 0, 4.6, 1, 1, 1);
  wall(pbMarble, PX - HL, PZ - HD, PX - HL, PZ + HZ + 5, 0, 4.6, 0.85, 0.85, 0.88);
  wall(pbMarble, PX + HL, PZ - HD, PX + HL, PZ + HZ + 5, 0, 4.6, 0.85, 0.85, 0.88);
  wall(pbTrack, PX - HL, PZ + HZ + 5, PX + HL, PZ + HZ + 5, 0, 4.6, 0.75, 0.75, 0.78); // путевая стена за поездом
  // колонны — мрамор
  for (let x = -44; x <= 44; x += 8) {
    wall(pbMarble, PX + x - 0.45, PZ + 2.6, PX + x + 0.45, PZ + 2.6, 0, 4.6, 1, 1, 1);
    wall(pbMarble, PX + x - 0.45, PZ + 3.4, PX + x + 0.45, PZ + 3.4, 0, 4.6, 1, 1, 1);
    wall(pbMarble, PX + x - 0.45, PZ + 2.6, PX + x - 0.45, PZ + 3.4, 0, 4.6, 1, 1, 1);
    wall(pbMarble, PX + x + 0.45, PZ + 2.6, PX + x + 0.45, PZ + 3.4, 0, 4.6, 1, 1, 1);
    // тёмный цоколь колонны
    wall(pbPlain, PX + x - 0.5, PZ + 2.55, PX + x + 0.5, PZ + 2.55, 0, 0.5, 0.16, 0.17, 0.19, false);
    wall(pbPlain, PX + x - 0.5, PZ + 3.45, PX + x + 0.5, PZ + 3.45, 0, 0.5, 0.16, 0.17, 0.19, false);
  }
  // путевая яма
  floorQuad(pbPlain, PX - HL, PZ + HZ, PX + HL, PZ + HZ + 5, -1.2, 0.07, 0.07, 0.08);
  // край платформы: упасть нельзя, кроме дверей вагона
  const doorGaps = [[-6, -4.6], [4.6, 6]];
  let cx0 = -HL;
  for (const [g1, g2] of doorGaps) { edges.push(PX + cx0, PZ + HZ, PX + g1, PZ + HZ); cx0 = g2; }
  edges.push(PX + cx0, PZ + HZ, PX + HL, PZ + HZ);
  // белая полоса у края
  floorQuad(pbPlain, PX - HL, PZ + HZ - 0.6, PX + HL, PZ + HZ - 0.25, 0.012, 0.62, 0.62, 0.6);
  scene.add(pbMarble.build(matMarble), pbFloor.build(matFloor), pbCeil.build(matCeil), pbTrack.build(matTrackWall), pbPlain.build(matPlain));

  // светильники зала: полосы между колоннами + мягкие ореолы
  const glowPts = [];
  for (let x = -40; x <= 40; x += 8) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.35), matLightStrip);
    strip.position.set(PX + x, 4.56, PZ + 3);
    strip.rotation.x = Math.PI / 2;
    scene.add(strip);
    glowPts.push(PX + x, 4.4, PZ + 3);
  }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
  scene.add(new THREE.Points(glowGeo, new THREE.PointsMaterial({
    map: glowTex(), size: 5, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xc8d8f0, opacity: 0.35,
  })));

  // скамейки и коллизии вокруг них
  for (const bx of [-20, 20]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.6), matWood);
    seat.position.set(PX + bx, 0.5, PZ + 0.3);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 0.08), matWood);
    back.position.set(PX + bx, 0.95, PZ + 0.02);
    scene.add(seat, back);
    for (const lx of [-1.4, 1.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), matSteel);
      leg.position.set(PX + bx + lx, 0.25, PZ + 0.3);
      scene.add(leg);
    }
    edges.push(PX + bx - 1.6, PZ + 0.0, PX + bx + 1.6, PZ + 0.0);
    edges.push(PX + bx - 1.6, PZ + 0.62, PX + bx + 1.6, PZ + 0.62);
  }

  // часы над путями — цифры сошли с ума
  const clock = textPlane('88:88', 2.0, 0.7, { fg: '#ff2a1e', bg: '#050505', size: 130, font: 'monospace', weight: 'bold' });
  clock.position.set(PX + 14, 3.95, PZ + HZ + 4.85);
  clock.rotation.y = Math.PI;
  scene.add(clock);

  // подвесной указатель, у которого что-то не так со стрелкой
  const exitSign = textPlane('ВЫХОД В ГОРОД  ▼', 4.2, 0.55, { fg: '#e8edf6', bg: '#0d2c5e', size: 72 });
  exitSign.position.set(PX - 8, 3.7, PZ + 2);
  exitSign.rotation.y = Math.PI / 2;
  scene.add(exitSign);

  // ===== ПОЕЗД =====
  const tbIn = new MeshBuf(), tbOut = new MeshBuf(), tbPlain = new MeshBuf();
  const tz1 = PZ + HZ + 0.55, tz2 = PZ + HZ + 3.55; // стенки вагона
  // средний вагон (заходим в него): двери открыты, интерьер светлый
  const segsT = [[-9.5, -6], [-4.6, 4.6], [6, 9.5]];
  for (const [a, b] of segsT) wall(tbIn, PX + a, tz1, PX + b, tz1, 0, 2.7, 1, 1, 1);
  wall(tbIn, PX - 9.5, tz2, PX + 9.5, tz2, 0, 2.7, 1, 1, 1); // дальняя стена
  wall(tbIn, PX - 9.5, tz1, PX - 9.5, tz2, 0, 2.7, 0.9, 0.9, 0.9);
  wall(tbIn, PX + 9.5, tz1, PX + 9.5, tz2, 0, 2.7, 0.9, 0.9, 0.9);
  // линолеум и потолок
  tbPlain.quad(PX - 9.5, 0.02, tz1, PX + 9.5, 0.02, tz1, PX + 9.5, 0.02, tz2, PX - 9.5, 0.02, tz2, 0, 1, 0, 0, 0, 6, 1, 0.32, 0.30, 0.26);
  tbPlain.quad(PX - 9.5, 2.7, tz1, PX + 9.5, 2.7, tz1, PX + 9.5, 2.7, tz2, PX - 9.5, 2.7, tz2, 0, 1, 0, 0, 0, 6, 1, 0.85, 0.87, 0.9);
  // сиденья: коричневый кожзам + спинки
  for (const [a, b] of [[-8.8, -6.2], [-3.8, 3.8], [6.2, 8.8]]) {
    tbPlain.quad(PX + a, 0.5, tz2 - 0.75, PX + b, 0.5, tz2 - 0.75, PX + b, 0.5, tz2 - 0.1, PX + a, 0.5, tz2 - 0.1, 0, 1, 0, 0, 0, 1, 1, 0.42, 0.26, 0.16);
    wall(tbPlain, PX + a, tz2 - 0.12, PX + b, tz2 - 0.12, 0.5, 1.15, 0.40, 0.25, 0.15, false); // спинка
    wall(tbPlain, PX + a, tz2 - 0.75, PX + b, tz2 - 0.75, 0.18, 0.5, 0.2, 0.18, 0.15, false); // фронт сиденья
  }
  // соседние вагоны — борта с горящими окнами (текстура, период 4 м)
  for (const [a, b] of [[-29, -10.3], [10.3, 29]]) {
    wall(tbOut, PX + a, tz1, PX + b, tz1, 0, 2.7, 1, 1, 1);
    tbPlain.quad(PX + a, 2.75, tz1, PX + b, 2.75, tz1, PX + b, 2.75, tz2, PX + a, 2.75, tz2, 0, 1, 0, 0, 0, 4, 1, 0.1, 0.12, 0.15);
  }
  scene.add(tbIn.build(matTrainIn), tbOut.build(matTrainOut), tbPlain.build(matPlain));

  // окна изнутри вагона — чёрный тоннель за стеклом
  const winMat = new THREE.MeshStandardMaterial({ color: 0x04060a, roughness: 0.1, metalness: 0.3 });
  for (const wz of [tz1 + 0.04, tz2 - 0.04]) {
    for (let wx = -8.4; wx <= 8.4; wx += 2.8) {
      if (wz < tz2 - 1 && Math.abs(Math.abs(wx) - 5.6) < 0.8) continue; // не поверх дверных проёмов (x≈±5.6)
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), winMat);
      win.position.set(PX + wx, 1.78, wz);
      if (wz > (tz1 + tz2) / 2) win.rotation.y = Math.PI;
      scene.add(win);
    }
  }

  // поручни в среднем вагоне
  const railGeo = new THREE.CylinderGeometry(0.024, 0.024, 18.6, 8);
  for (const dz of [0.75, 2.1]) {
    const rail = new THREE.Mesh(railGeo, matSteel);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(PX, 2.08, tz1 + dz);
    scene.add(rail);
  }
  const poleGeo = new THREE.CylinderGeometry(0.024, 0.024, 2.66, 8);
  for (const px of [-5.3, 0, 5.3]) {
    const pole = new THREE.Mesh(poleGeo, matSteel);
    pole.position.set(PX + px, 1.35, (tz1 + tz2) / 2);
    scene.add(pole);
  }
  // светящаяся полоса под потолком вагона
  const carStrip = new THREE.Mesh(new THREE.PlaneGeometry(18.4, 0.22), matLightStrip);
  carStrip.position.set(PX, 2.68, (tz1 + tz2) / 2);
  carStrip.rotation.x = Math.PI / 2;
  scene.add(carStrip);

  // пассажиры: Пустые сидят молча
  const figMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
  const seatsX = [-8.3, -7.1, -3.2, -2.0, -0.8, 0.6, 1.8, 3.0, 6.6, 7.8];
  for (const sx of seatsX) {
    const f = sittingFigure(figMat);
    f.position.set(PX + sx, 0.52, tz2 - 0.42);
    scene.add(f);
  }
  // и на платформе вдалеке стоят ещё двое
  for (const sx of [-38, 41]) {
    const f = sittingFigure(figMat);
    f.scale.set(1, 1.45, 1);
    f.position.set(PX + sx, 0, PZ + HZ - 1.2);
    scene.add(f);
  }

  // схема линии внутри вагона
  const scheme = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.65),
    new THREE.MeshBasicMaterial({ map: schemeTexture(), fog: false }));
  scheme.position.set(PX, 2.1, tz2 - 0.06);
  scheme.rotation.y = Math.PI;
  scene.add(scheme);

  // название станции на стене за поездом и в зале
  const name2 = textPlane('Р Ы Б А Ц К О Е', 16, 1.6, { size: 90 });
  name2.position.set(PX, 3.7, PZ + HZ + 4.9);
  name2.rotation.y = Math.PI; // текстом к платформе
  scene.add(name2);

  // свет платформы: холодные лампы
  for (let x = -40; x <= 40; x += 16) {
    const l = new THREE.PointLight(0xd6e4ff, 55, 26, 1.8);
    l.position.set(PX + x, 4.1, PZ + 3);
    scene.add(l);
  }
  const lInside = new THREE.PointLight(0xeef4ff, 40, 14, 1.6);
  lInside.position.set(PX, 2.4, (tz1 + tz2) / 2);
  scene.add(lInside);
  // мигающая лампа в дальнем конце
  const flick = new THREE.PointLight(0xd6e4ff, 50, 22, 1.8);
  flick.position.set(PX - 46, 4.1, PZ + 3);
  scene.add(flick);

  return {
    edges,
    blockers: [grateBlocker],
    grate,
    escTrigger: esc,
    platformSpawn: { x: PX, z: PZ - 2, yaw: Math.PI }, // лицом к поезду
    trainZone: { minX: PX - 9, maxX: PX + 9, minZ: tz1, maxZ: tz2 },
    flickLight: flick,
    openGate() { grate.visible = false; grateBlocker.on = false; },
  };
}
