// MicroCure — organ generation, organic meshes, analytic collision and interactables.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ORGANS, LORE, HOST, ENEMIES, ELITES, ELITE_TUNING, SPAWN_TUNING, PERFORMANCE, CRISES } from './content.js';
import { RNG, fbm, clamp, dist2, pick, TAU, angleDelta } from './utils.js';

// A septic sac: one displaced icosahedron plus a few satellite nodules and
// hanging tendrils, merged so the growth reads as a single organic mass.
function makeSacGeometry(rng) {
  const parts = [];
  const base = new THREE.IcosahedronGeometry(1, 3);
  const pos = base.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const lump =
      1 +
      0.17 * Math.sin(n.x * 7.3 + n.y * 4.1) +
      0.13 * Math.sin(n.y * 9.7 + n.z * 5.3) +
      0.08 * Math.cos(n.z * 11.1 - n.x * 3.7) +
      0.05 * Math.sin(n.x * 17.9 - n.z * 13.1);
    v.copy(n).multiplyScalar(lump);
    v.y *= 0.82;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  base.computeVertexNormals();
  parts.push(base);
  for (let i = 0; i < 6; i++) {
    const nodule = new THREE.SphereGeometry(rng.float(0.26, 0.46), 8, 6);
    const a = rng.float(0, TAU);
    nodule.translate(Math.cos(a) * 0.82, rng.float(-0.55, 0.6), Math.sin(a) * 0.82);
    parts.push(nodule);
  }
  for (let i = 0; i < 4; i++) {
    const a = rng.float(0, TAU);
    const drop = rng.float(0.7, 1.3);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.45, -0.55, Math.sin(a) * 0.45),
      new THREE.Vector3(Math.cos(a) * 0.58, -0.7 - drop * 0.4, Math.sin(a) * 0.58),
      new THREE.Vector3(Math.cos(a) * 0.48, -0.8 - drop, Math.sin(a) * 0.48),
    ]);
    parts.push(new THREE.TubeGeometry(curve, 6, rng.float(0.055, 0.1), 5, false));
  }
  // TubeGeometry and SphereGeometry are indexed, IcosahedronGeometry is not;
  // mergeGeometries refuses a mixed batch and silently drops the whole sac.
  const flat = parts.map((g) => {
    if (!g.index) return g;
    const out = g.toNonIndexed();
    g.dispose();
    return out;
  });
  let merged = null;
  try {
    merged = mergeGeometries(flat, false);
  } catch {
    merged = null;
  }
  flat.forEach((g) => g.dispose());
  if (merged) merged.computeBoundingSphere();
  return merged || new THREE.IcosahedronGeometry(1, 2);
}

// Hand-authored fallbacks. Procedural layouts are generated from the organ's
// layoutStyle below; these remain for deterministic regression checks.
const LAYOUTS = {
  lung: {
    entry: { x: 0, z: 4 },
    rooms: [
      { id: 'entry', name: 'BRONCHIAL ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'ALVEOLAR CROSSROADS', x: 0, z: -25, r: 10.5, type: 'hub', enemies: 2 },
      { id: 'east', name: 'CAUTERY CACHE', x: 23, z: -27, r: 8.5, type: 'cache', enemies: 3 },
      { id: 'west', name: 'PLEURAL ARCHIVE', x: -23, z: -28, r: 8.5, type: 'secret', enemies: 2 },
      { id: 'north', name: 'INFECTED LOBULE', x: 0, z: -52, r: 10.5, type: 'infection', enemies: 3 },
      { id: 'exit', name: 'HILAR EXTRACTION', x: 0, z: -76, r: 8, type: 'exit', enemies: 1 },
    ],
    corridors: [
      ['entry', 'hub', 8],
      ['hub', 'east', 7.2],
      ['hub', 'west', 7.2],
      ['hub', 'north', 8.4],
      ['north', 'exit', 7.2],
    ],
    gates: [
      { id: 'north-gate', edge: ['hub', 'north'], requires: 'tool', label: 'PULMONARY MEMBRANE', color: 0xe8b06a },
      { id: 'west-gate', edge: ['hub', 'west'], requires: 'tool', label: 'PLEURAL SEAL', color: 0xb7d7bd },
      { id: 'exit-seal', edge: ['north', 'exit'], requires: 'nodes', label: 'HILAR SEAL', color: 0xe8b06a },
    ],
    nodes: [
      { id: 'n1', room: 'hub', x: 5.5, z: -22 },
      { id: 'n2', room: 'east', x: 24, z: -24 },
      { id: 'n3', room: 'north', x: -4.3, z: -49.5 },
      { id: 'n4', room: 'north', x: 4.7, z: -54 },
    ],
    tool: { room: 'east', x: 19.8, z: -25.5 },
    exit: { room: 'exit', x: 0, z: -76 },
    lore: ['l1', 'l2'],
    nodesRequired: 4,
  },
  heart: {
    entry: { x: 0, z: 4 },
    rooms: [
      { id: 'entry', name: 'AORTIC ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'atrium', name: 'ATRIAL CHAMBER', x: 0, z: -27, r: 12, type: 'hub', enemies: 3 },
      { id: 'valve', name: 'MITRAL THRESHOLD', x: 0, z: -53, r: 9, type: 'infection', enemies: 2 },
      { id: 'boss', name: 'VENTRICULAR SPIRE', x: 0, z: -82, r: 18, type: 'boss', enemies: 0 },
    ],
    corridors: [
      ['entry', 'atrium', 8],
      ['atrium', 'valve', 8.2],
      ['valve', 'boss', 10],
    ],
    gates: [{ id: 'boss-seal', edge: ['valve', 'boss'], requires: 'nodes', label: 'THROMBUS SEAL', color: 0xff7a55 }],
    nodes: [
      { id: 'h1', room: 'atrium', x: -6.5, z: -24 },
      { id: 'h2', room: 'atrium', x: 6.8, z: -29 },
      { id: 'h3', room: 'valve', x: 2.5, z: -52 },
    ],
    tool: null,
    exit: null,
    lore: ['l3', 'l4'],
    nodesRequired: 3,
    boss: { x: 0, z: -86 },
    obstacles: [
      { x: -8.5, z: -80, r: 1.5, h: 6.5, type: 'calcified' },
      { x: 8.5, z: -80, r: 1.5, h: 6.5, type: 'calcified' },
      { x: -7.2, z: -90.5, r: 1.2, h: 5, type: 'calcified' },
      { x: 7.2, z: -90.5, r: 1.2, h: 5, type: 'calcified' },
    ],
  },
};

// ------------------------------------------------------------------ procedural layouts
// Each organ is a topology, not a reskin: a central branch, a closed ring, a
// spiral that doubles back, a ladder of short rooms, or a chain of ventricle
// chambers. Positions are authored as templates and then jittered from the run
// seed, so the route is learnable without being identical twice.
function layoutShift(points, rng, jitter = 1) {
  return points.map((p) => ({
    ...p,
    x: p.x + rng.float(-jitter, jitter),
    z: p.z + rng.float(-jitter, jitter),
    r: p.r * rng.float(0.94, 1.06),
  }));
}

function buildLayoutFromPoints(points, organId, seed, run) {
  const def = ORGANS[organId];
  const rng = new RNG((seed >>> 0) ^ 0x27d4eb2f);
  const final = organId === 'heart';
  const tier = run?.tier || 1;
  const rooms = layoutShift(points, rng, 0.8).map((p) => ({
    ...p,
    enemies: p.type === 'entry'
      ? 0
      : p.type === 'boss'
        ? 0
        : Math.max(1, Math.round((p.enemies ?? 2) + Math.min(3, (tier - 1) * 0.45))),
  }));
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const corridors = [];
  const gates = [];
  const nodes = [];
  const obstacles = [];

  const connect = (a, b, width) => {
    if (!byId.has(a) || !byId.has(b)) return;
    if (corridors.some(([ca, cb]) => (ca === a && cb === b) || (ca === b && cb === a))) return;
    corridors.push([a, b, width]);
  };

  const sideIds = new Set(rooms.filter((r) => r.type === 'cache' || r.type === 'secret').map((r) => r.id));
  const mainRooms = rooms.filter((r) => !sideIds.has(r.id));
  for (let i = 1; i < mainRooms.length; i++) {
    const a = mainRooms[i - 1];
    const b = mainRooms[i];
    const width = Math.max(6.4, Math.min(9.4, (a.r + b.r) * 0.42));
    connect(a.id, b.id, width);
  }

  // Optional loop edge turns the ring into an actual circuit.
  if (def.layoutStyle === 'ring') {
    const hub = rooms.find((r) => r.id === 'hub');
    const south = rooms.find((r) => r.id === 'south');
    if (hub && south) connect(hub.id, south.id, 7.2);
  }

  const entry = rooms[0];
  const hubRoom = rooms.find((r) => r.type === 'hub') || rooms[1];
  const cache = rooms.find((r) => r.type === 'cache');
  const secret = rooms.find((r) => r.type === 'secret');
  const finalRoom = rooms[rooms.length - 1];

  // Tool-gated side rooms. The tool always exists in the first organ; later
  // organs still contain a charge so a fresh save/route can never dead-end.
  for (const side of [cache, secret]) {
    if (!side) continue;
    const from = hubRoom;
    connect(from.id, side.id, 6.6);
    gates.push({
      id: `${side.id}-seal`,
      edge: [from.id, side.id],
      requires: 'tool',
      label: side.id === cache ? 'VASCULAR MEMBRANE' : 'PLEURAL SEAL',
      color: side.id === cache ? 0xe8b06a : 0xb7d7bd,
    });
  }

  // The final seal eats the whole route's node count.
  if (rooms.length > 2) {
    const before = rooms[rooms.length - 2];
    gates.push({
      id: final ? 'boss-seal' : 'exit-seal',
      edge: [before.id, finalRoom.id],
      requires: 'nodes',
      label: final ? 'THROMBUS SEAL' : 'HILAR SEAL',
      color: final ? 0xff7a55 : 0xe8b06a,
    });
  }

  // Node count grows with case tier but never into a slog.
  const nodeCount = final ? 3 : 4 + (tier >= 4 ? 1 : 0) + (rng.chance(0.35) ? 1 : 0);
  // Nodes must sit on the main route. Optional archive/cache rooms may hold
  // lore or the tool, but never a mandatory infection node behind their gate.
  const nodeRooms = rng.shuffle(rooms.filter((r) => r.type !== 'entry' && r.type !== 'boss' && r.type !== 'exit' && r.type !== 'cache' && r.type !== 'secret'));
  for (let i = 0; i < nodeCount; i++) {
    // Spread nodes around the route instead of stacking five in one room.
    const room = nodeRooms[i % nodeRooms.length];
    let x = room.x + rng.float(-room.r * 0.45, room.r * 0.45);
    let z = room.z + rng.float(-room.r * 0.45, room.r * 0.45);
    const p = new THREE.Vector2(x, z);
    if (p.distanceTo(new THREE.Vector2(room.x, room.z)) > room.r * 0.62) {
      const d = p.clone().sub(new THREE.Vector2(room.x, room.z)).normalize();
      p.copy(new THREE.Vector2(room.x, room.z).addScaledVector(d, room.r * 0.5));
      x = p.x;
      z = p.y;
    }
    nodes.push({ id: `n${organId}-${i}`, room: room.id, x, z });
  }

  // A few pillar obstructions give rooms a silhouette to fight around.
  for (const room of rooms) {
    if (room.type === 'entry' || room.type === 'boss') continue;
    const count = rng.int(0, 2);
    for (let i = 0; i < count; i++) {
      const a = rng.float(0, TAU);
      const d = room.r * rng.float(0.46, 0.66);
      const x = room.x + Math.cos(a) * d;
      const z = room.z + Math.sin(a) * d;
      if (nodes.some((n) => dist2(n.x, n.z, x, z) < 2.8)) continue;
      if (dist2(x, z, room.x, room.z) < 3) continue;
      obstacles.push({ x, z, r: rng.float(0.65, 1.25), h: rng.float(2.4, 6.2), type: 'spur' });
    }
  }

  // The tool sits on the main path, never behind its own gate. It is the key
  // to the optional rooms, not a reward hidden inside the locked room.
  const tool = run && !run.hasCautery && hubRoom
    ? { room: hubRoom.id, x: hubRoom.x + hubRoom.r * 0.32, z: hubRoom.z - hubRoom.r * 0.24 }
    : null;

  return {
    entry: { x: entry.x, z: entry.z },
    rooms,
    corridors,
    gates,
    nodes,
    tool,
    exit: final ? null : { room: finalRoom.id, x: finalRoom.x, z: finalRoom.z },
    boss: final ? { x: finalRoom.x, z: finalRoom.z } : undefined,
    obstacles,
    lore: LORE.filter((l) => l.organ === organId).map((l) => l.id),
    nodesRequired: nodes.length,
    style: def.layoutStyle || 'branch',
  };
}

function generateLayout(organId, seed, run) {
  const style = ORGANS[organId]?.layoutStyle || 'branch';
  const final = organId === 'heart';
  const endType = final ? 'boss' : 'exit';
  const endId = final ? 'boss' : 'exit';
  let points;

  if (style === 'spire' || final) {
    points = [
      { id: 'entry', name: 'AORTIC ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'atrium', name: 'ATRIAL CHAMBER', x: 0, z: -26, r: 11, type: 'hub', enemies: 2 },
      { id: 'cache', name: 'VALVE CACHE', x: 23, z: -30, r: 8, type: 'cache', enemies: 2 },
      { id: 'secret', name: 'ENDOCARDIAL ARCHIVE', x: -23, z: -32, r: 8, type: 'secret', enemies: 2 },
      { id: 'valve', name: 'MITRAL THRESHOLD', x: 0, z: -54, r: 9.5, type: 'infection', enemies: 3 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'AORTIC EXTRACTION', x: 0, z: -84, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else if (style === 'alveolar') {
    points = [
      { id: 'entry', name: 'BRONCHIAL ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'ALVEOLAR CROSSROADS', x: 0, z: -26, r: 11, type: 'hub', enemies: 2 },
      { id: 'cache', name: 'CAUTERY CACHE', x: 24, z: -32, r: 8.5, type: 'cache', enemies: 2 },
      { id: 'secret', name: 'PLEURAL ARCHIVE', x: -24, z: -34, r: 8.5, type: 'secret', enemies: 3 },
      { id: 'infection', name: 'INFECTED LOBULE', x: 0, z: -56, r: 10, type: 'infection', enemies: 3 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'HILAR EXTRACTION', x: 0, z: -82, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else if (style === 'branch') {
    points = [
      { id: 'entry', name: 'HEPATIC ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'PORTAL CROSSROADS', x: 0, z: -26, r: 11, type: 'hub', enemies: 2 },
      { id: 'secret', name: 'BILE ARCHIVE', x: -26, z: -32, r: 8.5, type: 'secret', enemies: 3 },
      { id: 'cache', name: 'SINUSOID CACHE', x: 25, z: -36, r: 8.5, type: 'cache', enemies: 2 },
      { id: 'infection', name: 'NECROTIC LOBULE', x: 0, z: -58, r: 10, type: 'infection', enemies: 4 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'DUCTAL EXTRACTION', x: 0, z: -82, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else if (style === 'ring') {
    points = [
      { id: 'entry', name: 'RENAL ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'CORTICAL CROSSING', x: 0, z: -28, r: 10, type: 'hub', enemies: 2 },
      { id: 'secret', name: 'GLOMERULAR VAULT', x: -27, z: -36, r: 8, type: 'secret', enemies: 2 },
      { id: 'north', name: 'NEPHRON LOOP', x: -24, z: -62, r: 9, type: 'infection', enemies: 3 },
      { id: 'cache', name: 'PELVIC CACHE', x: 22, z: -64, r: 8.5, type: 'cache', enemies: 3 },
      { id: 'south', name: 'MEDULLARY RETURN', x: 25, z: -36, r: 9, type: 'infection', enemies: 3 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'URETERAL EXTRACTION', x: 0, z: -96, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else if (style === 'spiral') {
    points = [
      { id: 'entry', name: 'MENINGEAL ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'SYNAPTIC CROSSING', x: 0, z: -24, r: 10, type: 'hub', enemies: 2 },
      { id: 'cache', name: 'DENDRITE CACHE', x: 23, z: -34, r: 8, type: 'cache', enemies: 2 },
      { id: 'a', name: 'CORTICAL FOLD', x: 8, z: -50, r: 9, type: 'infection', enemies: 3 },
      { id: 'b', name: 'MEMORY PIT', x: -18, z: -58, r: 9.5, type: 'infection', enemies: 3 },
      { id: 'secret', name: 'DREAM ARCHIVE', x: -34, z: -38, r: 8, type: 'secret', enemies: 2 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'CORTICAL EXTRACTION', x: 0, z: -92, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else if (style === 'ladder') {
    points = [
      { id: 'entry', name: 'FEMORAL ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'CORTICAL SHAFT', x: -16, z: -26, r: 10, type: 'hub', enemies: 2 },
      { id: 'cache', name: 'OSTEON CACHE', x: 18, z: -30, r: 8, type: 'cache', enemies: 2 },
      { id: 'a', name: 'TRABECULAR WELL', x: 14, z: -52, r: 9, type: 'infection', enemies: 3 },
      { id: 'secret', name: 'DONOR ARCHIVE', x: -22, z: -58, r: 8, type: 'secret', enemies: 2 },
      { id: 'b', name: 'MARROW SPILL', x: -12, z: -78, r: 9.5, type: 'infection', enemies: 4 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'FEMORAL EXTRACTION', x: 10, z: -102, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else if (style === 'coil') {
    points = [
      { id: 'entry', name: 'GASTRIC ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'DUODENAL BEND', x: 0, z: -26, r: 10, type: 'hub', enemies: 2 },
      { id: 'cache', name: 'VILLUS CACHE', x: 23, z: -30, r: 8, type: 'cache', enemies: 2 },
      { id: 'a', name: 'JEJUNAL COIL', x: 22, z: -54, r: 9, type: 'infection', enemies: 3 },
      { id: 'b', name: 'ACID POOL', x: 6, z: -76, r: 9.5, type: 'infection', enemies: 3 },
      { id: 'secret', name: 'ABSORPTION ARCHIVE', x: -22, z: -64, r: 8, type: 'secret', enemies: 2 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'ILEAL EXTRACTION', x: -18, z: -96, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  } else {
    points = [
      { id: 'entry', name: 'LYMPHATIC ACCESS', x: 0, z: 0, r: 8, type: 'entry', enemies: 0 },
      { id: 'hub', name: 'FILTER GARDEN', x: 0, z: -28, r: 11, type: 'hub', enemies: 2 },
      { id: 'secret', name: 'GERMINAL ARCHIVE', x: -27, z: -34, r: 8.5, type: 'secret', enemies: 2 },
      { id: 'cache', name: 'NODAL CACHE', x: 27, z: -38, r: 8.5, type: 'cache', enemies: 2 },
      { id: 'infection', name: 'REACTIVE FOLLICLE', x: 0, z: -60, r: 10, type: 'infection', enemies: 4 },
      { id: endId, name: final ? 'VENTRICULAR SPIRE' : 'THORACIC EXTRACTION', x: 0, z: -86, r: final ? 18 : 8.5, type: endType, enemies: final ? 0 : 2 },
    ];
  }

  return buildLayoutFromPoints(points, organId, seed, run);
}

// ------------------------------------------------------------------ textures
function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function makeTissueTexture(palette, seed, floor = false) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = floor ? hexCss(palette.floor) : hexCss(palette.tissue);
  g.fillRect(0, 0, size, size);
  const rng = new RNG(seed);

  // Broad discoloration.
  for (let i = 0; i < 34; i++) {
    const x = rng.float(0, size);
    const y = rng.float(0, size);
    const r = rng.float(25, 140);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.55);
    grad.addColorStop(0, dark ? 'rgba(25,4,6,0.22)' : 'rgba(255,190,160,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Capillary network.
  const drawVein = (x, y, angle, width, depth) => {
    if (depth <= 0 || width < 0.35) return;
    const len = rng.float(18, 60);
    const wobble = rng.float(-0.8, 0.8);
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    const mx = x + Math.cos(angle + wobble) * len * 0.5;
    const my = y + Math.sin(angle + wobble) * len * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(mx, my, ex, ey);
    g.strokeStyle = depth > 1 ? 'rgba(70,10,16,0.38)' : 'rgba(255,176,150,0.22)';
    g.lineWidth = width;
    g.lineCap = 'round';
    g.stroke();
    drawVein(ex, ey, angle + rng.float(-0.55, 0.55), width * 0.64, depth - 1);
    if (rng.chance(0.55)) {
      drawVein(mx, my, angle + rng.float(-1.2, 1.2), width * 0.5, depth - 1);
    }
  };
  for (let i = 0; i < 16; i++) {
    drawVein(rng.float(0, size), rng.float(0, size), rng.float(0, TAU), rng.float(1.5, 4.2), 3);
  }

  // Cells and grit.
  for (let i = 0; i < 2800; i++) {
    const a = rng.float(0.015, 0.08);
    g.fillStyle = rng.chance(0.5) ? `rgba(255,225,205,${a})` : `rgba(20,2,4,${a})`;
    const r = rng.float(0.4, 2.2);
    g.beginPath();
    g.arc(rng.float(0, size), rng.float(0, size), r, 0, TAU);
    g.fill();
  }
  if (floor) {
    for (let i = 0; i < 16; i++) {
      const x = rng.float(0, size);
      const y = rng.float(0, size);
      const r = rng.float(18, 70);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,180,130,0.08)');
      grad.addColorStop(0.6, 'rgba(20,2,4,0.16)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(floor ? 7 : 5, floor ? 7 : 5);
  tex.anisotropy = 8;
  return tex;
}

function makeBumpTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  for (let i = 0; i < 1200; i++) {
    const v = Math.floor(rng.float(90, 180));
    g.fillStyle = `rgba(${v},${v},${v},0.14)`;
    g.beginPath();
    g.arc(rng.float(0, size), rng.float(0, size), rng.float(1, 5), 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo(rng.float(0, size), rng.float(0, size));
    g.bezierCurveTo(
      rng.float(0, size), rng.float(0, size),
      rng.float(0, size), rng.float(0, size),
      rng.float(0, size), rng.float(0, size)
    );
    g.strokeStyle = 'rgba(30,30,30,0.4)';
    g.lineWidth = rng.float(0.5, 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  return tex;
}

function makeMembraneTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rng = new RNG(seed);
  const cx = size / 2;
  const cy = size / 2;
  for (let i = 0; i < 30; i++) {
    const a = rng.float(0, TAU);
    const r = rng.float(size * 0.15, size * 0.52);
    g.beginPath();
    g.moveTo(cx, cy);
    g.bezierCurveTo(
      cx + Math.cos(a + 0.5) * r * 0.5, cy + Math.sin(a + 0.5) * r * 0.5,
      cx + Math.cos(a - 0.3) * r * 0.8, cy + Math.sin(a - 0.3) * r * 0.8,
      cx + Math.cos(a) * r, cy + Math.sin(a) * r
    );
    g.strokeStyle = `rgba(255,196,150,${rng.float(0.06, 0.22)})`;
    g.lineWidth = rng.float(0.5, 2.2);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const r = rng.float(size * 0.15, size * 0.4);
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.strokeStyle = 'rgba(255,150,120,0.12)';
    g.lineWidth = rng.float(1, 3);
    g.stroke();
  }
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.55);
  grad.addColorStop(0, 'rgba(255,190,150,0.22)');
  grad.addColorStop(0.65, 'rgba(140,28,40,0.16)');
  grad.addColorStop(1, 'rgba(20,0,4,0.4)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ geometry
function organicCavity(radius, seed, doors = []) {
  // SphereGeometry is indexed, so normals stay smooth after displacement.
  // A non-indexed icosahedron produced huge flat facets under the surgical lights.
  const geo = new THREE.SphereGeometry(1, 80, 50);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const noise = fbm(n.x * 2.1 + seed * 0.01, n.y * 2.1, n.z * 2.1, 3);
    const rad = 1 + (noise - 0.5) * 0.38 + Math.sin(n.y * 8 + n.x * 3) * 0.018;
    pos.setXYZ(
      i,
      n.x * rad * radius * 1.15,
      n.y * rad * radius * 0.64,
      n.z * rad * radius * 1.15
    );
  }

  // Cut real openings at corridor mouths. A closed shell made every room read
  // as a dead end even though the collision union was open.
  if (doors.length && geo.index) {
    const index = geo.index.array;
    const kept = [];
    const p = geo.attributes.position;
    for (let i = 0; i < index.length; i += 3) {
      const ax = p.getX(index[i]);
      const ay = p.getY(index[i]);
      const az = p.getZ(index[i]);
      const bx = p.getX(index[i + 1]);
      const by = p.getY(index[i + 1]);
      const bz = p.getZ(index[i + 1]);
      const cx = p.getX(index[i + 2]);
      const cy = p.getY(index[i + 2]);
      const cz = p.getZ(index[i + 2]);
      const mx = (ax + bx + cx) / 3;
      const my = (ay + by + cy) / 3;
      const mz = (az + bz + cz) / 3;
      const wy = my + 2.35;
      let cut = false;
      if (wy > 0.02) {
        const ang = Math.atan2(mx, mz);
        for (const door of doors) {
          const doorAng = Math.atan2(door.dir.x, door.dir.z);
          // Keep the cut inside the corridor's outer wall, so the corridor
          // sleeve closes the opening instead of exposing black shell edges.
          const half = Math.asin(clamp((door.width / 2 + 0.7) / (radius * 1.15), 0.05, 0.95));
          const top = 2.0 + door.width * 0.48;
          if (wy < top && Math.abs(angleDelta(ang, doorAng)) < half) {
            cut = true;
            break;
          }
        }
      }
      if (!cut) kept.push(index[i], index[i + 1], index[i + 2]);
    }
    geo.setIndex(kept);
  }
  geo.computeVertexNormals();
  return geo;
}

function organicTube(radius, length, seed) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 22, 10, true);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const noise = fbm(v.x * 0.4 + seed * 0.01, v.y * 0.22, v.z * 0.4, 3);
    const scale = 1 + (noise - 0.5) * 0.3;
    pos.setXYZ(i, v.x * scale, v.y, v.z * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

// A crisis is anatomy, not a marker. The shattered vessel sits in a low,
// lumpy crater of torn tissue; the blood is one uneven shape rather than a
// perfect disc so the eye reads "injury" before it reads "objective".
function crisisMoundGeometry(seed) {
  const geo = new THREE.SphereGeometry(1, 26, 12, 0, TAU, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const noise = fbm(n.x * 2.6 + seed * 0.013, n.y * 2.2, n.z * 2.6, 3);
    const rad = 1 + (noise - 0.5) * 0.26;
    pos.setXYZ(i, v.x * rad * 1.02, v.y * rad * 0.27, v.z * rad * 0.9);
  }
  geo.computeVertexNormals();
  return geo;
}

function tornVesselGeometry(seed) {
  const geo = new THREE.CylinderGeometry(0.18, 0.34, 0.62, 9, 4, true);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const angle = Math.atan2(v.z, v.x);
    const top = clamp((v.y + 0.31) / 0.62, 0, 1);
    const noise = fbm(Math.cos(angle) * 1.7 + seed * 0.01, Math.sin(angle) * 1.7, top * 2.5, 3);
    const radial = 1 + (noise - 0.5) * 0.24;
    const jag = top > 0.8 ? (noise - 0.44) * 0.15 : 0;
    pos.setXYZ(i, v.x * radial, v.y + jag, v.z * radial);
  }
  geo.computeVertexNormals();
  geo.translate(0, 0.31, 0);
  return geo;
}

function bloodPoolGeometry(radius, seed, lobes = 3) {
  const rng = new RNG(seed);
  const shape = new THREE.Shape();
  const segments = 36;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * TAU;
    const wobble = 0.72 + rng.float(0, 0.26) + Math.sin(angle * (2 + lobes) + seed * 0.01) * 0.08;
    const r = radius * clamp(wobble, 0.55, 1.12);
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 1);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function crisisPoolGeometry(seed) {
  const parts = [bloodPoolGeometry(1.12, seed, 3)];
  const rng = new RNG(seed ^ 0x51ed2701);
  for (let i = 0; i < 5; i++) {
    const angle = rng.float(0, TAU);
    const distance = rng.float(1.05, 1.72);
    const part = bloodPoolGeometry(rng.float(0.1, 0.26), seed + i * 37, 2);
    part.translate(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    parts.push(part);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged || bloodPoolGeometry(1.12, seed, 3);
}

function roomCenter(room) {
  return new THREE.Vector3(room.x, 2.3, room.z);
}

function corridorTransform(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return {
    dx,
    dz,
    len,
    midX: (a.x + b.x) / 2,
    midZ: (a.z + b.z) / 2,
    angle: Math.atan2(dx, dz),
    dir: new THREE.Vector3(dx / len, 0, dz / len),
  };
}

// ------------------------------------------------------------------ Level
export class Level {
  constructor(scene, organId, seed, run, game) {
    this.scene = scene;
    this.organId = organId;
    this.def = ORGANS[organId];
    this.layout = generateLayout(organId, seed, run);
    this.seed = seed;
    this.run = run;
    this.game = game;
    this.rng = new RNG(seed ^ 0x9e3779b9);
    this.group = new THREE.Group();
    this.group.name = `organ-${organId}`;
    this.scene.add(this.group);
    this.rooms = [];
    this.corridors = [];
    this.shapes = [];
    this.obstacles = [];
    this.gates = [];
    this.nodes = [];
    this.broodNests = [];
    // Raised tissue shelves. Collision skips them once the surgeon's boots are
    // above the lip, so they are both solid cover and honest high ground.
    this.platforms = [];
    this.heartLandmarks = [];
    this.pickups = [];
    this.enemySpawns = [];
    this.lore = [];
    this.toolPickup = null;
    this.exitPortal = null;
    this.currentRoom = null;
    // The entry chamber is the sterile airlock. Until the surgeon first steps
    // out of it, nothing can damage him: a distant clot turret used to draw a
    // clean line down the corridor and kill an idle player before the first
    // step, which reads as a broken spawn rather than a fair fight.
    this.entryRoom = this.layout.rooms.find((room) => room.type === 'entry') || null;
    this.entryRoomId = this.entryRoom?.id || null;
    this.entryProtected = true;
    this.elapsed = 0;
    this.crisis = null;
    this.crisisTimer = CRISES.firstDelay;
    this.crisisCount = 0;
    // A separate seeded stream keeps crises from changing layout or garrison
    // identity while still making their timing and spawn point reproducible.
    this.crisisRng = new RNG(seed ^ 0xd1b54a35);
    this.materials = [];
    this.textures = [];
    this.disposables = [];
    this.retiredGeometries = [];
    this.roamingLights = [];
    this.minimap = { rooms: [], corridors: [], gates: [], nodes: [], tool: null, exit: null, boss: null };
    this.build();
  }

  // ---------------------------------------------------------------- build
  build() {
    const palette = this.def.palette;
    const s = this.seed;
    this.tissueTex = makeTissueTexture(palette, s, false);
    this.floorTex = makeTissueTexture(palette, s + 7, true);
    this.bumpTex = makeBumpTexture(s + 11);
    this.membraneTex = makeMembraneTexture(s + 13);
    this.textures.push(this.tissueTex, this.floorTex, this.bumpTex, this.membraneTex);

    this.wallMat = new THREE.MeshPhysicalMaterial({
      map: this.tissueTex,
      bumpMap: this.bumpTex,
      bumpScale: 0.11,
      color: 0xd8b8aa,
      roughness: 0.72,
      metalness: 0.02,
      clearcoat: 0.12,
      clearcoatRoughness: 0.44,
      envMapIntensity: 0.28,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.06,
      side: THREE.BackSide,
    });
    this.floorMat = new THREE.MeshPhysicalMaterial({
      map: this.floorTex,
      bumpMap: this.bumpTex,
      bumpScale: 0.07,
      // Warm but venous. The old value went sand-coloured under a ceiling lamp.
      color: 0x875649,
      roughness: 0.52,
      metalness: 0.01,
      clearcoat: 0.16,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.1,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.05,
    });
    // Corridors are wet channels cut through the organ, not polished hallways.
    // The room floor is warm and dry; the connecting tissue runs darker and
    // glossier so the eye reads the doorway as a threshold, not a beige carpet.
    this.corridorFloorMat = new THREE.MeshPhysicalMaterial({
      map: this.floorTex,
      bumpMap: this.bumpTex,
      bumpScale: 0.09,
      color: 0x4f332e,
      roughness: 0.42,
      metalness: 0.02,
      clearcoat: 0.26,
      clearcoatRoughness: 0.34,
      envMapIntensity: 0.16,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.04,
    });
    this.membraneMat = new THREE.MeshStandardMaterial({
      map: this.membraneTex,
      color: 0xffc1a0,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      roughness: 0.25,
      metalness: 0.05,
      emissive: 0x9e3a2c,
      emissiveIntensity: 0.5,
      depthWrite: false,
    });
    this.materials.push(this.wallMat, this.floorMat, this.corridorFloorMat, this.membraneMat);

    this.roomById = new Map(this.layout.rooms.map((r) => [r.id, r]));
    this.connections = new Map(this.layout.rooms.map((r) => [r.id, []]));
    for (const [aId, bId, width] of this.layout.corridors) {
      const a = this.roomById.get(aId);
      const b = this.roomById.get(bId);
      const lenA = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      this.connections.get(aId).push({ dir: { x: (b.x - a.x) / lenA, z: (b.z - a.z) / lenA }, width });
      this.connections.get(bId).push({ dir: { x: (a.x - b.x) / lenA, z: (a.z - b.z) / lenA }, width });
    }
    for (const room of this.layout.rooms) {
      this.buildRoom(room);
      this.minimap.rooms.push({ x: room.x, z: room.z, r: room.r, name: room.name, id: room.id });
    }
    for (const [aId, bId, width] of this.layout.corridors) {
      this.buildCorridor(this.roomById.get(aId), this.roomById.get(bId), width);
    }

    this.buildAmbientProps();
    this.buildGates();
    this.buildNodes();
    this.buildLore();
    this.buildTool();
    this.buildExit();
    this.buildObstacles();
    this.buildBroodNests();
    this.buildSpawns();
    this.buildLights();
    this.activeNodeCount = this.nodes.length;
    this.batchStaticGeometry();

    this.minimap.gates = this.gates.map((g) => ({ x: g.x, z: g.z, requires: g.requires, open: false }));
    this.minimap.nodes = this.nodes.map((n) => ({ x: n.x, z: n.z, active: true }));
    this.minimap.exit = this.layout.exit ? { x: this.layout.exit.x, z: this.layout.exit.z } : null;
    this.minimap.boss = this.layout.boss ? { x: this.layout.boss.x, z: this.layout.boss.z } : null;
    this.minimap.bounds = this.computeBounds();
  }

  // ---------------------------------------------------------------- batching
  // Nearly all organ dressing is welded to the world. Drawing 600 tiny props
  // separately was the single largest cost in the game: every one is a draw
  // call, a material bind and a state change. Batch the static skin by material
  // and keep only the handful of things that actually animate as live objects.
  batchStaticGeometry() {
    const dynamicRoots = new Set();
    const addRoot = (obj) => {
      if (obj) dynamicRoots.add(obj);
    };
    for (const n of this.nodes) addRoot(n.group);
    for (const g of this.gates) addRoot(g.group);
    for (const l of this.lore) addRoot(l.group);
    for (const b of this.broodNests) addRoot(b.group);
    // The wall hearts contract on a timer. If the static batcher eats them the
    // geometry still draws, but the whole landmark freezes — the exact failure
    // a first capture hid behind its silhouette.
    for (const h of this.heartLandmarks) addRoot(h.group);
    addRoot(this.toolPickup?.group);
    addRoot(this.exitPortal?.group);

    const dynamicCache = new WeakMap();
    const isDynamic = (obj) => {
      let node = obj;
      let result = false;
      while (node && node !== this.group) {
        const cached = dynamicCache.get(node);
        if (cached !== undefined) {
          result = cached;
          break;
        }
        if (dynamicRoots.has(node)) {
          result = true;
          break;
        }
        node = node.parent;
      }
      dynamicCache.set(obj, result);
      return result;
    };

    const materialKey = (m) => {
      if (!m) return null;
      const n = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
      const c = (v) => (v && v.getHexString ? v.getHexString() : '');
      return [
        m.type, c(m.color), c(m.emissive), n(m.emissiveIntensity), n(m.roughness),
        n(m.metalness), n(m.opacity), m.transparent ? 1 : 0, m.side, m.blending,
        m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, n(m.alphaTest), m.vertexColors ? 1 : 0,
        m.flatShading ? 1 : 0, m.wireframe ? 1 : 0, m.map?.uuid || '', m.bumpMap?.uuid || '',
        n(m.bumpScale), n(m.clearcoat), n(m.clearcoatRoughness), n(m.envMapIntensity),
      ].join('|');
    };

    this.group.updateMatrixWorld(true);
    const candidates = [];
    this.group.traverse((obj) => {
      if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
      if (obj.userData.noBatch) return;
      if (isDynamic(obj)) return;
      if (Array.isArray(obj.material)) return;
      if (!obj.geometry || obj.geometry.morphAttributes?.position) return;
      candidates.push(obj);
    });

    const canonicalByKey = new Map();
    const buckets = new Map();
    for (const mesh of candidates) {
      let mat = mesh.material;
      if (!mat || mat.isShaderMaterial) continue;
      const key = materialKey(mat);
      if (!key) continue;
      const canonical = canonicalByKey.get(key);
      if (!canonical) canonicalByKey.set(key, mat);
      else if (canonical !== mat) mesh.material = canonical;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: canonical || mat, meshes: [] };
        buckets.set(key, bucket);
      }
      bucket.meshes.push(mesh);
    }

    let batchCount = 0;
    let sourceCount = 0;
    for (const bucket of buckets.values()) {
      if (bucket.meshes.length < 2) continue;
      const geometries = [];
      for (const mesh of bucket.meshes) {
        let geo = mesh.geometry.clone();
        for (const name of Object.keys(geo.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
        }
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) {
          const count = geo.attributes.position.count;
          geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        if (geo.index) {
          const flat = geo.toNonIndexed();
          geo.dispose();
          geo = flat;
        }
        geo.applyMatrix4(mesh.matrixWorld);
        geometries.push(geo);
      }
      let merged = null;
      try {
        merged = mergeGeometries(geometries, false);
      } catch {
        merged = null;
      }
      if (!merged) {
        geometries.forEach((g) => g.dispose());
        continue;
      }
      merged.computeBoundingSphere();
      const batch = new THREE.Mesh(merged, bucket.material);
      batch.name = 'static-batch';
      batch.matrixAutoUpdate = false;
      batch.updateMatrix();
      this.group.add(batch);
      this.disposables.push(merged);
      for (const mesh of bucket.meshes) {
        this.retiredGeometries.push(mesh.geometry);
        mesh.removeFromParent();
      }
      geometries.forEach((g) => g.dispose());
      batchCount++;
      sourceCount += bucket.meshes.length;
    }

    // A merged batch can no longer be culled prop-by-prop, so give it a stable
    // render order. Opaque batches go first; transparent tissue still sorts
    // back-to-front by three's normal pass order.
    for (const child of this.group.children) {
      if (child.name === 'static-batch') child.renderOrder = child.material.transparent ? 1 : 0;
    }
    this.batchStats = { batches: batchCount, meshes: sourceCount, materials: canonicalByKey.size };
  }

  computeBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of this.layout.rooms) {
      minX = Math.min(minX, r.x - r.r);
      maxX = Math.max(maxX, r.x + r.r);
      minZ = Math.min(minZ, r.z - r.r);
      maxZ = Math.max(maxZ, r.z + r.r);
    }
    return { minX, maxX, minZ, maxZ };
  }

  buildRoom(room) {
    const doors = this.connections.get(room.id) || [];
    const geo = organicCavity(room.r, this.seed + room.x * 3 + room.z, doors);
    const mesh = new THREE.Mesh(geo, this.wallMat);
    mesh.name = 'room-shell';
    mesh.position.set(room.x, 2.35, room.z);
    this.group.add(mesh);
    this.disposables.push(geo);      const floor = new THREE.Mesh(new THREE.CircleGeometry(room.r * 1.18, 56), this.floorMat);
      floor.name = 'room-floor';
      floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.02, room.z);
    this.group.add(floor);
    this.disposables.push(floor.geometry);

    // A soft ring of tissue at the room edge, like a sphincter.
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.def.palette.membrane,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(room.r * 0.9, room.r * 1.02, 56), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(room.x, 0.045, room.z);
    this.group.add(ring);
    this.disposables.push(ring.geometry);
    this.materials.push(ringMat);

    this.buildDoorFrames(room, doors);
    this.buildCeilingLamp(room);
    this.buildFloorDetails(room);
    this.buildFloorVessels(room);
    this.buildRoomProps(room);
    this.rooms.push(room);
    this.shapes.push({ type: 'circle', x: room.x, z: room.z, r: room.r, room });
  }

  buildDoorFrames(room, doors) {
    const palette = this.def.palette;
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: palette.tissue,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.06,
      clearcoat: 0.3,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.7,
    });
    this.materials.push(frameMat);
    for (const door of doors) {
      const px = room.x + door.dir.x * room.r * 1.02;
      const pz = room.z + door.dir.z * room.r * 1.02;
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(door.dir.x, 0, door.dir.z)
      );
      const ringR = door.width / 2 + 0.62;
      for (let j = 0; j < 2; j++) {
        const radius = ringR + j * 0.17;
        const geo = new THREE.TorusGeometry(radius, j === 0 ? 0.19 : 0.075, 7, 42);
        const ring = new THREE.Mesh(geo, frameMat);
        ring.position.set(px, 2.1, pz);
        ring.quaternion.copy(quat);
        this.group.add(ring);
        this.disposables.push(geo);
      }
      // A thick fleshy lip covers the raw cut edge of the cavity. Without it
      // the doorway leaks a bright, paper-thin crescent of wall.
      const lipMat = frameMat.clone();
      lipMat.color.setHex(palette.tissue);
      lipMat.emissiveIntensity = 0.12;
      lipMat.roughness = 0.72;
      this.materials.push(lipMat);
      const lipGeo = new THREE.TorusGeometry(ringR + 1.02, 0.62, 8, 40);
      this.disposables.push(lipGeo);
      for (let j = 0; j < 2; j++) {
        const lip = new THREE.Mesh(lipGeo, lipMat);
        lip.position.set(px, 2.1, pz);
        lip.quaternion.copy(quat);
        lip.scale.setScalar(1 + j * 0.085);
        this.group.add(lip);
      }

      // Soft organic teeth around the mouth, kept subordinate to the arch.
      const toothGeo = new THREE.ConeGeometry(0.1, 0.48, 5);
      const toothMat = frameMat.clone();
      toothMat.color.setHex(palette.tissue);
      toothMat.emissiveIntensity = 0.12;
      this.materials.push(toothMat);
      this.disposables.push(toothGeo);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const ty = 2.1 + Math.sin(a) * (ringR + 0.02);
        if (ty < 0.55) continue;
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(
          px + Math.cos(a) * (ringR + 0.02) * door.dir.z,
          ty,
          pz - Math.cos(a) * (ringR + 0.02) * door.dir.x
        );
        tooth.rotation.z = -a;
        tooth.rotation.y = Math.atan2(door.dir.x, door.dir.z);
        this.group.add(tooth);
      }
    }
  }

  // Structural ribs that follow the chamber wall from floor to ceiling. They
  // read as anatomy, not as free-floating hoops in the player's face.
  buildRoomArches(room, doors) {
    const rng = new RNG(this.seed ^ (room.x * 157 + room.z * 263 + 71));
    const palette = this.def.palette;
    // Dark, wet bone rather than light timber: the old tan clearcoat picked up
    // the ceiling lamp and read as a plank floating over the corridor.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7d4a3c,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.06,
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.3,
    });
    this.materials.push(mat);
    const count = room.type === 'boss' ? 5 : 4;
    const vertical = room.r * 0.615;
    const tStart = Math.max(-1.35, Math.asin(Math.max(-0.98, -2.25 / vertical)));
    for (let i = 0; i < count; i++) {
      let angle = (i / count) * TAU + rng.float(-0.1, 0.1);
      let clear = false;
      for (let tries = 0; tries < 26; tries++) {
        clear = doors.every((door) => {
          const da = Math.atan2(door.dir.z, door.dir.x);
          return Math.abs(angleDelta(angle, da)) > 0.58;
        });
        if (clear) break;
        angle += 0.14;
      }
      if (!clear) continue;

      const points = [];
      const steps = 12;
      for (let j = 0; j <= steps; j++) {
        const t = tStart + (j / steps) * (1.38 - tStart);
        const horiz = Math.cos(t) * room.r * 1.045;
        const y = 2.35 + Math.sin(t) * vertical;
        if (y < 0.06) continue;
        points.push(new THREE.Vector3(
          room.x + Math.cos(angle) * horiz,
          y,
          room.z + Math.sin(angle) * horiz
        ));
      }
      if (points.length < 3) continue;
      const tube = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        24,
        rng.float(0.09, 0.17),
        6,
        false
      );
      const ribMesh = new THREE.Mesh(tube, mat);
      ribMesh.name = 'wall-rib';
      this.group.add(ribMesh);
      this.disposables.push(tube);
    }
  }

  buildCeilingLamp(room) {
    const palette = this.def.palette;
    const mat = new THREE.MeshStandardMaterial({
      color: palette.glow,
      emissive: palette.glow,
      emissiveIntensity: 0.16,
      roughness: 0.32,
      metalness: 0.1,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(room.r * 0.019, 12, 9), mat);
    lamp.name = 'ceiling-lamp';
    lamp.position.set(room.x, room.r * 0.66, room.z);
    this.group.add(lamp);
    this.materials.push(mat);
    this.disposables.push(lamp.geometry);

    // A physical shade does the work bloom was doing badly. Without it the
    // emissive bulb read as a small sun hanging in the middle of every room.
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0x3a2f28,
      emissive: 0x1a0d08,
      emissiveIntensity: 0.25,
      roughness: 0.62,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(room.r * 0.055, room.r * 0.016, room.r * 0.045, 16, 1, true),
      shadeMat
    );
    shade.name = 'lamp-shade';
    shade.position.set(room.x, room.r * 0.685, room.z);
    this.group.add(shade);
    this.materials.push(shadeMat);
    this.disposables.push(shade.geometry);

    const haloMat = new THREE.MeshBasicMaterial({
      color: palette.glow,
      transparent: true,
      opacity: 0.022,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(room.r * 0.042, 16, 12), haloMat);
    halo.position.copy(lamp.position);
    this.group.add(halo);
    this.materials.push(haloMat);
    this.disposables.push(halo.geometry);

    // Suspensory sinew, not tan conduit. The old pale 6 cm cords crossed the
    // whole ceiling and read as lengths of PVC pipe hanging over the corridor.
    const cordMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a16,
      emissive: 0x0a0202,
      emissiveIntensity: 0.2,
      roughness: 0.92,
      metalness: 0.0,
    });
    this.materials.push(cordMat);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + this.rng.float(0, 1);
      const points = [
        new THREE.Vector3(room.x + Math.cos(a) * room.r * 0.16, room.r * 0.7, room.z + Math.sin(a) * room.r * 0.16),
        new THREE.Vector3(room.x + Math.cos(a) * room.r * 0.2, room.r * 0.66, room.z + Math.sin(a) * room.r * 0.2),
        new THREE.Vector3(room.x + Math.cos(a) * room.r * 0.1, room.r * 0.61, room.z + Math.sin(a) * room.r * 0.1),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.TubeGeometry(curve, 10, 0.028, 4, false);
      const cord = new THREE.Mesh(geo, cordMat);
      cord.name = 'lamp-cord';
      this.group.add(cord);
      this.disposables.push(geo);
    }
  }

  buildFloorDetails(room) {
    const rng = new RNG(this.seed ^ (room.x * 311 + room.z * 97 + 7));
    const palette = this.def.palette;
    const noduleGeo = new THREE.SphereGeometry(1, 9, 7);
    const noduleMat = new THREE.MeshStandardMaterial({
      color: palette.tissueDeep,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.28,
      roughness: 0.5,
      metalness: 0.04,
    });
    this.materials.push(noduleMat);
    this.disposables.push(noduleGeo);
    for (let i = 0; i < 11; i++) {
      const a = rng.float(0, TAU);
      const d = rng.float(room.r * 0.46, room.r * 0.94);
      const nodule = new THREE.Mesh(noduleGeo, noduleMat);
      nodule.position.set(room.x + Math.cos(a) * d, rng.float(0.05, 0.22), room.z + Math.sin(a) * d);
      nodule.scale.set(rng.float(0.25, 0.9), rng.float(0.1, 0.26), rng.float(0.25, 0.9));
      this.group.add(nodule);
    }

    const puddleMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b0506,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.22,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.04,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.materials.push(puddleMat);
    for (let i = 0; i < 4; i++) {
      const a = rng.float(0, TAU);
      const d = rng.float(0.28, 0.82) * room.r;
      const geo = new THREE.CircleGeometry(rng.float(0.35, 0.95), 24);
      // Ragged rim: perfect ellipses read as decals, not fluid.
      const pp = geo.attributes.position;
      const phase = rng.float(0, TAU);
      for (let v = 0; v < pp.count; v++) {
        const px = pp.getX(v);
        const py = pp.getY(v);
        if (Math.hypot(px, py) < 0.02) continue;
        const a = Math.atan2(py, px);
        const k = 1 + 0.16 * Math.sin(a * 3 + phase) + 0.07 * Math.sin(a * 7 - phase * 2);
        pp.setXY(v, px * k, py * k);
      }
      geo.computeVertexNormals();
      const puddle = new THREE.Mesh(geo, puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(room.x + Math.cos(a) * d, 0.055, room.z + Math.sin(a) * d);
      this.group.add(puddle);
      this.disposables.push(geo);
    }

    const dotMat = new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dotGeo = new THREE.SphereGeometry(0.035, 5, 4);
    this.materials.push(dotMat);
    this.disposables.push(dotGeo);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rng.float(-0.1, 0.1);
      const d = room.r * rng.float(0.68, 0.9);
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(room.x + Math.cos(a) * d, 0.08, room.z + Math.sin(a) * d);
      this.group.add(dot);
    }
  }

  // Raised vascular relief across the floor. This is what gives the player a
  // sense of scale and direction when the room light is low.
  buildFloorVessels(room) {
    const rng = new RNG(this.seed ^ (room.x * 733 + room.z * 419 + 31));
    const palette = this.def.palette;
    const vesselMat = new THREE.MeshPhysicalMaterial({
      color: palette.tissueDeep,
      emissive: palette.tissueDeep,
      // Wet relief, not neon tubing. The old emissive made every branch read as
      // a glowing wire laid on the floor instead of a vessel under the skin.
      emissiveIntensity: 0.1,
      roughness: 0.62,
      metalness: 0.02,
      // A clearcoated cylinder under one key light carries a continuous
      // specular line from end to end, which is exactly what makes it read as
      // a cable. Rough relief scatters the highlight instead.
      clearcoat: 0.04,
      clearcoatRoughness: 0.72,
      envMapIntensity: 0.7,
    });
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x2e6f66,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.materials.push(vesselMat, pulseMat);

    const branches = 2 + rng.int(0, 2);
    for (let i = 0; i < branches; i++) {
      const a = rng.float(0, TAU);
      const points = [];
      const steps = 5;
      const reach = rng.float(room.r * 0.55, room.r * 1.05);
      let ang = a;
      for (let s = 0; s < steps; s++) {
        const d = (s / (steps - 1)) * reach;
        ang += rng.float(-0.22, 0.22);
        points.push(new THREE.Vector3(
          room.x + Math.cos(ang) * d,
          0.062,
          room.z + Math.sin(ang) * d
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const thick = rng.float(0.012, 0.03);
      const geo = new THREE.TubeGeometry(curve, 24, thick, 5, false);
      const vein = new THREE.Mesh(geo, vesselMat);
      vein.name = 'floor-vein';
      this.group.add(vein);
      this.disposables.push(geo);

      // Fine side-branches turn the relief into a vascular network, not a
      // handful of loose cables.
      for (let b = 0; b < 2; b++) {
        const side = b === 0 ? 1 : -1;
        const start = points[1 + rng.int(0, 2)];
        const branchPts = [start.clone()];
        let bx = start.x;
        let bz = start.z;
        let ba = a + side * rng.float(0.5, 1.1);
        for (let s = 0; s < 3; s++) {
          const len = rng.float(0.6, 1.8);
          bx += Math.cos(ba) * len;
          bz += Math.sin(ba) * len;
          branchPts.push(new THREE.Vector3(bx, 0.062, bz));
          ba += rng.float(-0.35, 0.35);
        }
        const branchGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branchPts), 12, thick * 0.42, 4, false);
        const branch = new THREE.Mesh(branchGeo, vesselMat);
        branch.name = 'floor-vein';
        this.group.add(branch);
        this.disposables.push(branchGeo);
      }

      // A thinner luminous capillary running alongside the main vessel.
      const glowGeo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => p.clone().add(new THREE.Vector3(0.07, 0.012, 0.07)))),
        18,
        thick * 0.22,
        4,
        false
      );
      this.group.add(new THREE.Mesh(glowGeo, pulseMat));
      this.disposables.push(glowGeo);
    }

    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x53352c,
      roughness: 0.56,
      metalness: 0.03,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.08,
    });
    const plateGeo = new THREE.IcosahedronGeometry(1, 0);
    this.materials.push(plateMat);
    this.disposables.push(plateGeo);
    for (let i = 0; i < 3; i++) {
      const a = rng.float(0, TAU);
      const d = rng.float(room.r * 0.72, room.r * 0.96);
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.name = 'calcified-plate';
      plate.position.set(room.x + Math.cos(a) * d, 0.02, room.z + Math.sin(a) * d);
      plate.scale.set(rng.float(0.25, 0.7), rng.float(0.035, 0.08), rng.float(0.25, 0.7));
      plate.rotation.set(0, rng.float(0, TAU), 0);
      this.group.add(plate);
    }
  }

  buildCorridor(a, b, width) {
    const t = corridorTransform(a, b);
    const visualRadius = width / 2 + 1.55;
    // A corridor is only the gap between two rooms. Building it centre-to-centre
    // put a bright floor plane and a tube through the middle of both rooms.
    const startOffset = Math.min(a.r * 0.92, t.len * 0.48);
    const endOffset = Math.max(t.len - b.r * 0.92, t.len * 0.52);
    const visualLen = Math.max(4, endOffset - startOffset + 1.4);
    const midAlong = (startOffset + endOffset) / 2;
    const cx = a.x + t.dir.x * midAlong;
    const cz = a.z + t.dir.z * midAlong;

    const geo = organicTube(visualRadius, visualLen, this.seed + t.midX + t.midZ);
    const mesh = new THREE.Mesh(geo, this.wallMat);
    mesh.name = 'corridor-wall';
    mesh.position.set(cx, 2.2, cz);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.dir);
    this.group.add(mesh);
    this.disposables.push(geo);

    const floorGeo = new THREE.PlaneGeometry(width + 2.2, visualLen);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, this.corridorFloorMat);
    floor.rotation.y = t.angle;
    floor.position.set(cx, 0.047, cz);
    this.group.add(floor);
    this.disposables.push(floorGeo);

    // Half-arches, not full hoops. A full torus put the camera inside a giant
    // pale ring at every doorway; a rib should spring from the floor.
    const ribMat = new THREE.MeshPhysicalMaterial({
      color: 0xb07a62,
      roughness: 0.64,
      metalness: 0.02,
      clearcoat: 0.18,
      clearcoatRoughness: 0.42,
      emissive: this.def.palette.tissueDeep,
      emissiveIntensity: 0.1,
      envMapIntensity: 0.45,
    });
    this.materials.push(ribMat);
    const ribGeo = new THREE.TorusGeometry(visualRadius * 0.94, 0.16, 6, 28, Math.PI);
    this.disposables.push(ribGeo);
    const count = Math.max(1, Math.round(visualLen / 7.5));
    for (let i = 0; i < count; i++) {
      const along = ((i + 1) / (count + 1) - 0.5) * visualLen;
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.name = 'corridor-rib';
      rib.position.set(cx + t.dir.x * along, 0.08, cz + t.dir.z * along);
      rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.dir);
      this.group.add(rib);
    }

    // Two capillary guide-lines run the length of the corridor. They pull the
    // eye toward the next chamber without lighting the whole tunnel.
    const side = new THREE.Vector3(-t.dir.z, 0, t.dir.x);
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0x3e8d80,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.materials.push(lineMat);
    for (const sign of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const along = (i / 6 - 0.5) * (visualLen - 1.5);
        pts.push(new THREE.Vector3(
          cx + t.dir.x * along + side.x * sign * (width * 0.42),
          0.075,
          cz + t.dir.z * along + side.z * sign * (width * 0.42)
        ));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.018, 4, false);
      this.group.add(new THREE.Mesh(geo, lineMat));
      this.disposables.push(geo);
    }

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    this.shapes.push({
      type: 'capsule',
      ax: a.x, az: a.z, bx: b.x, bz: b.z,
      r: width / 2,
      roomA: a, roomB: b,
    });
    this.corridors.push({ a: a.id, b: b.id, ax: a.x, az: a.z, bx: b.x, bz: b.z, width, len });
    this.minimap.corridors.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, width });

    // A wet floor channel down the middle.
    const channelMat = new THREE.MeshBasicMaterial({
      color: this.def.palette.glow,
      transparent: true,
      opacity: 0.085,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const channelGeo = new THREE.PlaneGeometry(width * 0.24, visualLen);
    channelGeo.rotateX(-Math.PI / 2);
    const channel = new THREE.Mesh(channelGeo, channelMat);
    channel.rotation.y = t.angle;
    channel.position.set(cx, 0.056, cz);
    this.group.add(channel);
    this.disposables.push(channelGeo);
    this.materials.push(channelMat);
  }

  buildRoomProps(room) {
    const rng = new RNG(this.seed ^ (room.x * 977 + room.z * 131 + room.r * 17));
    const palette = this.def.palette;
    const style = this.def.propStyle || 'alveolar';
    const count = room.type === 'boss' ? 22 : 12;
    const sphereGeo = new THREE.SphereGeometry(1, 12, 9);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: palette.tissue,
      roughness: 0.46,
      metalness: 0.02,
      clearcoat: 0.28,
      clearcoatRoughness: 0.3,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.12,
      envMapIntensity: 0.35,
    });
    const deepMat = new THREE.MeshStandardMaterial({
      color: palette.tissueDeep,
      roughness: 0.62,
      metalness: 0.02,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.25,
    });
    const paleMat = new THREE.MeshPhysicalMaterial({
      color: palette.membrane,
      roughness: 0.4,
      metalness: 0.02,
      clearcoat: 0.24,
      clearcoatRoughness: 0.35,
      emissive: palette.glow,
      emissiveIntensity: 0.06,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: palette.glow, transparent: true, opacity: 0.45 });
    this.materials.push(tubeMat, deepMat, paleMat, glowMat);
    const add = (mesh) => { this.group.add(mesh); return mesh; };

    if (style === 'alveolar') {
      const doors = this.connections.get(room.id) || [];
      const clusters = room.type === 'boss' ? 6 : room.type === 'entry' ? 1 : 3;
      for (let c = 0; c < clusters; c++) {
        let angle = rng.float(0, TAU);
        for (let tries = 0; tries < 16; tries++) {
          const clear = doors.every((door) => Math.abs(angleDelta(angle, Math.atan2(door.dir.x, door.dir.z))) > 0.72);
          if (clear) break;
          angle += 0.4;
        }
        const dist = rng.float(room.r * 0.82, room.r * 1.02);
        const baseY = rng.float(3.8, room.r * 0.62);
        const clusterSize = rng.float(0.24, 0.5) * (room.type === 'boss' ? 1.2 : 1);
        for (let j = 0; j < 3; j++) {
          const a = angle + rng.float(-0.2, 0.2);
          const d = dist + rng.float(-0.7, 0.7);
          const sac = new THREE.Mesh(sphereGeo, rng.chance(0.45) ? deepMat : paleMat);
          sac.name = 'alveolus';
          sac.position.set(
            room.x + Math.cos(a) * d + rng.float(-0.5, 0.5),
            baseY + rng.float(-0.4, 0.6),
            room.z + Math.sin(a) * d + rng.float(-0.5, 0.5)
          );
          const scale = clusterSize * rng.float(0.35, 0.7);
          sac.scale.set(scale, scale * rng.float(0.8, 1.15), scale);
          add(sac);
          const inward = new THREE.Vector3(room.x - sac.position.x, 0, room.z - sac.position.z).normalize();
          const anchor = sac.position.clone().addScaledVector(inward, -rng.float(0.8, 1.6));
          const stalkGeo = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([sac.position.clone(), sac.position.clone().lerp(anchor, 0.55), anchor]),
            5, Math.max(0.03, scale * 0.11), 4, false
          );
          add(new THREE.Mesh(stalkGeo, deepMat));
          this.disposables.push(stalkGeo);
        }
      }
    } else if (style === 'cardiac') {
      const bandGeo = new THREE.TorusGeometry(room.r * 0.78, 0.2, 7, 40, Math.PI * 1.1);
      for (let i = 0; i < 3; i++) {
        const band = new THREE.Mesh(bandGeo, tubeMat);
        band.position.set(room.x, rng.float(1.1, 4.0), room.z);
        band.rotation.set(Math.PI / 2 + rng.float(-0.35, 0.35), rng.float(0, TAU), rng.float(0, TAU));
        band.scale.setScalar(rng.float(0.78, 1.12));
        add(band);
      }
      this.disposables.push(bandGeo);
      const calcMat = new THREE.MeshStandardMaterial({
        color: 0xd9b77e, roughness: 0.3, metalness: 0.22,
        emissive: 0x6b3b16, emissiveIntensity: 0.2,
      });
      this.materials.push(calcMat);
      for (let i = 0; i < count * 0.5; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.5, room.r * 0.94);
        const rock = new THREE.Mesh(rockGeo, calcMat);
        rock.position.set(room.x + Math.cos(a) * d, rng.float(0.4, 2.4), room.z + Math.sin(a) * d);
        rock.scale.set(rng.float(0.2, 0.75), rng.float(0.2, 1.0), rng.float(0.2, 0.75));
        rock.rotation.set(rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU));
        add(rock);
      }
      for (let i = 0; i < 8; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.3, room.r * 0.76);
        const pts = [
          new THREE.Vector3(room.x + Math.cos(a) * room.r * 0.15, room.r * 0.6, room.z + Math.sin(a) * room.r * 0.15),
          new THREE.Vector3(room.x + Math.cos(a) * d * 0.7, rng.float(3.0, 5.0), room.z + Math.sin(a) * d * 0.7),
          new THREE.Vector3(room.x + Math.cos(a) * d, rng.float(0.7, 2.2), room.z + Math.sin(a) * d),
        ];
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, rng.float(0.025, 0.06), 5, false);
        add(new THREE.Mesh(geo, paleMat));
        this.disposables.push(geo);
      }
    } else if (style === 'hepatic') {
      // Hexagonal hepatic lobules: stacked collagens with a portal vein at the core.
      const lobuleMat = new THREE.MeshPhysicalMaterial({
        color: 0xb46f45, roughness: 0.42, clearcoat: 0.24,
        clearcoatRoughness: 0.35, emissive: palette.tissueDeep, emissiveIntensity: 0.14,
      });
      this.materials.push(lobuleMat);
      for (let i = 0; i < count; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.5, room.r * 0.92);
        const lob = new THREE.Mesh(new THREE.CylinderGeometry(rng.float(0.5, 1.3), rng.float(0.9, 1.7), rng.float(1.4, 4.5), 6), lobuleMat);
        lob.position.set(room.x + Math.cos(a) * d, rng.float(1.0, 3.2), room.z + Math.sin(a) * d);
        lob.rotation.set(rng.float(-0.25, 0.25), rng.float(0, TAU), rng.float(-0.25, 0.25));
        add(lob);
      }
      for (let i = 0; i < 7; i++) {
        const a = rng.float(0, TAU);
        const rr = room.r * rng.float(0.55, 0.95);
        const pts = [];
        for (let j = 0; j < 5; j++) {
          pts.push(new THREE.Vector3(
            room.x + Math.cos(a + j * 0.2) * rr,
            0.4 + j * rng.float(0.35, 0.8),
            room.z + Math.sin(a + j * 0.2) * rr
          ));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, rng.float(0.04, 0.09), 5, false);
        add(new THREE.Mesh(geo, tubeMat));
        this.disposables.push(geo);
      }
    } else if (style === 'renal') {
      // Glomerular knots and loop-of-Henle tubules.
      const glomerulusMat = new THREE.MeshPhysicalMaterial({
        color: 0xc97d86, roughness: 0.36, clearcoat: 0.4,
        clearcoatRoughness: 0.24, emissive: palette.tissueDeep, emissiveIntensity: 0.12,
      });
      this.materials.push(glomerulusMat);
      for (let i = 0; i < count; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.48, room.r * 0.9);
        const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(rng.float(0.22, 0.55), rng.float(0.07, 0.16), 30, 6), glomerulusMat);
        knot.position.set(room.x + Math.cos(a) * d, rng.float(0.8, 3.4), room.z + Math.sin(a) * d);
        knot.rotation.set(rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU));
        add(knot);
        if (i % 3 === 0) {
          const tube = new THREE.Mesh(new THREE.TorusGeometry(rng.float(0.5, 1.1), 0.055, 6, 26, Math.PI * 1.3), paleMat);
          tube.position.copy(knot.position);
          tube.rotation.set(rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU));
          add(tube);
        }
      }
    } else if (style === 'neural') {
      // Dendritic fans, synaptic beads and a low-frequency axon glow.
      const axonMat = new THREE.MeshPhysicalMaterial({
        color: 0xa88a95, roughness: 0.44, clearcoat: 0.3,
        clearcoatRoughness: 0.32, emissive: palette.glow, emissiveIntensity: 0.08,
      });
      this.materials.push(axonMat);
      for (let i = 0; i < Math.max(4, count * 0.6); i++) {
        const a = rng.float(0, TAU);
        const origin = new THREE.Vector3(room.x + Math.cos(a) * room.r * 0.2, rng.float(1.6, 4.6), room.z + Math.sin(a) * room.r * 0.2);
        const pts = [origin];
        for (let j = 0; j < 4; j++) {
          pts.push(origin.clone().add(new THREE.Vector3(
            Math.cos(a + j * 0.55) * rng.float(1.2, 3.1),
            rng.float(-0.9, 0.9),
            Math.sin(a + j * 0.55) * rng.float(1.2, 3.1)
          )));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, rng.float(0.025, 0.07), 4, false);
        add(new THREE.Mesh(geo, axonMat));
        this.disposables.push(geo);
        const bead = new THREE.Mesh(sphereGeo, rng.chance(0.5) ? glowMat : paleMat);
        bead.position.copy(pts[pts.length - 1]);
        bead.scale.setScalar(rng.float(0.08, 0.2));
        add(bead);
      }
    } else if (style === 'marrow') {
      // Trabecular pillars, fat vacuoles and a warm central well.
      const boneMat = new THREE.MeshStandardMaterial({
        color: 0xd6c39c, roughness: 0.58, metalness: 0.04,
        emissive: palette.tissueDeep, emissiveIntensity: 0.16,
      });
      const fatMat = new THREE.MeshPhysicalMaterial({
        color: 0xe6c07a, roughness: 0.42, clearcoat: 0.35,
        clearcoatRoughness: 0.3, emissive: palette.glow, emissiveIntensity: 0.1,
      });
      this.materials.push(boneMat, fatMat);
      for (let i = 0; i < Math.max(4, count * 0.7); i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.45, room.r * 0.88);
        const h = rng.float(2.2, 6.5);
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(rng.float(0.14, 0.4), rng.float(0.3, 0.7), h, 6), boneMat);
        pillar.position.set(room.x + Math.cos(a) * d, h / 2, room.z + Math.sin(a) * d);
        pillar.rotation.set(rng.float(-0.18, 0.18), rng.float(0, TAU), rng.float(-0.18, 0.18));
        add(pillar);
      }
      for (let i = 0; i < count; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.3, room.r * 0.82);
        const vacuole = new THREE.Mesh(sphereGeo, fatMat);
        vacuole.position.set(room.x + Math.cos(a) * d, rng.float(0.4, 2.4), room.z + Math.sin(a) * d);
        vacuole.scale.setScalar(rng.float(0.1, 0.32));
        add(vacuole);
      }
    } else if (style === 'intestinal') {
      // Circular folds, villus cones and acid pools that read from the floor.
      const foldGeo = new THREE.TorusGeometry(room.r * 0.62, 0.34, 7, 34, Math.PI * 1.4);
      for (let i = 0; i < 3; i++) {
        const fold = new THREE.Mesh(foldGeo, tubeMat);
        fold.position.set(room.x, rng.float(0.8, 2.6), room.z);
        fold.rotation.set(Math.PI / 2 + rng.float(-0.4, 0.4), rng.float(0, TAU), rng.float(0, TAU));
        add(fold);
      }
      this.disposables.push(foldGeo);
      for (let i = 0; i < count; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.2, room.r * 0.8);
        const villus = new THREE.Mesh(new THREE.ConeGeometry(rng.float(0.07, 0.16), rng.float(0.5, 1.5), 5), paleMat);
        villus.position.set(room.x + Math.cos(a) * d, rng.float(0.35, 0.9), room.z + Math.sin(a) * d);
        villus.rotation.set(rng.float(-0.5, 0.5), rng.float(0, TAU), rng.float(-0.5, 0.5));
        add(villus);
      }
      const poolMat = new THREE.MeshBasicMaterial({ color: 0xc7d46b, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.materials.push(poolMat);
      const poolGeo = new THREE.CircleGeometry(room.r * 0.42, 28);
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(room.x + rng.float(-1.5, 1.5), 0.06, room.z + rng.float(-1.5, 1.5));
      add(pool);
      this.disposables.push(poolGeo);
    } else if (style === 'lymphatic') {
      // Follicle beads on a web of lymphatics, like a filter garden.
      const follicleMat = new THREE.MeshPhysicalMaterial({
        color: 0xc4c98d, roughness: 0.38, clearcoat: 0.32,
        clearcoatRoughness: 0.3, emissive: palette.glow, emissiveIntensity: 0.12,
      });
      this.materials.push(follicleMat);
      for (let i = 0; i < count; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(room.r * 0.35, room.r * 0.9);
        const follicle = new THREE.Mesh(sphereGeo, follicleMat);
        follicle.position.set(room.x + Math.cos(a) * d, rng.float(0.8, 3.6), room.z + Math.sin(a) * d);
        follicle.scale.setScalar(rng.float(0.18, 0.48));
        add(follicle);
      }
      for (let i = 0; i < 6; i++) {
        const a = rng.float(0, TAU);
        const pts = [];
        for (let j = 0; j < 5; j++) {
          pts.push(new THREE.Vector3(
            room.x + Math.cos(a + j * 0.4) * room.r * rng.float(0.35, 0.9),
            rng.float(0.4, 3.2),
            room.z + Math.sin(a + j * 0.4) * room.r * rng.float(0.35, 0.9)
          ));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, rng.float(0.03, 0.07), 4, false);
        add(new THREE.Mesh(geo, tubeMat));
        this.disposables.push(geo);
      }
    }

    this.disposables.push(sphereGeo, rockGeo);

    // Vessels snaking down the wall, shared by every organ.
    const vesselMat = new THREE.MeshPhysicalMaterial({
      color: palette.tissueDeep,
      roughness: 0.56,
      metalness: 0.03,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      emissive: 0x180305,
      emissiveIntensity: 0.2,
      envMapIntensity: 0.25,
    });
    this.materials.push(vesselMat);
    for (let v = 0; v < 3; v++) {
      let baseAngle = rng.float(0, TAU);
      let clear = false;
      for (let tries = 0; tries < 14; tries++) {
        clear = (this.connections.get(room.id) || []).every((door) =>
          Math.abs(angleDelta(baseAngle, Math.atan2(door.dir.z, door.dir.x))) > 0.7
        );
        if (clear) break;
        baseAngle += 0.22;
      }
      if (!clear) continue;
      const points = [];
      for (let p = 0; p < 5; p++) {
        const a = baseAngle + p * 0.22;
        const rr = room.r * rng.float(0.88, 1.0);
        points.push(new THREE.Vector3(
          room.x + Math.cos(a) * rr,
          0.5 + p * rng.float(0.3, 0.8),
          room.z + Math.sin(a) * rr
        ));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, rng.float(0.025, 0.065), 5, false);
      add(new THREE.Mesh(geo, vesselMat));
      this.disposables.push(geo);
    }
    // Vertical play. Two low tissue shelves per room, placed away from the
    // door lanes, give the jump and the dash somewhere to matter. The second
    // tier exists only in boss arenas, where a full jump-chain should read as
    // an escape route rather than a ledge you can accidentally clip.
    this.buildLedges(room, rng, { tubeMat, deepMat, paleMat, glowMat });
    if (style === 'cardiac') this.buildHeartLandmark(room, rng, { tubeMat, paleMat, deepMat, glowMat });
    if (room.type !== 'entry') this.buildMembraneVeils(room, this.connections.get(room.id) || []);
  }

  // A low shelf you can stand on. Its mesh is solid from the floor up, so the
  // collision is honest: walk around it, jump on top of it. The top is the only
  // surface that becomes walkable, which keeps enemies pathing on the floor.
  buildLedges(room, rng, mats) {
    const doors = this.connections.get(room.id) || [];
    const doorPoints = doors.map((door) => ({
      x: room.x + door.dir.x * room.r * 0.92,
      z: room.z + door.dir.z * room.r * 0.92,
    }));
    const shelfMat = new THREE.MeshPhysicalMaterial({
      map: this.tissueTex,
      bumpMap: this.bumpTex,
      bumpScale: 0.1,
      color: 0x9a5c4e,
      roughness: 0.58,
      metalness: 0.01,
      clearcoat: 0.16,
      clearcoatRoughness: 0.5,
      emissive: this.def.palette.tissueDeep,
      emissiveIntensity: 0.09,
      envMapIntensity: 0.2,
    });
    this.materials.push(shelfMat);
    // The entry is where the surgeon lands and reads the room. A shelf there
    // sat directly on the spawn point, so it is deliberately left open.
    const count = room.type === 'entry' ? 0 : room.type === 'boss' ? 3 : 2;
    const placed = [];
    for (let i = 0; i < count; i++) {
      const d = room.r * (0.62 + i * 0.06);
      const r = Math.min(1.75, room.r * 0.18);
      // Choose the best of a fixed fan instead of rejecting a room outright.
      // A hard reject left the entry, hub and exit with no vertical option at
      // all; scoring gives every room a shelf while still keeping door lanes
      // and other shelves clear.
      let best = null;
      for (let step = 0; step < 24; step++) {
        const angle = (step / 24) * TAU + rng.float(-0.04, 0.04);
        const px = room.x + Math.cos(angle) * d;
        const pz = room.z + Math.sin(angle) * d;
        const doorGap = doorPoints.length
          ? Math.min(...doorPoints.map((door) => Math.hypot(px - door.x, pz - door.z)))
          : 99;
        const shelfGap = placed.length
          ? Math.min(...placed.map((shelf) => Math.hypot(px - shelf.x, pz - shelf.z) - r - shelf.r))
          : 99;
        const score = Math.min(doorGap, shelfGap);
        if (!best || score > best.score) best = { angle, x: px, z: pz, score };
      }
      if (!best || best.score < 2.1) continue;
      const angle = best.angle;
      const top = 0.88 + i * 0.06;
      const x = best.x;
      const z = best.z;
      placed.push({ x, z, r });

      // A shelf is a growth, not a coin. Perturb the cylinder radially and on
      // the top face so the lip waves like every other tissue surface here.
      const topGeo = new THREE.CylinderGeometry(r, r * 0.9, 0.34, 22, 2, false);
      const pos = topGeo.attributes.position;
      const wobbleA = rng.float(0, TAU);
      const wobbleB = rng.float(0, TAU);
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v);
        const vz = pos.getZ(v);
        const vy = pos.getY(v);
        const a = Math.atan2(vz, vx);
        const rr = Math.hypot(vx, vz);
        if (rr > 0.02) {
          const wob = 1 + Math.sin(a * 3 + wobbleA) * 0.07 + Math.sin(a * 7 + wobbleB) * 0.035;
          pos.setX(v, vx * wob);
          pos.setZ(v, vz * wob);
        }
        if (vy > 0.01) pos.setY(v, vy + Math.sin(a * 5 + wobbleA) * 0.055 + Math.sin(a * 9 + wobbleB) * 0.02);
      }
      topGeo.computeVertexNormals();
      const pad = new THREE.Mesh(topGeo, shelfMat);
      pad.position.set(x, top - 0.17, z);
      pad.rotation.y = rng.float(0, TAU);
      this.group.add(pad);
      this.disposables.push(topGeo);

      // A dark fleshy lip, not a neon ring. The old additive rim blew out to
      // white under bloom and read as polished plastic in a body.
      const rimGeo = new THREE.TorusGeometry(r * 0.99, 0.075, 5, 28);
      const rim = new THREE.Mesh(rimGeo, mats.deepMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, top + 0.015, z);
      this.group.add(rim);
      this.disposables.push(rimGeo);

      // The shelf grows out of the wall instead of floating on a pillar.
      const root = new THREE.Vector3(
        room.x + Math.cos(angle) * room.r * 0.92,
        0.15,
        room.z + Math.sin(angle) * room.r * 0.92
      );
      const anchor = new THREE.Vector3(x, top - 0.25, z);
      for (let s = 0; s < 3; s++) {
        const mid = anchor.clone().lerp(root, 0.55);
        mid.y -= rng.float(0.2, 0.5);
        const geo = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([anchor.clone(), mid, root.clone().add(new THREE.Vector3(rng.float(-0.4, 0.4), 0, rng.float(-0.4, 0.4)))]),
          8,
          rng.float(0.09, 0.2),
          6,
          false
        );
        this.group.add(new THREE.Mesh(geo, mats.deepMat));
        this.disposables.push(geo);
      }

      this.platforms.push({ x, z, r, top });
      this.obstacles.push({ x, z, r: r * 0.94, solid: true, top });

      if (room.type === 'boss' && i === 0) {
        // Second tier at 1.64 m: one jump from the first shelf. It is the only
        // true two-step climb in the vertical slice, and it is optional.
        const bx = x + Math.cos(angle + 1.35) * r * 1.1;
        const bz = z + Math.sin(angle + 1.35) * r * 1.1;
        const br = r * 0.6;
        const bTop = top + 0.76;
        const bGeo = new THREE.CylinderGeometry(br, br * 0.88, 0.28, 18, 1);
        const bPad = new THREE.Mesh(bGeo, shelfMat);
        bPad.position.set(bx, bTop - 0.14, bz);
        this.group.add(bPad);
        this.disposables.push(bGeo);
        const bRimGeo = new THREE.TorusGeometry(br * 0.96, 0.06, 5, 22);
        const bRim = new THREE.Mesh(bRimGeo, mats.deepMat);
        bRim.rotation.x = -Math.PI / 2;
        bRim.position.set(bx, bTop + 0.012, bz);
        this.group.add(bRim);
        this.disposables.push(bRimGeo);
        this.platforms.push({ x: bx, z: bz, r: br, top: bTop });
        this.obstacles.push({ x: bx, z: bz, r: br * 0.92, solid: true, top: bTop });
      }
    }
  }

  // A giant perfusing heart built into the wall of a cardiac room. This is the
  // landmark that tells the player which organ they are inside from the doorway
  // alone. It beats faster when the surgeon is close (see main.js).
  buildHeartLandmark(room, rng, mats) {
    const doors = this.connections.get(room.id) || [];
    let angle = rng.float(0, TAU);
    for (let tries = 0; tries < 20; tries++) {
      const clear = doors.every((door) =>
        Math.abs(angleDelta(angle, Math.atan2(door.dir.z, door.dir.x))) > 0.8
      );
      if (clear) break;
      angle += 0.29;
    }
    const d = room.r * 0.63;
    const x = room.x + Math.cos(angle) * d;
    const z = room.z + Math.sin(angle) * d;
    const golden = rng.float(0.9, 1.06);
    // Big enough to own the wall and read from the doorway, small enough that
    // the valve is a detail rather than an eye in the middle of the frame.
    const size = (room.type === 'boss' ? 1.8 : 1.28) * golden;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    // The valve is local +Z. Rotate it to face the room centre, not the wall.
    group.rotation.y = -angle - Math.PI / 2;
    this.group.add(group);

    const muscle = new THREE.MeshPhysicalMaterial({
      // No colour map here. The organ's tissue texture carries large pale
      // patches that became a perfect orange disc on a three-metre lobe, reading
      // as a hole or a portal. Bump and coronary geometry carry the detail.
      bumpMap: this.bumpTex,
      bumpScale: 0.11,
      color: 0x963b43,
      roughness: 0.5,
      metalness: 0.01,
      clearcoat: 0.16,
      clearcoatRoughness: 0.55,
      emissive: 0x4a0b0e,
      emissiveIntensity: 0.52,
      envMapIntensity: 0.3,
    });
    const pale = new THREE.MeshPhysicalMaterial({
      color: 0xa87a63,
      roughness: 0.62,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
      emissive: 0x1e0605,
      emissiveIntensity: 0.1,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x230507,
      roughness: 0.7,
      emissive: 0x120102,
      emissiveIntensity: 0.32,
    });
    this.materials.push(muscle, pale, dark);

    // A perfect sphere with a clearcoat reads as a balloon. Displace the lobes
    // into uneven myocardium so every highlight breaks across a real surface.
    const lobeGeo = new THREE.SphereGeometry(1, 20, 15);
    const lp = lobeGeo.attributes.position;
    const lv = new THREE.Vector3();
    for (let i = 0; i < lp.count; i++) {
      lv.fromBufferAttribute(lp, i).normalize();
      const az = Math.atan2(lv.z, lv.x);
      const el = Math.asin(clamp(lv.y, -1, 1));
      const lump = 1 + Math.sin(az * 5 + 0.7) * 0.045 + Math.sin(el * 7 - 0.4) * 0.04 + Math.sin((az + el) * 9) * 0.025;
      lp.setXYZ(i, lv.x * lump, lv.y * lump, lv.z * lump);
    }
    lobeGeo.computeVertexNormals();
    const addLobe = (px, py, pz, sx, sy, sz, mat = muscle) => {
      const lobe = new THREE.Mesh(lobeGeo, mat);
      lobe.position.set(px * size, py * size, pz * size);
      lobe.scale.set(sx * size, sy * size, sz * size);
      lobe.rotation.set(rng.float(-0.1, 0.1), rng.float(0, TAU), rng.float(-0.16, 0.16));
      group.add(lobe);
      return lobe;
    };
    addLobe(0, 1.82, 0, 1.24, 1.6, 1.16);
    addLobe(-0.1, 0.92, 0.18, 0.7, 1.05, 0.7);
    addLobe(-0.05, 0.35, 0.1, 0.42, 0.62, 0.42);
    addLobe(-1.1, 2.42, 0.22, 0.78, 0.98, 0.82);
    addLobe(1.13, 2.18, -0.15, 0.7, 0.86, 0.76);
    // Epicardial fat caps: the pale, lumpy crowns on a real heart's top edge.
    addLobe(0.18, 2.92, -0.1, 0.66, 0.54, 0.64, pale);
    addLobe(-0.92, 3.02, 0.28, 0.48, 0.28, 0.46, pale);
    addLobe(0.82, 2.86, -0.06, 0.42, 0.24, 0.42, pale);

    // Great vessels: two arteries and a vena cava root, arching up and back
    // into the wall. Straight tubes over the room read as scaffolding.
    for (let v = 0; v < 3; v++) {
      const a = v * 2.1 + rng.float(-0.2, 0.2);
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.5 * size, 3.0 * size, Math.sin(a) * 0.35 * size),
        new THREE.Vector3(Math.cos(a) * 0.78 * size, 4.1 * size, Math.sin(a) * 0.4 * size - 0.35 * size),
        new THREE.Vector3(Math.cos(a) * 0.7 * size + rng.float(-0.3, 0.3), 5.2 * size, -0.95 * size),
      ];
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.13 * size, 7, false);
      group.add(new THREE.Mesh(geo, pale));
      this.disposables.push(geo);
    }

    // No frontal valve. An anatomical heart seen from outside has no big round
    // opening; the first version did, and every capture read it as an eye. The
    // silhouette, aorta and coronary tree carry the read instead.

    // Coronary arteries and the interventricular groove. These are the shape
    // cues a player recognises instantly, even in a dark cavity.
    const coronaryPaths = [
      [[-0.48, 2.9, 0.8], [-0.55, 2.2, 1.02], [-0.36, 1.35, 0.92], [-0.18, 0.55, 0.6]],
      [[0.66, 2.62, 0.82], [0.72, 1.98, 1.0], [0.5, 1.16, 0.88], [0.28, 0.58, 0.56]],
      [[-1.12, 2.28, 0.5], [-0.55, 2.45, 0.95], [0.28, 2.32, 1.0], [1.0, 2.18, 0.55]],
    ];
    for (let c = 0; c < coronaryPaths.length; c++) {
      const pts = coronaryPaths[c].map(([px, py, pz]) => new THREE.Vector3(px * size, py * size, pz * size));
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, (c === 2 ? 0.06 : 0.045) * size, 5, false);
      group.add(new THREE.Mesh(geo, pale));
      this.disposables.push(geo);
      // A thinner, darker branch keeps the surface from reading as piping.
      if (c < 2) {
        const branch = pts.map((p) => p.clone().add(new THREE.Vector3(0.18 * size, 0, 0.04 * size)));
        const bGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branch), 10, 0.022 * size, 4, false);
        group.add(new THREE.Mesh(bGeo, dark));
        this.disposables.push(bGeo);
      }
    }

    // Coronary bands and the hanging chordae under the valve.
    for (let b = 0; b < 2; b++) {
      const bandGeo = new THREE.TorusGeometry(1.16 * size, 0.075 * size, 6, 26, Math.PI * 1.25);
      const band = new THREE.Mesh(bandGeo, pale);
      band.position.set(0, (1.7 + b * 0.5) * size, 0);
      band.rotation.set(Math.PI / 2 + rng.float(-0.3, 0.3), rng.float(0, TAU), rng.float(0, TAU));
      group.add(band);
      this.disposables.push(bandGeo);
    }
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * TAU;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.62 * size, 1.42 * size, Math.sin(a) * 0.62 * size),
        new THREE.Vector3(Math.cos(a) * 0.7 * size, 0.96 * size, Math.sin(a) * 0.7 * size),
        new THREE.Vector3(Math.cos(a) * 0.52 * size, 0.6 * size, Math.sin(a) * 0.52 * size),
      ];
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 7, 0.022 * size, 4, false);
      group.add(new THREE.Mesh(geo, pale));
      this.disposables.push(geo);
    }

    // Base pedicle: the heart is rooted in the wall, not levitating.
    const rootGeo = new THREE.CylinderGeometry(0.6 * size, 1.0 * size, 1.4 * size, 9);
    const root = new THREE.Mesh(rootGeo, muscle);
    root.position.set(0, 0.5 * size, 0);
    group.add(root);
    this.disposables.push(rootGeo);
    this.disposables.push(lobeGeo);

    // The mass is self-lit just enough to read in an unlit chamber. No local
    // point light: one small specular spark from a close lamp was not worth the
    // light slot or the bloom risk.
    this.heartLandmarks.push({
      x,
      z,
      group,
      muscle,
      phase: rng.float(0, TAU),
      rate: rng.float(0.94, 1.12),
      size,
      room: room.id,
    });
    // The mass is solid. A beating heart you can walk through would break the
    // one thing this landmark exists to sell.
    this.obstacles.push({ x, z, r: 1.35 * size, solid: true });
  }

  // Hanging sheets of pleura. They catch the practical lights and break up the
  // smooth cavity wall without becoming collision geometry.
  buildMembraneVeils(room, doors) {
    const rng = new RNG(this.seed ^ (room.x * 883 + room.z * 197 + 53));
    const palette = this.def.palette;
    const mat = new THREE.MeshPhysicalMaterial({
      map: this.membraneTex,
      color: palette.membrane,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.02,
      depthWrite: false,
      envMapIntensity: 0.35,
      emissive: palette.tissueDeep,
      emissiveIntensity: 0.08,
    });
    this.materials.push(mat);
    const count = room.type === 'boss' ? 5 : 2;
    for (let i = 0; i < count; i++) {
      let angle = (i / count) * TAU + rng.float(-0.2, 0.2);
      let clear = false;
      for (let tries = 0; tries < 18; tries++) {
        clear = doors.every((door) => {
          const da = Math.atan2(door.dir.z, door.dir.x);
          return Math.abs(angleDelta(angle, da)) > 0.7;
        });
        if (clear) break;
        angle += 0.2;
      }
      if (!clear) continue;
      const w = room.r * rng.float(0.34, 0.55);
      const h = room.r * rng.float(0.3, 0.48);
      const geo = new THREE.PlaneGeometry(w, h, 10, 8);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j);
        const y = pos.getY(j);
        const u = x / w;
        const taper = Math.sin((y / h + 0.5) * Math.PI);
        pos.setX(j, x * (0.42 + 0.58 * taper));
        pos.setZ(j, Math.sin(x * 2.4 + y * 1.7) * 0.16);
      }
      geo.computeVertexNormals();
      const veil = new THREE.Mesh(geo, mat);
      veil.name = 'membrane-veil';
      const rr = room.r * rng.float(0.9, 0.97);
      veil.position.set(
        room.x + Math.cos(angle) * rr,
        rng.float(2.2, 3.5),
        room.z + Math.sin(angle) * rr
      );
      veil.lookAt(room.x, veil.position.y - 0.6, room.z);
      this.group.add(veil);
      this.disposables.push(geo);
    }
  }

  buildAmbientProps() {
    // A few sprite-like glowing motes near the room edges.
    const palette = this.def.palette;
    for (const room of this.layout.rooms) {
      if (room.type === 'entry') continue;
      const mat = new THREE.MeshBasicMaterial({
        color: palette.glow,
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      // Motes are atmosphere, not lanterns. The old 0.16 m spheres read as
      // floating eggs at twenty metres.
      const geo = new THREE.SphereGeometry(0.075, 6, 5);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(
          room.x + this.rng.float(-room.r * 0.8, room.r * 0.8),
          this.rng.float(1, 6),
          room.z + this.rng.float(-room.r * 0.8, room.r * 0.8)
        );
        this.group.add(m);
      }
      this.disposables.push(geo);
      this.materials.push(mat);
    }
  }

  buildObstacles() {
    const list = this.layout.obstacles || [];
    for (const o of list) {
      const geo = new THREE.CylinderGeometry(o.r * 0.62, o.r, o.h, 9, 5);
      // Craggy stalagmite, not a turned wooden post.
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const rad = Math.hypot(x, z);
        if (rad <= 0.001) continue;
        const a = Math.atan2(z, x);
        const k = 1 + 0.17 * Math.sin(a * 3.3 + y * 1.9) + 0.1 * Math.sin(y * 3.7 - a * 2.4);
        pos.setX(i, x * k);
        pos.setZ(i, z * k);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x6f4839,
        roughness: 0.86,
        metalness: 0.02,
        emissive: 0x220a06,
        emissiveIntensity: 0.14,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(o.x, o.h / 2, o.z);
      mesh.rotation.y = this.rng.float(0, TAU);
      this.group.add(mesh);
      this.disposables.push(geo);
      this.materials.push(mat);
      this.obstacles.push({ x: o.x, z: o.z, r: o.r * 0.9, solid: true });
    }
  }

  buildGates() {
    for (const g of this.layout.gates) {
      const a = this.roomById.get(g.edge[0]);
      const b = this.roomById.get(g.edge[1]);
      const t = corridorTransform(a, b);
      const corridor = this.layout.corridors.find(
        ([ca, cb]) => (ca === a.id && cb === b.id) || (ca === b.id && cb === a.id)
      );
      const width = corridor ? corridor[2] : 8;
      const x = t.midX;
      const z = t.midZ;
      const radius = width / 2 + 0.45;
      const group = new THREE.Group();
      group.position.set(x, 2.15, z);
      group.rotation.y = t.angle;

      const discMat = this.membraneMat.clone();
      discMat.opacity = 0.72;
      discMat.color.setHex(g.color);
      discMat.emissive.setHex(g.color);
      discMat.emissiveIntensity = 0.35;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), discMat);
      group.add(disc);

      // A wet sphincter, not a neon arch: the pale rim read as a stargate.
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x7a3b2e,
        emissive: g.color,
        emissiveIntensity: 0.3,
        roughness: 0.46,
        metalness: 0.04,
      });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.07, 6, 40), rimMat);
      group.add(rim);

      // Emissive rim does the local lighting. A real point light per gate
      // forced every lit pixel through two more light calculations for a glow
      // that is already painted into the mesh.
      const light = null;
      this.group.add(group);
      this.materials.push(discMat, rimMat);
      this.disposables.push(disc.geometry, rim.geometry);

      const gate = {
        id: g.id,
        x, z, radius,
        requires: g.requires,
        label: g.label,
        color: g.color,
        group,
        disc,
        rim,
        light,
        open: false,
        openT: 0,
        blocking: true,
      };
      this.gates.push(gate);
      this.obstacles.push({ x, z, r: radius + 0.1, gate, solid: true, dynamic: true });
    }
  }

  buildNodes() {
    for (const n of this.layout.nodes) {
      const group = new THREE.Group();
      group.position.set(n.x, 2.0, n.z);
      // A node is a festering sac, not a red marble. One merged mass carries
      // the lumpy silhouette, satellite nodules and the tendrils hanging off
      // the underside, so the whole growth still costs a single draw call.
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x2c090c,
        emissive: 0x8e1a1c,
        emissiveIntensity: 0.4,
        roughness: 0.48,
        metalness: 0.06,
      });
      // Smooth shading over a heavily displaced surface reads as swollen meat;
      // flat facets at this size read as a cut gemstone.
      const coreGeo = makeSacGeometry(this.rng);
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);
      // No stuck-on scabs: flattened patches embedded in the merged mass only
      // showed as pale triangular shards where they clipped through the lumps.
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff3a24,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 9), haloMat);
      group.add(halo);
      // No equatorial torus: at close range it read as a Saturn ring bolted to
      // the growth. The core, nodules, tendrils and halo carry the silhouette.
      const ring = null;
      const light = null;
      this.group.add(group);
      this.materials.push(coreMat, haloMat);
      this.disposables.push(coreGeo, halo.geometry);

      const nodeHp = Math.round(120 * (1 + Math.max(0, (this.run?.tier || 1) - 1) * 0.1));
      this.nodes.push({
        id: n.id,
        room: n.room,
        x: n.x, z: n.z,
        group, core, coreMat, halo, haloMat, ring, light,
        hp: nodeHp,
        maxHp: nodeHp,
        active: true,
        radius: 1.35,
        hitFlash: 0,
        phase: this.rng.float(0, TAU),
      });
    }
  }

  buildLore() {
    const entries = LORE.filter((l) => l.organ === this.organId);
    const candidates = this.layout.rooms.filter((r) => r.type !== 'entry' && r.type !== 'boss');
    for (let i = 0; i < entries.length; i++) {
      const def = entries[i];
      const room = candidates[(i * 2 + 1) % Math.max(1, candidates.length)];
      if (!room) continue;
      const a = this.rng.float(0, TAU);
      const d = room.r * 0.52;
      const x = room.x + Math.cos(a) * d;
      const z = room.z + Math.sin(a) * d;
      const group = new THREE.Group();
      group.position.set(x, 1.5, z);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8fe8d8,
        emissive: 0x6fe3d2,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.1,
      });
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.015, 4, 28),
        new THREE.MeshBasicMaterial({
          color: 0x6fe3d2,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.rotation.x = Math.PI / 2;
      group.add(shard, halo);
      this.group.add(group);
      this.materials.push(mat, halo.material);
      this.disposables.push(shard.geometry, halo.geometry);
      this.lore.push({ def, group, collected: false, x, z, phase: this.rng.float(0, TAU) });
    }
  }

  buildTool() {
    if (!this.layout.tool) return;
    const t = this.layout.tool;
    const group = new THREE.Group();
    group.position.set(t.x, 1.35, t.z);
    const metal = new THREE.MeshStandardMaterial({
      color: 0xd2ded7,
      metalness: 0.78,
      roughness: 0.24,
      emissive: 0x2a665c,
      emissiveIntensity: 0.38,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x252b28, metalness: 0.2, roughness: 0.62 });
    const trayMat = new THREE.MeshPhysicalMaterial({ color: 0x9da9a3, metalness: 0.72, roughness: 0.34, clearcoat: 0.2 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.94, metalness: 0 });
    const glow = new THREE.MeshStandardMaterial({
      color: 0x9bffe4,
      emissive: 0x6fe3d2,
      emissiveIntensity: 1.9,
      roughness: 0.18,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6fe3d2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const iconMat = new THREE.MeshBasicMaterial({
      color: 0xa6ffec,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    // A sterile field kit: tray, cloth and a recognisable handpiece lying on it.
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.06, 18), trayMat);
    tray.position.y = -0.62;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.013, 5, 32), metal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.585;
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.014, 18), cloth);
    drape.position.y = -0.578;
    group.add(tray, rim, drape);

    // The pen floats just above the tray, with the emitter pointing forward.
    const float = new THREE.Group();
    const spin = new THREE.Group();
    float.add(spin);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.078, 0.4, 12), dark);
    grip.rotation.z = Math.PI / 2;
    grip.position.x = -0.22;
    spin.add(grip);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.006, 4, 14), metal);
      rib.rotation.y = Math.PI / 2;
      rib.position.x = -0.36 + i * 0.085;
      spin.add(rib);
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.052, 0.26, 12), metal);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 0.12;
    spin.add(barrel);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 4, 14), dark);
    collar.rotation.y = Math.PI / 2;
    collar.position.x = 0.24;
    spin.add(collar);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 10), glow);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.36;
    spin.add(tip);
    // A tiny charge gauge on the grip, so the tool has a readable state.
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.015), iconMat);
    gauge.position.set(-0.24, 0.078, 0);
    gauge.rotation.x = -Math.PI / 2;
    spin.add(gauge);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.014, 5, 40), ringMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.2;
    float.add(halo);
    const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), iconMat);
    icon.position.y = 0.56;
    float.add(icon);
    // No 3.4 m light column. From a distance it read as a yellow monolith and
    // hid the handpiece it was supposed to advertise; the waypoint marks it.
    group.add(float);
    this.group.add(group);
    this.materials.push(metal, dark, trayMat, cloth, glow, ringMat, iconMat);
    this.disposables.push(
      tray.geometry, rim.geometry, drape.geometry, grip.geometry, barrel.geometry,
      collar.geometry, tip.geometry, gauge.geometry, halo.geometry, icon.geometry
    );
    this.toolPickup = {
      group, float, spin, x: t.x, z: t.z, collected: false, phase: 0,
      ringMat, iconMat, glowMat: glow,
    };
    this.minimap.tool = { x: t.x, z: t.z };
  }

  buildExit() {
    if (!this.layout.exit) return;
    const e = this.layout.exit;
    const group = new THREE.Group();
    group.position.set(e.x, 0, e.z);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6fe3d2,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.08, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.03, 6, 40), ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.5;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2.0, 8, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x6fe3d2,
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.position.y = 4;
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 36),
      new THREE.MeshBasicMaterial({
        color: 0x6fe3d2,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.07;
    group.add(ring, ring2, beam, core);
    this.group.add(group);
    this.materials.push(ringMat, beam.material, core.material);
    this.disposables.push(ring.geometry, ring2.geometry, beam.geometry, core.geometry);
    this.exitPortal = { group, ring, ring2, beam, core, active: false, x: e.x, z: e.z };
  }

  buildSpawns() {
    const extra = (this.run.mutation?.extraEnemies || 0) + (this.run.protocol?.extraEnemies || 0);
    const roster = this.def.roster;
    const tier = this.run?.tier || 1;
    const eliteChance = Math.min(
      ELITE_TUNING.maxChance,
      ELITE_TUNING.chance + Math.max(0, tier - 1) * ELITE_TUNING.tierStep
    );
    const elitePool = ELITES.filter((e) => tier >= e.minTier);
    for (const room of this.layout.rooms) {
      let count = room.enemies;
      if (room.type !== 'entry' && room.type !== 'boss') {
        count += extra + SPAWN_TUNING.roomBonus;
      }
      if (room.type === 'infection') count += SPAWN_TUNING.infectionBonus;
      if (tier >= SPAWN_TUNING.tierBonusAt && room.type !== 'entry' && room.type !== 'boss') {
        count += SPAWN_TUNING.tierBonus;
      }
      if (
        this.run.route?.addElite &&
        this.run.routePending &&
        (room.id === 'atrium' || room.id === 'hub')
      ) {
        this.enemySpawns.push(this.spawnPoint(room, 'brute'));
        this.run.routePending = false;
      }
      for (let i = 0; i < count; i++) {
        const type = this.rng.pick(roster);
        const pack = ENEMIES[type]?.pack || 1;
        for (let p = 0; p < pack; p++) {
          const spawn = this.spawnPoint(room, type);
          if (room.type !== 'entry' && room.type !== 'boss' && elitePool.length && this.rng.next() < eliteChance) {
            spawn.elite = this.rng.pick(elitePool).id;
          }
          this.enemySpawns.push(spawn);
        }
      }
    }
  }

  // The room shells are ellipsoids: horizontal radius 1.15r, vertical 0.64r,
  // centred 2.35 m above the floor. Surface-mounted creatures need that real
  // curve, otherwise they hang in the middle of the air.
  ceilingAt(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const room of this.rooms) {
      const d = dist2(x, z, room.x, room.z);
      if (d < bestD) {
        bestD = d;
        best = room;
      }
    }
    if (!best) return 3.4;
    const q = clamp(bestD / (best.r * 1.15), 0, 0.995);
    return 2.35 + best.r * 0.64 * Math.sqrt(1 - q * q);
  }

  broodPoint(roomId, avoid = null) {
    const candidates = this.broodNests.filter((n) => n.room === roomId);
    if (!candidates.length) return null;
    if (!avoid) return candidates[0];
    let best = candidates[0];
    let bestD = -1;
    for (const nest of candidates) {
      const d = dist2(nest.x, nest.z, avoid.x, avoid.z);
      if (d > bestD) {
        bestD = d;
        best = nest;
      }
    }
    return best;
  }

  buildBroodNests() {
    const palette = this.def.palette;
    for (const room of this.layout.rooms) {
      if (room.type === 'entry' || room.type === 'boss') continue;
      const doors = this.connections.get(room.id) || [];
      const count = room.type === 'infection' ? 3 : 2;
      for (let i = 0; i < count; i++) {
        let angle = this.rng.float(0, TAU);
        for (let tries = 0; tries < 18; tries++) {
          const clear = doors.every((door) =>
            Math.abs(angleDelta(angle, Math.atan2(door.dir.z, door.dir.x))) > 0.55
          );
          if (clear) break;
          angle += 0.24;
        }
        const rr = room.r * this.rng.float(0.82, 0.93);
        const x = room.x + Math.cos(angle) * rr;
        const z = room.z + Math.sin(angle) * rr;
        const y = this.rng.float(1.15, 2.65);
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.lookAt(room.x, y, room.z);

        const membrane = new THREE.MeshPhysicalMaterial({
          color: 0x7d3f38,
          emissive: palette.tissueDeep,
          emissiveIntensity: 0.35,
          roughness: 0.46,
          metalness: 0.03,
          clearcoat: 0.3,
          clearcoatRoughness: 0.3,
          transparent: true,
          opacity: 0.94,
        });
        // Flesh-amber ova, not popcorn. The old cream eggs were the brightest
        // thing in every room and read as untextured placeholders.
        const eggMat = new THREE.MeshPhysicalMaterial({
          color: 0xa85a42,
          emissive: 0x6e2318,
          emissiveIntensity: 0.3,
          roughness: 0.34,
          metalness: 0.02,
          clearcoat: 0.4,
          clearcoatRoughness: 0.24,
          transparent: true,
          opacity: 0.94,
        });
        const lipMat = new THREE.MeshStandardMaterial({
          color: 0x381516,
          emissive: 0x220607,
          emissiveIntensity: 0.5,
          roughness: 0.62,
          side: THREE.DoubleSide,
        });
        this.materials.push(membrane, eggMat, lipMat);

        // One socket + one clutch instead of six separate meshes. The whole
        // sac still swells and flares; only the redundant draws are gone.
        const socketParts = [];
        const socketGeo = new THREE.TorusGeometry(0.34, 0.11, 6, 18);
        const throatGeo = new THREE.CircleGeometry(0.27, 16);
        const socket = new THREE.Mesh(socketGeo, lipMat);
        socket.position.z = 0.04;
        const throat = new THREE.Mesh(throatGeo, lipMat);
        throat.position.z = 0.02;
        for (const part of [socket, throat]) {
          part.updateMatrix();
          const geo = part.geometry.clone();
          geo.applyMatrix4(part.matrix);
          socketParts.push(geo);
        }
        let socketMerged = null;
        try {
          socketMerged = mergeGeometries(socketParts, false);
        } catch {
          socketMerged = null;
        }
        socketParts.forEach((g) => g.dispose());
        if (socketMerged) {
          socketMerged.computeBoundingSphere();
          socketGeo.dispose();
          throatGeo.dispose();
          socket.geometry = socketMerged;
          socket.position.set(0, 0, 0);
          group.add(socket);
          this.disposables.push(socketMerged);
        } else {
          group.add(socket, throat);
          this.disposables.push(socketGeo, throatGeo);
        }

        const eggGeo = new THREE.SphereGeometry(0.18, 8, 6);
        const eggParts = [];
        for (let e = 0; e < 4; e++) {
          const a = (e / 4) * TAU;
          const geo = eggGeo.clone();
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(Math.cos(a) * 0.27, Math.sin(a) * 0.25, 0.18 + (e % 2) * 0.1),
            new THREE.Quaternion(),
            new THREE.Vector3(1, 1.22, 1)
          );
          geo.applyMatrix4(m);
          eggParts.push(geo);
        }
        let eggMerged = null;
        try {
          eggMerged = mergeGeometries(eggParts, false);
        } catch {
          eggMerged = null;
        }
        eggParts.forEach((g) => g.dispose());
        let eggs = [];
        if (eggMerged) {
          eggGeo.dispose();
          eggMerged.computeBoundingSphere();
          const clutch = new THREE.Mesh(eggMerged, eggMat);
          group.add(clutch);
          eggs = [clutch];
          this.disposables.push(eggMerged);
        } else {
          for (let e = 0; e < 4; e++) {
            const a = (e / 4) * TAU;
            const egg = new THREE.Mesh(eggGeo, eggMat);
            egg.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.25, 0.18 + (e % 2) * 0.1);
            egg.scale.set(1, 1.22, 1);
            group.add(egg);
            eggs.push(egg);
          }
          this.disposables.push(eggGeo);
        }
        this.group.add(group);
        this.broodNests.push({
          room: room.id,
          x,
          z,
          y,
          group,
          socket,
          eggs,
          phase: this.rng.float(0, TAU),
          flare: 0,
        });
      }
    }
  }

  flareBrood(roomId, player) {
    const nest = this.broodPoint(roomId, player ? player.pos : null);
    if (!nest) return null;
    nest.flare = 1;
    this.game?.fx?.burst(new THREE.Vector3(nest.x, nest.y, nest.z), this.def.palette.glow, 26, 4);
    return nest;
  }

  // ---------------------------------------------------------------- crises
  // A vascular emergency is the case interrupting the fight. It is deliberately
  // local to the current room so the answer is a decision, not a fetch quest:
  // break off, cross the room, and spend the cautery channel while the timer
  // and the brood both keep running. Ignoring it is a choice with a real Host
  // cost, not a hidden difficulty modifier.
  updateCrisis(dt, player) {
    const crisis = this.crisis;
    if (crisis?.active) {
      crisis.age += dt;
      crisis.phase += dt;
      crisis.timeLeft -= dt;
      const pulse = 0.5 + 0.5 * Math.sin(crisis.phase * 4.4);
      crisis.mound.scale.set(1 + pulse * 0.014, 1 + pulse * 0.026, 1 + pulse * 0.014);
      crisis.stumpGroup.rotation.z = crisis.stumpTilt + Math.sin(crisis.phase * 1.7) * 0.012;
      crisis.rimMat.emissiveIntensity = 0.42 + pulse * 0.62;
      crisis.rim.scale.setScalar(1 + pulse * 0.035);
      crisis.pool.scale.setScalar(1 + pulse * 0.012);
      crisis.poolMat.opacity = 0.82 + pulse * 0.08;
      crisis.jet.scale.set(0.86 + pulse * 0.14, 0.86 + pulse * 0.22, 0.86 + pulse * 0.14);
      crisis.jet.rotation.z = Math.sin(crisis.phase * 3.2) * 0.08;
      crisis.jetMat.opacity = 0.26 + pulse * 0.16;
      if (crisis.light) crisis.light.intensity = 1.0 + pulse * 1.8;
      crisis.sprayTimer -= dt;
      if (crisis.sprayTimer <= 0) {
        crisis.sprayTimer = 0.18 + this.crisisRng.next() * 0.12;
        const origin = new THREE.Vector3(crisis.x, 0.95 + this.crisisRng.float(0, 0.3), crisis.z);
        const dir = new THREE.Vector3(
          this.crisisRng.float(-0.38, 0.38),
          0.85,
          this.crisisRng.float(-0.38, 0.38)
        ).normalize();
        this.game?.fx?.blood(origin, dir, 3);
      }
      if (crisis.timeLeft <= 0) this.ruptureCrisis();
      return;
    }

    if (this.crisisCount >= CRISES.maxPerOrgan) return;
    if (!this.game?.player?.hasCautery) {
      this.crisisTimer = Math.min(this.crisisTimer, CRISES.toolGrace);
      return;
    }
    if (this.game?.boss?.active) return;
    const room = this.rooms.find((r) => r.id === this.currentRoom);
    if (!room || room.type === 'entry' || room.type === 'boss') return;
    this.crisisTimer -= dt;
    if (this.crisisTimer <= 0) this.spawnCrisis(room, player);
  }

  spawnCrisis(room, player) {
    let x = room.x;
    let z = room.z;
    for (let tries = 0; tries < 18; tries++) {
      const a = this.crisisRng.float(0, TAU);
      const d = room.r * this.crisisRng.float(0.28, CRISES.spawnRadius + 0.12);
      x = room.x + Math.cos(a) * d;
      z = room.z + Math.sin(a) * d;
      if (this.blockedByObstacle(x, z, 1.1)) continue;
      if (player && dist2(x, z, player.pos.x, player.pos.z) < CRISES.spawnMinPlayerDistance) continue;
      if (this.nodes.some((n) => n.active && dist2(x, z, n.x, n.z) < 2.0)) continue;
      if (this.gates.some((g) => !g.open && dist2(x, z, g.x, g.z) < 2.2)) continue;
      if (this.exitPortal && dist2(x, z, this.exitPortal.x, this.exitPortal.z) < 2.4) continue;
      if (this.toolPickup && !this.toolPickup.collected && dist2(x, z, this.toolPickup.x, this.toolPickup.z) < 2.0) continue;
      break;
    }

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const seed = this.crisisRng.int(1, 0x7fffffff);

    const moundMat = new THREE.MeshPhysicalMaterial({
      color: 0x471017,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.5,
      emissive: 0x0e0103,
      emissiveIntensity: 0.32,
    });
    const mound = new THREE.Mesh(crisisMoundGeometry(seed), moundMat);
    mound.position.y = 0.015;
    group.add(mound);

    const poolMat = new THREE.MeshPhysicalMaterial({
      color: 0x230105,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pool = new THREE.Mesh(crisisPoolGeometry(seed), poolMat);
    pool.position.y = 0.022;
    group.add(pool);

    const stumpMat = new THREE.MeshPhysicalMaterial({
      color: 0x7c3b34,
      roughness: 0.52,
      metalness: 0.01,
      clearcoat: 0.24,
      clearcoatRoughness: 0.44,
      emissive: 0x1e0304,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });
    const stumpGroup = new THREE.Group();
    stumpGroup.position.y = 0.05;
    const stumpTilt = this.crisisRng.float(-0.22, 0.22);
    stumpGroup.rotation.z = stumpTilt;
    stumpGroup.rotation.x = this.crisisRng.float(-0.1, 0.1);
    const stump = new THREE.Mesh(tornVesselGeometry(seed), stumpMat);
    stumpGroup.add(stump);

    // The dark mouth is what sells an open vessel: without it the stump reads
    // as a solid tusk. The rim sits just proud of the wound lip.
    const mouth = new THREE.Mesh(
      new THREE.CircleGeometry(0.165, 11),
      new THREE.MeshBasicMaterial({ color: 0x100103, side: THREE.DoubleSide })
    );
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.y = 0.601;
    stumpGroup.add(mouth);

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x57070c,
      roughness: 0.38,
      metalness: 0.02,
      emissive: 0xd52419,
      emissiveIntensity: 0.55,
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.183, 0.035, 4, 14), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.612;
    stumpGroup.add(rim);

    const flapMat = new THREE.MeshPhysicalMaterial({
      color: 0x945049,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
    });
    const flapParts = [];
    const flapRng = new RNG(seed ^ 0x2c1b3c6d);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * TAU + flapRng.float(-0.13, 0.13);
      const length = flapRng.float(0.12, 0.3);
      const geo = new THREE.ConeGeometry(flapRng.float(0.032, 0.062), length, 4, 1);
      geo.translate(0, length * 0.5, 0);
      geo.rotateX(flapRng.float(0.5, 1.02));
      geo.rotateY(angle);
      geo.translate(Math.cos(angle) * 0.17, 0.56, Math.sin(angle) * 0.17);
      flapParts.push(geo);
    }
    const flapGeo = mergeGeometries(flapParts, false);
    flapParts.forEach((g) => g.dispose());
    const flaps = new THREE.Mesh(flapGeo, flapMat);
    stumpGroup.add(flaps);
    group.add(stumpGroup);

    // Blood is opaque enough to read against the wet floor, but not additive:
    // additive red turns the whole wound into a neon prop.
    const jetGeo = new THREE.CylinderGeometry(0.014, 0.135, 1.18, 8, 1, true);
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0x64090e,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const jet = new THREE.Mesh(jetGeo, jetMat);
    jet.position.y = 1.16;
    stumpGroup.add(jet);

    // One local light makes the wound read against even the darkest palette.
    // Crises are rare and single-instance, so this stays inside the light budget.
    const light = new THREE.PointLight(0xff3a28, 1.6, 6.5, 2);
    light.position.set(0, 0.85, 0);
    group.add(light);

    this.group.add(group);
    this.crisis = {
      active: true,
      x,
      z,
      room: room.id,
      age: 0,
      phase: this.crisisRng.float(0, TAU),
      timeLeft: CRISES.window,
      window: CRISES.window,
      sealTime: CRISES.sealTime,
      sprayTimer: 0.2,
      group,
      mound,
      moundMat,
      pool,
      poolMat,
      stumpGroup,
      stump,
      stumpMat,
      stumpTilt,
      flaps,
      rim,
      rimMat,
      mouth,
      jet,
      jetMat,
      light,
    };
    this.crisisCount++;
    const at = new THREE.Vector3(x, 0.9, z);
    this.game?.fx?.splat(new THREE.Vector3(x, 0, z), 1.5, 0x46070b);
    this.game?.fx?.bloodMist(at, new THREE.Vector3(0, 0.8, 0.1), 9);
    this.game?.fx?.shockwave(new THREE.Vector3(x, 0.06, z), 0xff4b38, 3.4, 0.6);
    this.game?.audio?.crisisStart();
    this.game?.ui?.toast('VASCULAR CRISIS', 'ARTERIAL RUPTURE // SEAL IT', 'bad', 4200);
  }

  // Every round that finds the open wound shortens the seal window. It is not
  // a fail state by itself: a disciplined player can still close the tear, and
  // a panicking player learns the rule from the countdown rather than a wall of
  // text. The first tear gets a single toast; later hits rely on the HUD.
  damageCrisis(seconds, game) {
    const crisis = this.crisis;
    if (!crisis?.active || !Number.isFinite(seconds) || seconds <= 0) return false;
    crisis.timeLeft -= seconds;
    if (!crisis.tears) crisis.tears = 0;
    crisis.tears++;
    const at = new THREE.Vector3(crisis.x, 1.05, crisis.z);
    game?.fx?.blood(at, new THREE.Vector3(0, 0.8, 0.15), 8);
    game?.fx?.splat(new THREE.Vector3(crisis.x, 0, crisis.z), 0.9, 0x4a060b);
    game?.fx?.addShake(0.16);
    game?.ui?.goreFlash(0.14);
    game?.audio?.crisisTear();
    if (crisis.tears === 1) game?.ui?.toast('WOUND TORN', 'HOLD E — STOP FIRING', 'bad', 2600);
    if (crisis.timeLeft <= 0) this.ruptureCrisis();
    return true;
  }

  sealCrisis(crisis, game) {
    if (!crisis || this.crisis !== crisis || !crisis.active) return false;
    const at = new THREE.Vector3(crisis.x, 1.1, crisis.z);
    game?.fx?.burst(at, 0x9bffe4, 34, 4.5);
    game?.fx?.pulseRing(at, 0x9bffe4);
    game?.fx?.shockwave(new THREE.Vector3(crisis.x, 0.06, crisis.z), 0x9bffe4, CRISES.interactRange, 0.5);
    game?.fx?.splat(new THREE.Vector3(crisis.x, 0, crisis.z), 1.5, 0x4b070c);
    game?.audio?.crisisSealed();
    game?.healHost(CRISES.hostGain);
    game?.addFocus(CRISES.focus);
    game?.awardChain(CRISES.score, 0);
    game?.ui?.toast('RUPTURE SEALED', `HOST +${CRISES.hostGain} // ${CRISES.score} PTS`, 'good', 3000);
    this.removeCrisis();
    this.scheduleCrisis();
    return true;
  }

  ruptureCrisis() {
    const crisis = this.crisis;
    if (!crisis || !crisis.active) return;
    const at = new THREE.Vector3(crisis.x, 1.1, crisis.z);
    const game = this.game;
    this.removeCrisis();
    game?.fx?.burst(at, 0xff4a32, 44, 7);
    game?.fx?.blood(at, new THREE.Vector3(0, 0.8, 0.2), 26);
    game?.fx?.splat(new THREE.Vector3(crisis.x, 0, crisis.z), 2.2, 0x4a060b);
    game?.fx?.shockwave(new THREE.Vector3(crisis.x, 0.06, crisis.z), 0xff4a32, 5.2, 0.55);
    game?.fx?.addShake(0.38);
    game?.ui?.goreFlash(0.32);
    game?.ui?.toast('ARTERIAL RUPTURE', `HOST −${CRISES.hostLoss} // BROOD BREACH`, 'bad', 4600);
    game?.audio?.crisisFail();
    game?.damageHost(CRISES.hostLoss, 'crisis');
    if (game?.state === 'playing' && this.def.roster?.length) {
      for (let i = 0; i < CRISES.ruptureEnemies; i++) {
        const type = this.crisisRng.pick(this.def.roster);
        const a = this.crisisRng.float(0, TAU);
        const d = 1.6 + this.crisisRng.float(0, 1.2);
        game.spawnEnemyAt(type, crisis.x + Math.cos(a) * d, crisis.z + Math.sin(a) * d);
      }
    }
    this.scheduleCrisis();
  }

  scheduleCrisis() {
    this.crisisTimer = Math.max(12, CRISES.interval + this.crisisRng.float(-CRISES.jitter, CRISES.jitter));
  }

  removeCrisis() {
    const crisis = this.crisis;
    if (!crisis) return;
    crisis.active = false;
    if (crisis.light) crisis.light.intensity = 0;
    crisis.group.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material?.dispose?.();
    });
    crisis.group.removeFromParent();
    this.crisis = null;
  }

  spawnPoint(room, type) {
    let x = room.x;
    let z = room.z;
    const wall = type === 'wall';
    for (let tries = 0; tries < 14; tries++) {
      const a = this.rng.float(0, TAU);
      const d = wall
        ? room.r * SPAWN_TUNING.wallRadius
        : this.rng.float(room.r * 0.35, room.r * 0.72);
      x = room.x + Math.cos(a) * d;
      z = room.z + Math.sin(a) * d;
      if (this.blockedByObstacle(x, z, 1.4)) continue;
      if (room.type === 'cache' && this.layout.tool && dist2(x, z, this.layout.tool.x, this.layout.tool.z) < 3) continue;
      break;
    }
    return { x, z, type, room: room.id };
  }

  buildLights() {
    // One real point light per room is seductive and ruinous: every extra
    // light multiplies the fragment cost of every tissue material in view.
    // Instead, three lights roam to the nearest chambers. The player can only
    // see those rooms, so the swap is invisible, but the shader stays fixed.
    const palette = this.def.palette;
    this.roamingLights = [];
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(palette.glow, 0, 32, 2);
      this.group.add(light);
      this.roamingLights.push(light);
    }
    // The Warden brings its own red core light in entities.js. A second
    // arena-wide light was pure duplicated cost.
    this.lightTimer = 0;
    this.updateRoamingLights({ x: 0, z: 4 });
  }

  updateRoamingLights(pos) {
    if (!this.roamingLights?.length || !this.rooms.length) return;
    const nearest = this.rooms
      .map((room) => ({ room, d: dist2(pos.x, pos.z, room.x, room.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.roamingLights.length);
    for (let i = 0; i < this.roamingLights.length; i++) {
      const light = this.roamingLights[i];
      const entry = nearest[i];
      if (!entry) {
        light.intensity = 0;
        continue;
      }
      const room = entry.room;
      light.position.set(room.x, room.r * 0.55, room.z);
      light.distance = room.r * 3.0;
      light.intensity = room.type === 'boss' ? 16 : 10;
    }
  }

  // ---------------------------------------------------------------- collision
  closestOnSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) return { x: ax, z: az };
    let t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = clamp(t, 0, 1);
    return { x: ax + dx * t, z: az + dz * t };
  }

  insideShape(shape, x, z, margin = 0) {
    if (shape.type === 'circle') {
      return dist2(x, z, shape.x, shape.z) <= Math.max(0, shape.r - margin);
    }
    const p = this.closestOnSegment(x, z, shape.ax, shape.az, shape.bx, shape.bz);
    return dist2(x, z, p.x, p.z) <= Math.max(0, shape.r - margin);
  }

  walkable(x, z, margin = 0.05) {
    for (const s of this.shapes) if (this.insideShape(s, x, z, margin)) return true;
    return false;
  }

  // Highest surface the soldier can stand on at this point. `fromY` is the
  // current boot height: only shelves at or below it (plus a small step-up)
  // count, so a 1 m ledge can never teleport a grounded player onto itself.
  groundAt(x, z, fromY = 0, step = 0.34) {
    let best = 0;
    for (const p of this.platforms) {
      if (p.top > fromY + step) continue;
      if (dist2(x, z, p.x, p.z) > p.r * p.r) continue;
      if (p.top > best) best = p.top;
    }
    return best;
  }

  // 0..1 proximity to a beating-heart landmark. Presentation only: this drives
  // tempo and screen pulse, never damage or timing on the simulation clock.
  heartProximity(pos) {
    let best = 0;
    for (const h of this.heartLandmarks) {
      const d = Math.hypot(pos.x - h.x, pos.z - h.z);
      best = Math.max(best, clamp(1 - (d - 2.5) / 15, 0, 1));
    }
    return best;
  }

  blockedByObstacle(x, z, radius = 0) {
    for (const o of this.obstacles) {
      if (o.gate && o.gate.open) continue;
      if (dist2(x, z, o.x, o.z) < o.r + radius) return o;
    }
    return null;
  }

  constrain(pos, radius = 0.44, feetY = 0) {
    // If already inside the walkable union, only resolve props.
    let inside = false;
    for (const s of this.shapes) {
      if (this.insideShape(s, pos.x, pos.z, -radius)) {
        inside = true;
        break;
      }
    }
    if (!inside) {
      let best = null;
      let bestD = Infinity;
      for (const s of this.shapes) {
        let cx = pos.x, cz = pos.z;
        if (s.type === 'circle') {
          const dx = pos.x - s.x;
          const dz = pos.z - s.z;
          const d = Math.hypot(dx, dz) || 1;
          const lim = Math.max(0.01, s.r - radius);
          cx = s.x + (dx / d) * lim;
          cz = s.z + (dz / d) * lim;
        } else {
          const p = this.closestOnSegment(pos.x, pos.z, s.ax, s.az, s.bx, s.bz);
          const dx = pos.x - p.x;
          const dz = pos.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          const lim = Math.max(0.01, s.r - radius);
          cx = p.x + (dx / d) * lim;
          cz = p.z + (dz / d) * lim;
        }
        const dd = (cx - pos.x) ** 2 + (cz - pos.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = { x: cx, z: cz };
        }
      }
      if (best) {
        pos.x = best.x;
        pos.z = best.z;
      }
    }

    // Props and closed gates.
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      for (const o of this.obstacles) {
        if (o.gate && o.gate.open) continue;
        // A shelf is an obstacle only while the boots are below its lip. Above
        // it the player is standing on the surface, not walking into a wall.
        if (o.top !== undefined && feetY > o.top - 0.06) continue;
        const dx = pos.x - o.x;
        const dz = pos.z - o.z;
        const d = Math.hypot(dx, dz);
        const need = o.r + radius;
        if (d < need) {
          const nx = d > 0.0001 ? dx / d : 1;
          const nz = d > 0.0001 ? dz / d : 0;
          pos.x = o.x + nx * need;
          pos.z = o.z + nz * need;
          pushed = true;
        }
      }
      if (!pushed) break;
      if (!this.walkable(pos.x, pos.z, 0)) {
        // Push back toward the nearest shape if an obstacle ejected us.
        for (const s of this.shapes) {
          if (s.type === 'circle') {
            const dx = pos.x - s.x;
            const dz = pos.z - s.z;
            const d = Math.hypot(dx, dz) || 1;
            if (d < s.r) continue;
          }
        }
      }
    }
    return pos;
  }

  rayWallDistance(origin, dir, maxDist = 90) {
    let best = maxDist;
    // The floor is tissue too.
    if (dir.y < -0.0001) {
      const floorT = (0.08 - origin.y) / dir.y;
      if (floorT > 0 && floorT < best) best = floorT;
    }
    // Organic boundary: march until the point leaves the walkable union.
    const step = 0.32;
    for (let t = 0.6; t < best; t += step) {
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      if (!this.walkable(x, z, 0.02)) {
        best = t;
        break;
      }
    }
    // Props and closed gates. The boss body is a movement obstacle only; the
    // core and shield relays have their own hit spheres.
    for (const o of this.obstacles) {
      if (o.boss) continue;
      if (o.gate && o.gate.open) continue;
      const ox = o.x - origin.x;
      const oz = o.z - origin.z;
      const proj = ox * dir.x + oz * dir.z;
      if (proj < 0) continue;
      const perp2 = ox * ox + oz * oz - proj * proj;
      const r2 = o.r * o.r;
      if (perp2 <= r2) {
        const hit = proj - Math.sqrt(r2 - perp2);
        if (hit > 0 && hit < best) best = hit;
      }
    }
    return best;
  }

  segmentClear(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return true;
    const steps = Math.ceil(len / 0.4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.walkable(ax + dx * t, az + dz * t, 0.15)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- updates
  update(dt, player) {
    this.elapsed += dt;
    const time = this.elapsed;
    this.lightTimer = (this.lightTimer || 0) - dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.45;
      this.updateRoamingLights(player.pos);
    }

    // Room entry.
    let inRoom = null;
    for (const room of this.rooms) {
      if (dist2(player.pos.x, player.pos.z, room.x, room.z) < room.r * 0.9) {
        inRoom = room;
        break;
      }
    }
    if (inRoom && this.currentRoom !== inRoom.id) {
      this.currentRoom = inRoom.id;
      this.game?.onRoomEnter?.(inRoom);
    }
    // Once the airlock is left, the protection is spent for the rest of the
    // organ. This tests the radius, not currentRoom: the corridor between
    // rooms keeps the last room id, so the old check left the shield on for the
    // whole first corridor. Retreating to spawn cannot farm a safe corner.
    if (this.entryProtected && this.entryRoomId) {
      const entry = this.roomById.get(this.entryRoomId);
      if (entry && dist2(player.pos.x, player.pos.z, entry.x, entry.z) > entry.r * 0.9) {
        this.entryProtected = false;
      }
    }

    this.updateCrisis(dt, player);

    // Brood nests swell before a wave; the flare is the tell that the walls
    // are about to open.
    const propCull = PERFORMANCE.propCullDistance;
    for (const nest of this.broodNests) {
      const near = dist2(player.pos.x, player.pos.z, nest.x, nest.z) < propCull;
      nest.group.visible = near;
      if (!near) continue;
      nest.phase += dt * (1.1 + nest.flare * 5.5);
      const pulse = 0.5 + 0.5 * Math.sin(nest.phase);
      nest.socket.scale.setScalar(1 + pulse * 0.035 + nest.flare * 0.22);
      nest.socket.material.emissiveIntensity = 0.35 + pulse * 0.2 + nest.flare * 2.2;
      for (let i = 0; i < nest.eggs.length; i++) {
        const egg = nest.eggs[i];
        egg.scale.setScalar(1 + Math.sin(nest.phase * 1.4 + i) * 0.05 + nest.flare * 0.14);
      }
      nest.flare = Math.max(0, nest.flare - dt * 0.7);
    }

    // The wall heart. A contraction is a quick squeeze followed by a long
    // release, so the scale curve is sharpened rather than a plain sine.
    for (const h of this.heartLandmarks) {
      const near = dist2(player.pos.x, player.pos.z, h.x, h.z) < propCull;
      h.group.visible = near;
      if (!near) continue;
      h.phase += dt * h.rate * TAU;
      const s = Math.sin(h.phase);
      const squeeze = s > 0 ? s ** 3 : 0;
      const echo = Math.max(0, Math.sin(h.phase * 2 - 0.9)) ** 6 * 0.32;
      h.group.scale.set(1 - squeeze * 0.028, 1 + squeeze * 0.014 - echo * 0.006, 1 - squeeze * 0.028);
      h.muscle.emissiveIntensity = 0.52 + squeeze * 0.26 + echo * 0.12;
    }

    // Nodes.
    for (const n of this.nodes) {
      if (!n.active) continue;
      const nodeNear = dist2(player.pos.x, player.pos.z, n.x, n.z) < propCull;
      n.group.visible = nodeNear;
      if (!nodeNear) continue;
      n.phase += dt * 1.7;
      if (n.ring) n.ring.rotation.z += dt * 0.45;
      const pulse = 0.5 + 0.5 * Math.sin(n.phase);
      n.core.scale.setScalar(1 + pulse * 0.045);
      n.coreMat.emissiveIntensity = 0.3 + pulse * 0.28;
      if (n.halo) {
        n.halo.scale.setScalar(1.14 + pulse * 0.07);
        n.haloMat.opacity = 0.045 + pulse * 0.035;
      }
      if (n.light) n.light.intensity = 3.5 + pulse * 3.5;
      if (n.hitFlash > 0) {
        n.hitFlash -= dt;
        n.coreMat.emissive.setHex(0xffffff);
        n.coreMat.emissiveIntensity = 1.1;
      } else {
        n.coreMat.emissive.setHex(0x8e1a1c);
      }
    }

    // Gates.
    for (const gate of this.gates) {
      const gateNear = dist2(player.pos.x, player.pos.z, gate.x, gate.z) < propCull;
      if (!gate.open) gate.group.visible = gateNear;
      if (!gateNear) continue;
      if (gate.open) {
        gate.openT = Math.min(1, gate.openT + dt * 2.2);
        gate.disc.material.opacity = 0.72 * (1 - gate.openT);
        gate.disc.scale.setScalar(1 + gate.openT * 0.08);
        gate.rim.rotation.z += dt * 0.8;
        if (gate.light) gate.light.intensity = Math.max(0, 6 * (1 - gate.openT));
        if (gate.openT >= 1) {
          gate.group.visible = false;
          gate.blocking = false;
        }
      } else {
        gate.rim.rotation.z += dt * 0.15;
        gate.disc.material.opacity = 0.58 + 0.14 * Math.sin(time * 2.2 + gate.x);
      }
    }

    // Tool and lore pickups.
    if (this.toolPickup && !this.toolPickup.collected) {
      const toolNear = dist2(player.pos.x, player.pos.z, this.toolPickup.x, this.toolPickup.z) < propCull;
      this.toolPickup.group.visible = toolNear;
      if (toolNear) {
        this.toolPickup.phase += dt * 2.2;
        const tick = this.toolPickup.phase;
        this.toolPickup.float.position.y = 0.04 + Math.sin(tick) * 0.055;
        this.toolPickup.spin.rotation.y += dt * 0.75;
        this.toolPickup.iconMat.opacity = 0.62 + Math.sin(tick * 1.3) * 0.22;
        this.toolPickup.ringMat.opacity = 0.34 + Math.sin(tick * 0.9) * 0.18;
        this.toolPickup.glowMat.emissiveIntensity = 1.7 + Math.sin(tick * 2.1) * 0.35;
        if (dist2(player.pos.x, player.pos.z, this.toolPickup.x, this.toolPickup.z) < 2.2) {
          this.toolPickup.collected = true;
          this.toolPickup.group.visible = false;
          this.game?.acquireCautery?.();
        }
      }
    }
    for (const l of this.lore) {
      if (l.collected) continue;
      const loreNear = dist2(player.pos.x, player.pos.z, l.x, l.z) < propCull;
      l.group.visible = loreNear;
      if (!loreNear) continue;
      l.phase += dt * 1.4;
      l.group.position.y = 1.5 + Math.sin(l.phase) * 0.1;
      l.group.rotation.y += dt * 0.5;
      if (dist2(player.pos.x, player.pos.z, l.x, l.z) < 1.5) {
        l.collected = true;
        l.group.visible = false;
        this.game?.collectLore?.(l.def);
      }
    }

    // Exit portal.
    if (this.exitPortal) {
      const nodesLeft = this.activeNodeCount;
      const active = nodesLeft === 0;
      if (this.exitPortal.active !== active) {
        this.exitPortal.active = active;
        this.game?.onExitStateChanged?.(active);
      }
      const portalNear =
        dist2(player.pos.x, player.pos.z, this.exitPortal.x, this.exitPortal.z) < propCull;
      this.exitPortal.group.visible = portalNear;
      if (portalNear) {
        this.exitPortal.ring.rotation.z += dt * 0.6;
        this.exitPortal.ring2.rotation.z -= dt * 0.35;
        const p = 0.5 + 0.5 * Math.sin(time * 2);
        this.exitPortal.beam.material.opacity = (active ? 0.07 : 0.02) + p * 0.015;
        this.exitPortal.ring.material.opacity = active ? 0.55 + p * 0.2 : 0.16;
        this.exitPortal.ring2.material.opacity = active ? 0.35 : 0.08;
      }
    }

    // Gate seals that depend on node count.
    if (!this.sealOpened && this.def && this.activeNodeCount === 0) {
      this.sealOpened = true;
      let opened = 0;
      for (const gate of this.gates) {
        if (gate.requires === 'nodes' && !gate.open) {
          this.openGate(gate);
          opened++;
        }
      }
      if (opened) this.game?.onSealsReleased?.();
    }
  }

  openGate(gate) {
    if (!gate || gate.open) return false;
    gate.open = true;
    gate.blocking = false;
    this.minimap.gates.forEach((g) => {
      if (dist2(g.x, g.z, gate.x, gate.z) < 0.5) g.open = true;
    });
    this.game?.audio?.doorOpen?.();
    this.game?.fx?.burst(new THREE.Vector3(gate.x, 2, gate.z), gate.color, 26, 5);
    return true;
  }

  activeNodes() {
    return this.nodes.filter((n) => n.active);
  }

  allNodesCleared() {
    return this.activeNodes().length === 0;
  }

  getInteractable(pos, hasCautery) {
    let best = null;
    let bestDist = Infinity;
    const consider = (target, range) => {
      const d = dist2(pos.x, pos.z, target.x, target.z);
      if (d < range && d < bestDist) {
        bestDist = d;
        best = target;
      }
    };

    // The patient's emergency outranks a routine node. If the surgeon is close
    // enough to reach the rupture, the prompt must be the seal, not whichever
    // infection happens to be nearer by half a metre.
    if (this.crisis?.active) {
      const d = dist2(pos.x, pos.z, this.crisis.x, this.crisis.z);
      if (d < CRISES.interactRange) {
        return {
          type: 'crisis',
          crisis: this.crisis,
          x: this.crisis.x,
          z: this.crisis.z,
          enabled: hasCautery,
          time: this.crisis.sealTime,
          prompt: hasCautery ? 'HOLD E — SEAL ARTERIAL RUPTURE' : 'ARTERIAL RUPTURE — CAUTERY REQUIRED',
        };
      }
    }

    for (const gate of this.gates) {
      if (gate.open) continue;
      const needsTool = gate.requires === 'tool';
      const enabled = needsTool ? hasCautery : this.allNodesCleared();
      consider({
        type: 'gate',
        gate,
        x: gate.x,
        z: gate.z,
        enabled,
        prompt: enabled
          ? `HOLD E — CAUTERIZE ${gate.label}`
          : needsTool
            ? 'SEALED — REQUIRES CAUTERY CHARGE'
            : `SEALED — ${this.activeNodeCount} INFECTION NODES REMAIN`,
      }, 7.0);
    }

    for (const n of this.nodes) {
      if (!n.active) continue;
      const enabled = hasCautery;
      consider({
        type: 'node',
        node: n,
        x: n.x,
        z: n.z,
        enabled,
        prompt: enabled
          ? 'HOLD E — CAUTERIZE INFECTION'
          : 'INFECTED MASS — SHOOTING WILL COST HOST INTEGRITY',
      }, 3.5);
    }

    for (const l of this.lore) {
      if (l.collected) continue;
      consider({ type: 'lore', lore: l, x: l.x, z: l.z, enabled: true, prompt: 'E — READ ARCHIVE SHARD' }, 2.4);
    }

    if (this.exitPortal) {
      const cleared = this.allNodesCleared();
      consider({
        type: 'exit',
        x: this.exitPortal.x,
        z: this.exitPortal.z,
        enabled: cleared,
        prompt: cleared ? 'E — EXTRACT TO NEXUS' : `EXTRACTION LOCKED — ${this.activeNodeCount} NODES REMAIN`,
      }, 4.0);
    }

    return best;
  }

  damageNode(node, damage, clean, game) {
    if (!node || !node.active) return false;
    node.hp -= damage;
    node.hitFlash = 0.08;
    if (node.hp > 0) {
      game.fx.impact(new THREE.Vector3(node.x, 2, node.z), 0xff6045, 8);
      game.audio.enemyHit();
      return false;
    }
    node.active = false;
    this.activeNodeCount = Math.max(0, this.activeNodeCount - 1);
    node.group.visible = false;
    if (node.light) node.light.intensity = 0;
    game.fx.burst(new THREE.Vector3(node.x, 2, node.z), 0xff6a42, 46, 8);
    game.audio.nodeDestroyed();
    game.fx.addShake(0.35);
    if (!clean) game.damageHost(HOST.shotNodeCost, 'node');
    game.onNodeDestroyed(node, clean);
    return true;
  }

  cauterizeNode(node, game) {
    if (!node || !node.active) return;
    game.fx.burst(new THREE.Vector3(node.x, 2, node.z), 0x9bffe4, 28, 5);
    node.active = false;
    this.activeNodeCount = Math.max(0, this.activeNodeCount - 1);
    node.group.visible = false;
    game.onNodeDestroyed(node, true);
  }

  getObjectiveTarget(playerPos) {
    if (this.crisis?.active) return { x: this.crisis.x, z: this.crisis.z, kind: 'crisis' };
    if (this.toolPickup && !this.toolPickup.collected) {
      return { x: this.toolPickup.x, z: this.toolPickup.z, kind: 'tool' };
    }
    const nodes = this.activeNodes();
    if (nodes.length) {
      let best = nodes[0];
      let d = Infinity;
      for (const n of nodes) {
        const nd = dist2(playerPos.x, playerPos.z, n.x, n.z);
        if (nd < d) {
          d = nd;
          best = n;
        }
      }
      return { x: best.x, z: best.z, kind: 'node' };
    }
    if (this.layout.boss) return { x: this.layout.boss.x, z: this.layout.boss.z, kind: 'boss' };
    if (this.exitPortal) return { x: this.exitPortal.x, z: this.exitPortal.z, kind: 'exit' };
    return null;
  }

  getObjectiveText(playerPos) {
    if (this.crisis?.active) return 'SEAL THE ARTERIAL RUPTURE';
    if (this.toolPickup && !this.toolPickup.collected) return 'RECOVER THE CAUTERY CHARGE';
    const nodes = this.activeNodeCount;
    if (nodes > 0) return `CLEAR INFECTION — ${nodes} NODE${nodes === 1 ? '' : 'S'} REMAIN`;
    if (this.layout.boss) return `DESTROY ${this.run?.bossDef?.name || 'THE THROMBUS WARDEN'}`;
    return 'REACH EXTRACTION';
  }

  getMap() {
    return this.minimap;
  }

  dispose() {
    this.removeCrisis();
    (this.retiredGeometries || []).forEach((g) => g.dispose?.());
    this.retiredGeometries = [];
    if (this.group) {
      // Removing lights during traverse mutates the children array mid-iteration
      // and can leave a hole that three's traverse then walks into. Collect
      // them first, detach them after the walk.
      const lights = [];
      this.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
          else obj.material?.dispose?.();
        }
        if (obj.isLight) lights.push(obj);
      });
      for (const light of lights) light.removeFromParent();
      this.group.removeFromParent();
      this.group.clear();
    }
    (this.textures || []).forEach((t) => t.dispose?.());
    (this.materials || []).forEach((m) => m.dispose?.());
    this.textures = [];
    this.materials = [];
  }
}
