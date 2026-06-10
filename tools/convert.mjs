// Конвертер сырых данных OSM (Overpass out geom) в компактный data/map.json для игры.
// Запуск: node tools/convert.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => JSON.parse(readFileSync(join(root, 'data', 'raw', f), 'utf8'));

const buildings = raw('buildings.json').elements;
const roads = raw('roads.json').elements;
const extra = raw('extra.json').elements;

// --- Проекция: метро Рыбацкое = начало координат ---
const LAT0 = 59.8308399, LON0 = 30.5002908;
const M_LAT = 110540, M_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);
// x — на восток, z — на юг (right-handed Three.js: -z это север)
const px = (lon) => +((lon - LON0) * M_LON).toFixed(2);
const pz = (lat) => +(-(lat - LAT0) * M_LAT).toFixed(2);
const proj = (g) => g.map(p => [px(p.lon), pz(p.lat)]);

// --- Этажность ---
function levelsFor(tags) {
  const t = tags || {};
  const tagged = parseFloat(t['building:levels']);
  if (!isNaN(tagged) && tagged > 0) return Math.min(tagged, 30);
  const b = t.building;
  if (['garage', 'garages', 'shed', 'roof', 'service', 'kiosk', 'hut'].includes(b)) return 1;
  if (['retail', 'commercial', 'supermarket'].includes(b) || t.shop) return 1;
  if (['house', 'detached', 'semidetached_house'].includes(b)) return 2;
  if (['school', 'kindergarten'].includes(b) || ['school', 'kindergarten'].includes(t.amenity)) return 3;
  if (['apartments', 'residential', 'dormitory'].includes(b)) return 5;
  if (['industrial', 'warehouse'].includes(b)) return 2;
  return 2;
}

function kindFor(tags) {
  const t = tags || {};
  const b = t.building;
  if (['apartments', 'residential', 'dormitory'].includes(b)) return 'panel';
  if (['garage', 'garages', 'shed', 'roof', 'hut'].includes(b)) return 'garage';
  if (['school', 'kindergarten'].includes(b) || ['school', 'kindergarten'].includes(t.amenity)) return 'school';
  if (['retail', 'commercial', 'supermarket', 'kiosk', 'service'].includes(b) || t.shop) return 'shop';
  if (['industrial', 'warehouse', 'construction'].includes(b)) return 'industrial';
  if (b === 'train_station' || t.public_transport) return 'station';
  return 'misc';
}

const outBuildings = [];
let skipped = 0;
for (const el of buildings) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) { skipped++; continue; }
  const pts = proj(el.geometry);
  // замкнутый контур: последняя точка дублирует первую — убираем
  const first = pts[0], last = pts[pts.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) pts.pop();
  if (pts.length < 3) { skipped++; continue; }
  const t = el.tags || {};
  outBuildings.push({
    p: pts,
    l: levelsFor(t),
    k: kindFor(t),
    n: t['addr:street'] && t['addr:housenumber'] ? `${t['addr:street']}, ${t['addr:housenumber']}` : (t.name || undefined),
  });
}

// --- Дороги ---
const ROAD_CLASS = {
  primary: ['primary', 'primary_link', 'trunk', 'trunk_link'],
  secondary: ['secondary', 'secondary_link', 'tertiary', 'tertiary_link'],
  street: ['residential', 'unclassified', 'living_street'],
  service: ['service'],
  path: ['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track'],
};
function roadClass(hw) {
  for (const [cls, list] of Object.entries(ROAD_CLASS)) if (list.includes(hw)) return cls;
  return null;
}
const outRoads = [];
const namedStreets = new Set();
for (const el of roads) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
  const cls = roadClass((el.tags || {}).highway);
  if (!cls) continue;
  if (el.tags && el.tags.name) namedStreets.add(el.tags.name);
  outRoads.push({ p: proj(el.geometry), c: cls, n: el.tags && el.tags.name || undefined });
}

// --- Ж/д, вода, парки, заборы, станции ---
const outRail = [], outWater = [], outParks = [], outFences = [], outStations = [];
for (const el of extra) {
  if (el.type === 'node' && el.tags && el.tags.railway === 'station') {
    outStations.push({ x: px(el.lon), z: pz(el.lat), name: el.tags.name, subway: el.tags.station === 'subway' });
    continue;
  }
  if (el.type !== 'way' || !el.geometry) continue;
  const t = el.tags || {};
  const pts = proj(el.geometry);
  if (t.railway === 'rail' || t.railway === 'subway') outRail.push(pts);
  else if (t.natural === 'water' || t.waterway === 'riverbank') outWater.push(pts);
  else if (t.waterway) outRail.length; // ручьи пропускаем в v1
  else if (t.leisure === 'park' || t.leisure === 'playground') outParks.push({ p: pts, k: t.leisure });
  else if (t.barrier) outFences.push(pts);
}

// --- Спавн: у вестибюля метро Рыбацкое ---
const metro = outStations.find(s => s.subway) || outStations[0] || { x: 0, z: 0 };

// --- Границы карты ---
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const b of outBuildings) for (const [x, z] of b.p) {
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}

const map = {
  name: 'Рыбацкое',
  spawn: { x: metro.x, z: metro.z },
  bounds: { minX: Math.floor(minX), maxX: Math.ceil(maxX), minZ: Math.floor(minZ), maxZ: Math.ceil(maxZ) },
  stations: outStations,
  buildings: outBuildings,
  roads: outRoads,
  rail: outRail,
  water: outWater,
  parks: outParks,
  fences: outFences,
};

writeFileSync(join(root, 'data', 'map.json'), JSON.stringify(map));
const stats = {};
for (const b of outBuildings) stats[b.k] = (stats[b.k] || 0) + 1;
console.log('buildings:', outBuildings.length, JSON.stringify(stats));
console.log('skipped (open/multipoly):', skipped);
console.log('roads:', outRoads.length, '| rail:', outRail.length, '| water:', outWater.length, '| parks:', outParks.length, '| fences:', outFences.length);
console.log('streets:', [...namedStreets].slice(0, 12).join('; '));
console.log('stations:', outStations.map(s => `${s.name}${s.subway ? ' (метро)' : ' (жд)'} @ ${s.x},${s.z}`).join(' | '));
console.log('bounds:', JSON.stringify(map.bounds));
console.log('size:', (JSON.stringify(map).length / 1024 / 1024).toFixed(2), 'MB');
