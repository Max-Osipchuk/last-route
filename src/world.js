// Построение 3D-мира Рыбацкого из data/map.json
import * as THREE from 'three';

// ---------- геометрические утилиты ----------

export function pointInPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// Аккумулятор треугольников -> один BufferGeometry
export class MeshBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.v = 0; }
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, u0, v0, u1, v1, r, g, b) {
    const p = this.pos, n = this.nor, t = this.uv, c = this.col, base = this.v;
    p.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 4; i++) { n.push(nx, ny, nz); c.push(r, g, b); }
    t.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.v += 4;
  }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, r, g, b) {
    const base = this.v;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) { this.nor.push(nx, ny, nz); this.col.push(r, g, b); this.uv.push(0, 0); }
    this.idx.push(base, base + 1, base + 2);
    this.v += 3;
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return new THREE.Mesh(g, material);
  }
}

// Лента вдоль полилинии (дорога/рельсы), с дисками на стыках
function strip(buf, pts, width, y, r, g, b, joints = true) {
  const hw = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const px = -dz / len * hw, pz = dx / len * hw;
    buf.quad(x1 + px, y, z1 + pz, x2 + px, y, z2 + pz, x2 - px, y, z2 - pz, x1 - px, y, z1 - pz,
      0, 1, 0, 0, 0, 1, 1, r, g, b);
  }
  if (joints && width >= 3) {
    for (let i = 1; i < pts.length - 1; i++) {
      const [cx, cz] = pts[i];
      for (let k = 0; k < 8; k++) {
        const a1 = k / 8 * Math.PI * 2, a2 = (k + 1) / 8 * Math.PI * 2;
        buf.tri(cx, y, cz, cx + Math.cos(a1) * hw, y, cz + Math.sin(a1) * hw,
          cx + Math.cos(a2) * hw, y, cz + Math.sin(a2) * hw, 0, 1, 0, r, g, b);
      }
    }
  }
}

// Сдвиг полилинии вбок (для рельсов)
function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let nx = 0, nz = 0;
    if (i > 0) { const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dz) || 1; nx += -dz / l; nz += dx / l; }
    if (i < pts.length - 1) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1; nx += -dz / l; nz += dx / l; }
    const l = Math.hypot(nx, nz) || 1;
    out.push([pts[i][0] + nx / l * off, pts[i][1] + nz / l * off]);
  }
  return out;
}

// ---------- процедурные текстуры ----------

function canvasTex(size, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(ctx, s, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

// Панелька: 4 этажа x 4 окна на тайл (ячейка 256px при 1024)
// Раскладка окна в ячейке: ox=fx*256+68, oy=fy*256+52, размер 120x152 —
// panelEmissive обязан совпадать с panelAlbedo по этим координатам!
function panelAlbedo() {
  return canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#7d7668'; ctx.fillRect(0, 0, s, s);
    // каждая бетонная панель чуть своего тона + редкие «заплатки» после ремонта
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const dv = (Math.random() - 0.5) * 14;
      ctx.fillStyle = `rgba(${125 + dv | 0},${118 + dv | 0},${104 + dv | 0},0.55)`;
      ctx.fillRect(px * 256, py * 256, 256, 256);
      if (Math.random() < 0.12) { // заплатка другого оттенка
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(148,136,114,0.5)' : 'rgba(110,108,104,0.5)';
        ctx.fillRect(px * 256 + 8, py * 256 + 8, 240, 240);
      }
    }
    // потёки дождя сверху вниз
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * s;
      const grd = ctx.createLinearGradient(x, 0, x, s);
      grd.addColorStop(0, 'rgba(40,38,32,0.28)'); grd.addColorStop(1, 'rgba(40,38,32,0)');
      ctx.fillStyle = grd; ctx.fillRect(x, 0, 3 + Math.random() * 8, s);
    }
    noise(ctx, s, 2600, 0.06);
    // швы панелей с грязью по краям
    for (let i = 0; i <= 4; i++) {
      ctx.strokeStyle = 'rgba(30,28,24,0.85)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(i * 256, 0); ctx.lineTo(i * 256, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 256); ctx.lineTo(s, i * 256); ctx.stroke();
      ctx.strokeStyle = 'rgba(52,48,42,0.35)'; ctx.lineWidth = 13;
      ctx.beginPath(); ctx.moveTo(i * 256, 0); ctx.lineTo(i * 256, s); ctx.stroke();
    }
    // окна
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const cx = fx * 256, cy = fy * 256;
      const ox = cx + 68, oy = cy + 52;
      const plastic = Math.random() < 0.4; // белый стеклопакет vs старая рама
      // откос
      ctx.fillStyle = plastic ? '#8f897c' : '#5e5950';
      ctx.fillRect(ox - 8, oy - 8, 136, 168);
      // стекло — тёмный провал с холодным отблеском неба сверху
      ctx.fillStyle = '#0a0c10'; ctx.fillRect(ox, oy, 120, 152);
      const sky = ctx.createLinearGradient(0, oy, 0, oy + 60);
      sky.addColorStop(0, 'rgba(125,135,158,0.18)'); sky.addColorStop(1, 'rgba(125,135,158,0)');
      ctx.fillStyle = sky; ctx.fillRect(ox, oy, 120, 60);
      // занавеска у части окон
      if (Math.random() < 0.3) {
        ctx.fillStyle = 'rgba(96,84,70,0.5)';
        const side = Math.random() < 0.5 ? ox : ox + 78;
        ctx.fillRect(side, oy, 42, 152);
      }
      // рама
      ctx.strokeStyle = plastic ? '#b9b4a8' : '#3a352c'; ctx.lineWidth = 6;
      ctx.strokeRect(ox, oy, 120, 152);
      ctx.beginPath(); ctx.moveTo(ox + 78, oy); ctx.lineTo(ox + 78, oy + 152); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + 76); ctx.lineTo(ox + 78, oy + 76); ctx.stroke();
      // форточка приоткрыта у некоторых — чёрный клин
      if (Math.random() < 0.22) {
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.moveTo(ox + 82, oy + 4); ctx.lineTo(ox + 116, oy + 4); ctx.lineTo(ox + 82, oy + 40); ctx.closePath(); ctx.fill();
      }
      // потёк грязи под подоконником
      ctx.fillStyle = 'rgba(45,42,36,0.35)';
      ctx.fillRect(ox - 4, oy + 154, 128, 8);
      const drip = ctx.createLinearGradient(0, oy + 160, 0, oy + 210);
      drip.addColorStop(0, 'rgba(45,42,36,0.3)'); drip.addColorStop(1, 'rgba(45,42,36,0)');
      ctx.fillStyle = drip; ctx.fillRect(ox + 10 + Math.random() * 60, oy + 160, 14, 50);
      // кондиционер сбоку от окна + ржавый потёк
      if (Math.random() < 0.18) {
        const ax = ox + 126, ay = oy + 20 + Math.random() * 60;
        ctx.fillStyle = '#9a958b'; ctx.fillRect(ax, ay, 52, 36);
        ctx.strokeStyle = '#6b675e'; ctx.lineWidth = 3; ctx.strokeRect(ax, ay, 52, 36);
        for (let l = 0; l < 4; l++) { ctx.beginPath(); ctx.moveTo(ax + 6, ay + 8 + l * 7); ctx.lineTo(ax + 46, ay + 8 + l * 7); ctx.stroke(); }
        const rust = ctx.createLinearGradient(0, ay + 36, 0, ay + 140);
        rust.addColorStop(0, 'rgba(122,72,38,0.4)'); rust.addColorStop(1, 'rgba(122,72,38,0)');
        ctx.fillStyle = rust; ctx.fillRect(ax + 14, ay + 36, 12, 104);
      }
      // балкон на части ячеек: плита + ограждение под окном
      if ((fx + fy) % 2 === 0) {
        ctx.fillStyle = '#54504a'; ctx.fillRect(cx + 24, cy + 216, 208, 18);
        // экран ограждения (шифер/металл) с ржавчиной
        ctx.fillStyle = Math.random() < 0.5 ? '#6e6a60' : '#62666c';
        ctx.fillRect(cx + 28, cy + 234, 200, 20);
        ctx.strokeStyle = 'rgba(40,38,34,0.7)'; ctx.lineWidth = 2;
        for (let l = 0; l < 9; l++) { ctx.beginPath(); ctx.moveTo(cx + 28 + l * 24, cy + 234); ctx.lineTo(cx + 28 + l * 24, cy + 254); ctx.stroke(); }
        ctx.fillStyle = 'rgba(122,72,38,0.3)';
        ctx.fillRect(cx + 30 + Math.random() * 160, cy + 234, 10 + Math.random() * 18, 20);
        // тень под плитой
        ctx.fillStyle = 'rgba(20,19,17,0.4)'; ctx.fillRect(cx + 24, cy + 212, 208, 5);
      }
    }
    // редкие ржавые потёки от швов
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s, y = (Math.random() * 4 | 0) * 256;
      const rust = ctx.createLinearGradient(0, y, 0, y + 120);
      rust.addColorStop(0, 'rgba(118,68,34,0.35)'); rust.addColorStop(1, 'rgba(118,68,34,0)');
      ctx.fillStyle = rust; ctx.fillRect(x, y, 6 + Math.random() * 10, 120);
    }
  });
}

// Рельеф панельки: швы и окна — углубления, балконная плита — выступ
function panelBump() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const v = 110 + Math.random() * 40 | 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(fx * 128 + 34, fy * 128 + 26, 60, 76);
    if ((fx + fy) % 2 === 0) { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(fx * 128 + 12, fy * 128 + 108, 104, 9); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function panelEmissive(litCells) {
  return canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    for (const [fx, fy, warm] of litCells) {
      const ox = fx * 256 + 68, oy = fy * 256 + 52;
      ctx.fillStyle = warm ? '#ffd9a0' : '#9db8e8';
      ctx.fillRect(ox, oy, 120, 152);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(ox + 74, oy, 8, 152); ctx.fillRect(ox, oy + 72, 120, 8);
    }
  });
}

function garageAlbedo() {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#4a4640'; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 1600, 0.08);
    // потёки с крыши
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * s;
      const g = ctx.createLinearGradient(0, 0, 0, 200);
      g.addColorStop(0, 'rgba(30,28,24,0.4)'); g.addColorStop(1, 'rgba(30,28,24,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 3 + Math.random() * 6, 200);
    }
    // ворота с рёбрами
    ctx.fillStyle = '#3a3b3e'; ctx.fillRect(40, 120, 432, 392);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#34353a' : '#3e3f44'; ctx.fillRect(40, 120 + i * 44, 432, 22); }
    ctx.strokeStyle = '#26272b'; ctx.lineWidth = 8; ctx.strokeRect(40, 120, 432, 392);
    ctx.beginPath(); ctx.moveTo(256, 120); ctx.lineTo(256, 512); ctx.stroke(); // створки
    // замок и петли
    ctx.fillStyle = '#222326'; ctx.fillRect(238, 300, 36, 28);
    // ржавчина: пятна и потёки от верха ворот
    ctx.fillStyle = 'rgba(120,60,30,0.3)';
    for (let i = 0; i < 26; i++) ctx.fillRect(Math.random() * s, 80 + Math.random() * 400, 8 + Math.random() * 28, 6 + Math.random() * 16);
    for (let i = 0; i < 8; i++) {
      const x = 50 + Math.random() * 410;
      const g = ctx.createLinearGradient(0, 120, 0, 320);
      g.addColorStop(0, 'rgba(126,66,30,0.45)'); g.addColorStop(1, 'rgba(126,66,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 120, 5 + Math.random() * 9, 200);
    }
    // граффити-тег
    const tags = ['РЫБА', 'ШУМ', 'СПБ', 'ТИХО'];
    ctx.save();
    ctx.translate(80 + Math.random() * 200, 380 + Math.random() * 80);
    ctx.rotate((Math.random() - 0.5) * 0.2);
    ctx.font = 'bold 54px Arial';
    ctx.strokeStyle = 'rgba(150,40,40,0.55)'; ctx.lineWidth = 3;
    ctx.strokeText(tags[Math.random() * tags.length | 0], 0, 0);
    ctx.restore();
  });
}

function shopAlbedo() {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#6a6258'; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 1200, 0.07);
    // вывеска: тёмный короб с выцветшими буквами
    ctx.fillStyle = '#2e2a24'; ctx.fillRect(0, 50, s, 90);
    ctx.font = 'bold 58px Arial'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(190,182,160,0.5)';
    ctx.fillText('ПРОДУКТЫ 24', 256, 116);
    // витрины с рамами, нижняя кирпичная кладка
    for (const wx of [28, 280]) {
      ctx.fillStyle = '#07090d'; ctx.fillRect(wx, 180, 204, 270);
      ctx.fillStyle = 'rgba(125,135,158,0.08)'; ctx.fillRect(wx, 180, 204, 90);
      ctx.strokeStyle = '#3a342c'; ctx.lineWidth = 9; ctx.strokeRect(wx, 180, 204, 270);
      ctx.beginPath(); ctx.moveTo(wx + 102, 180); ctx.lineTo(wx + 102, 450); ctx.stroke();
      // решётка на витрине
      ctx.strokeStyle = 'rgba(40,42,46,0.8)'; ctx.lineWidth = 3;
      for (let l = 1; l < 6; l++) { ctx.beginPath(); ctx.moveTo(wx, 180 + l * 45); ctx.lineTo(wx + 204, 180 + l * 45); ctx.stroke(); }
    }
    // цоколь
    ctx.fillStyle = '#534c42'; ctx.fillRect(0, 460, s, 52);
    ctx.fillStyle = 'rgba(30,28,24,0.4)';
    for (let i = 0; i < 20; i++) ctx.fillRect(Math.random() * s, 462 + Math.random() * 46, 10 + Math.random() * 30, 4);
  });
}

// слабое холодное свечение витрин магазина + пара горящих букв вывески
function shopEmissive() {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    for (const wx of [28, 280]) {
      const g = ctx.createLinearGradient(0, 180, 0, 450);
      g.addColorStop(0, 'rgba(120,150,170,0.5)'); g.addColorStop(1, 'rgba(40,60,80,0.15)');
      ctx.fillStyle = g; ctx.fillRect(wx, 180, 204, 270);
    }
    // от вывески горят только обрывки букв
    ctx.font = 'bold 58px Arial'; ctx.textAlign = 'center';
    ctx.fillStyle = '#b8503a';
    ctx.save(); ctx.beginPath(); ctx.rect(150, 50, 90, 90); ctx.clip();
    ctx.fillText('ПРОДУКТЫ 24', 256, 116); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(330, 50, 60, 90); ctx.clip();
    ctx.fillText('ПРОДУКТЫ 24', 256, 116); ctx.restore();
  });
}

function miscAlbedo() {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#6e675c'; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 1800, 0.07);
    // облупившаяся штукатурка: пятна с «кирпичом» под ней
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * s, y = Math.random() * s, w = 40 + Math.random() * 90, h = 30 + Math.random() * 60;
      ctx.fillStyle = '#5a4438'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(40,30,24,0.6)'; ctx.lineWidth = 2;
      for (let r = 0; r < h; r += 12) { ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x + w, y + r); ctx.stroke(); }
    }
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s;
      const grd = ctx.createLinearGradient(x, 0, x, s);
      grd.addColorStop(0, 'rgba(35,32,28,0.3)'); grd.addColorStop(1, 'rgba(35,32,28,0)');
      ctx.fillStyle = grd; ctx.fillRect(x, 0, 5 + Math.random() * 10, s);
    }
    // окно
    const ox = 156, oy = 140;
    ctx.fillStyle = '#4f4a42'; ctx.fillRect(ox - 10, oy - 10, 220, 260);
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(ox, oy, 200, 240);
    ctx.fillStyle = 'rgba(125,135,158,0.1)'; ctx.fillRect(ox, oy, 200, 80);
    ctx.strokeStyle = '#2c2a26'; ctx.lineWidth = 8; ctx.strokeRect(ox, oy, 200, 240);
    ctx.beginPath(); ctx.moveTo(ox + 100, oy); ctx.lineTo(ox + 100, oy + 240); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy + 120); ctx.lineTo(ox + 200, oy + 120); ctx.stroke();
  });
}

// Асфальт: альбедо + карта шероховатости с лужами (лужи гладкие — бликуют под фонарями)
function asphaltTextures() {
  // лужи общие для обеих карт
  const puddles = [];
  for (let i = 0; i < 7; i++) {
    puddles.push([Math.random() * 512, Math.random() * 512, 22 + Math.random() * 52, 14 + Math.random() * 30]);
  }
  const blob = (ctx, x, y, rx, ry, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let a = 0; a <= 16; a++) {
      const t = a / 16 * Math.PI * 2;
      const w = 1 + Math.sin(a * 2.7 + x) * 0.25;
      const px = x + Math.cos(t) * rx * w, py = y + Math.sin(t) * ry * w;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.fill();
  };
  const map = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#43464d'; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 5200, 0.10);
    for (let i = 0; i < 16; i++) { // трещины
      ctx.strokeStyle = 'rgba(8,9,11,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) { // заплатки свежего асфальта
      ctx.fillStyle = 'rgba(28,30,34,0.6)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 50 + Math.random() * 90, 40 + Math.random() * 70);
    }
    for (const [x, y, rx, ry] of puddles) blob(ctx, x, y, rx, ry, 'rgba(12,14,20,0.85)');
  });
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#999'; ctx.fillRect(0, 0, 512, 512); // мокрый асфальт, средняя шероховатость
  for (let i = 0; i < 2000; i++) {
    const v = 120 + Math.random() * 70 | 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  for (const [x, y, rx, ry] of puddles) blob(ctx, x, y, rx, ry, '#0a0a0a'); // лужи — зеркало
  const rough = new THREE.CanvasTexture(c);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}

export function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,170,80,0.85)');
  g.addColorStop(0.35, 'rgba(255,150,60,0.25)');
  g.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function skyTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#03040a');
  g.addColorStop(0.55, '#070a12');
  g.addColorStop(0.8, '#11131c');
  g.addColorStop(0.93, '#241c14');
  g.addColorStop(1, '#2e2418');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
  // звёзды в верхней трети
  for (let i = 0; i < 60; i++) {
    const a = 0.15 + Math.random() * 0.5;
    ctx.fillStyle = `rgba(200,210,235,${a})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 170, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- сборка мира ----------

const FLOOR_H = { panel: 2.8, shop: 3.6, garage: 2.6, school: 3.3, industrial: 3.4, station: 4.0, misc: 2.9 };
const ROAD_STYLE = {
  primary: { w: 13, y: 0.05, c: [0.16, 0.165, 0.185] },
  secondary: { w: 9, y: 0.04, c: [0.145, 0.15, 0.17] },
  street: { w: 6.5, y: 0.03, c: [0.135, 0.14, 0.16] },
  service: { w: 4, y: 0.02, c: [0.12, 0.125, 0.142] },
  path: { w: 1.8, y: 0.012, c: [0.15, 0.147, 0.13] },
};

export function buildWorld(scene, map) {
  const colliderEdges = [];

  // --- земля ---
  const asp = asphaltTextures();
  asp.map.repeat.set(700, 700);
  asp.rough.repeat.set(700, 700);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({ map: asp.map, roughnessMap: asp.rough, roughness: 1.0, metalness: 0.08 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(600, -0.05, -1000);
  scene.add(ground);

  // --- небо ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // --- материалы зданий ---
  const pa = panelAlbedo();
  const pBump = panelBump();
  const litA = panelEmissive([[1, 0, 1], [3, 2, 0]]);
  const litB = panelEmissive([[2, 1, 1]]);
  const litC = panelEmissive([]); // совсем тёмный дом
  const panelOpts = { map: pa, bumpMap: pBump, bumpScale: 1.4, emissive: 0xffffff, vertexColors: true, roughness: 0.85 };
  const mats = {
    panelA: new THREE.MeshStandardMaterial({ ...panelOpts, emissiveMap: litA, emissiveIntensity: 1.3 }),
    panelB: new THREE.MeshStandardMaterial({ ...panelOpts, emissiveMap: litB, emissiveIntensity: 1.3 }),
    panelC: new THREE.MeshStandardMaterial({ ...panelOpts, emissiveMap: litC, emissiveIntensity: 1.0 }),
    garage: new THREE.MeshStandardMaterial({ map: garageAlbedo(), vertexColors: true, roughness: 0.9 }),
    shop: new THREE.MeshStandardMaterial({ map: shopAlbedo(), emissive: 0xffffff, emissiveMap: shopEmissive(), emissiveIntensity: 0.55, vertexColors: true, roughness: 0.8 }),
    misc: new THREE.MeshStandardMaterial({ map: miscAlbedo(), vertexColors: true, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.95, side: THREE.DoubleSide }),
  };
  const bufs = { panelA: new MeshBuf(), panelB: new MeshBuf(), panelC: new MeshBuf(), garage: new MeshBuf(), shop: new MeshBuf(), misc: new MeshBuf() };
  const roofBuf = new MeshBuf();

  // оттенки питерских панелек: серый, бежевый, грязно-розовый, желтоватый
  const tints = [[0.85, 0.85, 0.88], [0.92, 0.87, 0.78], [0.9, 0.78, 0.76], [0.88, 0.86, 0.72], [0.78, 0.8, 0.84]];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  for (const b of map.buildings) {
    const isPanel = b.k === 'panel' || (b.k === 'misc' && b.l >= 5);
    const kind = isPanel ? 'panel' : b.k;
    const h = b.l * (FLOOR_H[kind] || 2.9);
    let bufName, uCell, vRep;
    if (isPanel) {
      const r = rnd();
      bufName = r < 0.35 ? 'panelA' : r < 0.75 ? 'panelB' : 'panelC';
      uCell = 12; vRep = b.l / 4;
    } else if (kind === 'garage' || kind === 'industrial') { bufName = 'garage'; uCell = 3.2; vRep = 1; }
    else if (kind === 'shop') { bufName = 'shop'; uCell = 6; vRep = 1; }
    else { bufName = 'misc'; uCell = 5; vRep = Math.max(1, Math.round(b.l)); }
    const buf = bufs[bufName];
    const tint = isPanel ? tints[(rnd() * tints.length) | 0] : [0.82 + rnd() * 0.18, 0.82 + rnd() * 0.15, 0.8 + rnd() * 0.12];

    const pts = b.p;
    let cum = 0;
    for (let i = 0; i < pts.length; i++) {
      let [x1, z1] = pts[i];
      let [x2, z2] = pts[(i + 1) % pts.length];
      colliderEdges.push(x1, z1, x2, z2);
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      // наружная нормаль: проверяем серединой
      let nx = -dz / len, nz = dx / len;
      if (pointInPoly(pts, (x1 + x2) / 2 + nx * 0.4, (z1 + z2) / 2 + nz * 0.4)) {
        nx = -nx; nz = -nz;
        [x1, z1, x2, z2] = [x2, z2, x1, z1];
      }
      const u0 = cum / uCell, u1 = (cum + len) / uCell;
      buf.quad(x1, 0, z1, x2, 0, z2, x2, h, z2, x1, h, z1, nx, 0, nz, u0, 0, u1, vRep, ...tint);
      cum += len;
    }
    // крыша
    const v2 = pts.map(p => new THREE.Vector2(p[0], p[1]));
    try {
      const tris = THREE.ShapeUtils.triangulateShape(v2, []);
      for (const [a, c, d] of tris) {
        roofBuf.tri(pts[a][0], h, pts[a][1], pts[c][0], h, pts[c][1], pts[d][0], h, pts[d][1], 0, 1, 0, 1, 1, 1);
      }
    } catch (e) { /* самопересекающийся контур — пропускаем крышу */ }
  }
  for (const [name, buf] of Object.entries(bufs)) scene.add(buf.build(mats[name]));
  scene.add(roofBuf.build(mats.roof));

  // --- дороги ---
  const roadBuf = new MeshBuf();
  const dashBuf = new MeshBuf();
  const lampPositions = [];
  for (const r of map.roads) {
    const st = ROAD_STYLE[r.c];
    if (!st) continue;
    strip(roadBuf, r.p, st.w, st.y, ...st.c);
    // разметка и фонари на улицах и крупнее — шаг считаем вдоль всей улицы,
    // потому что сегменты OSM короткие и шаг "внутри сегмента" почти не срабатывает
    if (r.c === 'street' || r.c === 'secondary' || r.c === 'primary') {
      let acc = 0, nextLamp = 12, nextDash = 5, side = 1;
      const off = st.w / 2 + 1.2;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1];
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
        while (nextDash <= acc + len) {
          const d = nextDash - acc;
          const dl = Math.min(3, len - d);
          if (dl > 0.8) {
            const mx = x1 + ux * d, mz = z1 + uz * d;
            dashBuf.quad(mx + px * 0.09, st.y + 0.006, mz + pz * 0.09, mx - px * 0.09, st.y + 0.006, mz - pz * 0.09,
              mx + ux * dl - px * 0.09, st.y + 0.006, mz + uz * dl - pz * 0.09, mx + ux * dl + px * 0.09, st.y + 0.006, mz + uz * dl + pz * 0.09,
              0, 1, 0, 0, 0, 1, 1, 0.42, 0.43, 0.45);
          }
          nextDash += 11;
        }
        while (nextLamp <= acc + len) {
          const d = nextLamp - acc;
          lampPositions.push([x1 + ux * d + px * off * side, z1 + uz * d + pz * off * side]);
          side = -side;
          nextLamp += 26;
        }
        acc += len;
      }
    }
  }
  const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.1 });
  scene.add(roadBuf.build(roadMat));
  scene.add(dashBuf.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));

  // --- ж/д ---
  const railBuf = new MeshBuf();
  for (const line of map.rail) {
    strip(railBuf, line, 5, 0.015, 0.085, 0.082, 0.078, false);
    for (const off of [-0.76, 0.76]) {
      strip(railBuf, offsetLine(line, off), 0.14, 0.07, 0.30, 0.32, 0.35, false);
    }
  }
  scene.add(railBuf.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 })));

  // --- вода ---
  const waterBuf = new MeshBuf();
  for (const poly of map.water) {
    const pts = [...poly];
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    const v2 = pts.map(p => new THREE.Vector2(p[0], p[1]));
    try {
      const tris = THREE.ShapeUtils.triangulateShape(v2, []);
      for (const [a, c, d] of tris) {
        waterBuf.tri(pts[a][0], -0.02, pts[a][1], pts[c][0], -0.02, pts[c][1], pts[d][0], -0.02, pts[d][1], 0, 1, 0, 1, 1, 1);
      }
    } catch (e) { }
  }
  scene.add(waterBuf.build(new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.12, metalness: 0.6, side: THREE.DoubleSide })));

  // --- парки (тёмная трава) + деревья ---
  const parkBuf = new MeshBuf();
  const treeSpots = [];
  for (const park of map.parks) {
    const pts = [...park.p];
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    const v2 = pts.map(p => new THREE.Vector2(p[0], p[1]));
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    try {
      const tris = THREE.ShapeUtils.triangulateShape(v2, []);
      for (const [a, c, d] of tris) {
        parkBuf.tri(pts[a][0], 0.008, pts[a][1], pts[c][0], 0.008, pts[c][1], pts[d][0], 0.008, pts[d][1], 0, 1, 0, 1, 1, 1);
      }
    } catch (e) { continue; }
    if (park.k === 'park' && treeSpots.length < 1800) {
      const area = (maxX - minX) * (maxZ - minZ);
      const want = Math.min(120, Math.max(2, area / 220));
      for (let t = 0, tries = 0; t < want && tries < want * 8; tries++) {
        const x = minX + Math.random() * (maxX - minX), z = minZ + Math.random() * (maxZ - minZ);
        if (pointInPoly(pts, x, z)) { treeSpots.push([x, z]); t++; }
      }
    }
  }
  scene.add(parkBuf.build(new THREE.MeshStandardMaterial({ color: 0x0e140e, roughness: 1 })));

  if (treeSpots.length) {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 3, 5);
    const crownGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a150f, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x0d1410, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
    const m = new THREE.Matrix4();
    treeSpots.forEach(([x, z], i) => {
      const s = 0.8 + Math.random() * 1.1;
      m.makeScale(1, s, 1).setPosition(x, 1.5 * s, z);
      trunks.setMatrixAt(i, m);
      m.makeScale(s * (0.8 + Math.random() * 0.5), s, s * (0.8 + Math.random() * 0.5)).setPosition(x + (Math.random() - 0.5), 3 * s + 0.5, z + (Math.random() - 0.5));
      crowns.setMatrixAt(i, m);
    });
    scene.add(trunks, crowns);
  }

  // --- заборы ---
  const fenceBuf = new MeshBuf();
  for (const line of map.fences) {
    for (let i = 0; i < line.length - 1; i++) {
      const [x1, z1] = line[i], [x2, z2] = line[i + 1];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const nx = -dz / len, nz = dx / len;
      fenceBuf.quad(x1, 0, z1, x2, 0, z2, x2, 1.55, z2, x1, 1.55, z1, nx, 0, nz, 0, 0, len / 2.5, 1, 0.12, 0.13, 0.15);
    }
  }
  scene.add(fenceBuf.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide })));

  // --- фонарные столбы (инстансы) ---
  let lampMeshes = null;
  if (lampPositions.length) {
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 7.2, 6);
    const headGeo = new THREE.SphereGeometry(0.21, 8, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x110a04, emissive: 0xff9a3c, emissiveIntensity: 2.8 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, lampPositions.length);
    const m = new THREE.Matrix4();
    lampPositions.forEach(([x, z], i) => {
      m.identity().setPosition(x, 3.6, z); poles.setMatrixAt(i, m);
      m.identity().setPosition(x, 7.25, z); heads.setMatrixAt(i, m);
    });
    scene.add(poles, heads);
    // ореолы (Points)
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(
      lampPositions.flatMap(([x, z]) => [x, 7.25, z]), 3));
    const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      map: glowTex(), size: 5.5, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0xffac55, opacity: 0.55,
    }));
    scene.add(glow);
    lampMeshes = { poles, heads, glow };
  }

  return { colliderEdges, lampPositions, lampMeshes };
}

// ---------- узнаваемость: адресные таблички, подъезды, метро ----------

function longestEdge(pts) {
  let bi = 0, bl = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l > bl) { bl = l; bi = i; }
  }
  const [x1, z1] = pts[bi], [x2, z2] = pts[(bi + 1) % pts.length];
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len, nz = dx / len; // наружная нормаль
  if (pointInPoly(pts, (x1 + x2) / 2 + nx * 0.4, (z1 + z2) / 2 + nz * 0.4)) { nx = -nx; nz = -nz; }
  return { x1, z1, x2, z2, len, nx, nz, mx: (x1 + x2) / 2, mz: (z1 + z2) / 2 };
}

function plaqueTexture(street, num) {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d2c5e'; ctx.fillRect(0, 0, 360, 96);
  ctx.strokeStyle = '#cfd8e8'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 350, 86);
  ctx.fillStyle = '#e8edf6'; ctx.textAlign = 'center';
  let fs = 22;
  ctx.font = `${fs}px Arial`;
  while (ctx.measureText(street).width > 320 && fs > 12) { fs -= 2; ctx.font = `${fs}px Arial`; }
  ctx.fillText(street, 180, 36);
  ctx.font = 'bold 40px Arial';
  ctx.fillText(num, 180, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function addLandmarks(scene, map) {
  // --- адресные таблички (как настоящие синие в СПб) ---
  const plaques = [];
  let count = 0;
  for (const b of map.buildings) {
    if (!b.n || count >= 650) continue;
    const comma = b.n.lastIndexOf(',');
    const street = comma > 0 ? b.n.slice(0, comma) : b.n;
    const num = comma > 0 ? b.n.slice(comma + 1).trim() : '';
    if (!num) continue;
    const e = longestEdge(b.p);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.64),
      new THREE.MeshBasicMaterial({ map: plaqueTexture(street, num), fog: true })
    );
    mesh.position.set(e.mx + e.nx * 0.22, 3.1, e.mz + e.nz * 0.22);
    mesh.lookAt(e.mx + e.nx * 10, 3.1, e.mz + e.nz * 10);
    mesh.visible = false; // включаются рядом с игроком (см. game.js)
    scene.add(mesh);
    plaques.push(mesh);
    count++;
  }

  // --- светящиеся двери подъездов у панелек ---
  const doorGeo = new THREE.BoxGeometry(1.5, 2.3, 0.18);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x553f22, emissive: 0xffc678, emissiveIntensity: 0.85 });
  const doorPos = [];
  for (const b of map.buildings) {
    const isPanel = b.k === 'panel' || (b.k === 'misc' && b.l >= 5);
    if (!isPanel) continue;
    const e = longestEdge(b.p);
    const n = Math.max(1, Math.round(e.len / 26));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      doorPos.push([e.x1 + (e.x2 - e.x1) * t + e.nx * 0.12, e.z1 + (e.z2 - e.z1) * t + e.nz * 0.12, Math.atan2(e.nx, e.nz)]);
    }
  }
  if (doorPos.length) {
    const doors = new THREE.InstancedMesh(doorGeo, doorMat, doorPos.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    doorPos.forEach(([x, z, ang], i) => {
      q.setFromAxisAngle(up, ang);
      p.set(x, 1.15, z);
      m.compose(p, q, s);
      doors.setMatrixAt(i, m);
    });
    scene.add(doors);
    // тёплые ореолы над дверями
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(doorPos.flatMap(([x, z]) => [x, 2.6, z]), 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      map: glowTex(), size: 2.6, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffc070, opacity: 0.5,
    })));
  }

  // --- метро РЫБАЦКОЕ: буква М и название, видны издалека ---
  const mCanvas = document.createElement('canvas');
  mCanvas.width = mCanvas.height = 256;
  let ctx = mCanvas.getContext('2d');
  ctx.fillStyle = '#08090c'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#d23b2f'; ctx.lineWidth = 26; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(38, 218); ctx.lineTo(38, 48); ctx.lineTo(128, 165); ctx.lineTo(218, 48); ctx.lineTo(218, 218);
  ctx.stroke();
  const mTex = new THREE.CanvasTexture(mCanvas); mTex.colorSpace = THREE.SRGBColorSpace;
  const mSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2),
    new THREE.MeshBasicMaterial({ map: mTex, transparent: false, side: THREE.DoubleSide, fog: false })
  );
  mSign.position.set(map.spawn.x, 13.2, map.spawn.z);
  scene.add(mSign);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 10.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 }));
  pole.position.set(map.spawn.x, 5.3, map.spawn.z);
  scene.add(pole);

  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 1024; nameCanvas.height = 128;
  ctx = nameCanvas.getContext('2d');
  ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#e8ecf4'; ctx.font = '300 86px Arial'; ctx.textAlign = 'center';
  ctx.fillText('Р Ы Б А Ц К О Е', 512, 95);
  const nameTex = new THREE.CanvasTexture(nameCanvas); nameTex.colorSpace = THREE.SRGBColorSpace;
  const nameSign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 1.4),
    new THREE.MeshBasicMaterial({ map: nameTex, side: THREE.DoubleSide, fog: true })
  );
  nameSign.position.set(map.spawn.x, 5.6, map.spawn.z);
  nameSign.rotation.y = 0.5;
  scene.add(nameSign);

  // холодные лампы у метро
  const metroGlowGeo = new THREE.BufferGeometry();
  metroGlowGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    map.spawn.x, 13.2, map.spawn.z, map.spawn.x + 4, 5.5, map.spawn.z + 2, map.spawn.x - 4, 5.5, map.spawn.z - 2,
  ], 3));
  scene.add(new THREE.Points(metroGlowGeo, new THREE.PointsMaterial({
    map: glowTex(), size: 13, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xcfdcff, opacity: 0.65,
  })));
  const metroLight = new THREE.PointLight(0xcfe0ff, 120, 45, 1.8);
  metroLight.position.set(map.spawn.x, 7.5, map.spawn.z);
  scene.add(metroLight);

  // --- выбор квартиры друга: настоящий адрес в 400-800 м от метро ---
  let friend = null, bestScore = 1e18;
  for (const b of map.buildings) {
    if (!b.n || b.l < 5) continue;
    if (b.k !== 'panel' && b.k !== 'misc') continue;
    const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length;
    const cz = b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
    const d = Math.hypot(cx - map.spawn.x, cz - map.spawn.z);
    if (d < 350 || d > 900) continue;
    let score = Math.abs(d - 550);
    if (b.n.includes('Тепловозная')) score -= 250;
    if (score < bestScore) {
      const e = longestEdge(b.p);
      bestScore = score;
      friend = { address: b.n, x: cx, z: cz, doorX: e.mx + e.nx * 1.2, doorZ: e.mz + e.nz * 1.2, levels: b.l };
    }
  }
  if (friend) {
    // приоткрытая светящаяся дверь — её видно
    const fl = new THREE.PointLight(0xffd9a0, 50, 22, 1.8);
    fl.position.set(friend.doorX, 2.4, friend.doorZ);
    scene.add(fl);
  }

  return { plaques, friend };
}
