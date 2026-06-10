// Метро «Рыбацкое» внутри: вестибюль, платформа, поезд с финалом
import * as THREE from 'three';
import { MeshBuf, glowTex } from './world.js';

// Платформа строится в пустом юго-западном углу карты (внутри границ,
// иначе физика игрока прижмёт телепорт обратно) — попадаем туда «эскалатором»
const PX = -2000, PZ = -3700;

function textPlane(text, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#0a0c10';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = opts.fg || '#e8ecf4';
  ctx.font = (opts.weight || '300') + ' ' + (opts.size || 110) + 'px Arial';
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
  const floorQuad = (buf, x1, z1, x2, z2, y, r, g, b) => {
    buf.quad(x1, y, z1, x2, y, z1, x2, y, z2, x1, y, z2, 0, 1, 0, 0, 0, 1, 1, r, g, b);
  };
  const matInterior = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });

  // ===== ВЕСТИБЮЛЬ у точки метро =====
  const m = { x: map.spawn.x, z: map.spawn.z };
  // дверь смотрит в сторону спавна игрока
  const toSpawn = Math.atan2(spawnPoint.x - m.x, spawnPoint.z - m.z);
  const south = Math.abs(Math.sin(toSpawn)) < Math.abs(Math.cos(toSpawn)); // дверь по оси z?
  const vb = new MeshBuf();
  const W = 10, D = 7, H = 4.6; // полуразмеры и высота
  const c1 = [0.28, 0.28, 0.31], c2 = [0.33, 0.34, 0.37];
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
  for (const [x1, z1, x2, z2] of segs) wall(vb, x1, z1, x2, z2, 0, H, ...c1);
  // пол и потолок
  floorQuad(vb, m.x - W, m.z - D, m.x + W, m.z + D, 0.06, 0.30, 0.30, 0.33);
  floorQuad(vb, m.x - W, m.z - D, m.x + W, m.z + D, H, 0.22, 0.23, 0.26);
  // турникеты в ряд
  for (let i = -1; i <= 1; i++) {
    const tx = m.x + i * 1.6 - (doorOnX !== 0 ? doorOnX * 2 : 0);
    const tz = m.z + (doorOnZ !== 0 ? doorOnZ * 2 : i * 0); // ряд поперёк входа
    const px = doorOnZ !== 0 ? tx : m.x + doorOnX * 2;
    const pz = doorOnZ !== 0 ? m.z + doorOnZ * 2 : m.z + i * 1.6;
    wall(vb, px - 0.4, pz - 0.18, px + 0.4, pz - 0.18, 0, 1.05, ...c2);
    wall(vb, px - 0.4, pz + 0.18, px + 0.4, pz + 0.18, 0, 1.05, ...c2);
  }
  scene.add(vb.build(matInterior));

  // эскалаторный проём — в стене напротив двери, тёмный зев
  const escX = m.x - W * doorOnX * 0.99 - (doorOnZ !== 0 ? 0 : 0);
  const escZ = m.z - D * doorOnZ * 0.99;
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
  const pb = new MeshBuf();
  const HL = 50, HD = 6, HZ = 12; // x: -50..50, z: -6..12 — зал
  const fc = [0.20, 0.21, 0.23];
  floorQuad(pb, PX - HL, PZ - HD, PX + HL, PZ + HZ, 0, ...fc);
  floorQuad(pb, PX - HL, PZ - HD, PX + HL, PZ + HZ + 5, 4.6, 0.10, 0.11, 0.13); // потолок накрывает и пути
  wall(pb, PX - HL, PZ - HD, PX + HL, PZ - HD, 0, 4.6, 0.26, 0.26, 0.29);
  wall(pb, PX - HL, PZ - HD, PX - HL, PZ + HZ + 5, 0, 4.6, 0.22, 0.22, 0.25);
  wall(pb, PX + HL, PZ - HD, PX + HL, PZ + HZ + 5, 0, 4.6, 0.22, 0.22, 0.25);
  wall(pb, PX - HL, PZ + HZ + 5, PX + HL, PZ + HZ + 5, 0, 4.6, 0.12, 0.12, 0.14); // стена за поездом
  // колонны
  for (let x = -44; x <= 44; x += 8) {
    wall(pb, PX + x - 0.45, PZ + 2.6, PX + x + 0.45, PZ + 2.6, 0, 4.6, 0.30, 0.29, 0.27);
    wall(pb, PX + x - 0.45, PZ + 3.4, PX + x + 0.45, PZ + 3.4, 0, 4.6, 0.30, 0.29, 0.27);
    wall(pb, PX + x - 0.45, PZ + 2.6, PX + x - 0.45, PZ + 3.4, 0, 4.6, 0.30, 0.29, 0.27);
    wall(pb, PX + x + 0.45, PZ + 2.6, PX + x + 0.45, PZ + 3.4, 0, 4.6, 0.30, 0.29, 0.27);
  }
  // путевая яма
  floorQuad(pb, PX - HL, PZ + HZ, PX + HL, PZ + HZ + 5, -1.2, 0.1, 0.1, 0.11);
  // край платформы: упасть нельзя, кроме дверей вагона
  const doorGaps = [[-6, -4.6], [4.6, 6]];
  let cx0 = -HL;
  for (const [g1, g2] of doorGaps) { edges.push(PX + cx0, PZ + HZ, PX + g1, PZ + HZ); cx0 = g2; }
  edges.push(PX + cx0, PZ + HZ, PX + HL, PZ + HZ);
  // белая полоса у края
  floorQuad(pb, PX - HL, PZ + HZ - 0.6, PX + HL, PZ + HZ - 0.25, 0.012, 0.62, 0.62, 0.6);
  scene.add(pb.build(matInterior));

  // ===== ПОЕЗД =====
  const tb = new MeshBuf();
  const tz1 = PZ + HZ + 0.55, tz2 = PZ + HZ + 3.55; // стенки вагона
  const tcol = [0.09, 0.15, 0.22]; // тёмный сине-зелёный номерной
  // средний вагон (заходим в него): двери открыты
  let vx0 = -9.5;
  // стена со стороны платформы, с двумя проёмами
  let segsT = [[-9.5, -6], [-4.6, 4.6], [6, 9.5]];
  for (const [a, b] of segsT) wall(tb, PX + a, tz1, PX + b, tz1, 0, 2.7, ...tcol);
  wall(tb, PX - 9.5, tz2, PX + 9.5, tz2, 0, 2.7, ...tcol); // дальняя стена
  wall(tb, PX - 9.5, tz1, PX - 9.5, tz2, 0, 2.7, ...tcol);
  wall(tb, PX + 9.5, tz1, PX + 9.5, tz2, 0, 2.7, ...tcol);
  floorQuad(tb, PX - 9.5, tz1, PX + 9.5, tz2, 0.02, 0.2, 0.19, 0.17);
  floorQuad(tb, PX - 9.5, tz1, PX + 9.5, tz2, 2.7, 0.85, 0.87, 0.9); // светлый потолок
  // сиденья вдоль дальней стены (без коллизий — низкие)
  floorQuad(tb, PX - 8.8, tz2 - 0.75, PX - 6.2, tz2 - 0.1, 0.5, 0.25, 0.16, 0.12);
  floorQuad(tb, PX - 3.8, tz2 - 0.75, PX + 3.8, tz2 - 0.1, 0.5, 0.25, 0.16, 0.12);
  floorQuad(tb, PX + 6.2, tz2 - 0.75, PX + 8.8, tz2 - 0.1, 0.5, 0.25, 0.16, 0.12);
  // соседние вагоны — закрытые коробки с окнами
  for (const [a, b] of [[-29, -10.3], [10.3, 29]]) {
    wall(tb, PX + a, tz1, PX + b, tz1, 0, 2.7, tcol[0] * 0.8, tcol[1] * 0.8, tcol[2] * 0.8);
    floorQuad(tb, PX + a, tz1, PX + b, tz2, 2.75, 0.1, 0.12, 0.15);
  }
  scene.add(tb.build(matInterior));

  // окна вагонов светятся холодным
  const winBuf = new MeshBuf();
  for (let x = -28; x <= 28; x += 2.4) {
    if (x > -10 && x < 10) continue;
    winBuf.quad(PX + x, 1.3, tz1 - 0.02, PX + x + 1.5, 1.3, tz1 - 0.02, PX + x + 1.5, 2.25, tz1 - 0.02, PX + x, 2.25, tz1 - 0.02,
      0, 0, -1, 0, 0, 1, 1, 1, 1, 1);
  }
  scene.add(winBuf.build(new THREE.MeshBasicMaterial({ color: 0xcfe2ee, fog: false })));

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
