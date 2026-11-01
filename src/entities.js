// MicroCure — player, enemies, projectiles, pickups, hazards and the Warden.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PLAYER, WEAPON, DISCIPLINES, ENEMIES, BOSS, BOSS_VARIANTS, ELITES, COMBAT, FOCUS, HOST, GAMEPAD, ORGAN_AMBIENCE } from './content.js';
import { clamp, damp, dist2, RNG, TAU, lerp, smoothstep } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const LEG_MATRIX = new THREE.Matrix4();
// Gameplay decisions use the run stream. This keeps the same seed from
// producing different boss tells or summon angles on every replay; FX-only
// randomness remains free to use Math.random.
const gameplayRandom = (game) => game?.run?.rng?.next?.() ?? Math.random();
let flashTexture = null;
let polymerWearTexture = null;
let steelWearTexture = null;
let clothWeaveTexture = null;
let gloveGrainTexture = null;

// A real muzzle flash is a ragged star, not a glowing ball. Painted once at
// boot and reused by every player rebuild.
// Generated wear maps for the viewmodel. A flat roughness value makes polymer
// and parkerised steel look like injection-moulded plastic; uneven roughness is
// what puts scuffs and handling marks into the specular response.
function makeWearTexture(kind) {
  const cache = kind === 'steel' ? steelWearTexture : polymerWearTexture;
  if (cache) return cache;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const base = kind === 'steel' ? 188 : 172;
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 240; i++) {
    const v = base + (Math.random() - 0.5) * 46;
    g.fillStyle = `rgba(${v},${v},${v},${0.14 + Math.random() * 0.24})`;
    const w = 1 + Math.random() * 5;
    const h = 1 + Math.random() * 4;
    g.fillRect(Math.random() * size, Math.random() * size, w, h);
  }
  for (let i = 0; i < 34; i++) {
    const v = base + (Math.random() - 0.5) * 90;
    g.strokeStyle = `rgba(${v},${v},${v},${0.26 + Math.random() * 0.3})`;
    g.lineWidth = 0.5 + Math.random() * 1.2;
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 8 + Math.random() * (kind === 'steel' ? 90 : 46);
    g.beginPath();
    g.moveTo(x, y);
    if (kind === 'steel') g.lineTo(x + len, y + (Math.random() - 0.5) * 2);
    else g.lineTo(x + len * 0.25, y + len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === 'steel' ? 3 : 2, kind === 'steel' ? 3 : 2);
  tex.anisotropy = 4;
  if (kind === 'steel') steelWearTexture = tex;
  else polymerWearTexture = tex;
  return tex;
}

// Woven surgical gown. A smooth cylinder with a flat roughness value reads as
// rubber; a fine twill weave in the bump and roughness channels is what makes
// cloth look like cloth under a moving light.
function makeClothTexture() {
  if (clothWeaveTexture) return clothWeaveTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const over = ((x + y) / 4) % 2 === 0;
      const v = over ? 168 : 88;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 3, 2);
      g.fillRect(x + 1, y + 2, 2, 1);
    }
  }
  for (let i = 0; i < 260; i++) {
    const v = 60 + Math.random() * 140;
    g.fillStyle = `rgba(${v},${v},${v},0.16)`;
    g.fillRect(Math.random() * size, Math.random() * size, 1, 1 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  tex.anisotropy = 4;
  clothWeaveTexture = tex;
  return tex;
}

// Fine nitrile grain. Bump only: a colour map here would just add dirt.
function makeGloveTexture() {
  if (gloveGrainTexture) return gloveGrainTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i++) {
    const v = 95 + Math.random() * 62;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  gloveGrainTexture = tex;
  return tex;
}

function makeFlashTexture() {
  if (flashTexture) return flashTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const cx = 64;
  const cy = 64;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 62);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.12, 'rgba(255,232,180,0.98)');
  grad.addColorStop(0.35, 'rgba(255,158,78,0.55)');
  grad.addColorStop(1, 'rgba(255,90,30,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, 42, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + Math.random() * 0.18;
    const len = 26 + Math.random() * 36;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    const spike = g.createLinearGradient(0, 0, len, 0);
    spike.addColorStop(0, 'rgba(255,240,200,0.95)');
    spike.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = spike;
    g.beginPath();
    g.moveTo(0, -3.2);
    g.lineTo(len, 0);
    g.lineTo(0, 3.2);
    g.closePath();
    g.fill();
    g.restore();
  }
  flashTexture = new THREE.CanvasTexture(c);
  flashTexture.colorSpace = THREE.SRGBColorSpace;
  return flashTexture;
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    }
  });
  group.removeFromParent();
}

function standard(color, emissive = 0x000000, emissiveIntensity = 0.2, roughness = 0.6, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness,
  });
}

// Bake a material's albedo into a vertex colour so many differently-coloured
// body parts can share one draw call without turning into a grey blob.
function paintGeometry(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Body skin is never one flat albedo. Bake low-frequency bruising and a few
// darker wet creases into vertex colours so a single lit draw still reads as
// tissue rather than painted plastic.
function mottleGeometry(geo, color) {
  paintGeometry(geo, color);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  if (!pos || !col) return geo;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const blotch = Math.sin(x * 7.1 + z * 5.3) * 0.5 + Math.sin(y * 11.7 - x * 3.1) * 0.3 + Math.sin(z * 17.3 + y * 2.7) * 0.2;
    const crease = Math.max(0, Math.cos(x * 9.3 + y * 8.1 + z * 6.7)) * 0.18;
    const shade = clamp(1 + blotch * 0.17 - crease, 0.62, 1.24);
    col.setXYZ(i, clamp(col.getX(i) * shade, 0, 1), clamp(col.getY(i) * shade * 0.94, 0, 1), clamp(col.getZ(i) * shade * 0.9, 0, 1));
  }
  col.needsUpdate = true;
  return geo;
}

function mergeColoredMeshes(meshes, target) {
  const geometries = [];
  for (const mesh of meshes) {
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
    mesh.updateMatrix();
    geo.applyMatrix4(mesh.matrix);
    paintGeometry(geo, mesh.material?.color || 0xffffff);
    geometries.push(geo);
  }
  let merged = null;
  try {
    merged = mergeGeometries(geometries, false);
  } catch {
    merged = null;
  }
  geometries.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, target);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Merge direct mesh children of one parent that share a material. This keeps
// the original material look (unlike a vertex-coloured mega-batch) while
// removing the per-finger, per-bolt draw calls that dominated the viewmodel.
function mergeDirectMeshesByMaterial(parent, skip = new Set()) {
  parent.updateMatrixWorld(true);
  const buckets = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || child.isInstancedMesh || skip.has(child)) continue;
    if (Array.isArray(child.material) || !child.material || child.material.isShaderMaterial) continue;
    let list = buckets.get(child.material);
    if (!list) {
      list = [];
      buckets.set(child.material, list);
    }
    list.push(child);
  }
  let mergedCount = 0;
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geometries = [];
    for (const mesh of meshes) {
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
      mesh.updateMatrix();
      geo.applyMatrix4(mesh.matrix);
      geometries.push(geo);
    }
    let merged = null;
    try {
      merged = mergeGeometries(geometries, false);
    } catch {
      merged = null;
    }
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'merged-parts';
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
    for (const source of meshes) {
      source.geometry?.dispose?.();
      source.removeFromParent();
    }
    mergedCount += meshes.length - 1;
  }
  return mergedCount;
}

function mergeMeshGeometry(meshes, color, target) {
  const geometries = [];
  for (const mesh of meshes) {
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
    mesh.updateMatrix();
    geo.applyMatrix4(mesh.matrix);
    paintGeometry(geo, color);
    geometries.push(geo);
  }
  let merged = null;
  try {
    merged = mergeGeometries(geometries, false);
  } catch {
    merged = null;
  }
  geometries.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, target);
  mesh.frustumCulled = true;
  return mesh;
}

// A tapered tube between two points. Limbs are not axis-aligned boxes; building
// them from explicit joints is what makes a forearm read as attached anatomy
// instead of a cylinder parked under the gun.
function segmentMesh(a, b, r1, r2, material, radial = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.001, dir.length());
  const geo = new THREE.CylinderGeometry(r2, r1, len, radial, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}

// ===================================================================== PLAYER
export class Player {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 4);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.hp = PLAYER.maxHp;
    this.maxHp = PLAYER.maxHp;
    this.ammoMag = WEAPON.mag;
    this.ammoReserve = WEAPON.reserve;
    this.medkits = PLAYER.medkits;
    this.stabilizers = PLAYER.stabilizers;
    this.stabilizerMax = PLAYER.stabilizers;
    this.grenades = PLAYER.grenades;
    this.injections = PLAYER.injections;
    this.hasCautery = false;

    this.fireCooldown = 0;
    this.fireRateMult = 1;
    this.collateralMult = 1;
    this.moveSpeedMult = 1;
    this.dashCooldownMult = 1;
    this.reloadMult = 1;
    this.medkitHealMult = 1;
    this.cauteryCooldownMult = 1;
    this.reloadTimer = 0;
    this.reloadTotal = WEAPON.reload;
    this.reloading = false;
    this.reloadMatched = false;
    this.reloadMissed = false;
    this.reloadCues = 0;
    this.aiming = false;
    this.aimBlend = 0;
    this.recoil = 0;
    this.recoilPitch = 0;
    this.hitStun = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDir = new THREE.Vector3();
    // One rupture per enemy per burst. Without this a 0.2 s dash applies a hit
    // on every 60 Hz step and turns a shove into a blender.
    this.dashStrikeSet = new Set();
    this.iframes = 0;
    this.airHeight = 0;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sprintTimer = 0;
    this.grenadeCooldown = 0;
    this.cauteryCooldown = 0;
    this.medkitCooldown = 0;
    this.medkitTimer = 0;
    this.stabilizeCooldown = 0;
    this.bobPhase = 0;
    this.bob = 0;
    this.moveSpeed = 0;
    this.landDip = 0;
    this.equip = 1;
    this.workBlend = 0;
    this.footTimer = 0;
    this.dead = false;
    this.channel = null;
    this.channelProgress = 0;
    this.channelTime = PLAYER.channelTime;
    this.interaction = null;
    this.currentRoom = null;
    // Kit silhouette. The rifle chassis is shared, but each discipline bolts
    // different hardware onto it; setKit() swaps only that module.
    this.kitId = null;
    this.kitModule = null;
    this.weaponName = WEAPON.name;
    this.weaponShort = WEAPON.short;
    this.weaponLabel = 'BIO-VOLT';
    this.accentHex = 0x58e7d0;
    this.accentDark = 0x24cbb4;
    this.time = 0;
    this.damageTaken = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.buildViewmodelClean();
    this.applyCamera();
  }

  setupStats(stats) {
    this.maxHp = stats.maxHp;
    this.hp = stats.hp ?? stats.maxHp;
    this.medkits = stats.medkits;
    this.stabilizerMax = stats.stabilizers;
    this.stabilizers = stats.stabilizers;
    this.grenades = stats.grenades;
    this.fireRateMult = stats.fireRateMult ?? 1;
    this.collateralMult = stats.collateralMult ?? 1;
    this.injections = PLAYER.injections;
    this.ammoMag = WEAPON.mag;
    this.ammoReserve = WEAPON.reserve + (stats.reserveBonus || 0);
    this.dead = false;
    this.channel = null;
    this.channelProgress = 0;
    this.channelTime = PLAYER.channelTime;
  }

  buildViewmodel() {
    const group = new THREE.Group();
    group.position.set(0.32, -0.29, -0.7);
    group.scale.setScalar(0.6);
    const metal = standard(0x22282b, 0x071012, 0.12, 0.28, 0.8);
    const polymer = standard(0x111416, 0x000000, 0, 0.72, 0.08);
    const glow = new THREE.MeshStandardMaterial({
      color: 0x8fffe0,
      emissive: 0x4dffe0,
      emissiveIntensity: 1.05,
      roughness: 0.25,
      metalness: 0.2,
    });
    const dark = standard(0x2c1114, 0x230406, 0.2, 0.55, 0.1);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.58), metal);
    body.position.set(0, 0, 0);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.28), polymer);
    receiver.position.set(0, 0.02, 0.08);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.52, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.5);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.3), metal);
    shroud.position.set(0, 0.015, -0.36);
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 10), glow);
    cell.rotation.z = Math.PI / 2;
    cell.position.set(-0.115, 0.055, 0.08);
    const cellCage = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.2), metal);
    cellCage.position.set(-0.155, 0.03, 0.08);
    const scopeBase = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.19), polymer);
    scopeBase.position.set(0, 0.145, 0.0);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.16), metal);
    scope.position.set(0, 0.2, 0.0);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.027, 12),
      new THREE.MeshBasicMaterial({ color: 0x9bffe4 })
    );
    lens.position.set(0, 0.2, -0.081);
    lens.rotation.y = Math.PI;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), polymer);
    grip.position.set(0, -0.16, 0.14);
    grip.rotation.x = -0.2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.18), polymer);
    stock.position.set(0, -0.02, 0.4);
    const trigger = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 4, 10, Math.PI), metal);
    trigger.position.set(0, -0.07, 0.1);
    trigger.rotation.x = Math.PI / 2;
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), dark);
    handL.position.set(0.015, -0.15, 0.17);
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.15), dark);
    handR.position.set(0.0, -0.16, 0.02);
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 })
    );
    muzzle.position.set(0, 0.01, -0.78);
    const flashLight = new THREE.PointLight(0xffc27a, 0, 3, 2);
    flashLight.position.set(0, 0.05, -0.7);

    group.add(body, receiver, barrel, shroud, cell, cellCage, scopeBase, scope, lens, grip, stock, trigger, handL, handR, muzzle, flashLight);
    this.camera.add(group);
    this.viewmodel = group;
    this.vmBase = new THREE.Vector3(0.32, -0.29, -0.7);
    this.viewmodel.scale.setScalar(0.6);
    this.muzzleMesh = muzzle;
    this.flashLight = flashLight;
    this.viewMaterials = [metal, polymer, glow, dark, lens.material, muzzle.material];
    this.viewGeometries = group.children.map((c) => c.geometry).filter(Boolean);
    this.vmRecoil = 0;
    this.flashTimer = 0;
    this.muzzleWorld = new THREE.Vector3();
  }

  buildViewmodelClean() {
    const group = new THREE.Group();
    // The rifle sits close and large enough that gloves, wear and machining
    // read at speed. At the old scale it was a prop in the corner; here it is
    // something a body is holding.
    group.position.set(0.155, -0.262, -0.77);
    group.scale.setScalar(0.405);
    group.rotation.set(-0.018, 0.132, -0.016);

    // Service-worn surgical hardware: scuffed polymer, parkerised steel and
    // dull instrument brass. Nothing here should look chrome-plated or new.
    const polymer = new THREE.MeshPhysicalMaterial({
      // Dark service polymer. The camera headlamp sits 0.6 m away, so any mid
      // albedo lifts to pale sage on screen and the rifle reads as a toy.
      color: 0x1b231f,
      metalness: 0.18,
      roughness: 0.76,
      roughnessMap: makeWearTexture('polymer'),
      clearcoat: 0.32,
      clearcoatRoughness: 0.46,
      envMapIntensity: 0.95,
    });
    const gripMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a312b,
      metalness: 0.05,
      roughness: 0.92,
      roughnessMap: makeWearTexture('polymer'),
      clearcoat: 0.14,
      clearcoatRoughness: 0.52,
    });
    const metal = new THREE.MeshPhysicalMaterial({
      color: 0x4d5751,
      metalness: 0.58,
      roughness: 0.58,
      roughnessMap: makeWearTexture('steel'),
      clearcoat: 0.22,
      clearcoatRoughness: 0.44,
      envMapIntensity: 0.95,
      emissive: 0x09100e,
      emissiveIntensity: 0.2,
    });
    const brass = new THREE.MeshPhysicalMaterial({
      color: 0x7a5c37,
      metalness: 0.72,
      roughness: 0.44,
      envMapIntensity: 0.9,
    });
    const dark = new THREE.MeshPhysicalMaterial({
      color: 0x2b2823,
      metalness: 0.02,
      roughness: 0.75,
      clearcoat: 0.08,
      clearcoatRoughness: 0.5,
      emissive: 0x0b0706,
      emissiveIntensity: 0.18,
    });
    const teal = new THREE.MeshStandardMaterial({
      color: 0x3f7d68,
      emissive: 0x1c4f41,
      emissiveIntensity: 0.22,
      roughness: 0.44,
      metalness: 0.12,
    });
    const glowSoft = new THREE.MeshBasicMaterial({
      color: 0x8fd8c0,
      transparent: true,
      opacity: 0.3,
      toneMapped: false,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x151818,
      roughness: 0.78,
      metalness: 0.05,
    });
    const tape = new THREE.MeshStandardMaterial({ color: 0x93855f, roughness: 0.9, metalness: 0.02 });
    const signal = new THREE.MeshBasicMaterial({ color: 0x6fe3d2 });

    const parts = [];
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      group.add(m);
      parts.push(m);
      return m;
    };
    // Every hard edge is broken by a small bevel. Boxes with knife edges were
    // the single biggest reason the viewmodel read as a placeholder asset.
    const rounded = (w, h, d, r = 0.012, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);

    // Receiver and stock: a heavy surgical chassis, not a toy pistol.
    add(rounded(0.19, 0.16, 0.36, 0.02, 3), polymer, 0, 0.0, -0.02);
    add(rounded(0.15, 0.1, 0.22, 0.018), polymer, 0, -0.012, 0.28);
    add(rounded(0.115, 0.032, 0.15, 0.01), polymer, 0, 0.055, 0.3);
    // The butt is a rounded end, not a ribbed pad. At eye height the shoulder
    // pad is behind the camera; the old block sat in front of it and ate the
    // whole bottom-right corner of the frame.
    add(rounded(0.115, 0.115, 0.045, 0.016), dark, 0, -0.012, 0.425);
    add(rounded(0.092, 0.042, 0.17, 0.014), polymer, 0, 0.075, 0.315, -0.05);
    add(rounded(0.195, 0.03, 0.32, 0.01), metal, 0, 0.096, -0.03);
    add(rounded(0.11, 0.014, 0.25, 0.005), brass, 0, 0.116, -0.03);
    // Ejection port, bolt catch and selector: small machined readables.
    add(rounded(0.055, 0.058, 0.11, 0.008), dark, 0.098, 0.03, 0.035);
    add(rounded(0.012, 0.03, 0.055, 0.004), brass, 0.11, -0.015, 0.15);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 8), metal, 0.104, 0.052, 0.11, 0, 0, Math.PI / 2);

    // Barrel, shroud, brake. The shroud is a rounded shell with recessed vents,
    // so the light catches an edge instead of a flat box face.
    add(rounded(0.14, 0.13, 0.4, 0.026, 3), polymer, 0, 0.005, -0.34);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        add(rounded(0.006, 0.038, 0.052, 0.002), dark, side * 0.071, 0.008, -0.26 - i * 0.062);
      }
    }
    add(new THREE.CylinderGeometry(0.043, 0.047, 0.56, 14), metal, 0, 0.012, -0.53, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.07, 0.055, 0.11, 14), metal, 0, 0.012, -0.82, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      add(new THREE.TorusGeometry(0.058, 0.008, 5, 16), brass, 0, 0.012, -0.48 - i * 0.1, 0, Math.PI / 2, 0);
      add(new THREE.TorusGeometry(0.057, 0.003, 4, 16), dark, 0, 0.012, -0.475 - i * 0.1, 0, Math.PI / 2, 0);
    }
    add(rounded(0.075, 0.085, 0.05, 0.014), polymer, 0, 0.012, -0.88);
    add(rounded(0.026, 0.028, 0.48, 0.008), metal, -0.083, 0.025, -0.38);
    add(rounded(0.026, 0.028, 0.48, 0.008), metal, 0.083, 0.025, -0.38);
    // Muzzle brake side ports.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        add(rounded(0.008, 0.026, 0.024, 0.002), dark, side * 0.062, 0.02, -0.8 - i * 0.035);
      }
    }
    // Twin surgical prongs give the rifle a silhouette no generic rifle has.
    add(new THREE.CylinderGeometry(0.014, 0.02, 0.24, 8), metal, -0.05, 0.012, -0.96, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.014, 0.02, 0.24, 8), metal, 0.05, 0.012, -0.96, Math.PI / 2);
    add(new THREE.ConeGeometry(0.02, 0.07, 7), brass, -0.05, 0.012, -1.1, -Math.PI / 2);
    add(new THREE.ConeGeometry(0.02, 0.07, 7), brass, 0.05, 0.012, -1.1, -Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      add(rounded(0.024, 0.06, 0.03, 0.004), dark, -0.088 + (i % 2) * 0.176, 0.06, -0.2 - Math.floor(i / 2) * 0.2);
    }
    // Worn cloth tape around the handguard and a serial plate. These asymmetries
    // are what make a weapon look carried rather than extruded. The tape wrap
    // also breaks the long black handguard into three readable masses.
    add(rounded(0.148, 0.052, 0.07, 0.01), dark, 0, -0.002, -0.47);
    const tapeWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.082, 0.03, 14, 1, true), tape);
    tapeWrap.position.set(0, 0.004, -0.355);
    tapeWrap.rotation.x = Math.PI / 2;
    group.add(tapeWrap);
    parts.push(tapeWrap);
    const tapeWrap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.076, 0.018, 12, 1, true), tape);
    tapeWrap2.position.set(0, 0.004, -0.575);
    tapeWrap2.rotation.x = Math.PI / 2;
    tapeWrap2.rotation.z = 0.04;
    group.add(tapeWrap2);
    parts.push(tapeWrap2);
    for (const side of [-1, 1]) {
      add(rounded(0.006, 0.064, 0.16, 0.006), gripMat, side * 0.071, -0.006, -0.32);
      add(rounded(0.006, 0.052, 0.1, 0.005), gripMat, side * 0.071, -0.008, -0.13);
    }
    add(rounded(0.078, 0.085, 0.09, 0.02), gripMat, 0, -0.115, 0.155, -0.2, 0, 0);
    add(rounded(0.05, 0.028, 0.002, 0.003), brass, 0.066, 0.046, -0.27, 0, Math.PI / 2, 0);
    for (let i = 0; i < 3; i++) {
      add(rounded(0.03, 0.0035, 0.001, 0.001), dark, 0.066, 0.052 - i * 0.006, -0.269, 0, Math.PI / 2, 0);
    }
    // Rail teeth, receiver screws and a front sight: small machine detail that
    // catches the view light and makes the rifle read as manufactured.
    for (let i = 0; i < 7; i++) {
      add(new THREE.BoxGeometry(0.052, 0.014, 0.018), metal, 0, 0.137, -0.2 + i * 0.045);
    }
    for (const [x, z] of [[-0.095, 0.08], [0.095, 0.08], [-0.095, 0.22], [0.095, 0.22]]) {
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), brass, x, 0.0, z, 0, 0, Math.PI / 2);
    }
    add(new THREE.TorusGeometry(0.035, 0.008, 4, 10), metal, 0, 0.115, -0.68, 0, 0, 0);
    add(new THREE.BoxGeometry(0.012, 0.07, 0.02), metal, 0, 0.075, -0.68);
    add(new THREE.BoxGeometry(0.014, 0.028, 0.05), brass, 0.106, 0.045, 0.05);
    add(new THREE.BoxGeometry(0.012, 0.052, 0.025), polymer, 0.11, 0.015, -0.02);
    add(new THREE.TorusGeometry(0.035, 0.01, 4, 10, Math.PI * 1.4), metal, -0.06, -0.035, 0.44, 0, 0, 0.7);

    // Optic with a genuinely visible lens, a hood and turret caps.
    add(rounded(0.085, 0.072, 0.16, 0.012), polymer, 0, 0.174, -0.04);
    add(new THREE.CylinderGeometry(0.033, 0.036, 0.065, 14), metal, 0, 0.178, -0.13);
    add(new THREE.TorusGeometry(0.034, 0.006, 5, 18), dark, 0, 0.178, -0.164, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.017, 0.017, 0.024, 10), brass, 0, 0.218, -0.04);
    add(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 10), metal, 0.052, 0.174, -0.01, 0, 0, Math.PI / 2);
    const lens = add(new THREE.CircleGeometry(0.024, 16), glowSoft, 0, 0.178, -0.165, 0, Math.PI, 0);
    lens.material.toneMapped = false;

    // Rear and front irons sit slightly off the optic line.
    add(rounded(0.045, 0.018, 0.03, 0.003), metal, 0, 0.135, 0.12);
    add(rounded(0.008, 0.032, 0.02, 0.002), dark, -0.016, 0.145, 0.12);
    add(rounded(0.008, 0.032, 0.02, 0.002), dark, 0.016, 0.145, 0.12);
    add(new THREE.TorusGeometry(0.024, 0.005, 4, 12), metal, 0, 0.112, -0.69);
    add(rounded(0.006, 0.04, 0.008, 0.002), dark, 0, 0.094, -0.69);

    // One small powered strip survives on the receiver. It is the read that
    // connects the weapon to the HUD without turning it into a neon prop.
    add(rounded(0.008, 0.009, 0.2, 0.002), signal, -0.082, 0.058, 0.02);
    add(rounded(0.012, 0.012, 0.035, 0.003), dark, -0.082, 0.058, -0.11);

    // Bio-cell: the visual heart of the rifle, caged and recessed rather than a
    // bare bright cylinder floating off the side.
    const cell = add(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 16), metal, -0.118, 0.012, -0.09, 0, 0, Math.PI / 2);
    // A caged bio-cell: dark steel housing with one narrow glowing seam. The old
    // full-length cyan cylinder read as a plastic sci-fi prop, not a sealed
    // medical power source.
    add(new THREE.CylinderGeometry(0.021, 0.021, 0.19, 12), glowSoft, -0.118, 0.012, -0.09, 0, 0, Math.PI / 2);
    for (const z of [-0.16, -0.09, -0.02]) {
      add(new THREE.TorusGeometry(0.042, 0.006, 5, 16), dark, -0.118, 0.012, z, 0, Math.PI / 2, 0);
    }
    cell.castShadow = false;
    add(new THREE.TorusGeometry(0.051, 0.009, 5, 16), brass, -0.212, 0.012, -0.09, 0, Math.PI / 2, 0);
    add(new THREE.TorusGeometry(0.051, 0.009, 5, 16), brass, -0.025, 0.012, -0.09, 0, Math.PI / 2, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      add(rounded(0.005, 0.005, 0.2, 0.0015), dark, -0.118 + Math.cos(a) * 0.047, 0.012 + Math.sin(a) * 0.047, -0.09);
      add(new THREE.TorusGeometry(0.048, 0.003, 4, 12), dark, -0.206, 0.012, -0.09, 0, Math.PI / 2, 0);
      add(new THREE.TorusGeometry(0.048, 0.003, 4, 12), dark, -0.03, 0.012, -0.09, 0, Math.PI / 2, 0);
    }
    add(rounded(0.075, 0.011, 0.28, 0.004), rubber, -0.1, 0.07, -0.3);
    add(rounded(0.06, 0.014, 0.11, 0.004), brass, 0, 0.148, -0.27);
    add(rounded(0.03, 0.016, 0.16, 0.004), brass, 0, 0.148, 0.05);
    // Optic power cable, zip-tied along the receiver.
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.045, 0.2, -0.1),
      new THREE.Vector3(0.12, 0.15, -0.04),
      new THREE.Vector3(0.13, 0.06, 0.07),
      new THREE.Vector3(0.09, 0.02, 0.16),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 14, 0.006, 5, false), rubber);
    group.add(cable);
    parts.push(cable);

    // Hose, gloves and grip. The gloves give the silhouette a human scale.
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.09, -0.05, 0.22),
      new THREE.Vector3(-0.15, -0.12, 0.11),
      new THREE.Vector3(-0.13, -0.13, -0.05),
      new THREE.Vector3(-0.17, -0.02, -0.17),
    ]);
    const hoseGeo = new THREE.TubeGeometry(hoseCurve, 20, 0.015, 6, false);
    const hose = new THREE.Mesh(hoseGeo, rubber);
    group.add(hose);
    parts.push(hose);
    // Quick-release couplers at both ends of the fluid line.
    add(new THREE.CylinderGeometry(0.021, 0.021, 0.026, 10), brass, -0.09, -0.05, 0.22, 0.6, 0, 0.3);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.024, 10), brass, -0.17, -0.02, -0.17, 1.1, 0, 0.4);

    // ---------------------------------------------------------------------
    // HANDS AND ARMS
    // ---------------------------------------------------------------------
    // A rifle without arms is a floating prop. Both hands are built around the
    // surface they actually close on — the handguard and the pistol grip — and
    // then continued into a sleeved forearm that leaves the bottom of frame.
    // Digits have three phalanges and real joints; a single tube per finger is
    // the tell that separates a placeholder hand from a hand at this distance.
    const glove = new THREE.MeshPhysicalMaterial({
      // Used nitrile, not chalk. At the old value the glove clipped to pure
      // white under the view fill and read as a mannequin hand. Darkening the
      // albedo keeps the creases and knuckle shading that sell the grip.
      color: 0x4f5b53,
      metalness: 0.02,
      roughness: 0.8,
      roughnessMap: makeWearTexture('polymer'),
      bumpMap: makeGloveTexture(),
      bumpScale: 0.0035,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
      sheen: 0.04,
      sheenColor: new THREE.Color(0x7d8a82),
      sheenRoughness: 0.84,
      envMapIntensity: 0.24,
    });
    const gloveTrim = new THREE.MeshStandardMaterial({ color: 0x3d4841, roughness: 0.86, metalness: 0.02 });
    // Matte gown cloth. The old sleeve carried a pale sheen that turned both
    // forearms into lit pipes under the view light; cloth should stay dark and
    // let its folds, not its highlight, describe the form.
    const sleeve = new THREE.MeshPhysicalMaterial({
      // A dark gown reads as cloth only if the view fill cannot lift it to
      // grey. The old 0x28332d turned both forearms into pale pipes under the
      // close view light; the glove now carries the value contrast instead.
      color: 0x232b26,
      metalness: 0.01,
      roughness: 1.0,
      roughnessMap: makeClothTexture(),
      bumpMap: makeClothTexture(),
      bumpScale: 0.0045,
      sheen: 0.08,
      sheenColor: new THREE.Color(0x4e5f53),
      sheenRoughness: 0.96,
      envMapIntensity: 0.12,
    });
    const sleeveFold = new THREE.MeshStandardMaterial({ color: 0x0e1410, roughness: 1.0, metalness: 0.0 });
    const cuffTape = new THREE.MeshStandardMaterial({ color: 0x574c3a, roughness: 1.0, metalness: 0.0 });
    const wristBand = new THREE.MeshStandardMaterial({ color: 0x24544a, roughness: 0.88, metalness: 0.02 });

    // Three shallow tendons across the back of the hand, plus a few dark
    // splashes. Both are tiny, and both are what stop a gloved hand reading as
    // a smooth mannequin part under a moving light.
    const addTendons = (hand, x, y, zStart, zEnd) => {
      for (let i = 0; i < 3; i++) {
        const z = zStart + (i - 1) * 0.024;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(x - 0.004, y * 0.55, z * 0.75),
          new THREE.Vector3(x - 0.002, 0.02, z * 0.45),
        ]);
        hand.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0022, 4, false), gloveTrim));
      }
      // One smeared cut near the wrist, not two round blots: a paired dark
      // spot on the back of a pale glove reads as a pair of eyes, which made
      // the whole hand look like a creature at rest.
      const stain = new THREE.MeshStandardMaterial({ color: 0x3a0a0c, roughness: 0.86, metalness: 0 });
      const smear = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.0042), stain);
      smear.position.set(x + 0.006, y - 0.034, zStart + 0.03);
      smear.rotation.set(0.25, Math.PI / 2, 0.6);
      hand.add(smear);
    };

    const handShell = (hand, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      hand.add(mesh);
      return mesh;
    };

    // A finger or thumb: tapered phalanx tubes joined by spheres, with a darker
    // glove tip. The knuckle bulge at each joint is what catches the rim light.
    const buildDigit = (hand, points, r0, r1) => {
      for (let i = 0; i < points.length - 1; i++) {
        const ra = lerp(r0, r1, i / (points.length - 1));
        const rb = lerp(r0, r1, (i + 1) / (points.length - 1));
        hand.add(segmentMesh(points[i], points[i + 1], ra, rb * 0.97, glove, 8));
        if (i > 0) {
          // A knuckle is a swell, not a bead. At 1.07x the joint spheres were
          // wider than the phalanx and every finger read as a string of balls.
          const joint = new THREE.Mesh(new THREE.SphereGeometry(ra * 0.88, 8, 6), glove);
          joint.position.copy(points[i]);
          joint.scale.set(1.0, 0.86, 1.0);
          hand.add(joint);
        }
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(r1 * 0.92, 8, 6), gloveTrim);
      tip.position.copy(points[points.length - 1]);
      hand.add(tip);
    };

    // Fabric cuff where the glove meets the gown: a stitched band, three cloth
    // folds and a strip of autoclave tape. This is the seam that makes a hand
    // belong to a person instead of ending in mid-air.
    const buildCuff = (hand, wrist, axis, radius) => {
      const len = 0.078;
      const start = wrist.clone();
      const end = start.clone().addScaledVector(axis, len);
      hand.add(segmentMesh(start, end, radius * 1.02, radius * 1.16, sleeveFold, 12));
      for (const t of [0.14, 0.34, 0.56]) {
        const fold = new THREE.Mesh(new THREE.TorusGeometry(radius * (1.03 + t * 0.16), 0.006, 4, 16), sleeveFold);
        fold.position.copy(start).addScaledVector(axis, len * t);
        fold.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        hand.add(fold);
      }
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.99, radius * 0.99, 0.008, 12), cuffTape);
      tape.position.copy(start).addScaledVector(axis, len * 0.66);
      tape.quaternion.setFromUnitVectors(UP, axis);
      hand.add(tape);
      return end;
    };

    // Support hand: closed over the handguard from the near side. The rail axis
    // is Z, so the fingers climb over the top and hook down the far face while
    // the thumb lies along the barrel. This is the hand the player sees most.
    const buildRailHand = () => {
      const hand = new THREE.Group();
      // The palm sits OUTSIDE the handguard, not inside it. The old shell was
      // centred on the rail face, so the gun swallowed nine tenths of the hand
      // and the player only saw a white wrist and four fingertip stubs.
      handShell(hand, new RoundedBoxGeometry(0.034, 0.104, 0.14, 3, 0.02), glove, -0.088, -0.004, 0);
      handShell(hand, new THREE.SphereGeometry(0.052, 14, 10), glove, -0.095, 0.0, 0, 0.34, 1.0, 1.02);
      // Knuckle row across the back of the hand. Slightly lighter trim so the
      // four joints catch the fill and the grip has a readable top edge.
      for (let i = 0; i < 4; i++) {
        handShell(hand, new THREE.SphereGeometry(0.0155, 8, 6), gloveTrim, -0.112, 0.042, -0.062 + i * 0.042, 1.25, 0.95, 1.15);
      }
      // A full C-clamp around the 14 cm handguard. The arc clears the top by
      // 1.5 cm, so the fingers and the rail are visibly two separate forms.
      for (let i = 0; i < 4; i++) {
        const z = -0.064 + i * 0.043;
        const reach = 0.008 * Math.sin((i / 3) * Math.PI);
        buildDigit(
          hand,
          [
            new THREE.Vector3(-0.104, 0.046, z),
            new THREE.Vector3(-0.112, 0.076, z + 0.002),
            new THREE.Vector3(-0.062, 0.09 - reach, z + 0.003),
            new THREE.Vector3(0.018, 0.088 - reach, z + 0.004),
            new THREE.Vector3(0.07, 0.054 - reach, z + 0.004),
            new THREE.Vector3(0.082, 0.006 - reach, z + 0.004),
          ],
          0.0136,
          0.0098
        );
      }
      // Thumb laid along the near face of the guard, pointing down the barrel.
      // Wrapping it over the top as well made a mitten of the whole hand.
      buildDigit(
        hand,
        [
          new THREE.Vector3(-0.09, 0.026, -0.05),
          new THREE.Vector3(-0.108, 0.018, -0.078),
          new THREE.Vector3(-0.104, 0.01, -0.11),
          new THREE.Vector3(-0.082, 0.004, -0.128),
        ],
        0.0168,
        0.0122
      );
      // Dorsal seam of the glove.
      hand.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.109, 0.02, -0.06),
              new THREE.Vector3(-0.118, 0.024, 0),
              new THREE.Vector3(-0.109, 0.02, 0.06),
            ]),
            12,
            0.0018,
            4,
            false
          ),
          gloveTrim
        )
      );
      const wristEnd = new THREE.Vector3(-0.098, -0.118, 0.055);
      hand.add(segmentMesh(new THREE.Vector3(-0.088, -0.042, 0.01), wristEnd, 0.039, 0.033, glove, 12));
      addTendons(hand, -0.104, 0.044, 0.026, 0.052);
      const axis = wristEnd.clone().sub(new THREE.Vector3(-0.086, -0.06, 0.024)).normalize();
      const cuffEnd = buildCuff(hand, wristEnd, axis, 0.036);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.024, 12), wristBand);
      band.position.copy(wristEnd).addScaledVector(axis, 0.012);
      band.quaternion.setFromUnitVectors(UP, axis);
      hand.add(band);
      // Set high on the handguard, not behind it. At -0.34 the receiver sat
      // between the eye and the hand, so the support hand vanished and the
      // rifle read as a floating prop. Raising it over the rail keeps the
      // C-clamp silhouette visible from the firing line without clipping the
      // optic, and the wrist still lands where the sleeve expects it.
      // Seat the palm level with the handguard so the fingers actually close
      // around it. Lifted to 0.108 the hand hovered 4 cm above the rail and
      // read as a claw resting near the rifle.
      hand.position.set(0.002, 0.012, -0.3);
      hand.rotation.set(0.04, 0.03, -0.18);
      hand.scale.setScalar(1.1);
      hand.updateMatrix();
      return { hand, wrist: cuffEnd.clone().applyMatrix4(hand.matrix) };
    };

    // Firing hand: wraps the pistol grip from the near-left side, so the back of
    // the hand and all four knuckles face the eye. The trigger finger stays
    // indexed along the receiver — a surgeon does not walk with a finger on the
    // trigger.
    const buildGripHand = () => {
      const hand = new THREE.Group();
      handShell(hand, new RoundedBoxGeometry(0.05, 0.142, 0.112, 3, 0.022), glove, -0.068, 0.0, 0.002);
      handShell(hand, new THREE.SphereGeometry(0.062, 14, 10), glove, -0.084, 0.004, 0.002, 0.38, 1.0, 1.02);
      for (let i = 0; i < 4; i++) {
        handShell(hand, new THREE.SphereGeometry(0.015, 8, 6), glove, -0.093, -0.05 + i * 0.035, -0.024, 1.18, 0.95, 1.2);
      }
      for (let i = 0; i < 4; i++) {
        const y = -0.05 + i * 0.035;
        // The index finger rides straight along the receiver; the other three
        // close hard around the frontstrap.
        if (i === 3) {
          buildDigit(
            hand,
            [
              new THREE.Vector3(-0.062, y, -0.024),
              new THREE.Vector3(-0.03, y + 0.002, -0.06),
              new THREE.Vector3(-0.004, y + 0.006, -0.096),
              new THREE.Vector3(0.012, y + 0.008, -0.142),
            ],
            0.0148,
            0.0106
          );
        } else {
          buildDigit(
            hand,
            [
              new THREE.Vector3(-0.062, y, -0.024),
              new THREE.Vector3(-0.028, y, -0.068),
              new THREE.Vector3(0.018, y, -0.078),
              new THREE.Vector3(0.052, y, -0.046),
              new THREE.Vector3(0.058, y, -0.004),
            ],
            0.0154,
            0.0108
          );
        }
      }
      // Thumb along the left of the receiver, pressing forward.
      buildDigit(
        hand,
        [
          new THREE.Vector3(-0.058, 0.06, 0.02),
          new THREE.Vector3(-0.078, 0.086, -0.02),
          new THREE.Vector3(-0.056, 0.092, -0.062),
          new THREE.Vector3(-0.02, 0.074, -0.086),
        ],
        0.0172,
        0.0124
      );
      hand.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.094, 0.018, -0.042),
              new THREE.Vector3(-0.1, 0.022, 0.004),
              new THREE.Vector3(-0.092, 0.018, 0.05),
            ]),
            12,
            0.0018,
            4,
            false
          ),
          gloveTrim
        )
      );
      const wristEnd = new THREE.Vector3(-0.088, -0.126, 0.06);
      hand.add(segmentMesh(new THREE.Vector3(-0.078, -0.05, 0.012), wristEnd, 0.037, 0.033, glove, 12));
      addTendons(hand, -0.096, 0.052, 0.026, 0.06);
      const axis = wristEnd.clone().sub(new THREE.Vector3(-0.072, -0.07, 0.026)).normalize();
      const cuffEnd = buildCuff(hand, wristEnd, axis, 0.037);
      // The palm must sit on the left side of the pistol grip, not 4 cm behind
      // it. The old offset left all four fingers curling around empty air,
      // which is why the hand read as a claw resting near the gun.
      hand.position.set(0.032, -0.125, 0.2);
      hand.rotation.set(0, -0.12, 0.04);
      hand.scale.setScalar(1.12);
      hand.updateMatrix();
      return { hand, wrist: cuffEnd.clone().applyMatrix4(hand.matrix) };
    };

    // One entry point for both articulated hands: the rail grip and the pistol
    // grip differ only in the surface they close on.
    const buildHand = (kind) => (kind === 'rail' ? buildRailHand() : buildGripHand());
    const rail = buildHand('rail');
    const grip = buildHand('grip');
    const supportHand = rail.hand;
    const strongHand = grip.hand;
    this.strongHand = strongHand;
    this.supportHand = supportHand;
    this.strongHandBaseZ = strongHand.position.z;
    this.strongHandBaseY = strongHand.position.y;
    this.supportHandBaseZ = supportHand.position.z;
    this.supportHandBaseY = supportHand.position.y;

    // Both forearms. The sleeve is displaced cloth, not a stack of ringed
    // tubes: a slow radial ripple plus a slight droop gives it folds that
    // catch the view light the way fabric does. Hard torus "joints" were the
    // single most robotic thing in the old model.
    const soakMat = new THREE.MeshStandardMaterial({ color: 0x34100d, roughness: 0.9, metalness: 0.01 });
    const buildSleeve = (a, b, r1, r2, folds = 0.05) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(r2, r1, len, 18, 12, false);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = (y + len / 2) / len;
        const rad = Math.hypot(x, z);
        if (rad > 0.0001) {
          const angle = Math.atan2(z, x);
          const ripple =
            Math.sin(angle * 3 + t * 11) * 0.55 +
            Math.sin(t * 19 + angle * 2) * 0.3 +
            Math.sin(angle * 7 - t * 4) * 0.15;
          const swell = 1 + ripple * folds * (0.4 + 0.6 * Math.sin(t * Math.PI));
          pos.setX(i, x * swell);
          pos.setZ(i, z * swell);
        }
        pos.setX(i, pos.getX(i) + Math.sin(t * 2.4) * len * 0.018);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, sleeve);
      mesh.position.copy(a).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
      return mesh;
    };
    const buildForearm = (wrist, elbow, exit) => {
      const dir = elbow.clone().sub(wrist).normalize();
      const start = wrist.clone().addScaledVector(dir, 0.024);
      // Human forearm proportions: ~6.5 cm at the wrist opening, ~9 cm at the
      // elbow. The old tubes were nearly twice that and read as pipes.
      // A 3 cm wrist on a 5 cm glove reads as a cable. These are the real
      // proportions of a forearm in a loose gown, not a pipe with a hand glued
      // on the end.
      const fore = buildSleeve(start, elbow, 0.052, 0.072, 0.11);
      const upper = buildSleeve(elbow, exit, 0.07, 0.082, 0.09);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 12), sleeve);
      joint.position.copy(elbow);
      joint.scale.set(1.08, 1.0, 1.02);
      // Elastic cuff where the glove is sealed under the gown. Small and fabric:
      // the old ring was bracelet-sized and read as hardware.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.018, 16), sleeveFold);
      band.position.copy(start).addScaledVector(dir, 0.006);
      band.quaternion.setFromUnitVectors(UP, dir);
      // A soaked patch on the elbow, pressed into the cloth rather than ringed
      // around it. Dark, matte and asymmetrical.
      const soak = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), soakMat);
      soak.position.copy(elbow).add(new THREE.Vector3(0.016, 0.02, 0.03));
      soak.scale.set(0.45, 1.15, 0.8);
      group.add(fore, upper, joint, band, soak);
      parts.push(fore, upper, joint, band, soak);
    };
    // Elbows stay inside the frame so the limbs bend. The support arm exits the
    // bottom-left, the firing arm the bottom-right.
    // Both elbows sit behind the weapon. An elbow nearer the eye than the
    // receiver draws the sleeve across the rifle like a sling; behind it, the
    // gun occludes the forearm and the hand reads as attached to an arm.
    buildForearm(rail.wrist, new THREE.Vector3(-0.42, -0.68, -0.12), new THREE.Vector3(-0.66, -1.15, -0.3));
    buildForearm(grip.wrist, new THREE.Vector3(0.34, -0.44, 0.24), new THREE.Vector3(0.58, -0.9, 0.4));
    group.add(supportHand, strongHand);

    add(rounded(0.018, 0.018, 0.16, 0.004), brass, 0.061, 0.038, -0.39);
    // Sling mounts, not decorative hoops.
    add(new THREE.TorusGeometry(0.027, 0.007, 5, 14), metal, 0.072, -0.035, 0.42, 0, Math.PI / 2, 0);
    add(new THREE.TorusGeometry(0.024, 0.006, 5, 14), metal, 0.073, 0.01, -0.55, 0, Math.PI / 2, 0);
    // Short polymer foregrip under the handguard gives the support hand an
    // object to actually be gripping.
    add(rounded(0.045, 0.095, 0.05, 0.012), polymer, 0, -0.065, -0.4, 0.2, 0, 0);
    add(rounded(0.05, 0.012, 0.055, 0.004), dark, 0, -0.11, -0.41, 0.2, 0, 0);

    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, toneMapped: false })
    );
    muzzle.position.set(0, 0.012, -0.94);
    group.add(muzzle);
    const flashMat = new THREE.SpriteMaterial({
      map: makeFlashTexture(),
      color: 0xffe0b0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const muzzleSprite = new THREE.Sprite(flashMat);
    muzzleSprite.position.set(0, 0.012, -1.0);
    muzzleSprite.scale.setScalar(0.4);
    muzzleSprite.visible = false;
    group.add(muzzleSprite);
    this.muzzleSprite = muzzleSprite;
    this.muzzleSpriteMat = flashMat;
    const flashLight = new THREE.PointLight(0xffc27a, 0, 3.4, 2);
    flashLight.position.set(0, 0.04, -0.88);
    // A point light still occupies a forward-render light slot at intensity 0.
    // Hide it between shots so the muzzle flash costs shader time only while
    // it is actually visible.
    flashLight.visible = false;
    group.add(flashLight);

    // A single short-range fill keeps the gloves readable. The old teal rim
    // light cost another full light loop for a 1.6 m accent.
    // Dimmer and further off the hands. At 0.72 in close range the nitrile and
    // sleeve clipped to white plastic, which was the most artificial read left
    // in the viewmodel.
    // Illuminance falls off with d², so a "small" 0.34 at 0.3 m from the
    // receiver is over 3 lux: the whole viewmodel clipped to white while the
    // organ stayed deep red, which is exactly why it read as a pasted prop.
    // A very dim key plus a grazing cool rim keeps the gun dark metal.
    const viewLight = new THREE.PointLight(0xffc8a8, 0.1, 2.6, 2);
    viewLight.position.set(0.44, 0.4, -0.16);
    // A small cool rim separates dark glove and receiver shapes from the warm
    // patient. It is a viewmodel fill, not a gameplay light.
    const rimLight = new THREE.PointLight(0x9fe6d8, 0.2, 1.7, 2);
    rimLight.position.set(0.3, 0.1, -0.32);
    this.camera.add(viewLight, rimLight);
    this.camera.add(group);
    this.viewmodel = group;
    this.vmBase = new THREE.Vector3(0.155, -0.262, -0.77);
    this.muzzleMesh = muzzle;
    this.flashLight = flashLight;
    this.viewLight = viewLight;
    this.rimLight = rimLight;
    this.cellMat = teal;
    this.viewMaterials = [polymer, metal, brass, dark, teal, glowSoft, rubber, glove, gloveTrim, gripMat, sleeve, sleeveFold, cuffTape, wristBand, soakMat, signal, muzzle.material];
    this.vmMats = { polymer, metal, brass, dark, teal, glowSoft, rubber, gripMat, tape, signal };
    this.viewLights = [viewLight, rimLight];

    // The clean viewmodel arrived with 59 separate meshes: every finger, ring,
    // prong and bolt was its own draw call. Collapse the rigid rifle by
    // material, then collapse each articulated hand into one vertex-coloured
    // mesh. The hands stay separate groups so reload and sway still animate.
    const hands = [strongHand, supportHand];
    const handMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      // Nitrile has a soft sheen and a worn grain, not a wet plastic highlight.
      // A tighter clearcoat here was what blew both gloves to bright white.
      roughness: 0.64,
      clearcoat: 0.12,
      clearcoatRoughness: 0.5,
      sheen: 0.1,
      sheenColor: new THREE.Color(0x9aa8a0),
      metalness: 0.04,
    });
    this.vmHandMat = handMat;
    mergeDirectMeshesByMaterial(group, new Set([...hands, muzzle]));
    for (const hand of hands) {
      const meshes = hand.children.filter((c) => c.isMesh);
      const merged = mergeColoredMeshes(meshes, handMat);
      if (!merged) continue;
      for (const mesh of meshes) {
        mesh.geometry?.dispose?.();
        mesh.removeFromParent();
      }
      merged.name = 'hand-batch';
      hand.add(merged);
    }

    // The magazine and charging handle stay separate from the rigid batch so
    // the reload can actually move them. Each is one vertex-coloured draw.
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.17, 0.085), polymer);
    magBody.position.set(0, 0, 0.01);
    const magWell = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.026, 0.095), brass);
    magWell.position.set(0, -0.092, 0.01);
    const magMerged = mergeColoredMeshes([magBody, magWell], this.vmHandMat);
    if (magMerged) {
      magMerged.matrixAutoUpdate = true;
      magMerged.name = 'magazine';
      magMerged.position.set(0, -0.145, 0.055);
      group.add(magMerged);
      this.magazine = magMerged;
      this.magazineBaseY = -0.145;
    }

    const boltBody = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.026, 0.11), metal);
    boltBody.position.set(0, 0, 0);
    const boltKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), brass);
    boltKnob.rotation.z = Math.PI / 2;
    boltKnob.position.set(-0.04, 0, 0.01);
    const boltMerged = mergeColoredMeshes([boltBody, boltKnob], this.vmHandMat);
    if (boltMerged) {
      boltMerged.matrixAutoUpdate = true;
      boltMerged.name = 'charging-handle';
      boltMerged.position.set(0.125, 0.035, 0.03);
      group.add(boltMerged);
      this.boltHandle = boltMerged;
      this.boltBaseZ = 0.03;
    }

    // Blood on the gloves and receiver. It is one mesh, hidden until the
    // surgeon actually gets close enough to the infection to be splashed.
    const bloodTmpMat = new THREE.MeshBasicMaterial({ color: 0x4a070b });
    const bloodBits = [];
    for (const [x, y, z, s] of [
      [0.015, -0.205, 0.14, 0.024],
      [0.035, -0.21, 0.08, 0.018],
      [0.0, -0.2, -0.36, 0.022],
      [0.035, -0.18, -0.4, 0.014],
      [0.09, 0.045, 0.05, 0.017],
      [0.075, -0.03, -0.3, 0.013],
      [-0.05, -0.02, 0.3, 0.015],
    ]) {
      const drop = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), bloodTmpMat);
      drop.position.set(x, y, z);
      drop.scale.set(1.6, 0.45, 1.1);
      bloodBits.push(drop);
    }
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.02,
      clearcoat: 0.55,
      clearcoatRoughness: 0.24,
    });
    const bloodMerged = mergeColoredMeshes(bloodBits, bloodMat);
    if (bloodMerged) {
      bloodMerged.name = 'view-blood';
      bloodMerged.visible = false;
      bloodMerged.matrixAutoUpdate = false;
      group.add(bloodMerged);
      this.viewBlood = bloodMerged;
      this.viewBloodMat = bloodMat;
      this.goreLevel = 0;
    }

    this.viewGeometries = [];
    group.traverse((o) => {
      if (o.isMesh) this.viewGeometries.push(o.geometry);
    });
    this.vmRecoil = 0;
    this.boltKick = 0;
    this.goreLevel = 0;
    this.flashTimer = 0;
    this.muzzleWorld = new THREE.Vector3();
    this.baseFov = 78;
  }

  // ------------------------------------------------------------ kit hardware
  // The chassis is shared so reload, recoil and ammo keep one source of truth;
  // the discipline decides what is bolted onto it. Each module is primitives in
  // rifle space, collapsed by material afterwards, so a kit costs two or three
  // draw calls rather than twenty.
  clearKitModule() {
    if (!this.kitModule) return;
    this.kitModule.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      if (o.material?.userData?.kitMaterial) o.material.dispose();
    });
    this.kitModule.removeFromParent();
    this.kitModule = null;
  }

  buildKitModule(kitId) {
    const m = this.vmMats;
    if (!m) return null;
    const kit = DISCIPLINES.find((d) => d.id === kitId) || DISCIPLINES[0];
    const accentHex = kit.weapon?.accent || 0x58e7d0;
    const accent = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentHex),
      emissive: new THREE.Color(accentHex),
      emissiveIntensity: 0.5,
      roughness: 0.46,
      metalness: 0.16,
    });
    accent.userData.kitMaterial = true;
    const bone = new THREE.MeshStandardMaterial({ color: 0xa9a48d, roughness: 0.66, metalness: 0.06 });
    bone.userData.kitMaterial = true;
    const hazard = new THREE.MeshStandardMaterial({ color: 0x8c4a1c, roughness: 0.74, metalness: 0.1 });
    hazard.userData.kitMaterial = true;
    const group = new THREE.Group();
    group.name = `kit-${kitId}`;
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      group.add(mesh);
      return mesh;
    };
    const rounded = (w, h, d, r = 0.01, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);

    if (kitId === 'trauma') {
      // Breach charge: a second, fatter tube under the handguard. The profile
      // is low and front-heavy, so the silhouette changes even at a glance.
      add(rounded(0.1, 0.095, 0.2, 0.016, 2), m.polymer, 0, -0.108, -0.31);
      add(new THREE.CylinderGeometry(0.038, 0.042, 0.34, 12), m.metal, 0, -0.125, -0.58, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.05, 0.045, 0.06, 12), m.brass, 0, -0.125, -0.755, Math.PI / 2);
      for (const z of [-0.45, -0.52]) {
        add(new THREE.TorusGeometry(0.049, 0.0075, 4, 14), hazard, 0, -0.125, z, 0, Math.PI / 2, 0);
      }
      add(new THREE.TorusGeometry(0.03, 0.008, 4, 10, Math.PI), m.dark, 0, -0.085, -0.24, 0, 0, Math.PI);
      add(rounded(0.012, 0.02, 0.09, 0.004), accent, 0.055, -0.145, -0.36);
      add(rounded(0.055, 0.02, 0.03, 0.005), hazard, 0, 0.075, -0.52);
    } else if (kitId === 'medic') {
      // Stabilizer reservoir: a vertical canister clamped behind the support
      // hand, with one bright sight glass. Reads as a tool, not a magazine.
      add(new THREE.CylinderGeometry(0.05, 0.052, 0.22, 14), m.metal, 0.112, -0.025, -0.03, Math.PI / 2);
      add(rounded(0.008, 0.085, 0.15, 0.003), accent, 0.162, -0.025, -0.03);
      for (const z of [-0.135, 0.075]) {
        add(new THREE.TorusGeometry(0.055, 0.0075, 4, 14), m.brass, 0.112, -0.025, z, 0, Math.PI / 2, 0);
      }
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), m.brass, 0.112, 0.04, -0.03);
      // Painted cross on the stock cheek: the one kit mark readable at speed.
      add(rounded(0.006, 0.068, 0.02, 0.002), bone, 0.086, 0.02, 0.245);
      add(rounded(0.006, 0.02, 0.068, 0.002), bone, 0.086, 0.02, 0.245);
      add(rounded(0.02, 0.012, 0.1, 0.003), accent, 0, 0.078, -0.28);
    } else {
      // Biopsy build: extended barrel, tall optic riser and a fixed blade. The
      // longest, thinnest silhouette of the three.
      add(new THREE.CylinderGeometry(0.025, 0.031, 0.38, 12), m.metal, 0, 0.01, -1.14, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12), m.brass, 0, 0.01, -0.955, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.033, 0.029, 0.07, 12), m.dark, 0, 0.01, -1.32, Math.PI / 2);
      add(rounded(0.007, 0.052, 0.2, 0.002), bone, 0.052, -0.055, -1.14, 0, 0, -0.22);
      add(rounded(0.05, 0.06, 0.11, 0.01), m.dark, 0, 0.246, -0.02);
      add(new THREE.CylinderGeometry(0.027, 0.029, 0.1, 12), m.metal, 0, 0.246, -0.1, Math.PI / 2);
      add(new THREE.TorusGeometry(0.028, 0.005, 4, 14), bone, 0, 0.246, -0.15, 0, 0, 0);
      add(rounded(0.146, 0.012, 0.05, 0.002), bone, 0, 0.075, -0.34);
      add(rounded(0.01, 0.03, 0.03, 0.003), accent, -0.09, 0.045, 0.02);
    }

    mergeDirectMeshesByMaterial(group);
    return group;
  }

  setKit(kitId = 'trauma') {
    const id = kitId || 'trauma';
    if (this.kitId === id) return;
    this.clearKitModule();
    const kit = DISCIPLINES.find((d) => d.id === id) || DISCIPLINES[0];
    this.kitId = id;
    this.weaponName = kit.weapon?.name || WEAPON.name;
    this.weaponShort = kit.weapon?.short || WEAPON.short;
    this.weaponLabel = kit.weapon?.label || this.weaponShort;
    const hex = kit.weapon?.accent || 0x58e7d0;
    this.accentHex = hex;
    this.accentDark = new THREE.Color(hex).multiplyScalar(0.42).getHex();
    // A longer barrel moves the muzzle, and the tracer, flash and light all
    // have to agree with it or shots appear to leave from inside the shroud.
    const muzzleZ = kit.weapon?.muzzle ?? -0.94;
    this.muzzleLocalZ = muzzleZ;
    if (this.muzzleMesh) this.muzzleMesh.position.z = muzzleZ;
    if (this.muzzleSprite) this.muzzleSprite.position.z = muzzleZ - 0.06;
    if (this.flashLight) this.flashLight.position.z = muzzleZ + 0.06;
    const module = this.buildKitModule(id);
    if (module) {
      this.viewmodel.add(module);
      this.kitModule = module;
    }
  }

  resetForLevel(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.dead = false;
    this.channel = null;
    this.channelProgress = 0;
    this.channelTime = PLAYER.channelTime;
    this.dashTimer = 0;
    this.iframes = PLAYER.spawnIFrames;
    this.airHeight = 0;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sprintTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadMatched = false;
    this.reloadMissed = false;
    this.aiming = false;
    this.aimBlend = 0;
    this.landDip = 0;
    this.equip = 1;
    this.workBlend = 0;
    this.channel = null;
    if (this.supportHand) {
      this.supportHand.position.z = this.supportHandBaseZ;
      this.supportHand.position.y = this.supportHandBaseY;
      this.supportHand.rotation.set(0.04, 0.03, 0.16);
    }
    if (this.magazine) {
      this.magazine.visible = true;
      this.magazine.position.y = this.magazineBaseY;
      this.magazine.position.z = 0.055;
      this.magazine.rotation.x = 0;
    }
    if (this.boltHandle) {
      this.boltHandle.position.z = this.boltBaseZ;
      this.boltHandle.position.x = 0.125;
    }
    this.applyCamera();
  }

  look(dx, dy, sensitivity = 1, invert = false) {
    if (this.dead) return;
    const s = 0.0022 * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= (invert ? -1 : 1) * dy * s;
    this.pitch = clamp(this.pitch, -1.35, 1.35);
    this.lookX = clamp(dx, -60, 60);
    this.lookY = clamp(dy, -60, 60);
  }

  getMuzzleWorld() {
    this.viewmodel.updateWorldMatrix(true, false);
    this.muzzleWorld.set(0, 0.012, this.muzzleLocalZ ?? -0.94);
    this.viewmodel.localToWorld(this.muzzleWorld);
    return this.muzzleWorld;
  }

  update(dt, input, level) {
    this.time += dt;
    if (this.dead) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    // Invulnerability is a short dash/recovery window, not a permanent state.
    // Without this decay the player is effectively immortal after every spawn.
    this.iframes = Math.max(0, this.iframes - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.cauteryCooldown = Math.max(0, this.cauteryCooldown - dt);
    this.medkitCooldown = Math.max(0, this.medkitCooldown - dt);
    this.medkitTimer = Math.max(0, this.medkitTimer - dt);
    this.stabilizeCooldown = Math.max(0, this.stabilizeCooldown - dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.hitStun = Math.max(0, this.hitStun - dt);
    this.landDip = damp(this.landDip, 0, 13, dt);
    this.equip = Math.max(0, this.equip - dt * 1.9);
    this.lookX = damp(this.lookX, 0, 14, dt);
    this.lookY = damp(this.lookY, 0, 14, dt);

    // Gamepad look is applied in the fixed step so aim speed does not depend on
    // the display refresh rate. The mouse path remains event-driven in main.js.
    const pad = input.pad;
    if (pad && (pad.lookX || pad.lookY)) {
      const factor = GAMEPAD.lookRate * dt / 0.0022;
      this.look(pad.lookX * factor, pad.lookY * factor, this.game.settings.sensitivity, this.game.settings.invertY);
    }

    const keys = input.keys;
    let ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let iz = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    ix += pad?.moveX || 0;
    iz += pad?.moveZ || 0;
    const magnitude = Math.hypot(ix, iz);
    if (magnitude > 1) {
      ix /= magnitude;
      iz /= magnitude;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(ix * cos + iz * sin, 0, -ix * sin + iz * cos);

    if (input.consumeAction('jump')) this.jumpBuffer = PLAYER.jumpBuffer;
    this.jumpHeld = keys.has('Space') || !!pad?.jump;

    if (input.consumeAction('dash') && this.dashCooldown <= 0 && this.channelProgress === 0) {
      const dir = wish.lengthSq() > 0 ? wish.clone() : new THREE.Vector3(-sin, 0, -cos);
      this.dashDir.copy(dir);
      this.dashTimer = PLAYER.dashTime;
      this.dashCooldown = PLAYER.dashCooldown * this.dashCooldownMult;
      this.iframes = PLAYER.dashIFrames;
      this.dashStrikeSet.clear();
      this.vel.copy(dir).multiplyScalar(PLAYER.dashSpeed);
      // An air dash holds the surgeon's height for the burst instead of
      // converting it into a fall.
      if (!this.grounded) this.vy = Math.max(this.vy, 0);
      // A defibrillator discharge: the dash interrupts nearby wind-ups and
      // opens a line through a clot, not only an escape.
      this.staggerNearby(PLAYER.dashStaggerRadius, PLAYER.dashStaggerTime);
      this.game.fx.shockwave(
        new THREE.Vector3(this.pos.x, 0.12 + this.airHeight, this.pos.z),
        0x8fe6d0,
        PLAYER.dashStaggerRadius,
        0.3
      );
      this.game.ui?.dashPulse?.();
      this.game.audio.dash();
      this.game.fx.addShake(0.12);
      this.game.fx.addRoll(-0.025);
      // A burst of wet air behind the boots, not only at the origin. The trail
      // is what makes the burst read as travel rather than a teleport.
      for (let i = 1; i <= 3; i++) {
        const px = this.pos.x - dir.x * i * 0.55;
        const pz = this.pos.z - dir.z * i * 0.55;
        this.game.fx.burst(new THREE.Vector3(px, 0.05 + this.airHeight, pz), 0xd9b9a0, 4, 0.7);
      }
    }

    if (input.consumeAction('reload')) this.tryReload();
    if (input.consumeAction('focus')) this.game.activateFocus();
    if (input.consumeAction('medkit')) this.useMedkit();
    if (input.consumeAction('stabilize')) this.useStabilizer();
    if (input.consumeAction('grenade')) this.throwGrenade();
    if (input.consumeAction('interact')) this.interact(level);

    // Interaction target is re-evaluated every step so prompts are honest.
    this.interaction = level.getInteractable(this.pos, this.hasCautery);
    if (this.channelProgress > 0) {
      const holding = keys.has('KeyE') || !!pad?.interact;
      if (!holding) {
        this.cancelChannel('released');
      } else if (!this.channelTargetValid()) {
        this.cancelChannel('range');
      } else {
        this.channelProgress += dt;
        if (Math.floor(this.channelProgress * 8) !== Math.floor((this.channelProgress - dt) * 8)) {
          this.game.audio.channel();
        }
        if (this.channelProgress >= (this.channelTime || PLAYER.channelTime)) {
          const target = this.channel;
          this.channel = null;
          this.channelProgress = 0;
          this.game.resolveInteraction(target);
        }
      }
    }

    const canAim = (!!input.aim || !!pad?.aim) && !this.reloading && this.channelProgress === 0 && !this.dead;
    this.aiming = canAim;
    this.aimBlend = damp(this.aimBlend, canAim ? 1 : 0, 13, dt);
    const aimSlow = 1 - this.aimBlend * (1 - WEAPON.aimSpeed);
    // Sprint is a reward for committing to a line. Holding forward for a beat
    // reaches it; strafing, aiming or stopping loses it.
    const forward = iz < -0.2 && wish.lengthSq() > 0 && !canAim;
    this.sprintTimer = forward ? this.sprintTimer + dt : 0;
    const sprinting = (forward && this.sprintTimer >= PLAYER.sprintHold) || !!pad?.sprint;
    const speed =
      (sprinting && wish.lengthSq() > 0 ? PLAYER.sprintSpeed : PLAYER.speed) *
      this.moveSpeedMult *
      aimSlow *
      (this.hitStun > 0 ? PLAYER.hitStunSpeed : 1) *
      (this.grounded ? 1 : PLAYER.airControl);
    const channelSlow = this.channelProgress > 0 ? 0.42 : 1;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        // Boots catch the floor at the end of the burst. The dip is small but it
        // stops the dash from feeling like the camera simply changed speed.
        this.landDip = 0.042;
        this.game.fx.addRoll((Math.random() - 0.5) * 0.008);
      }
      this.vel.copy(this.dashDir).multiplyScalar(PLAYER.dashSpeed * (0.6 + this.dashTimer / PLAYER.dashTime * 0.4));
    } else {
      const targetX = wish.x * speed * channelSlow;
      const targetZ = wish.z * speed * channelSlow;
      const accelRate = this.grounded ? 12 : 5.5;
      this.vel.x = damp(this.vel.x, targetX, accelRate, dt);
      this.vel.z = damp(this.vel.z, targetZ, accelRate, dt);
      if (wish.lengthSq() === 0) {
        this.vel.x = damp(this.vel.x, 0, this.grounded ? 15 : 2.2, dt);
        this.vel.z = damp(this.vel.z, 0, this.grounded ? 15 : 2.2, dt);
      }
    }

    // Horizontal first, so a dash that reaches a shelf resolves against it in
    // the same step. Collision checks the boot height, which is what lets a
    // jump carry the player over a lip instead of into an invisible wall.
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    level.constrain(this.pos, PLAYER.radius, this.airHeight);

    if (this.grounded) this.coyote = PLAYER.coyoteTime;
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.channelProgress === 0 && !this.dead) {
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.vy = PLAYER.jumpSpeed;
      this.airHeight = Math.max(this.airHeight, 0.001);
      this.game.audio.jump?.();
      this.game.fx.burst(new THREE.Vector3(this.pos.x, 0.08 + this.airHeight, this.pos.z), 0x8a6a4a, 8, 1.6);
    }
    // The height at the start of the frame is the swept test origin. A fast
    // fall can cross a shelf top by more than a fixed tolerance in one 60 Hz
    // step; the old current-height check then missed the top entirely and the
    // player dropped through a solid ledge to the floor.
    const fallFrom = this.airHeight;
    if (!this.grounded) {
      // Releasing early cuts the arc. Holding the jump gives the full height.
      if (this.vy > 1.2 && !this.jumpHeld) this.vy -= PLAYER.gravity * dt * 1.7;
      this.vy -= PLAYER.gravity * dt;
      this.airHeight += this.vy * dt;
    }

    if (!this.grounded) {
      const support = level.groundAt(this.pos.x, this.pos.z, fallFrom, 0.001);
      if (this.vy <= 0 && this.airHeight <= support) {
        const impact = Math.max(0, -this.vy);
        this.airHeight = support;
        this.vy = 0;
        this.grounded = true;
        this.landDip = clamp(impact * 0.006, 0.02, 0.1);
        if (impact > PLAYER.landSlamSpeed) {
          this.game.fx.shockwave(
            new THREE.Vector3(this.pos.x, 0.08 + support, this.pos.z),
            0xe8b06a,
            PLAYER.landSlamRadius,
            0.34
          );
          this.game.fx.addShake(0.08);
          this.game.audio.land?.();
          this.game.ui?.landPulse?.(clamp(impact / 13, 0, 1));
          this.staggerNearby(PLAYER.landSlamRadius, PLAYER.landSlamStagger);
          this.slamNearby(PLAYER.landSlamRadius, PLAYER.landSlamDamage);
        } else {
          this.game.audio.footstep(false);
          this.game.ui?.landPulse?.(clamp(impact / 22, 0, 0.4));
        }
      }
    } else {
      // Walking off a shelf starts a fall from its lip. A step smaller than
      // 35 cm snaps up, so low roots are climbable without a jump.
      const support = level.groundAt(this.pos.x, this.pos.z, this.airHeight + 0.34);
      if (support < this.airHeight - 0.08) {
        this.grounded = false;
        this.vy = 0;
      } else {
        this.airHeight = support;
      }
    }

    this.pos.y = this.airHeight;
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.dashTimer > 0) {
      this.clearDashingProjectiles();
      this.dashStrikeNearby();
    }

    // Head bob and footsteps.
    if (this.grounded && this.moveSpeed > 1.2) {
      this.bobPhase += dt * (5.2 + this.moveSpeed * 0.5);
      this.footTimer -= dt;
      if (this.footTimer <= 0) {
        this.footTimer = sprinting ? 0.3 : 0.42;
        this.game.audio.footstep(Math.sin(this.bobPhase) > 0);
      }
    }
    this.bob = this.moveSpeed > 0.5 ? Math.sin(this.bobPhase) * 0.03 + Math.sin(this.bobPhase * 2) * 0.007 : damp(this.bob, 0, 8, dt);
    const strafe = ix;
    const lean = Math.min(1, this.moveSpeed / PLAYER.sprintSpeed);
    this.roll = damp(
      this.roll,
      -strafe * (0.014 + lean * 0.012) + (this.dashTimer > 0 ? -0.025 : 0) + Math.sin(this.bobPhase) * 0.0038 * lean,
      7,
      dt
    );

    this.applyCamera();
    this.updateFiring(dt, input);
    this.updateViewmodel(dt);
  }

  // Dashing through a projectile tears it apart. This buys a line through a
  // volley; the shoulder strike below is the other half of the same verb.
  clearDashingProjectiles() {
    const px = this.pos.x;
    const pz = this.pos.z;
    const py = 1.15 + this.airHeight;
    for (const p of this.game.projectiles || []) {
      if (p.dead) continue;
      if (dist2(p.pos.x, p.pos.z, px, pz) > PLAYER.dashProjectileClear) continue;
      if (Math.abs(p.pos.y - py) > 1.5) continue;
      p.destroy(this.game, false);
      this.game.fx.burst(p.pos.clone(), p.kind === 'boss' ? 0xffb0a0 : 0xe8d0a0, 10, 2.4);
      this.game.audio.enemyHit?.();
    }
  }

  // Dash-through rupture. This is contact damage, not a projectile: it lets a
  // committed dash break a surround, stagger the next body and finish a wounded
  // clot. Killing with it returns part of the cooldown, so the mobility loop
  // rewards pressing into the room instead of backpedalling out of it. It never
  // touches Host Integrity — no round, no discharge, no collateral.
  dashStrikeNearby() {
    const game = this.game;
    if (!game?.enemies) return;
    const py = 0.9 + this.airHeight;
    for (const e of [...game.enemies]) {
      if (!e || e.dead || this.dashStrikeSet.has(e)) continue;
      if (dist2(this.pos.x, this.pos.z, e.pos.x, e.pos.z) > PLAYER.dashStrikeRadius) continue;
      // Do not punch a ceiling crawler out of the air from the floor, and do
      // not hit through a wall the dash cannot pass.
      if (Math.abs((e.height || 0) + 0.75 - py) > 1.35) continue;
      if (game.level?.segmentClear && !game.level.segmentClear(this.pos.x, this.pos.z, e.pos.x, e.pos.z)) continue;
      this.dashStrikeSet.add(e);
      const dir = new THREE.Vector3(e.pos.x - this.pos.x, 0.25, e.pos.z - this.pos.z).normalize();
      const wasAlive = !e.dead;
      e.takeDamage(PLAYER.dashStrikeDamage * (game.run?.damageMult || 1), game, 'body', dir);
      e.stagger = Math.max(e.stagger || 0, PLAYER.dashStrikeStagger);
      e.windup = 0;
      game.addFocus?.(FOCUS.dashStrikeGain);
      const at = new THREE.Vector3(e.pos.x, (e.height || 0) + 0.85, e.pos.z);
      game.fx?.impact(at, e.def?.glow || 0xff7a55, 16, dir);
      game.fx?.blood(at, dir, 14);
      game.fx?.pulseRing(new THREE.Vector3(e.pos.x, 0.08, e.pos.z), 0xff6a4a);
      game.fx?.addShake(0.12);
      game.audio?.dashStrike?.();
      game.hitstop = Math.max(game.hitstop || 0, 0.045);
      if (wasAlive && e.dead) {
        this.dashCooldown = Math.max(0, this.dashCooldown - PLAYER.dashCooldown * PLAYER.dashStrikeKillRefund);
        game.addFocus?.(FOCUS.hitGain);
        if (game.tips && !game.tips.has('phase-strike')) {
          game.tips.add('phase-strike');
          game.ui?.toast?.('PHASE STRIKE', 'DASH KILL // COOLDOWN RETURNED', 'good', 1500);
        }
      }
    }
  }

  // A short interruption pulse. Used by the dash and the landing slam to set
  // up the follow-up, not to replace aim.
  staggerNearby(radius, time) {
    for (const e of this.game.enemies || []) {
      if (!e || e.dead) continue;
      // dist2 is a real distance; comparing it against radius² silently doubled
      // every movement radius in the game. Keep the comparison in metres.
      if (dist2(this.pos.x, this.pos.z, e.pos.x, e.pos.z) > radius) continue;
      e.stagger = Math.max(e.stagger || 0, time);
      e.windup = 0;
    }
  }

  // A hard landing is an attack, not only a recovery. The body does the work,
  // so this never touches Host Integrity; falloff keeps the edge of the ring a
  // nudge rather than a second full hit.
  slamNearby(radius, damage) {
    if (!(damage > 0)) return;
    for (const e of this.game.enemies || []) {
      if (!e || e.dead) continue;
      const d = dist2(this.pos.x, this.pos.z, e.pos.x, e.pos.z);
      if (d > radius + (e.hitRadius || 0.4) * 0.5) continue;
      const dir = new THREE.Vector3(e.pos.x - this.pos.x, 0.25, e.pos.z - this.pos.z);
      if (dir.lengthSq() < 0.0001) dir.set(0, 0.25, -1);
      const falloff = clamp(1 - d / (radius + 0.001), 0, 1);
      e.takeDamage(damage * (0.55 + falloff * 0.45), this.game, 'body', dir.normalize());
    }
  }

  applyCamera() {
    this.camera.rotation.order = 'YXZ';
    const moveFrac = Math.min(1, this.moveSpeed / PLAYER.speed);
    // Reduce-motion is a comfort option, not a stealth difficulty toggle. It
    // removes head bob, landing dip, strafe roll and sprint FOV widening while
    // leaving pitch, aim zoom, collision and movement speed untouched.
    const motion = this.game?.settings?.reduceMotion ? 0 : 1;
    // Weight shifts side to side over the planted foot. It is deliberately
    // small; the old bob was a pure sine pogo with no lateral component.
    const lateral = Math.cos(this.bobPhase) * 0.013 * moveFrac * motion;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const amb = ORGAN_AMBIENCE[this.game?.level?.organId] || ORGAN_AMBIENCE.lung;
    // Breathing is slow and whole-body; the ventricular kick is a sharper
    // contraction. Both are comfort-scaled by reduce-motion and never touch
    // aim, collision or speed.
    const breath = Math.sin(this.time * TAU * amb.breathRate) * amb.breathDepth;
    const heartKick = clamp(this.game?.heartKick || 0, 0, 1);
    this.camera.position.set(
      this.pos.x + rightX * lateral,
      PLAYER.eyeHeight + this.airHeight + this.bob * motion + Math.sin(this.time * 1.15) * 0.0035 * motion - this.landDip * motion + heartKick * 0.018 * motion,
      this.pos.z + rightZ * lateral
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch - moveFrac * 0.006 * motion - this.landDip * 0.55 * motion;
    this.camera.rotation.z = this.roll * motion + heartKick * 0.006 * motion;
    const sprinting = this.moveSpeed > PLAYER.speed + 0.5;
    const targetFov =
      (this.baseFov || 78) +
      (sprinting ? 3.5 : 0) * motion +
      (this.dashTimer > 0 ? 7 : 0) * motion +
      breath * 0.55 * motion +
      heartKick * 0.9 * motion -
      this.aimBlend * WEAPON.aimZoom;
    this.camera.fov = damp(this.camera.fov, targetFov, 8, 1 / 60);
    this.camera.updateProjectionMatrix();
  }

  updateFiring(dt, input) {
    if (this.reloading) {
      this.reloadTimer -= dt;
      const progress = 1 - this.reloadTimer / this.reloadTotal;
      // Off-hand choreography is silent without these three metal cues. They are
      // one-shots per reload and track the same timing as the animation.
      if (!(this.reloadCues & 1) && progress >= 0.3) {
        this.reloadCues |= 1;
        this.game.audio.magOut();
      }
      if (!(this.reloadCues & 2) && progress >= 0.58) {
        this.reloadCues |= 2;
        this.game.audio.magIn();
      }
      if (!(this.reloadCues & 4) && progress >= 0.82) {
        this.reloadCues |= 4;
        this.game.audio.boltCycle();
      }
      if (this.reloadTimer <= 0) {
        const need = WEAPON.mag - this.ammoMag;
        const load = Math.min(need, this.ammoReserve);
        this.ammoMag += load;
        this.ammoReserve -= load;
        this.reloading = false;
        this.reloadMatched = false;
        this.reloadMissed = false;
        this.game.audio.reloadEnd();
      }
    }
    if (this.channelProgress > 0) return;
    if ((!input.fire && !input.pad?.fire) || this.reloading) return;
    if (this.fireCooldown > 0) return;
    if (this.ammoMag <= 0) {
      if (this.ammoReserve > 0) this.startReload();
      else {
        this.game.audio.dryFire();
        this.fireCooldown = 0.3;
      }
      return;
    }
    this.fireCooldown = WEAPON.fireInterval * this.fireRateMult;
    this.ammoMag--;
    this.shotsFired++;
    const spread =
      (WEAPON.spread + (this.moveSpeed / PLAYER.speed) * WEAPON.movingSpread) *
      (this.aiming ? WEAPON.aimSpread : 1);
    const hit = this.game.fireShot(this, spread);
    if (hit) this.shotsHit++;
    this.recoil = Math.min(1, this.recoil + 0.45);
    this.recoilPitch = Math.min(0.055, this.recoilPitch + WEAPON.recoil * 0.8);
    this.vmRecoil = Math.min(1, this.vmRecoil + 0.7);
    this.flashTimer = 0.045;
    this.boltKick = 1;
    this.game.audio.gunshot(this.kitId || 'trauma');
    this.game.fx.addShake(0.055);
    this.game.fx.addRoll((Math.random() - 0.5) * 0.012);
    this.game.fx.muzzle(this.getMuzzleWorld(), 0xffcf9a);
    const eject = this.viewmodel.localToWorld(new THREE.Vector3(0.11, -0.035, 0.08));
    const ejectRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.game.fx.casing(eject, ejectRight);
    this.muzzleMesh.material.opacity = 0.9;
    if (this.muzzleSprite) {
      this.muzzleSprite.visible = true;
      this.muzzleSpriteMat.opacity = 0.95;
      this.muzzleSpriteMat.rotation = Math.random() * TAU;
      this.muzzleSprite.scale.setScalar(0.34 + Math.random() * 0.12);
    }
    this.flashLight.visible = true;
    this.flashLight.intensity = 4;
    if (this.ammoMag <= 0 && this.ammoReserve > 0) this.startReload();
  }

  addGore(amount = 0.1) {
    this.goreLevel = clamp(this.goreLevel + amount, 0, 1);
    if (this.viewBlood) this.viewBlood.visible = true;
  }

  updateViewmodel(dt) {
    const vm = this.viewmodel;
    this.recoil = damp(this.recoil, 0, 10, dt);
    this.vmRecoil = damp(this.vmRecoil, 0, 18, dt);
    this.boltKick = damp(this.boltKick, 0, 24, dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.flashTimer <= 0) {
      this.muzzleMesh.material.opacity = 0;
      if (this.muzzleSprite) {
        this.muzzleSprite.visible = false;
        this.muzzleSpriteMat.opacity = 0;
      }
      this.flashLight.intensity = 0;
      this.flashLight.visible = false;
    }
    const swayX = -this.lookX * 0.0009;
    const swayY = this.lookY * 0.0009;
    const moveFrac = Math.min(1, this.moveSpeed / PLAYER.speed);
    const bobX = Math.sin(this.bobPhase) * 0.008 * moveFrac;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.011 * moveFrac;
    const sideStep = Math.sin(this.bobPhase * 2) * 0.004 * moveFrac;
    const reloadProgress = this.reloading ? clamp(1 - this.reloadTimer / (this.reloadTotal || 1), 0, 1) : 0;
    const reloadDip = this.reloading ? Math.sin(reloadProgress * Math.PI) : 0;
    // Braced aim brings the sight line to the centre of the screen. The same
    // merged meshes and hand groups animate, so the cost is a transform only.
    const aim = this.aimBlend;
    // Sprinting drops the rifle out of the sight line and cants it, the way a
    // real operator carries a weapon he is not currently using. Aiming cancels
    // the pose instead of fighting it.
    const runBlend =
      clamp((this.moveSpeed - PLAYER.speed * 0.85) / (PLAYER.sprintSpeed - PLAYER.speed * 0.85), 0, 1) *
      (1 - aim);
    const settle = 1 - runBlend * 0.35;
    const breath = Math.sin(this.time * 1.15) * 0.0026 * settle + Math.sin(this.time * 0.43) * 0.0014;
    this.workBlend = damp(this.workBlend, this.channelProgress > 0 ? 1 : 0, 9, dt);
    const equipDrop = this.equip * this.equip;
    const work = this.workBlend;
    // Injection pose: the rifle drops out of the sight line while the free hand
    // works. Without it, a medkit is a number changing with no body involved.
    const inject = this.medkitTimer > 0 ? Math.sin(clamp(1 - this.medkitTimer / 0.62, 0, 1) * Math.PI) : 0;
    vm.position.set(
      this.vmBase.x + swayX + bobX + sideStep + runBlend * 0.055 - aim * 0.33 - work * 0.06 - inject * 0.05,
      this.vmBase.y + swayY - bobY - reloadDip * 0.13 + aim * 0.065 + breath - runBlend * 0.045 - this.landDip * 1.6 - equipDrop * 0.24 - work * 0.13 - inject * 0.12,
      this.vmBase.z + this.vmRecoil * 0.085 + aim * 0.24 + runBlend * 0.04 + equipDrop * 0.1 + inject * 0.04
    );
    vm.rotation.set(
      -0.015 - this.vmRecoil * 0.06 + reloadDip * 0.5 + aim * 0.012 + breath * 0.7 + runBlend * 0.16 + equipDrop * 0.45 + work * 0.24 + inject * 0.3,
      -0.045 - swayX * 1.8 + reloadDip * 0.35 + aim * 0.045 + runBlend * 0.09 + work * 0.08,
      -0.025 + swayY * 1.5 - reloadDip * 0.4 + breath * 0.4 + runBlend * 0.17 - equipDrop * 0.2 - work * 0.1 + inject * 0.12
    );
    if (this.supportHand) {
      // The support hand stays locked on the handguard. The firing hand, which
      // is hidden behind the receiver, runs the reload; a support hand ghosting
      // through the chassis to the mag well broke the grip entirely.
      const restZ = this.supportHandBaseZ;
      const handY = this.supportHandBaseY + Math.sin(this.bobPhase) * 0.003 * moveFrac;
      this.supportHand.position.z = damp(this.supportHand.position.z, restZ - runBlend * 0.02, 24, dt);
      this.supportHand.position.y = damp(this.supportHand.position.y, handY - runBlend * 0.01, 24, dt);
      this.supportHand.rotation.x = damp(
        this.supportHand.rotation.x,
        0.04 + this.vmRecoil * 0.05 + runBlend * 0.06 + Math.sin(this.bobPhase) * 0.022 * moveFrac,
        24,
        dt
      );
      this.supportHand.rotation.z = damp(
        this.supportHand.rotation.z,
        0.16 + Math.sin(this.time * 0.9) * 0.008 * settle - runBlend * 0.04,
        18,
        dt
      );
      this.supportHand.rotation.y = damp(
        this.supportHand.rotation.y,
        0.03 + Math.sin(this.bobPhase * 0.5) * 0.015 * moveFrac,
        18,
        dt
      );
    }
    const magZ = 0.055;
    if (this.strongHand) {
      // The firing hand leaves the pistol grip, drops to the magazine well and
      // seats the fresh magazine. The old reload only slid the magazine while
      // the hand sat still, which read as the gun reloading itself.
      const reach = this.reloading
        ? reloadProgress < 0.5
          ? smoothstep(0.04, 0.3, reloadProgress)
          : 1 - smoothstep(0.66, 0.9, reloadProgress)
        : 0;
      this.strongHand.rotation.x = 0.04 + this.vmRecoil * 0.09 + Math.sin(this.bobPhase * 0.5) * 0.018 * moveFrac + reach * 0.5;
      this.strongHand.rotation.y = 0.06 - this.vmRecoil * 0.03 + reach * 0.22;
      this.strongHand.position.y = (this.strongHandBaseY ?? -0.125) - reach * 0.038 + Math.sin(this.bobPhase) * 0.004 * moveFrac;
      this.strongHand.position.z = (this.strongHandBaseZ ?? 0.2) - reach * 0.085;
    }
    if (this.magazine) {
      let off = 0;
      if (this.reloading) {
        off = reloadProgress < 0.6
          ? smoothstep(0.24, 0.4, reloadProgress)
          : 1 - smoothstep(0.58, 0.74, reloadProgress);
      }
      // The magazine is out of the well only while the firing hand is below the
      // receiver retrieving the fresh one.
      this.magazine.visible = !(this.reloading && reloadProgress > 0.47 && reloadProgress < 0.58);
      this.magazine.position.y = this.magazineBaseY - off * 0.33;
      this.magazine.position.z = magZ + off * 0.035;
      this.magazine.rotation.x = off * 0.3;
    }
    if (this.boltHandle) {
      // Bolt is cycled after the magazine seats, not halfway through the reload.
      const pull = this.reloading && reloadProgress > 0.8
        ? Math.sin(clamp((reloadProgress - 0.8) / 0.18, 0, 1) * Math.PI)
        : 0;
      this.boltHandle.position.z = this.boltBaseZ - pull * 0.075 + this.boltKick * 0.022;
      this.boltHandle.position.x = 0.125 + pull * 0.008;
    }
    if (this.viewBlood) this.viewBlood.visible = this.goreLevel > 0.015;
    if (this.cellMat) {
      const low = this.ammoMag <= 4 ? 1 : 0;
      this.cellMat.emissiveIntensity = 0.34 + Math.sin(this.time * 2.2) * 0.05 + low * (0.28 + Math.sin(this.time * 12) * 0.16);
      this.cellMat.emissive.setHex(low ? 0xe24b3c : this.accentDark);
      this.cellMat.color.setHex(low ? 0xff8a72 : this.accentHex);
    }
  }

  startReload() {
    if (this.reloading || this.ammoMag >= WEAPON.mag || this.ammoReserve <= 0) return;
    this.reloading = true;
    this.reloadTotal = WEAPON.reload * this.reloadMult;
    this.reloadTimer = this.reloadTotal;
    this.reloadMatched = false;
    this.reloadMissed = false;
    this.reloadCues = 0;
    this.channel = null;
    this.channelProgress = 0;
    this.game.audio.reloadStart();
  }

  // The second press is the skill check. One attempt per reload: a press inside
  // the band snaps the magazine home, a press outside it binds the magazine and
  // adds the penalty in WEAPON.activeReload. Letting the bar finish is always
  // safe, so the mechanic rewards attention without punishing inattention.
  tryReload() {
    if (!this.reloading) {
      this.startReload();
      return;
    }
    if (this.reloadMatched || this.reloadMissed) return;
    const timing = WEAPON.activeReload;
    const progress = 1 - this.reloadTimer / this.reloadTotal;
    if (progress >= timing.start && progress <= timing.end) {
      this.reloadMatched = true;
      this.reloadTimer = Math.min(this.reloadTimer, timing.snap);
      this.game.audio.reloadMatched();
      this.game.ui.toast('MATCHED LOAD', 'MAGAZINE SEATED // FAST RELOAD', 'good', 1500);
      this.game.fx.addShake(0.012);
      return;
    }
    this.reloadMissed = true;
    this.reloadTotal += timing.penalty;
    this.reloadTimer += timing.penalty;
    this.game.audio.reloadJam();
    this.game.ui.toast('SEIZED LOAD', `MAGAZINE BOUND // +${Math.round(timing.penalty * 1000)} MS`, 'warn', 1700);
    this.game.fx.addShake(0.045);
  }

  useMedkit() {
    // A refused ability used to be silent, which is indistinguishable from a
    // broken key. Every path now says what happened and why.
    if (this.medkits <= 0) {
      this.game.ui.toast('NO MEDKITS', 'SCAVENGE THE ORGAN', 'warn', 1800);
      this.game.audio.ui(false);
      return;
    }
    if (this.hp >= this.maxHp) {
      this.game.ui.toast('NO INJURY', 'MEDKIT HELD IN RESERVE', 'info', 1500);
      return;
    }
    if (this.medkitCooldown > 0) {
      this.game.ui.toast('INJECTOR CYCLING', `${this.medkitCooldown.toFixed(1)}S`, 'info', 900);
      return;
    }
    this.medkits--;
    this.medkitCooldown = 1;
    this.medkitTimer = 0.62;
    const heal = Math.round(PLAYER.medkitHeal * this.medkitHealMult);
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.game.audio.medkit();
    this.game.ui.toast('MEDKIT APPLIED', `+${heal} SURGEON INTEGRITY`, 'good');
    this.game.ui.healFlash();
    this.game.fx.burst(this.pos.clone().setY(1.2), 0x9bffe4, 20, 3);
    this.game.fx.shockwave(new THREE.Vector3(this.pos.x, 1.1, this.pos.z), 0x8fffe0, 1.5, 0.28);
  }

  useStabilizer() {
    if (this.stabilizers <= 0) {
      this.game.ui.toast('NO STABILIZERS', 'CLEAR THE NEXT NODE', 'warn', 1800);
      this.game.audio.ui(false);
      return;
    }
    if (this.stabilizeCooldown > 0) {
      this.game.ui.toast('RESERVOIR PRESSURIZING', `${this.stabilizeCooldown.toFixed(1)}S`, 'info', 900);
      return;
    }
    if (this.game.run.host >= this.game.run.hostMax) {
      this.game.ui.toast('HOST STABLE', 'NO STABILIZATION REQUIRED', 'info');
      return;
    }
    this.stabilizers--;
    this.stabilizeCooldown = 1;
    const heal = PLAYER.stabilizeHeal * (this.game.run.stabilizeMult || 1);
    this.game.healHost(heal);
    this.game.audio.stabilize();
    this.game.ui.healFlash();
    this.game.fx.burst(this.pos.clone().setY(1.1), 0x9bffe4, 32, 3.5);
    this.game.fx.shockwave(new THREE.Vector3(this.pos.x, 0, this.pos.z), 0x8fffe0, 3.2, 0.34);
    this.game.ui.toast('STABILIZER VENTED', `HOST +${Math.round(heal)}`, 'good');
  }

  throwGrenade() {
    if (this.grenades <= 0 || this.grenadeCooldown > 0) return;
    this.grenades--;
    this.grenadeCooldown = 0.9;
    this.game.throwGrenade();
    this.game.audio.grenadeThrow();
    this.vmRecoil = Math.min(1, this.vmRecoil + 0.5);
  }

  interact(level) {
    if (this.interaction) {
      if (!this.interaction.enabled) {
        this.game.ui.toast('ACCESS DENIED', this.interaction.prompt, 'warn');
        this.game.audio.ui(false);
        return;
      }
      if (this.interaction.type === 'exit') {
        this.game.completeOrgan();
        return;
      }
      if (this.interaction.type === 'lore') {
        this.game.collectLore(this.interaction.lore.def);
        this.interaction.lore.collected = true;
        this.interaction.lore.group.visible = false;
        return;
      }
      if (this.channelProgress > 0) return;
      this.channel = this.interaction;
      this.channelTime = this.interaction.time || PLAYER.channelTime;
      this.channelProgress = 0.0001;
      this.game.audio.cautery();
      this.game.fx.addShake(0.05);
      return;
    }
    if (this.hasCautery && this.cauteryCooldown <= 0) {
      this.cauteryCooldown = PLAYER.cauteryCooldown * this.cauteryCooldownMult;
      this.game.cauteryBurst(this);
      this.game.audio.cautery();
      this.game.fx.addShake(0.12);
      this.vmRecoil = Math.min(1, this.vmRecoil + 0.4);
    }
  }

  channelTargetValid() {
    if (!this.channel) return false;
    const d = dist2(this.pos.x, this.pos.z, this.channel.x, this.channel.z);
    if (this.channel.type === 'gate') return d < 7.2 && !this.channel.gate.open;
    if (this.channel.type === 'node') return d < 4.4 && this.channel.node.active;
    if (this.channel.type === 'crisis') return d < 4.6 && !!this.channel.crisis?.active;
    return false;
  }

  cancelChannel(reason = null) {
    const was = this.channel;
    this.channel = null;
    this.channelProgress = 0;
    this.channelTime = PLAYER.channelTime;
    if (reason === 'range' && was) {
      this.game.ui.toast('PROCEDURE ABORTED', 'TARGET LEFT THE FIELD', 'warn', 1700);
      this.game.audio.ui(false);
    } else if (reason === 'released' && was) {
      this.game.ui.toast('PROCEDURE RELEASED', 'HOLD E TO COMPLETE', 'info', 1400);
    }
  }

  takeDamage(amount, game = this.game) {
    if (this.iframes > 0 || this.dead) return;
    this.hp -= amount;
    this.damageTaken += amount;
    this.cancelChannel();
    this.iframes = PLAYER.hitIFrames;
    // A hit should cost something you can feel for a beat: the boot catches,
    // the muzzle climbs, the frame kicks. Purely a presentation window; no
    // damage or score is derived from it.
    this.hitStun = PLAYER.hitStun;
    this.recoilPitch = Math.min(0.16, this.recoilPitch + 0.055 + amount * 0.0012);
    this.roll += (Math.random() - 0.5) * 0.04;
    this.game.fx.addShake(0.3);
    this.game.fx.addRoll((Math.random() - 0.5) * 0.04);
    this.game.audio.playerHurt();
    this.game.ui.damageFlash(amount);
    this.addGore(0.06);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.game.playerDown();
    }
  }

  refillForOrgan(heal = 20, ammo = 42) {
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.ammoReserve += ammo;
    this.medkits += 1;
    this.stabilizers = this.stabilizerMax;
    this.grenades = Math.min(3, this.grenades + 1);
    this.dead = false;
  }

  dispose() {
    if (this.viewLights) this.viewLights.forEach((l) => l.removeFromParent());
    else if (this.viewLight) this.viewLight.removeFromParent();
    this.muzzleSpriteMat?.dispose();
    disposeGroup(this.viewmodel);
  }
}

// ===================================================================== ENEMIES
export class Enemy {
  constructor(scene, level, def, x, z, game, seed = 1, eliteId = null) {
    this.scene = scene;
    this.level = level;
    this.def = def;
    this.game = game;
    this.rng = new RNG(seed);
    this.pos = new THREE.Vector3(x, 0, z);
    this.elite = eliteId ? ELITES.find((e) => e.id === eliteId) || null : null;
    const tier = game.run?.tier || 1;
    const hpScale = 1 + (tier - 1) * 0.13;
    this.hp = Math.round(def.hp * hpScale * (this.elite?.hp || 1));
    this.maxHp = this.hp;
    this.speedMult =
      (game.run?.mutation?.enemySpeed || 1) *
      (game.run?.enemySlowMult || 1) *
      (1 + (tier - 1) * 0.012) *
      (this.elite?.speed || 1);
    this.damageMult = (1 + (tier - 1) * 0.07) * (this.elite?.damage || 1);
    // Jockeying state: an attacker denied a commitment slot circles instead of
    // standing in the surgeon's face waiting for a turn.
    this.holdTimer = 0;
    this.holdSide = Math.random() < 0.5 ? -1 : 1;
    // Idle voice. Offset per creature so a room does not vocalise in chorus.
    this.voiceTimer = 2.5 + Math.random() * 6.5;
    this.dead = false;
    this.flash = 0;
    this.windup = 0;
    this.attackCd = this.rng.float(0.2, 1.2);
    this.fuse = 0;
    this.phase = this.rng.float(0, TAU);
    this.active = true;
    this.eliteScale = this.elite?.scale || 1;
    this.homeRoom = level.rooms.reduce((best, room) => {
      const d = dist2(x, z, room.x, room.z);
      return !best || d < best.d ? { room, d } : best;
    }, null)?.room || null;
    this.ceilingY = def.style === 'wall' ? level.ceilingAt(x, z) : 0;
    this.height = def.style === 'wall' ? Math.max(1.6, this.ceilingY - COMBAT.ceilingGap) : 0;
    this.latched = def.style === 'wall';
    this.wallArmed = false;
    this.wallHunt = 0;
    this.dropDelay = 0;
    this.dropStrike = 0;
    this.deathTimer = 0;
    this.wounded = false;
    this.woundTimer = 1.1;
    this.stagger = 0;
    this.lungeTimer = 0;
    this.lungeArc = 0;
    this.landSquash = 0;
    this.lungeDir = new THREE.Vector3();
    this.flankSide = this.rng.chance(0.5) ? 1 : -1;
    this.heading = 0;
    this.headingPrev = 0;
    this.turnLean = 0;
    this.deathRoll = 1.18;
    this.deathPitch = 0.34;
    this.hurtLean = 0;
    this.deathBlood = 0.35;
    this.group = new THREE.Group();
    this.group.position.set(x, this.height, z);
    this.batchSources = [];
    this.build();
    this.mergeEnemyGeometry();
    this.weakSpec = def.weak ? { ...def.weak } : null;
    if (def.style === 'wall' && this.weakSpec) {
      this.weakSpec.y = 0.2;
      this.weakSpec.z = 0.24;
      this.weakSpec.r = 0.31;
      this.weakSpec.label = 'UNDERBELLY';
    }
    this.addGroundShadow();
    if (this.elite) {
      const scale = this.elite.scale || 1;
      this.group.scale.setScalar(scale);
      if (this.baseMat) {
        this.baseMat.color.setHex(this.elite.tint);
        this.baseMat.emissive.setHex(this.elite.glow);
        this.baseMat.emissiveIntensity = 0.3;
      }
      this.hitRadius = (this.hitRadius || 1) * scale;
      this.hitOffsetY = (this.hitOffsetY || 1) * scale;
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.elite.glow,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.eliteRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 4, 28), ringMat);
      this.eliteRing.rotation.x = Math.PI / 2;
      this.eliteRing.position.y = 0.08;
      this.group.add(this.eliteRing);
      this.materials.push(ringMat);
    }
    scene.add(this.group);
    this.light = null;
  }

  addGroundShadow() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x100203,
      transparent: true,
      opacity: this.def.style === 'wall' ? 0.18 : 0.42,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.018;
    this.group.add(mesh);
    this.groundShadow = mesh;
    this.shadowMat = mat;

    if (this.def.style === 'wall') {
      const dropMat = new THREE.MeshBasicMaterial({
        color: this.def.glow,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 24), dropMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      ring.visible = false;
      this.group.add(ring);
      this.dropMark = ring;
      this.dropMarkMat = dropMat;
    }
  }

  build() {
    const d = this.def;
    const style = d.style;
    // Vertex colour carries the per-part albedo; the material itself stays
    // white so a single draw can contain plates, limbs and chitin.
    // The merge target carries per-part vertex colour, so its own emissive must
    // stay black. A tinted emissive here used to make every chitin plate, leg
    // and mandible glow the same green as the weak sac.
    const base = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.62,
      roughnessMap: makeWearTexture('polymer'),
      metalness: 0.02,
      clearcoat: 0.86,
      clearcoatRoughness: 0.24,
      envMapIntensity: 1.0,
      vertexColors: true,
    });
    this.baseMat = base;
    this.materials = [base];

    if (style === 'skitter' || style === 'wall') {
      // Low, wet, many-legged. No floating: the body sits in the fluid film on
      // the floor and the legs carry the silhouette.
      const wall = style === 'wall';
      // Dark chitin, wet plates and bone spines. The bright sac is the only
      // high-value read; everything else carries the animal's silhouette.
      const chitin = standard(0x4a3a2b, 0x0f0202, 0.1, 0.58, 0.04);
      const plateMat = standard(0x6b4a34, 0x1a0303, 0.16, 0.46, 0.06);
      const boneMat = standard(0xb9a487, 0x2b2116, 0.05, 0.6, 0.02);
      const legMat = standard(0x3a2a22, 0x100202, 0.12, 0.72, 0.03);
      const mandibleMat = standard(0x3b1516, 0x240304, 0.15, 0.65, 0.08);
      this.materials.push(chitin, plateMat, boneMat, legMat, mandibleMat);
      this.bodyColor = 0x5d4a36;

      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 2), chitin);
      body.position.y = 0.4;
      body.scale.set(1.02, 0.7, 1.16);
      body.rotation.x = 0.08;
      this.body = body;
      this.bodyBaseY = body.position.y;
      this.bodyBaseRotX = 0.08;
      this.bodyBaseScale = body.scale.clone();
      this.group.add(body);

      const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 9), chitin);
      abdomen.position.set(0, 0.36, -0.48);
      abdomen.scale.set(0.94, 0.68, 1.22);
      this.group.add(abdomen);

      // Overlapping carapace domes. Separate plates catch the light and make
      // the abdomen read as segmented rather than as one pale balloon.
      for (let i = 0; i < 3; i++) {
        const plate = new THREE.Mesh(
          new THREE.SphereGeometry(0.46 - i * 0.035, 12, 6, 0, TAU, 0, Math.PI * 0.54),
          plateMat
        );
        plate.position.set(0, 0.36 + i * 0.012, -0.24 - i * 0.22);
        plate.scale.set(1.0 - i * 0.05, 0.58, 1.12);
        plate.rotation.x = -0.08;
        this.group.add(plate);
      }

      // Dorsal spines break the top silhouette in every direction.
      for (let i = 0; i < 7; i++) {
        const h = 0.13 + (i % 3) * 0.055;
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.022, h, 5), boneMat);
        spine.position.set((i % 2 ? 0.03 : -0.03), 0.67 + Math.sin(i * 1.7) * 0.018, 0.36 - i * 0.19);
        spine.rotation.x = -0.72;
        spine.rotation.z = (i % 2 ? 1 : -1) * 0.12;
        this.group.add(spine);
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const spine = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.11, 4), boneMat);
          spine.position.set(side * (0.26 + i * 0.03), 0.55 - i * 0.02, 0.18 - i * 0.26);
          spine.rotation.z = side * 0.72;
          spine.rotation.x = -0.32;
          this.group.add(spine);
        }
      }

      const sacMat = new THREE.MeshPhysicalMaterial({
        color: 0xb9c47a,
        emissive: d.glow,
        emissiveIntensity: 0.4,
        roughness: 0.24,
        metalness: 0.02,
        transparent: true,
        opacity: 0.86,
        clearcoat: 0.7,
        clearcoatRoughness: 0.16,
      });
      this.sacMat = sacMat;
      this.materials.push(sacMat);
      const sac = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), sacMat);
      sac.position.set(0, 0.44, -0.2);
      sac.scale.set(0.92, 1.12, 0.92);
      this.sac = sac;
      this.weakMesh = sac;
      this.weakMat = sacMat;
      this.group.add(sac);
      // A dark foetal knot inside the translucent sac: without it the weak
      // point is a clean glowing bubble at close range.
      const nucleus = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 7, 6),
        standard(0x210604, 0x090101, 0.2, 0.5, 0.02)
      );
      nucleus.position.copy(sac.position);
      nucleus.scale.set(1, 0.8, 1.1);
      this.group.add(nucleus);
      // Dark veins crawl over the sac; bone stays around it so it reads as an
      // exposed organ, not a lamp.
      const veinMat = standard(0x3d0b0c, 0x140102, 0.3, 0.5, 0.1);
      this.materials.push(veinMat);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        const vein = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.006, 4, 12, Math.PI * 1.2), veinMat);
        vein.position.set(0, 0.44, -0.2);
        vein.rotation.set(Math.PI * 0.5, a, 0.3);
        vein.scale.set(1, 1.12, 1);
        this.group.add(vein);
      }
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.21 + i * 0.012, 0.009, 4, 10, Math.PI), boneMat);
        rib.position.set(0, 0.43, -0.2);
        rib.rotation.y = Math.PI / 2;
        rib.rotation.z = i * (Math.PI / 4) - Math.PI * 0.38;
        this.group.add(rib);
      }

      const neck = segmentMesh(
        new THREE.Vector3(0, 0.39, 0.34),
        new THREE.Vector3(0, 0.37, 0.5),
        0.075,
        0.06,
        chitin,
        7
      );
      this.group.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), chitin);
      head.position.set(0, 0.36, 0.56);
      head.scale.set(0.98, 0.82, 1.05);
      this.head = head;
      this.headBaseY = head.position.y;
      this.group.add(head);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 6), chitin);
      snout.position.set(0, 0.33, 0.68);
      snout.rotation.x = Math.PI / 2;
      snout.scale.set(1, 0.8, 0.8);
      this.group.add(snout);

      // Eyes are the fastest way to make a creature read as a cartoon. These
      // were flat lime spheres with round black pupils: bright, symmetric, and
      // unmistakably cute at range. A damp, desaturated iris with a vertical
      // slit and one enlarged pair member reads as an animal instead.
      const eyeTint = new THREE.Color(d.glow).offsetHSL(0.02, 0.1, -0.34);
      const eyeMat = new THREE.MeshBasicMaterial({ color: eyeTint });
      this.materials.push(eyeMat);
      const irisParts = [];
      const slitParts = [];
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const r = 0.026 + (i === 1 ? 0.007 : 0) + (side < 0 ? 0.0015 : 0);
          const x = side * (0.075 + i * 0.055);
          const y = 0.42 + i * 0.022;
          const z = 0.7 - i * 0.035;
          const iris = new THREE.SphereGeometry(r, 7, 5);
          iris.scale(1, 0.8, 0.55);
          iris.translate(x, y, z);
          irisParts.push(iris);
          const slit = new THREE.SphereGeometry(r * 0.5, 5, 4);
          slit.scale(0.34, 1.35, 0.3);
          slit.translate(x, y, z + r * 0.36);
          slitParts.push(slit);
        }
        // Two jointed mandible pairs, plus a long swept antenna.
        for (let k = 0; k < 2; k++) {
          const base = new THREE.Vector3(side * (0.1 + k * 0.045), 0.31 - k * 0.035, 0.66);
          const mid = new THREE.Vector3(side * (0.2 + k * 0.04), 0.2 - k * 0.03, 0.8);
          const tip = new THREE.Vector3(side * (0.12 + k * 0.03), 0.12 - k * 0.02, 0.94);
          const jaw = segmentMesh(base, mid, 0.026, 0.017, mandibleMat, 4);
          const fang = segmentMesh(mid, tip, 0.018, 0.006, mandibleMat, 4);
          this.group.add(jaw, fang);
        }
        const a0 = new THREE.Vector3(side * 0.14, 0.48, 0.62);
        const a1 = new THREE.Vector3(side * 0.3, 0.68, 0.76);
        const a2 = new THREE.Vector3(side * 0.46, 0.8, 0.96);
        this.group.add(segmentMesh(a0, a1, 0.011, 0.007, mandibleMat, 4));
        this.group.add(segmentMesh(a1, a2, 0.007, 0.003, mandibleMat, 4));
      }
      // One iris draw and one pupil draw for all six eyes.
      const irisGeo = mergeGeometries(irisParts, false);
      const slitGeo = mergeGeometries(slitParts, false);
      irisParts.forEach((g) => g.dispose());
      slitParts.forEach((g) => g.dispose());
      if (irisGeo) this.group.add(new THREE.Mesh(irisGeo, eyeMat));
      if (slitGeo) {
        const slitMat = new THREE.MeshBasicMaterial({ color: 0x070202 });
        this.materials.push(slitMat);
        this.group.add(new THREE.Mesh(slitGeo, slitMat));
      }

      this.legs = [];
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 4; i++) {
          const root = new THREE.Group();
          root.position.set(side * 0.3, 0.42, 0.38 - i * 0.25);
          const knee = new THREE.Vector3(side * 0.46, 0.34, 0.08 + (i - 1.5) * 0.035);
          const foot = new THREE.Vector3(side * 0.76, -0.4, 0.16 + (i % 2) * 0.07);
          const coxa = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), legMat);
          const upper = segmentMesh(new THREE.Vector3(0, 0, 0), knee, 0.068, 0.042, legMat, 6);
          const lower = segmentMesh(knee, foot, 0.04, 0.018, legMat, 6);
          const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), legMat);
          kneeCap.position.copy(knee);
          const kneeSpur = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.16, 4), boneMat);
          kneeSpur.position.copy(knee).add(new THREE.Vector3(0, 0.06, 0));
          kneeSpur.rotation.z = -side * 0.5;
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), boneMat);
          claw.position.copy(foot);
          claw.rotation.z = side * 2.2;
          root.add(coxa, upper, lower, kneeCap, kneeSpur, claw);
          this.group.add(root);
          this.legs.push({ root, baseY: root.position.y, phase: i * 1.35 + (side > 0 ? 0.8 : 0), side });
        }
      }

      if (wall) {
        // Ceiling claws and a wet egg cluster, so the ambusher reads as a
        // different animal before it drops.
        const clawMat = standard(0xd4b79a, 0x6d3b24, 0.2, 0.35, 0.2);
        this.materials.push(clawMat);
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.48, 5), clawMat);
          claw.position.set(side * 0.52, 0.58, -0.05);
          claw.rotation.z = side * 0.9;
          this.group.add(claw);
        }
        const eggMat = new THREE.MeshPhysicalMaterial({
          color: 0xd9e7a3,
          emissive: 0x8fa43c,
          emissiveIntensity: 0.7,
          roughness: 0.2,
          metalness: 0.02,
          transparent: true,
          opacity: 0.85,
        });
        this.materials.push(eggMat);
        for (let i = 0; i < 4; i++) {
          const egg = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eggMat);
          egg.position.set(Math.cos(i * 1.6) * 0.2, 0.6 + (i % 2) * 0.08, -0.58 + Math.sin(i * 1.6) * 0.14);
          this.group.add(egg);
        }
        const silkMat = new THREE.MeshBasicMaterial({
          color: 0xd8cbb0,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
        });
        this.materials.push(silkMat);
        this.strands = [];
        const strandSpan = Math.max(0.32, COMBAT.ceilingGap - 0.45);
        const strandGeo = new THREE.CylinderGeometry(0.012, 0.024, 1, 4);
        for (let i = 0; i < 3; i++) {
          const strand = new THREE.Mesh(strandGeo, silkMat);
          strand.position.set((i - 1) * 0.13, 0.58 + strandSpan * 0.5, -0.12 + i * 0.12);
          strand.scale.y = strandSpan;
          this.group.add(strand);
          this.strands.push(strand);
        }
        this.silkStrandGeo = strandGeo;

        // The parachuting underside is the visible weak point from the floor.
        const bellyMat = new THREE.MeshPhysicalMaterial({
          color: 0xffc18a,
          emissive: d.glow,
          emissiveIntensity: 1.35,
          roughness: 0.2,
          metalness: 0.02,
          transparent: true,
          opacity: 0.88,
        });
        this.materials.push(bellyMat);
        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bellyMat);
        belly.position.set(0, 0.2, 0.24);
        belly.scale.set(1, 0.72, 1.2);
        this.group.add(belly);
        this.weakMat = bellyMat;
      }

      this.hitOffsetY = 0.5;
      this.hitRadius = 0.9;
    } else if (style === 'ground') {
      // A wet carapace, not a matte ball. Clearcoat catches the theatre light
      // along each facet so a crawler reads as shell at close range.
      const hideMat = new THREE.MeshPhysicalMaterial({
        color: 0x67382c,
        emissive: 0x160303,
        emissiveIntensity: 0.14,
        roughness: 0.5,
        metalness: 0.03,
        clearcoat: 0.4,
        clearcoatRoughness: 0.26,
        envMapIntensity: 0.55,
      });
      this.materials.push(hideMat);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), hideMat);
      body.position.y = 0.58;
      body.scale.set(1.25, 0.76, 1.6);
      this.body = body;
      this.bodyBaseY = body.position.y;
      this.bodyBaseRotX = 0;
      this.bodyBaseScale = body.scale.clone();
      this.group.add(body);

      const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), hideMat);
      abdomen.position.set(0, 0.54, -0.68);
      abdomen.scale.set(1.1, 0.85, 1.2);
      this.group.add(abdomen);

      // The head has to clear the body's front surface (z ≈ 0.96) or the whole
      // animal collapses into one faceless pod with a dot on it.
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), hideMat);
      head.position.set(0, 0.62, 1.06);
      head.scale.set(1.06, 0.84, 1);
      this.head = head;
      this.headBaseY = head.position.y;
      this.group.add(head);
      // Plated brow and a wet maw: the leaper needs a face, not a smooth ball.
      const browMat = standard(0x6d4a38, 0x1d0404, 0.12, 0.6, 0.04);
      this.materials.push(browMat);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7, 0, TAU, 0, Math.PI * 0.55), browMat);
        plate.position.set(side * 0.17, 0.72, 1.12);
        plate.scale.set(1.1, 0.75, 1.1);
        plate.rotation.set(-0.1, 0, side * 0.25);
        this.group.add(plate);
      }
      const maw = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 9, 7),
        standard(0x160204, 0x000000, 0, 0.5, 0.02)
      );
      maw.position.set(0, 0.46, 1.36);
      maw.scale.set(1.25, 0.85, 0.5);
      this.group.add(maw);

      // Same principle on the brute: a deep, wet iris and slit pupils instead
      // of pale glowing discs.
      const eyeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(d.glow).offsetHSL(0.01, 0.06, -0.3),
      });
      this.materials.push(eyeMat);
      this.weakMat = eyeMat;
      // One iris draw and one pupil draw for the whole cluster. Six separate
      // glowing spheres read as a row of teeth at close range; pupils give the
      // cluster a direction and keep the weak point legible as eyes.
      const irisParts = [];
      const pupilParts = [];
      const addEye = (x, y, z, r) => {
        const iris = new THREE.SphereGeometry(r, 7, 6);
        iris.translate(x, y, z);
        irisParts.push(iris);
        const pupil = new THREE.SphereGeometry(r * 0.46, 6, 5);
        pupil.scale(0.32, 1.3, 0.4);
        pupil.translate(x, y, z + r * 0.72);
        pupilParts.push(pupil);
      };
      for (const side of [-1, 1]) {
        addEye(side * 0.15, 0.7, 1.33, 0.072);
        addEye(side * 0.27, 0.63, 1.24, 0.048);
        addEye(side * 0.07, 0.78, 1.3, 0.036);
      }
      const irisGeo = mergeGeometries(irisParts, false);
      const pupilGeo = mergeGeometries(pupilParts, false);
      irisParts.forEach((g) => g.dispose());
      pupilParts.forEach((g) => g.dispose());
      if (irisGeo && pupilGeo) {
        this.group.add(new THREE.Mesh(irisGeo, eyeMat));
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x090202 });
        this.materials.push(pupilMat);
        this.group.add(new THREE.Mesh(pupilGeo, pupilMat));
        this.disposables?.push?.(irisGeo, pupilGeo);
      } else {
        if (irisGeo) this.group.add(new THREE.Mesh(irisGeo, eyeMat));
        if (pupilGeo) this.group.add(new THREE.Mesh(pupilGeo, new THREE.MeshBasicMaterial({ color: 0x090202 })));
      }

      const mandibleMat = standard(0x3b1516, 0x240304, 0.15, 0.65, 0.08);
      this.materials.push(mandibleMat);
      for (const side of [-1, 1]) {
        const mandible = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.4, 4), mandibleMat);
        mandible.position.set(side * 0.22, 0.52, 1.4);
        mandible.rotation.x = Math.PI / 2;
        mandible.rotation.z = side * 0.25;
        this.group.add(mandible);
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.5, 4), mandibleMat);
        antenna.position.set(side * 0.27, 0.76, 1.02);
        antenna.rotation.x = 0.8;
        antenna.rotation.z = side * 0.4;
        this.group.add(antenna);
      }

      const spineMat = standard(0x5b2b26, 0x210405, 0.12, 0.6, 0.05);
      this.materials.push(spineMat);
      for (let i = 0; i < 4; i++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), spineMat);
        spine.position.set(0, 0.84 - i * 0.02, -0.1 - i * 0.24);
        spine.rotation.x = Math.PI / 2;
        this.group.add(spine);
      }

      const legMat = standard(0x613229, 0x1c0304, 0.16, 0.72, 0.03);
      this.materials.push(legMat);
      this.legs = [];
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 4; i++) {
          const root = new THREE.Group();
          root.position.set(side * 0.4, 0.56, 0.48 - i * 0.34);
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.62, 5), legMat);
          upper.position.set(side * 0.25, 0, 0);
          upper.rotation.z = side * 0.9;
          const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.66, 5), legMat);
          lower.position.set(side * 0.56, -0.28, 0);
          lower.rotation.z = side * 0.5;
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.13, 4), legMat);
          claw.position.set(side * 0.82, -0.51, 0);
          claw.rotation.z = side * 2.15;
          const knee = new THREE.Mesh(new THREE.SphereGeometry(0.044, 5, 4), legMat);
          knee.position.set(side * 0.52, -0.26, 0);
          root.add(upper, lower, claw, knee);
          this.group.add(root);
          this.legs.push({ root, baseY: root.position.y, phase: i * 1.3 + (side > 0 ? 0.65 : 0), side });
        }
      }
      this.hitOffsetY = 0.7;
      this.hitRadius = 0.95;
    } else if (style === 'anchored') {
      // A clot that calcified around an eye. The old model was a red sphere on
      // a pale stalk; this one has a mass, a rim of bone spurs, a hooded socket
      // and four tapping tendrils, so it reads as an animal at 30 metres.
      // Tint the clot from the enemy's own palette so the red turret and the
      // green spitter are not the same animal. The body also carries enough
      // albedo to hold a silhouette at range; at 30 m only the eye used to
      // read, which made every anchored enemy look like a floating ember.
      const baseColor = new THREE.Color(d.color || 0x9e3b3b);
      const clotMat = standard(baseColor.clone().multiplyScalar(0.42).getHex(), 0x1c0505, 0.14, 0.7, 0.02);
      const boneMat = standard(0xa89174, 0x241a10, 0.05, 0.62, 0.01);
      const rimMat = standard(baseColor.clone().multiplyScalar(0.62).getHex(), 0x220404, 0.18, 0.55, 0.03);
      this.materials.push(clotMat, boneMat, rimMat);
      const mound = new THREE.Group();
      for (const [x, z, s, ry] of [[0, 0, 1, 0], [0.42, 0.2, 0.6, 1.1], [-0.38, 0.15, 0.55, 2.3], [0.1, -0.35, 0.5, 0.4]]) {
        const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 1), clotMat);
        lump.position.set(x * 1.1, 0.12 + s * 0.1, z * 1.1);
        lump.scale.set(s, 0.55 + s * 0.2, s);
        lump.rotation.y = ry;
        mound.add(lump);
      }
      this.group.add(mound);
      // Bone spurs around the base, angled outward like a crown.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.3;
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 5), boneMat);
        spur.position.set(Math.cos(a) * 0.66, 0.22, Math.sin(a) * 0.66);
        spur.rotation.z = Math.cos(a) * 0.55;
        spur.rotation.x = Math.sin(a) * 0.55;
        this.group.add(spur);
      }
      // A twisted vein instead of a straight pipe.
      const veinCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.24, 0),
        new THREE.Vector3(0.09, 0.62, 0.02),
        new THREE.Vector3(-0.06, 0.98, -0.02),
        new THREE.Vector3(0, 1.24, 0),
      ]);
      const stalk = new THREE.Mesh(new THREE.TubeGeometry(veinCurve, 18, 0.13, 8, false), rimMat);
      this.group.add(stalk);
      // Calcified hood over a wet socket.
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), boneMat);
      head.position.y = 1.4;
      head.scale.set(1.08, 0.96, 1.02);
      this.body = head;
      this.group.add(head);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8, 0, TAU, 0, Math.PI * 0.62), boneMat);
      hood.position.set(0, 1.46, -0.03);
      hood.scale.set(1.04, 0.92, 1.04);
      this.group.add(hood);
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 8),
        standard(0x120203, 0x000000, 0, 0.4, 0.02)
      );
      socket.position.set(0, 1.4, 0.31);
      socket.scale.set(1, 0.9, 0.7);
      this.group.add(socket);
      const eyeMat = new THREE.MeshPhysicalMaterial({
        color: 0xb64a3d,
        emissive: d.glow,
        emissiveIntensity: 0.42,
        roughness: 0.12,
        metalness: 0.05,
        clearcoat: 0.9,
        clearcoatRoughness: 0.05,
      });
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), eyeMat);
      eye.position.set(0.02, 1.41, 0.36);
      eye.scale.set(1, 0.92, 0.82);
      this.group.add(eye);
      const pupilMat = new THREE.MeshBasicMaterial({ color: d.glow });
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), pupilMat);
      pupil.position.set(0.02, 1.41, 0.47);
      this.group.add(pupil);
      this.materials.push(eyeMat, pupilMat);
      this.weakMat = eyeMat;
      // Four jointed tendrils tapping the floor.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.6;
        const sx = Math.cos(a) * 0.5;
        const sz = Math.sin(a) * 0.5;
        const kx = Math.cos(a) * 0.78;
        const kz = Math.sin(a) * 0.78;
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.42, 5), rimMat);
        up.position.set(sx * 0.7, 0.42, sz * 0.7);
        up.rotation.z = -Math.cos(a) * 0.75;
        up.rotation.x = Math.sin(a) * 0.75;
        const down = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.42, 5), boneMat);
        down.position.set(kx * 0.82, 0.16, kz * 0.82);
        down.rotation.z = Math.cos(a) * 0.55;
        down.rotation.x = -Math.sin(a) * 0.55;
        this.group.add(up, down);
      }
      this.hitOffsetY = 1.3;
      this.hitRadius = 0.9;
    } else {
      const bruteHide = standard(0x5b2f28, 0x170303, 0.18, 0.6, 0.04);
      this.materials.push(bruteHide);
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), bruteHide);
      body.position.y = 1.4;
      body.scale.set(1.2, 1.1, 1.05);
      this.body = body;
      this.bodyBaseY = body.position.y;
      this.bodyBaseRotX = 0;
      this.bodyBaseScale = body.scale.clone();
      this.group.add(body);

      const plateMat = standard(0xd0a06a, 0x5b2b11, 0.25, 0.4, 0.2);
      this.materials.push(plateMat);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const plate = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), plateMat);
        plate.position.set(Math.cos(a) * 0.95, 1.5 + Math.sin(a) * 0.5, Math.sin(a) * 0.65);
        plate.scale.set(1.2, 0.6, 1);
        this.group.add(plate);
      }

      const coreMat = new THREE.MeshBasicMaterial({ color: d.glow });
      this.materials.push(coreMat);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), coreMat);
      core.position.set(0, 1.5, 1.05);
      this.weakMat = coreMat;
      this.group.add(core);

      const armMat = standard(0x6d2a2a, 0x2a0606, 0.2, 0.7, 0);
      this.materials.push(armMat);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 1.7, 5), armMat);
        arm.position.set(side * 1.2, 1.0, 0);
        arm.rotation.z = side * 0.4;
        arm.rotation.x = side * 0.18;
        this.group.add(arm);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 5), armMat);
        claw.position.set(side * 1.48, 0.18, 0.34);
        claw.rotation.z = side * 1.9;
        claw.rotation.x = 1.2;
        this.group.add(claw);
      }
      this.hitOffsetY = 1.45;
      this.hitRadius = 1.45;
    }
    this.addWetAnatomy(style);
    this.addWound();
    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
  }

  // A real wound appears once the creature is badly hurt: a dark cavity, torn
  // flaps and two pale rib ends, attached to the animated body. It is one extra
  // draw only for wounded enemies, and it is the clearest possible "this thing
  // is dying" read in a dark corridor.
  addWound() {
    if (!this.body) return;
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.02,
      clearcoat: 0.75,
      clearcoatRoughness: 0.22,
    });
    this.materials.push(material);
    const bits = [];
    const push = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.scale.set(sx, sy, sz);
      bits.push(m);
      return m;
    };
    // Body-local coordinates. The cavity sits just proud of the flank so it is
    // visible from the side the surgeon usually shoots.
    push(new THREE.SphereGeometry(0.24, 9, 7), 0x260306, -0.5, 0.04, 0.14, 0, 0, 0, 0.5, 1.05, 1.25);
    push(new THREE.TorusGeometry(0.27, 0.055, 5, 12), 0x7c151b, -0.5, 0.04, 0.14, 0, Math.PI / 2, 0, 0.7, 1, 1.18);
    for (let i = 0; i < 3; i++) {
      push(
        new THREE.TorusGeometry(0.2 - i * 0.035, 0.014, 4, 8, Math.PI * 0.9),
        0xcdb89a,
        -0.56,
        0.04,
        0.14,
        0,
        Math.PI / 2,
        i * 0.7,
        0.45,
        1,
        1.05
      );
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      push(
        new THREE.ConeGeometry(0.07, 0.23, 4),
        0x5e0b11,
        -0.57,
        Math.cos(a) * 0.27,
        0.14 + Math.sin(a) * 0.27,
        0,
        0,
        Math.PI / 2 + Math.sin(a) * 0.5
      );
    }
    // The temporary materials only exist to colour the merged geometry.
    for (const m of bits) m.material.dispose();
    const merged = mergeColoredMeshes(bits, material);
    for (const m of bits) m.geometry.dispose();
    if (!merged) return;
    merged.name = 'enemy-wound';
    merged.visible = false;
    this.woundMesh = merged;
    this.body.add(merged);
  }

  // Exposed sinew, ribs and mouth anatomy. These meshes are merged into the
  // existing vertex-coloured body batch, so the wet detail costs triangles, not
  // draw calls.
  addWetAnatomy(style) {
    if (!this.body || style === 'anchored') return;
    const sinew = standard(0x8a1d21, 0x220304, 0.16, 0.48, 0.02);
    const bone = standard(0xc7b69c, 0x3a2f22, 0.04, 0.62, 0.03);
    const organ = standard(0x5f1018, 0x260306, 0.18, 0.36, 0.02);
    this.materials.push(sinew, bone, organ);
    const center = this.body.position;
    const rx = style === 'brute' ? 1.28 : style === 'ground' ? 0.8 : 0.66;
    const ry = style === 'brute' ? 0.92 : style === 'ground' ? 0.5 : 0.36;
    const rz = style === 'brute' ? 1.25 : style === 'ground' ? 1.18 : 0.92;
    const veinCount = style === 'brute' ? 8 : 6;
    for (let i = 0; i < veinCount; i++) {
      const pts = [];
      const phase = i * 1.37 + 0.4;
      for (let k = 0; k < 6; k++) {
        const t = -0.92 + (k / 5) * 1.84;
        const a = phase + t * 1.3;
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * rx * (0.9 + Math.sin(t * 5 + i) * 0.035),
            center.y + Math.sin(a * 1.17 + i) * ry * 0.72 + Math.sin(t * Math.PI) * 0.045,
            t * rz
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const vein = new THREE.Mesh(new THREE.TubeGeometry(curve, 7, 0.012 + (i % 3) * 0.004, 4, false), sinew);
      this.group.add(vein);
    }
    if (style === 'ground' || style === 'brute') {
      const count = style === 'brute' ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(style === 'brute' ? 1.0 : 0.54, 0.022, 4, 12, Math.PI), bone);
        rib.position.set(0, center.y - (style === 'brute' ? 0.48 : 0.16), -0.52 + i * 0.32);
        rib.scale.set(1.25, 1.0, 1);
        rib.rotation.z = Math.PI * 0.02;
        this.group.add(rib);
      }
    }
    if (style === 'skitter') {
      for (let i = 0; i < 3; i++) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), organ);
        lobe.position.set((i - 1) * 0.22, 0.27, -0.54 + i * 0.07);
        lobe.scale.set(1, 0.65, 1.2);
        this.group.add(lobe);
      }
    }
    const mouthZ = style === 'ground' ? 0.92 : style === 'brute' ? 1.08 : 0.78;
    const mouthY = style === 'ground' ? 0.55 : style === 'brute' ? 1.35 : 0.33;
    const spread = style === 'brute' ? 0.48 : 0.22;
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.16, 4), bone);
      tooth.position.set(-spread + (i / 3) * spread * 2, mouthY, mouthZ);
      tooth.rotation.x = Math.PI / 2;
      tooth.rotation.z = (i - 1.5) * 0.16;
      this.group.add(tooth);
    }
  }

  // ------------------------------------------------------------- draw batching
  // Each creature arrived with ~30 meshes (eight two-segment legs included).
  // At 30 creatures that is nearly 1,000 draws before the level is even drawn.
  // Bake all rigid anatomy into two vertex-coloured meshes and instance the
  // legs, keeping the animated body, sac and weak point separate.
  mergeEnemyGeometry() {
    if (!this.group || !this.baseMat) return;
    const base = this.baseMat;
    const keep = new Set();
    const addKeep = (obj) => { if (obj) keep.add(obj); };
    addKeep(this.body);
    addKeep(this.head);
    addKeep(this.sac);
    addKeep(this.weakMesh);
    for (const leg of this.legs || []) addKeep(leg.root);

    const underKept = (obj) => {
      let p = obj;
      while (p && p !== this.group) {
        if (keep.has(p)) return true;
        p = p.parent;
      }
      return false;
    };

    // Legs: merge upper+lower into one geometry per side and instance four
    // copies. Animation still drives the empty root groups.
    if (this.legs?.length) {
      this.buildInstancedLegs();
    }

    // Rigid painted anatomy: one vertex-coloured draw for everything opaque.
    const opaque = [];
    const byMaterial = new Map();
    this.group.traverse((obj) => {
      if (!obj.isMesh || obj.isInstancedMesh) return;
      if (obj === this.body || obj === this.sac || obj === this.weakMesh) return;
      if (underKept(obj)) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat) return;
      if (!mat.transparent && !mat.isMeshBasicMaterial) {
        opaque.push(obj);
        return;
      }
      let list = byMaterial.get(mat);
      if (!list) {
        list = [];
        byMaterial.set(mat, list);
      }
      list.push(obj);
    });

    if (opaque.length > 1) {
      const colored = mergeColoredMeshes(opaque, base);
      if (colored) {
        colored.name = 'enemy-rigid';
        colored.matrixAutoUpdate = false;
        this.group.add(colored);
        for (const mesh of opaque) {
          this.batchSources.push(mesh.geometry);
          mesh.removeFromParent();
        }
      }
    }

    // Emissive, basic and transparent anatomy stays visually distinct but is
    // collapsed to one draw per material (eyes, eggs, silk, weak sacs).
    for (const [mat, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const merged = mergeMeshGeometry(meshes, mat.color || 0xffffff, mat);
      if (!merged) continue;
      for (const mesh of meshes) {
        this.batchSources.push(mesh.geometry);
        if (this.strands?.includes(mesh)) {
          const i = this.strands.indexOf(mesh);
          this.strands[i] = merged;
        }
        mesh.removeFromParent();
      }
      this.group.add(merged);
    }

    const skin = this.bodyColor || this.def.color;
    if (this.body) mottleGeometry(this.body.geometry, skin);
    if (this.head) mottleGeometry(this.head.geometry, skin);
    this.legInstances?.forEach((inst) => inst.updateMatrix?.());
    this.updateLegInstances();
    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    // The source meshes are gone; their geometry is dead weight. Free it now
    // rather than carrying forty unused buffers per creature until death.
    for (const geo of this.batchSources) geo.dispose?.();
    this.batchSources.length = 0;
  }

  buildInstancedLegs() {
    const bySide = new Map();
    for (const leg of this.legs) {
      if (!leg.root) continue;
      const list = bySide.get(leg.side) || [];
      list.push(leg);
      bySide.set(leg.side, list);
    }
    this.legInstances = [];
    for (const [side, legs] of bySide) {
      let sharedGeo = null;
      for (let i = 0; i < legs.length; i++) {
        const root = legs[i].root;
        const geos = [];
        for (const child of [...root.children]) {
          if (!child.isMesh) continue;
          child.updateMatrix();
          let geo = child.geometry.clone();
          for (const name of Object.keys(geo.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
          }
          if (geo.index) {
            const flat = geo.toNonIndexed();
            geo.dispose();
            geo = flat;
          }
          geo.applyMatrix4(child.matrix);
          paintGeometry(geo, child.material?.color || 0xffffff);
          geos.push(geo);
          this.batchSources.push(child.geometry);
          child.removeFromParent();
        }
        const merged = geos.length ? mergeGeometries(geos, false) : null;
        geos.forEach((g) => g.dispose());
        if (!merged) continue;
        merged.computeBoundingSphere();
        if (!sharedGeo) sharedGeo = merged;
        else merged.dispose();
        legs[i].instanceIndex = i;
        root.visible = false;
      }
      if (!sharedGeo) continue;
      const inst = new THREE.InstancedMesh(sharedGeo, this.baseMat, legs.length);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.frustumCulled = false;
      inst.matrixAutoUpdate = false;
      inst.name = 'enemy-legs';
      this.group.add(inst);
      this.legInstances.push(inst);
      this.legInstanceSets = this.legInstanceSets || [];
      this.legInstanceSets.push({ side, legs, inst });
    }
  }

  updateLegInstances() {
    if (!this.legInstanceSets) return;
    const m = LEG_MATRIX;
    for (const set of this.legInstanceSets) {
      for (let i = 0; i < set.legs.length; i++) {
        const leg = set.legs[i];
        leg.root.updateMatrix();
        m.copy(leg.root.matrix);
        set.inst.setMatrixAt(i, m);
      }
      set.inst.instanceMatrix.needsUpdate = true;
    }
  }

  hitSphere() {
    return {
      center: new THREE.Vector3(this.pos.x, this.pos.y + this.height + this.lungeArc + this.hitOffsetY, this.pos.z),
      radius: this.hitRadius,
    };
  }

  weakSphere() {
    const w = this.weakSpec;
    if (!w) return null;
    this.group.updateWorldMatrix(true, false);
    const center = new THREE.Vector3(0, w.y, w.z).applyMatrix4(this.group.matrixWorld);
    return { center, radius: w.r * this.eliteScale, label: w.label, mult: w.mult };
  }

  updateDeath(dt) {
    if (this.deathTimer <= 0) return;
    this.deathTimer -= dt;
    this.phase += dt;
    const t = clamp(1 - this.deathTimer / COMBAT.corpseTime, 0, 1);
    // Three stages instead of one cross-fade: the hit throws the body, the
    // frame holds a spasm, then the mass gives out. Every stage is driven by
    // the same t so corpse cleanup timing does not change.
    const thrown = clamp(t / 0.16, 0, 1);
    const convulse = Math.max(0, 1 - t * 2.4);
    const curl = clamp((t - 0.1) * 2.4, 0, 1);
    const style = this.def?.style || 'ground';
    const slide = (this.deathSlide ?? 0.55) * (1 - (1 - thrown) * (1 - thrown));
    if (this.deathDir) {
      this.group.position.x = this.pos.x + this.deathDir.x * slide;
      this.group.position.z = this.pos.z + this.deathDir.z * slide;
    }
    // A heavy chassis drops before it rolls; a skitter keeps its feet for a
    // beat and then folds. The whole group still settles at the same height.
    const dropRate = style === 'heavy' ? 6.2 : style === 'skitter' ? 9.5 : 8;
    const restY = style === 'wall' || style === 'anchored' ? 0.05 : 0.12;
    this.group.position.y = damp(this.group.position.y, restY, dropRate, dt);
    this.group.rotation.z = damp(this.group.rotation.z, this.deathRoll, 7, dt);
    this.group.rotation.x = damp(this.group.rotation.x, this.deathPitch, 7, dt);
    if (style === 'wall' || style === 'anchored') {
      // Torn off the surface: a slow half-turn on the way down.
      this.group.rotation.y += dt * 1.15 * Math.max(0, 1 - t * 1.4);
    }
    // Two late spasms after the main convulsion has passed. A body that goes
    // completely still at 0.3 s reads as a switched-off prop.
    const twitch =
      (t > 0.5 && t < 0.56 ? Math.sin((t - 0.5) * 104) * 0.5 : 0) +
      (t > 0.66 && t < 0.7 ? Math.sin((t - 0.66) * 128) * 0.32 : 0);
    this.group.scale.set(
      this.eliteScale * (1 + t * 0.12 + convulse * 0.02),
      this.eliteScale * Math.max(style === 'heavy' ? 0.42 : 0.34, 1 - t * (style === 'heavy' ? 0.55 : 0.66)),
      this.eliteScale * (1 + t * 0.08)
    );
    if (curl < 0.995 || convulse > 0.02 || twitch !== 0) {
      this.animateLegs(dt, 0.55 + 1.65 * convulse + Math.abs(twitch) * 1.4, curl);
    }
    if (this.body && twitch !== 0) {
      this.body.rotation.z += twitch * 0.09;
      this.body.rotation.x += twitch * 0.05;
    }
    if (this.body) {
      this.body.rotation.z = Math.sin(this.phase * 24) * 0.18 * convulse + curl * 0.12;
      this.body.rotation.x = Math.sin(this.phase * 19) * 0.1 * convulse + curl * 0.24;
      if (this.bodyBaseScale) {
        const deflate = 1 - curl * 0.32;
        this.body.scale.set(
          this.bodyBaseScale.x * (1 + curl * 0.16),
          this.bodyBaseScale.y * deflate,
          this.bodyBaseScale.z * (1 + curl * 0.1)
        );
      }
    }
    if (this.sac) this.sac.scale.y = (1 - curl * 0.5) * (1.2 + Math.sin(this.phase * 21) * 0.18 * convulse);
    // The body keeps emptying onto the floor for the first few seconds.
    this.deathBlood -= dt;
    if (this.deathBlood <= 0 && t < 0.7) {
      this.deathBlood = 0.34 + Math.random() * 0.5;
      this.game.fx.splat(
        new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 0.7, 0, this.pos.z + (Math.random() - 0.5) * 0.7),
        0.55 + Math.random() * 0.55,
        0x4a060b
      );
      this.game.fx.blood(
        new THREE.Vector3(this.pos.x, this.hitOffsetY * 0.5, this.pos.z),
        new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4),
        3
      );
    }
    if (this.shadowMat) {
      this.shadowMat.opacity = Math.max(0, 0.36 * (1 - t * 0.5));
      if (this.groundShadow) this.groundShadow.position.y = 0.018 - this.group.position.y;
    }
    for (const m of this.materials) {
      if (m.emissive) m.emissiveIntensity *= Math.max(0.1, 1 - dt * 2.5);
    }
  }

  // A real arthropod gait is not a row of metronomes. Each leg swings forward on
  // its own phase, lifts while it swings, and plants at a different angle. The
  // animation runs on the empty root groups; the merged instanced geometry
  // inherits it, so all eight legs still cost two draw calls.
  animateLegs(dt, intensity = 1, curl = 0) {
    if (!this.legs) return;
    const rate = 8.4 + intensity * 6.2;
    for (const leg of this.legs) {
      if (!leg.root) continue;
      const swing = Math.sin(this.phase * rate + leg.phase);
      const lift = Math.max(0, Math.cos(this.phase * rate + leg.phase));
      const planted = Math.max(0, -swing);
      const fold = curl * (0.55 + (leg.phase % 1) * 0.25);
      leg.root.rotation.x = swing * 0.34 * intensity * (1 - curl);
      leg.root.rotation.y =
        leg.side * (0.16 * intensity + fold * 0.9) * (1 - curl * 0.3) +
        swing * 0.2 * intensity * (1 - curl);
      leg.root.rotation.z =
        leg.side * (0.025 + fold * 0.6) +
        Math.sin(this.phase * rate * 0.7 + leg.phase) * 0.05 * intensity * (1 - curl);
      leg.root.position.y =
        leg.baseY + (intensity > 0.35 ? lift * 0.052 * intensity : 0) + curl * 0.11 - planted * 0.01 * intensity;
    }
    this.updateLegInstances();
  }

  // The head is kept out of the merged body so it can hunt independently: a
  // slow sway while it walks, a fast twitch when it has a target, and a tilt
  // back before it rears. Rigid models read as toys; this is what sells an
  // animal looking at you.
  animateHead(dt, alert = 0) {
    if (!this.head) return;
    const base = this.headBaseY ?? this.head.position.y;
    this.head.position.y = base + Math.sin(this.phase * 11.4) * 0.018;
    this.head.rotation.y = damp(
      this.head.rotation.y,
      Math.sin(this.phase * 2.4) * 0.11 + Math.sin(this.phase * 9.7) * 0.025 + alert * 0.09,
      6,
      dt
    );
    this.head.rotation.z = damp(
      this.head.rotation.z,
      Math.sin(this.phase * 17.3) * 0.03 + this.hurtLean * 0.45,
      8,
      dt
    );
    this.head.rotation.x = damp(this.head.rotation.x, this.windup > 0 ? -0.16 : 0, 7, dt);
  }

  update(dt, player, game) {
    if (this.dead) return;
    this.phase += dt;
    this.holdTimer = Math.max(0, this.holdTimer - dt);
    // Something is always moving in a living body. A room that only makes noise
    // when it attacks reads as a diorama; these are quiet, occasional and
    // distance-gated so a distant nest cannot spend node time on the mix.
    this.voiceTimer -= dt;
    if (this.voiceTimer <= 0) {
      this.voiceTimer = 6 + Math.random() * 8;
      const dx = this.pos.x - player.pos.x;
      const dz = this.pos.z - player.pos.z;
      if (dx * dx + dz * dz < 196 && Math.random() < 0.65) {
        const style = this.def.style || 'ground';
        game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.enemyVoice(style));
      }
    }
    this.flash = Math.max(0, this.flash - dt);
    this.hurtLean = damp(this.hurtLean, 0, 7, dt);
    this.landSquash = damp(this.landSquash, 0, 9, dt);
    if (this.baseMat) this.baseMat.emissiveIntensity = this.flash > 0 ? 2.4 : this.wounded ? 0.2 : 0.16;
    if (this.woundMesh) this.woundMesh.visible = this.wounded;
    if (this.wounded) {
      this.woundTimer -= dt;
      if (this.woundTimer <= 0) {
        this.woundTimer = 1.2 + Math.random() * 0.9;
        game.fx.splat(new THREE.Vector3(this.pos.x, 0, this.pos.z), 0.65 + Math.random() * 0.45, 0x4a070b);
        game.fx.blood(
          new THREE.Vector3(this.pos.x, this.hitOffsetY * 0.55 + this.height, this.pos.z),
          new THREE.Vector3(0, 0.15, 0),
          4
        );
      }
    }
    if (this.eliteRing) {
      this.eliteRing.rotation.z += dt * 1.3;
      this.eliteRing.material.opacity = 0.38 + Math.sin(this.phase * 3.2) * 0.16;
    }
    const def = this.def;
    const d = dist2(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const len = Math.max(d, 0.0001);
    const ux = dx / len;
    const uz = dz / len;
    this.headingPrev = this.heading;
    this.heading = Math.atan2(dx, dz);
    this.group.rotation.y = this.heading;
    // Lean into the turn instead of pivoting like a turret.
    let turnDelta = this.heading - this.headingPrev;
    turnDelta = Math.atan2(Math.sin(turnDelta), Math.cos(turnDelta));
    this.turnLean = damp(this.turnLean, clamp(turnDelta / Math.max(dt, 0.001), -2.4, 2.4), 9, dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    const wasWinding = this.windup > 0;
    if (wasWinding) this.windup = Math.max(0, this.windup - dt);

    // Ceiling ambusher: it is anchored to the real shell, wakes when you come
    // underneath it, scuttles across the ceiling, then drops. Standing still is
    // what lets it line up; moving breaks the drop.
    if (def.style === 'wall' && this.latched) {
      if (this.groundShadow) this.groundShadow.visible = false;
      this.ceilingY = this.level.ceilingAt(this.pos.x, this.pos.z);
      this.height = this.ceilingY - COMBAT.ceilingGap + Math.sin(this.phase * 2.1) * 0.055;
      if (this.dropMark) {
        this.dropMark.visible = true;
        this.dropMark.position.y = 0.035 - this.height;
        const warn = this.wallArmed ? 0.34 + Math.sin(this.phase * 22) * 0.12 : 0.08;
        this.dropMarkMat.opacity = warn;
        this.dropMark.scale.setScalar(this.wallArmed ? 1.4 : 0.8);
      }
      const home = this.homeRoom;
      const inHome = !home || this.level.currentRoom === home.id;
      if (inHome && d < (def.aggro || 18) && !this.wallArmed) {
        this.wallArmed = true;
        this.dropDelay = def.dropDelay || 0.52;
        this.wallHunt = 0;          game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.wallCrawl());
        game.fx.addShake(0.025);
      }
      if (this.wallArmed) {
        const crawl = Math.max(0, 1 - this.dropDelay / Math.max(0.01, def.dropDelay || 0.52));
        const jitter = this.dropDelay > 0 ? Math.sin(this.phase * 32) * 0.07 : 0;
        this.group.position.set(this.pos.x + jitter, this.height, this.pos.z - jitter);
        this.group.rotation.z = Math.sin(this.phase * 18) * 0.05 * (1 - crawl);
        this.group.scale.set(
          this.eliteScale * (1 + Math.sin(this.phase * 20) * 0.02),
          this.eliteScale * (1 - Math.sin(this.phase * 20) * 0.015),
          this.eliteScale
        );
        this.animateLegs(dt, 1.9);
        if (this.dropDelay > 0) {
          this.dropDelay -= dt;
          return;
        }
        this.wallHunt += dt;
        const step = COMBAT.ceilingHuntSpeed * Math.min(1.5, 0.65 + crawl * 0.7) * dt;
        if (home) {
          const nx = this.pos.x + ux * step;
          const nz = this.pos.z + uz * step;
          if (dist2(nx, nz, home.x, home.z) <= home.r * 0.92) {
            this.pos.x = nx;
            this.pos.z = nz;
          }
        } else {
          this.pos.x += ux * step;
          this.pos.z += uz * step;
        }
        this.level.constrain(this.pos, def.radius * 0.9);
        if (this.weakMat && this.weakMat.emissive) {
          this.weakMat.emissiveIntensity = 1.5 + Math.sin(this.phase * 18) * 0.8;
        }
        if (d < COMBAT.ceilingDropRadius || this.wallHunt > COMBAT.ceilingHuntTime) {
          this.latched = false;
          this.dropStrike = 0.2;
          if (this.strands) this.strands.forEach((s) => (s.visible = false));
          if (this.dropMark) this.dropMark.visible = false;
          game.fx.burst(new THREE.Vector3(this.pos.x, this.height, this.pos.z), def.glow, 22, 5);
          game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.wallDrop());
          game.fx.addShake(0.09);
        }
      } else {
        this.animateLegs(dt, 0.3);
        this.group.position.set(this.pos.x, this.height, this.pos.z);
      }
      return;
    }
    if (def.style === 'wall' && this.height > 0.01) {
      if (this.groundShadow) this.groundShadow.visible = false;
      this.dropStrike = Math.max(0, this.dropStrike - dt);
      this.height = damp(this.height, 0, 14, dt);
      if (this.height < 0.04) {
        this.height = 0;
        this.group.rotation.z = 0;
        this.group.rotation.x = 0;
        if (this.groundShadow) this.groundShadow.visible = true;
        game.fx.burst(new THREE.Vector3(this.pos.x, 0.25, this.pos.z), 0xd8cbb0, 16, 3);
        game.fx.addShake(0.06);
      }
      // It falls with its legs spread and its body tilted toward the sound.
      if (d > 1.3) {
        const fallStep = 1.5 * dt;
        this.pos.x += ux * fallStep;
        this.pos.z += uz * fallStep;
      }
      this.group.position.set(this.pos.x, this.height, this.pos.z);
      this.group.rotation.z = Math.sin(this.phase * 20) * 0.12;
      this.animateLegs(dt, 2.3);
      return;
    }

    if (def.style === 'anchored') {
      if (d < def.range && this.level.segmentClear(this.pos.x, this.pos.z, player.pos.x, player.pos.z)) {
        if (this.attackCd <= 0 && this.windup <= 0) {
          this.windup = def.windup;
          this.attackCd = def.cooldown + def.windup;
          game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.alarm());
        }
      }
      if (wasWinding && this.windup <= 0) {
        const lead = def.lead || 0;
        const target = new THREE.Vector3(
          player.pos.x + player.vel.x * lead,
          1.2,
          player.pos.z + player.vel.z * lead
        );
        const origin = new THREE.Vector3(this.pos.x, 1.4, this.pos.z);
        const burst = def.burst || 1;
        const sideX = Math.cos(this.group.rotation.y);
        const sideZ = -Math.sin(this.group.rotation.y);
        for (let i = 0; i < burst; i++) {
          const offset = (i - (burst - 1) / 2) * 0.75;
          const aim = target.clone();
          aim.x += sideX * offset;
          aim.z += sideZ * offset;
          game.spawnEnemyProjectile(origin, aim, def.projectileSpeed || 16, def.damage * this.damageMult, 0xff7a55);
        }
        game.fx.muzzle(origin, 0xff8a60);
      }
      this.group.position.set(this.pos.x, 0, this.pos.z);
      if (this.body) this.body.position.y = 1.4 + Math.sin(this.phase * 2) * 0.04;
      return;
    }

    if (def.style === 'skitter') {
      this.animateLegs(dt, 1.25);
      if (this.fuse === 0) {
        if (d < (def.aggro || 46) && this.stagger <= 0) {
          const wobble = Math.sin(this.phase * (8.5 + (def.weave || 0) * 4) + this.flankSide) * (def.weave || 0.4);
          const surge = 0.78 + 0.45 * Math.max(0, Math.sin(this.phase * 5.4 + this.flankSide));
          const px = -uz;
          const pz = ux;
          const step = def.speed * this.speedMult * surge * dt;
          this.pos.x += (ux + px * wobble) * step;
          this.pos.z += (uz + pz * wobble) * step;
          this.level.constrain(this.pos, def.radius * 0.8);
          if (this.body) {
            this.body.rotation.z = Math.sin(this.phase * 9) * 0.12 + this.hurtLean;
            this.body.rotation.y = Math.sin(this.phase * 7) * 0.08;
          }
        }
        if (this.attackCd <= 0 && d < 2.9) {
          this.fuse = def.fuse || 0.6;
          this.attackCd = 2.2;
          game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.alarm());
          game.fx.addShake(0.04);
        }
      } else {
        this.fuse -= dt;
        const pulse = this.eliteScale * (1 + Math.sin(this.phase * 42) * 0.09);
        this.group.scale.set(pulse, pulse, pulse);
        if (this.sacMat) this.sacMat.emissiveIntensity = 2.1 + Math.sin(this.phase * 40) * 0.9;
        if (this.fuse <= 0) {
          this.explode(player, game);
          return;
        }
      }
      if (this.body) this.body.position.y = this.bodyBaseY + Math.sin(this.phase * 12) * 0.03;
      if (this.sac) this.sac.scale.y = 1.2 + Math.sin(this.phase * 6) * 0.12;
      this.animateHead(dt, d < def.aggro ? 1 : 0);
      this.group.position.set(this.pos.x, 0, this.pos.z);
      return;
    }

    // Ground crawlers, flankers, leapers and heavy chargers. Legs tuck in the
    // air so a leap reads as a body leaving the floor, not a model sliding.
    this.animateLegs(
      dt,
      1 + Math.min(0.9, this.lungeTimer * 1.8),
      clamp(this.lungeArc / 0.45, 0, 1) * 0.58
    );
    if (this.stagger > 0 && this.lungeTimer <= 0) {
      this.group.position.set(this.pos.x, this.lungeArc + Math.sin(this.phase * 22) * 0.02, this.pos.z);
      return;
    }
    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      const lungeTime = def.leapTime || def.chargeTime || 0.3;
      const step = (def.leapSpeed || def.chargeSpeed || 0) * dt;
      this.pos.x += this.lungeDir.x * step;
      this.pos.z += this.lungeDir.z * step;
      this.level.constrain(this.pos, def.radius);
      this.lungeArc = Math.sin(clamp(1 - this.lungeTimer / lungeTime, 0, 1) * Math.PI) * 0.45;
      if (this.lungeTimer <= 0) {
        // The body arrives before the legs do. A ground burst and a squash sell
        // the mass landing instead of letting the model stop in mid-air.
        this.lungeArc = 0;
        this.landSquash = 0.32;
        game.fx.burst(new THREE.Vector3(this.pos.x, 0.18, this.pos.z), 0x9b7b58, 12, 2.4);
        game.fx.addShake(0.07);
        game.audio.enemyLand();
      }
    } else {
      this.lungeArc = damp(this.lungeArc, 0, 12, dt);
      if (this.holdTimer > 0 && d < def.range * 2.6) {
        // Denied a slot: orbit the surgeon at a readable ring instead of
        // freezing in reach. The radial term pulls it back onto the ring, the
        // tangential term makes it a circling threat rather than a queue.
        const ring = Math.max(2.2, def.range + 0.8);
        const radial = clamp((d - ring) / 2.2, -1, 1);
        const tx = ux * radial - uz * this.holdSide * 0.9;
        const tz = uz * radial + ux * this.holdSide * 0.9;
        const len = Math.hypot(tx, tz) || 1;
        const step = def.speed * 0.82 * this.speedMult * dt;
        this.pos.x += (tx / len) * step;
        this.pos.z += (tz / len) * step;
        this.level.constrain(this.pos, def.radius);
        if (this.body) {
          this.body.rotation.z = Math.sin(this.phase * 5.2 + this.holdSide) * 0.08 + this.hurtLean;
          this.body.rotation.y = -this.holdSide * 0.22;
        }
      } else if (d > def.range * 0.85 && d < (def.aggro || 46)) {
        let mx = ux;
        let mz = uz;
        if (def.behavior === 'flank' && d > 4.4) {
          const a = (def.flank || 0.8) * this.flankSide;
          const c = Math.cos(a);
          const s = Math.sin(a);
          mx = ux * c - uz * s;
          mz = ux * s + uz * c;
        }
        // A side-to-side scuttle. It is deliberately uneven, so the silhouette
        // does not glide like a hovering drone.
        const weave = def.weave || 0;
        if (weave) {
          const w = Math.sin(this.phase * 7.2 + this.flankSide * 2.1) * weave;
          mx += -uz * w;
          mz += ux * w;
          const len2 = Math.hypot(mx, mz) || 1;
          mx /= len2;
          mz /= len2;
        }
        const surge = 0.82 + 0.36 * Math.max(0, Math.sin(this.phase * 5.8 + this.flankSide));
        const step = def.speed * this.speedMult * surge * dt;
        this.pos.x += mx * step;
        this.pos.z += mz * step;
        this.level.constrain(this.pos, def.radius);
        if (this.body) {
          this.body.rotation.z = Math.sin(this.phase * 8) * 0.1 + this.hurtLean;
          this.body.rotation.y = Math.sin(this.phase * 6.4) * 0.06;
        }
      }
    }

    if (wasWinding) {
      const base = this.eliteScale;
      const crouch = 1 - Math.sin(clamp(1 - this.windup / (def.windup || 0.4), 0, 1) * Math.PI) * 0.12;
      this.group.scale.set(base * crouch, base * (2 - crouch), base * crouch);
      if (this.windup <= 0) {
        // A jump clears a floor-level bite. Ranged attacks and the spore burst
        // still track the surgeon in three dimensions.
        if (
          d < def.range + 1.3 &&
          player.airHeight < PLAYER.airDodgeHeight &&
          game.level.segmentClear(this.pos.x, this.pos.z, player.pos.x, player.pos.z)
        ) {
          game.damagePlayer(def.damage * this.damageMult, this.pos, def.name);
          game.fx.addShake(0.22);
        }
        game.fx.burst(new THREE.Vector3(this.pos.x, 0.55, this.pos.z), 0xffa07a, 16, 3);
        if (def.leapSpeed || def.chargeSpeed) {
          this.lungeTimer = def.leapTime || def.chargeTime || 0.3;
          this.lungeDir.set(ux, 0, uz);
        }
        this.attackCd = Math.max(this.attackCd, def.cooldown || 1);
      }
    } else {
      const squash = this.landSquash;
      this.group.scale.set(
        this.eliteScale * (1 + squash * 0.28),
        this.eliteScale * (1 - squash * 0.42),
        this.eliteScale * (1 + squash * 0.28)
      );
      if (d < def.range + 0.7 && this.attackCd <= 0 && this.lungeTimer <= 0) {
        if (game.tryAttackSlot && !game.tryAttackSlot(this)) {
          // Someone else already has the room's attention. Circle for an
          // opening and try again shortly instead of queueing a second lunge.
          this.attackCd = COMBAT.meleeSlotRetry[0] + Math.random() * (COMBAT.meleeSlotRetry[1] - COMBAT.meleeSlotRetry[0]);
          this.holdTimer = this.attackCd + 0.2;
          this.holdSide *= -1;
        } else {
          this.holdTimer = 0;
          this.windup = def.windup;
          this.attackCd = def.cooldown + def.windup;
          game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.alarm());
        }
      }
    }

    if (this.body) {
      this.body.position.y = this.bodyBaseY + Math.sin(this.phase * 10) * 0.045;
      const rear = this.windup > 0 ? -0.22 * (1 - this.windup / (def.windup || 0.4)) : 0;
      this.body.rotation.x = damp(
        this.body.rotation.x,
        this.bodyBaseRotX + rear + (this.lungeArc > 0.06 ? -0.3 : 0) + this.hurtLean * 0.55,
        9,
        dt
      );
      this.body.rotation.z = damp(this.body.rotation.z, -this.turnLean * 0.12 + this.hurtLean, 8, dt);
    }
    if (this.weakMat && this.weakMat.emissive && this.windup > 0) {
      this.weakMat.emissiveIntensity = 1.4 + Math.sin(this.phase * 34) * 0.9;
    }
    this.animateHead(dt, d < def.range * 2 ? 1 : 0);
    this.group.rotation.z = damp(this.group.rotation.z, this.turnLean * 0.14 + Math.sin(this.phase * 8.4) * 0.012, 9, dt);
    this.group.position.set(this.pos.x, this.lungeArc, this.pos.z);
    if (this.groundShadow) this.groundShadow.position.y = 0.018 - this.lungeArc;
  }

  explode(player, game) {
    if (this.dead) return;
    const d = dist2(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    if (d < this.def.explodeRadius) {
      game.damagePlayer(this.def.explodeDamage * this.damageMult, this.pos, `${this.def.name} BURST`);
      game.damageHost(HOST.sporeBurstCost, 'spore');
    }
    const py = 0.45 + this.height;
    game.fx.burst(new THREE.Vector3(this.pos.x, py, this.pos.z), this.def.glow, 54, 8);
    game.fx.blood(new THREE.Vector3(this.pos.x, py, this.pos.z), new THREE.Vector3(0, 0.3, 0), 20);
    game.audio.explosion();
    game.fx.addShake(0.3);
    this.dead = true;
    this.group.visible = false;
    game.onEnemyRemoved(this);
  }

  takeDamage(amount, game, hitzone = 'body', impactDir = null) {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 0.1;
    const weak = hitzone === 'weak';
    game.ui.hitmarker(weak);
    if (!this.wounded && this.hp < this.maxHp * 0.42) {
      this.wounded = true;
      if (this.woundMesh) this.woundMesh.visible = true;
      game.fx.splat(new THREE.Vector3(this.pos.x, 0, this.pos.z), 1.4, 0x4b070c);
      game.fx.blood(new THREE.Vector3(this.pos.x, this.hitOffsetY, this.pos.z), new THREE.Vector3(0, 0.2, 0), 12);
    }
    if (weak) {
      game.audio.enemyCrit();
      game.fx.addShake(0.06);
      this.stagger = COMBAT.weakpointStagger;
      this.windup = 0;
      game.addFocus(FOCUS.hitGain);
    } else {
      game.audio.enemyHit();
    }
    if (this.weakMat && this.weakMat.emissive) {
      this.weakMat.emissiveIntensity = weak ? 4.5 : 1.2;
    }
    // Spray follows the bullet, not the player. A hit from the side throws
    // tissue across the room instead of politely upward.
    const dir = impactDir
      ? impactDir.clone().normalize()
      : new THREE.Vector3(this.pos.x - game.player.pos.x, 0.2, this.pos.z - game.player.pos.z).normalize();
    dir.y += 0.18;
    dir.normalize();
    const hy = this.hitOffsetY + this.height + this.lungeArc;
    game.fx.blood(new THREE.Vector3(this.pos.x, hy, this.pos.z), dir, weak ? 22 : 10);
    if (weak) {
      game.fx.burst(new THREE.Vector3(this.pos.x, hy + 0.2, this.pos.z), this.def.glow, 14, 3);
      // A weak-point hit tears something loose. Two chunks are enough to sell
      // it without filling the debris budget the instant a swarm arrives.
      game.fx.gib(new THREE.Vector3(this.pos.x, hy, this.pos.z), dir, 2, 0x5b1014);
    }
    this.hurtLean = clamp(this.hurtLean + (weak ? 0.2 : 0.09), 0, 0.28);
    if (this.hp <= 0) {
      this.dead = true;
      this.hp = 0;
      this.deathTimer = COMBAT.corpseTime;
      // Fall away from the shot. The lateral component of the impact in the
      // creature's own frame chooses which way the mass collapses.
      const rightX = Math.cos(this.heading);
      const rightZ = -Math.sin(this.heading);
      const side = dir.x * rightX + dir.z * rightZ;
      this.deathRoll = side >= 0 ? -1.22 : 1.22;
      this.deathPitch = 0.22 + Math.abs(dir.y) * 0.7;
      // The impact throws the body before it collapses. Distance is authored per
      // silhouette: a fast skitter skids, a heavy brute barely shifts.
      const style = this.def.style || 'ground';
      this.deathDir = new THREE.Vector3(dir.x, 0, dir.z);
      if (this.deathDir.lengthSq() < 1e-4) this.deathDir.set(0, 0, 1);
      this.deathDir.normalize();
      this.deathSlide = style === 'skitter' ? 0.92 : style === 'heavy' ? 0.26 : style === 'wall' ? 0.62 : 0.5;
      if (style === 'heavy') this.deathPitch += 0.4;
      this.group.rotation.order = 'YXZ';
      if (this.woundMesh) this.woundMesh.visible = true;
      if (this.groundShadow) this.groundShadow.visible = true;
      game.audio.playAt(this.pos.x, this.pos.z, () =>
        game.audio.enemyDeath(this.def.style === 'heavy' ? 1.5 : this.def.style === 'skitter' ? 0.8 : 1)
      );
      game.fx.burst(new THREE.Vector3(this.pos.x, hy, this.pos.z), this.def.glow, 42, 7);
      game.fx.blood(new THREE.Vector3(this.pos.x, hy, this.pos.z), dir, 30);
      game.fx.bloodMist(new THREE.Vector3(this.pos.x, hy, this.pos.z), dir, 8);
      game.fx.splat(new THREE.Vector3(this.pos.x, 0, this.pos.z), weak ? 2.2 : 1.5, 0x4d080d);
      // Arterial throw: three smaller pools land ahead of the body along the
      // line of the shot, so a kill leaves a direction, not just a puddle.
      const flat = new THREE.Vector3(dir.x, 0, dir.z);
      if (flat.lengthSq() > 0.001) {
        flat.normalize();
        for (let i = 0; i < 3; i++) {
          const spread = (i - 1) * 0.55 + (Math.random() - 0.5) * 0.3;
          const s = Math.sin(spread);
          const c = Math.cos(spread);
          const dx = flat.x * c - flat.z * s;
          const dz = flat.x * s + flat.z * c;
          const throwDist = 0.9 + Math.random() * 1.8;
          game.fx.splat(
            new THREE.Vector3(this.pos.x + dx * throwDist, 0, this.pos.z + dz * throwDist),
            0.5 + Math.random() * 0.55,
            0x4a060b
          );
        }
      }
      game.fx.gib(new THREE.Vector3(this.pos.x, hy, this.pos.z), dir, weak ? 9 : 5, 0x5b1014);
      // Close kills throw a film of blood onto the gloves and receiver, and the
      // very closest ones leave a brief arterial wash at the edge of the visor.
      const killDist = game.player
        ? dist2(this.pos.x, this.pos.z, game.player.pos.x, game.player.pos.z)
        : 99;
      if (killDist < 6.5) game.player.addGore(0.022 + (weak ? 0.02 : 0));
      if (killDist < 4.4) game.ui.goreFlash(0.62 - killDist * 0.08);
      game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.enemyDie());
      if (weak) game.addFocus(FOCUS.weakKillGain);
      this.killedByWeak = weak;
      game.onEnemyKilled(this);
    }
  }

  dispose() {
    disposeGroup(this.group);
    this.batchSources = [];
  }
}

// ===================================================================== BOSS
export class Boss {
  constructor(scene, level, game) {
    this.scene = scene;
    this.level = level;
    this.game = game;
    this.def = game.run?.bossDef || BOSS_VARIANTS[0];
    this.mech = this.def.mech || BOSS_VARIANTS[0].mech;
    this.group = new THREE.Group();
    this.base = new THREE.Vector3(level.layout.boss.x, 0, level.layout.boss.z);
    this.group.position.copy(this.base);
    this.active = false;
    this.dead = false;
    this.phase = 0;
    const tier = game.run?.tier || 1;
    this.hp = Math.round(BOSS.hp * (this.def.hpMult || 1) * (1 + (tier - 1) * 0.16));
    this.maxHp = this.hp;
    this.time = 0;
    this.volley = 2.4;
    this.summon = 7;
    this.charge = 6;
    this.hazard = 5;
    this.deathT = 0;
    this.flash = 0;
    this.shieldNodes = [];
    this.materials = [];
    this.obstacle = { x: this.base.x, z: this.base.z, r: 3.2, solid: true, boss: true };
    this.level.obstacles.push(this.obstacle);
    this.obstacleActive = false;
    this.build();
    scene.add(this.group);
    this.group.visible = false;
  }

  build() {
    const flesh = standard(0x5a1119, 0xa42022, 0.3, 0.5, 0.12);
    const clot = standard(0x2b070b, 0x6f0c13, 0.55, 0.35, 0.2);
    const calc = standard(0xd6b47c, 0x5a3516, 0.15, 0.36, 0.25);
    const coreMat = new THREE.MeshStandardMaterial({
      color: this.def.core,
      emissive: this.def.core,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.15,
    });
    this.materials.push(flesh, clot, calc, coreMat);

    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), flesh);
    body.scale.set(4.4, 3.6, 3.8);
    body.position.y = 4.1;
    this.body = body;
    this.group.add(body);

    const core = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12), coreMat);
    core.position.set(0, 4.0, 2.6);
    this.core = core;
    this.coreMat = coreMat;
    this.group.add(core);

    const iris = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.1, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb65c })
    );
    iris.position.copy(core.position);
    iris.rotation.y = 0.1;
    this.iris = iris;
    this.group.add(iris);

    // Calcified plates and a surgical-drone halo.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const plate = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 5), calc);
      plate.position.set(Math.cos(a) * 3.2, 4.5 + Math.sin(a * 2) * 0.8, Math.sin(a) * 2.8);
      plate.rotation.z = Math.cos(a) * 0.8;
      plate.rotation.x = Math.sin(a) * 0.7;
      plate.scale.set(1, 1.4, 0.45);
      this.group.add(plate);
    }
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.05, 6, 48),
      new THREE.MeshBasicMaterial({ color: this.def.halo, transparent: true, opacity: 0.4 })
    );
    halo.position.y = 5.8;
    halo.rotation.x = Math.PI / 2;
    this.halo = halo;
    this.group.add(halo);

    // Tendrils into the arena floor.
    const tendrilMat = standard(0x3e0b10, 0x6d1118, 0.35, 0.6, 0.1);
    this.materials.push(tendrilMat);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const points = [
        new THREE.Vector3(Math.cos(a) * 2.2, 2.5, Math.sin(a) * 2.0),
        new THREE.Vector3(Math.cos(a) * 4.2, 1.8, Math.sin(a) * 3.2),
        new THREE.Vector3(Math.cos(a) * 5.2, 0.1, Math.sin(a) * 4.4),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.TubeGeometry(curve, 12, 0.14, 5, false);
      this.group.add(new THREE.Mesh(geo, tendrilMat));
    }

    // Shield relays. The count is the variant's opening puzzle: the Warden
    // hides behind two, the Choir behind three, the Saint behind one thick relay.
    const nodeCount = this.mech.nodes || 2;
    const nodeHp = Math.round(
      BOSS.phases[0].nodeHp * (this.mech.nodeHp || 1) * (1 + ((this.game.run?.tier || 1) - 1) * 0.1)
    );
    for (let i = 0; i < nodeCount; i++) {
      const spread = nodeCount === 1 ? 0 : (i / (nodeCount - 1) - 0.5) * 2.1;
      const nodeMat = new THREE.MeshStandardMaterial({
        color: 0x805b38,
        emissive: 0xffa64a,
        emissiveIntensity: 1.2,
        roughness: 0.35,
        metalness: 0.25,
      });
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.84, 1), nodeMat);
      mesh.position.set(Math.sin(spread) * 4.4, 4.3, 2.2 - Math.cos(spread) * 1.5);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 5, 26), nodeMat);
      cage.rotation.y = Math.PI / 2;
      mesh.add(cage);
      this.group.add(mesh);
      this.materials.push(nodeMat);
      this.shieldNodes.push({ mesh, mat: nodeMat, hp: nodeHp, maxHp: nodeHp, alive: true, flash: 0 });
    }

    const light = new THREE.PointLight(0xff5a3c, 0, 34, 2);
    light.position.set(0, 4.5, 2.5);
    this.light = light;
    this.group.add(light);
  }

  activate() {
    if (this.active || this.dead) return;
    this.active = true;
    this.group.visible = true;
    this.obstacleActive = true;
    this.light.intensity = 30;
    this.game.audio.bossRoar();
    this.game.audio.setBossLayer(true);
    this.game.ui.showBoss(this);
    this.game.fx.shockwave(new THREE.Vector3(this.base.x, 0, this.base.z), 0xff6a3c, 10, 1.2);
    this.game.ui.toast(`BIO-SIGNATURE // ${this.def.name.replace('THE ', '')}`, this.def.intro, 'bad', 6500);
  }

  getShootables() {
    if (!this.active || this.dead) return [];
    this.group.updateMatrixWorld(true);
    const out = [];
    if (this.phase === 0) {
      for (const node of this.shieldNodes) {
        if (!node.alive) continue;
        const c = new THREE.Vector3();
        node.mesh.getWorldPosition(c);
        out.push({ kind: 'bossNode', boss: this, node, center: c, radius: 1.05 });
      }
    } else {
      const c = new THREE.Vector3();
      this.core.getWorldPosition(c);
      out.push({ kind: 'bossCore', boss: this, center: c, radius: BOSS.coreRadius });
    }
    return out;
  }

  damageNode(node, amount, game) {
    if (this.phase !== 0 || !node.alive) return;
    node.hp -= amount;
    node.flash = 0.1;
    game.ui.hitmarker();        game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.enemyHit());
        const p = new THREE.Vector3();
        node.mesh.getWorldPosition(p);
    game.fx.burst(p, 0xffb65c, 12, 4);
    if (node.hp <= 0) {
      node.alive = false;
      node.mesh.visible = false;
      game.fx.burst(p, 0xffd08a, 40, 7);
      game.fx.blood(p, new THREE.Vector3(0, 0.45, 0), 20);
      game.fx.gib(p, new THREE.Vector3(0, 1, 0.25), 6, 0x5b1014);
      game.fx.splat(new THREE.Vector3(p.x, 0, p.z), 1.8 + Math.random(), 0x4c070c);
      game.audio.nodeDestroyed();
      game.fx.addShake(0.3);
      game.addFocus(FOCUS.bossNodeGain);
      game.onBossNodeDestroyed?.(node);
      if (this.shieldNodes.every((n) => !n.alive)) this.beginPhase(1);
    }
  }

  takeDamage(amount, game) {
    if (!this.active || this.dead || this.phase === 0) return;
    this.hp -= amount;
    this.flash = 0.08;
    game.ui.hitmarker();
    game.audio.playAt(this.pos.x, this.pos.z, () => game.audio.enemyHit());
    const p = new THREE.Vector3();
    this.core.getWorldPosition(p);
    game.fx.blood(p, new THREE.Vector3(0, 0.2, 0), 8);
    game.ui.setBossHealth(this.hp, this.maxHp);
    if (this.hp <= this.maxHp * BOSS.phaseAt[1] && this.phase === 1) {
      this.beginPhase(2);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(game);
    }
  }

  beginPhase(next) {
    if (this.phase >= next) return;
    this.phase = next;
    this.game.audio.bossPhase();
    this.game.fx.shockwave(this.group.position.clone(), 0xffb65c, 14, 1.1);
    // The shield tearing loose is a physical event: a torrent from the core,
    // floor pools under the relays and a short arterial wash on the visor.
    const rupture = this.corePosition();
    this.game.fx.blood(rupture, new THREE.Vector3(0, 0.5, 0), 30);
    this.game.fx.bloodMist(rupture, new THREE.Vector3(0, 0.25, 0), 12);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU;
      this.game.fx.splat(
        new THREE.Vector3(this.base.x + Math.cos(a) * (2 + Math.random() * 4), 0, this.base.z + Math.sin(a) * (2 + Math.random() * 4)),
        2 + Math.random() * 2,
        0x48060b
      );
    }
    this.game.ui.goreFlash(0.55);
    this.game.ui.setBossPhase(next);
    this.game.ui.toast(
      `PHASE ${next === 1 ? 'II' : 'III'} // ${this.def.phaseNames?.[next] || BOSS.phases[next].name}`,
      BOSS.phases[next].note,
      'bad',
      4500
    );
    this.volley = 0.8;
    this.summon = 4;
    this.charge = 3.5;
    this.hazard = 3;
    this.game.fx.addShake(0.55);
    this.game.hitstop = Math.max(this.game.hitstop || 0, 0.1);
  }

  update(dt, player, game) {
    if (this.dead) {
      this.deathT += dt;
      this.group.scale.setScalar(Math.max(0.01, 1 - this.deathT * 0.25));
      this.group.rotation.y += dt * 0.8;
      this.light.intensity = Math.max(0, 30 * (1 - this.deathT * 0.7));
      return;
    }
    if (!this.active) return;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.coreMat.emissiveIntensity = this.flash > 0 ? 4 : 1.5 + Math.sin(this.time * 5) * 0.5;
    if (this.light) this.light.intensity = 24 + Math.sin(this.time * 3.2) * 8;
    this.iris.rotation.z += dt * 0.25;
    this.halo.rotation.z -= dt * 0.12;
    this.body.scale.set(4.4 + Math.sin(this.time * 1.4) * 0.1, 3.6 + Math.sin(this.time * 1.7) * 0.08, 3.8);
    for (const node of this.shieldNodes) {
      if (!node.alive) continue;
      node.flash = Math.max(0, node.flash - dt);
      node.mat.emissiveIntensity = node.flash > 0 ? 3.5 : 1.1 + Math.sin(this.time * 4 + node.mesh.position.x) * 0.4;
      node.mesh.rotation.y += dt * 0.7;
    }
    this.group.rotation.y = Math.atan2(player.pos.x - this.group.position.x, player.pos.z - this.group.position.z);
    this.volley -= dt;
    this.summon -= dt;
    this.charge -= dt;
    this.hazard -= dt;

    const mech = this.mech;
    if (this.phase === 0) {
      if (this.volley <= 0) {
        this.radialBarrage(game, mech.barrage, 0.9);
        this.volley = BOSS.phases[0].volley * mech.volley;
      }
      if (this.summon <= 0) {
        this.summonEnemy(game);
        this.summon = BOSS.phases[0].summon * mech.summon;
      }
    } else if (this.phase === 1) {
      if (this.volley <= 0) {
        this.radialBarrage(game, mech.barrage + 2, 1.0);
        this.aimedBurst(game, player, mech.aimed);
        this.volley = BOSS.phases[1].volley * mech.volley;
      }
      if (this.summon <= 0) {
        this.summonEnemy(game);
        this.summon = BOSS.phases[1].summon * mech.summon;
      }
      if (this.charge <= 0) {
        if (mech.ring) this.targetedRing(game, player);
        else this.aimedBurst(game, player, mech.aimed + 2);
        this.charge = BOSS.phases[1].charge * mech.charge;
      }
      if (mech.earlyHazard) {
        if (this.hazard <= 0) {
          const a = gameplayRandom(game) * TAU;
          game.spawnHazard(player.pos.x + Math.cos(a) * 1.6, player.pos.z + Math.sin(a) * 1.6, 3.3, 1.1);
          this.hazard = BOSS.phases[2].hazard * mech.hazard;
        }
      }
    } else {
      if (this.volley <= 0) {
        this.radialBarrage(game, mech.barrage + 6, 1.15);
        this.aimedBurst(game, player, mech.aimed + 2);
        this.volley = BOSS.phases[2].volley * mech.volley;
      }
      if (this.summon <= 0) {
        this.summonEnemy(game);
        this.summon = BOSS.phases[2].summon * mech.summon;
      }
      if (this.hazard <= 0) {
        const a = gameplayRandom(game) * TAU;
        game.spawnHazard(player.pos.x + Math.cos(a) * 1.6, player.pos.z + Math.sin(a) * 1.6, 3.3, 1.1);
        game.spawnHazard(this.base.x, this.base.z, 7, 2.2);
        this.hazard = BOSS.phases[2].hazard * mech.hazard;
      }
    }
    this.obstacle.x = this.group.position.x;
    this.obstacle.z = this.group.position.z;
  }

  corePosition() {
    const c = new THREE.Vector3();
    this.core.getWorldPosition(c);
    return c;
  }

  radialBarrage(game, count, speed) {
    const origin = this.corePosition();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + this.time * 0.2;
      const target = new THREE.Vector3(
        origin.x + Math.cos(a) * 10,
        1.2,
        origin.z + Math.sin(a) * 10
      );
      game.spawnBossProjectile(origin, target, speed, 16, 0xff7a3c);
    }
    game.fx.shockwave(this.group.position.clone(), 0xff7a3c, 6, 0.5);
    game.audio.bossPhase();
  }

  aimedBurst(game, player, count) {
    const origin = this.corePosition();
    for (let i = 0; i < count; i++) {
      const target = new THREE.Vector3(
        player.pos.x + (gameplayRandom(game) - 0.5) * 2.4,
        1.2,
        player.pos.z + (gameplayRandom(game) - 0.5) * 2.4
      );
      game.spawnBossProjectile(origin, target, 15, 14, 0xffb15c);
    }
  }

  targetedRing(game, player) {
    // A tight ring around the player, with a deliberate gap.
    const gap = gameplayRandom(game) * TAU;
    const origin = new THREE.Vector3(player.pos.x, 1.1, player.pos.z);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      if (Math.abs(((a - gap + Math.PI * 3) % TAU) - Math.PI) < 0.45) continue;
      const target = new THREE.Vector3(origin.x + Math.cos(a) * 8, 1.1, origin.z + Math.sin(a) * 8);
      game.spawnBossProjectile(origin.clone().setY(2.3), target, 10, 15, 0xff8a4a);
    }
    game.fx.shockwave(origin, 0xff8a4a, 7, 0.8);
  }

  summonEnemy(game) {
    const a = gameplayRandom(game) * TAU;
    const x = this.base.x + Math.cos(a) * 11;
    const z = this.base.z + Math.sin(a) * 8;
    const pool = this.mech.summonPool || ['spore', 'crawler'];
    game.spawnEnemyAt(pool[Math.floor(gameplayRandom(game) * pool.length)], x, z);
    game.fx.shockwave(new THREE.Vector3(x, 0, z), 0xd8f26a, 3, 0.5);
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    this.active = false;
    this.obstacleActive = false;
    const oi = this.level.obstacles.indexOf(this.obstacle);
    if (oi >= 0) this.level.obstacles.splice(oi, 1);
    this.group.visible = true;
    this.light.intensity = 40;
    game.audio.bossDeath();
    game.audio.setBossLayer(false);
    const core = this.corePosition();
    game.fx.burst(core, 0xffb65c, 90, 12);
    game.fx.blood(core, new THREE.Vector3(0, 0.6, 0), 46);
    game.fx.bloodMist(core, new THREE.Vector3(0, 0.3, 0), 18);
    game.fx.gib(core, new THREE.Vector3(0, 1, 0.2), 12, 0x5b1014);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + Math.random() * 0.4;
      game.fx.splat(
        new THREE.Vector3(this.base.x + Math.cos(a) * (2.5 + Math.random() * 4.5), 0, this.base.z + Math.sin(a) * (2.5 + Math.random() * 4.5)),
        2.4 + Math.random() * 2.6,
        0x45050a
      );
    }
    game.fx.shockwave(this.group.position.clone(), 0xff5a3c, 18, 1.4);
    game.ui.goreFlash(0.75);
    game.ui.hideBoss();
    game.onBossDefeated();
  }

  dispose() {
    const idx = this.level.obstacles.indexOf(this.obstacle);
    if (idx >= 0) this.level.obstacles.splice(idx, 1);
    disposeGroup(this.group);
    this.materials.forEach((m) => m.dispose?.());
  }
}

// ===================================================================== PROJECTILES
// Projectiles fire dozens of times a minute. Creating and disposing a shader
// program, two geometries and two materials per shot was a steady allocation
// and compile tax for identical spheres. Share the GPU assets and cache tinted
// materials by colour.
const PROJECTILE_GEOMETRY = {
  enemy: new THREE.SphereGeometry(0.15, 8, 6),
  boss: new THREE.SphereGeometry(0.24, 8, 6),
};
const PROJECTILE_GLOW_GEOMETRY = {
  enemy: new THREE.SphereGeometry(0.15 * 2.2, 6, 5),
  boss: new THREE.SphereGeometry(0.24 * 2.2, 6, 5),
};
const PROJECTILE_MATERIALS = new Map();

function projectileMaterial(color, glow) {
  const key = `${glow ? 'g' : 'c'}:${color}`;
  let material = PROJECTILE_MATERIALS.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: glow ? 0.15 : 0.95,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !glow,
      toneMapped: false,
    });
    PROJECTILE_MATERIALS.set(key, material);
  }
  return material;
}

export class Projectile {
  constructor(scene, origin, target, speed, damage, color, kind = 'enemy') {
    this.scene = scene;
    this.kind = kind;
    this.damage = damage;
    this.pos = origin.clone();
    this.dir = target.clone().sub(origin).normalize();
    this.speed = speed;
    this.life = 7;
    this.dead = false;
    const radius = kind === 'boss' ? 0.24 : 0.15;
    this.radius = radius;
    this.mesh = new THREE.Mesh(PROJECTILE_GEOMETRY[kind], projectileMaterial(color, false));
    this.mesh.position.copy(this.pos);
    this.glow = new THREE.Mesh(PROJECTILE_GLOW_GEOMETRY[kind], projectileMaterial(color, true));
    this.mesh.add(this.glow);
    scene.add(this.mesh);
  }

  update(dt, player, level, game) {
    if (this.dead) return;
    this.life -= dt;
    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.mesh.position.copy(this.pos);
    if (this.life <= 0 || !level.walkable(this.pos.x, this.pos.z, 0)) {
      this.destroy(game, false);
      return;
    }
    const obstacle = level.blockedByObstacle(this.pos.x, this.pos.z, 0);
    if (obstacle && !obstacle.boss) {
      this.destroy(game, false);
      return;
    }
    if (this.pos.y < 0.08) {
      this.destroy(game, false);
      return;
    }
    const dx = this.pos.x - player.pos.x;
    const dy = this.pos.y - (1.15 + player.airHeight);
    const dz = this.pos.z - player.pos.z;
    if (dx * dx + dy * dy + dz * dz < (this.radius + 0.62) ** 2) {
      game.damagePlayer(this.damage, this.pos, 'INFECTED PROJECTION');
      this.destroy(game, true);
    }
  }

  destroy(game, hit) {
    if (this.dead) return;
    this.dead = true;
    this.mesh.removeFromParent();
    // Geometry and materials are shared caches; only the scene graph node is
    // released here. Disposing them removed every other live projectile's GPU
    // resources and forced a fresh compile on the next shot.
    if (hit) game.fx.impact(this.pos, 0xff9a6a, 10);
    else game.fx.impact(this.pos, 0xff7a55, 5);
  }
}

// ===================================================================== HAZARD
export class Hazard {
  constructor(scene, x, z, radius, delay, game, style = null) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.delay = delay;
    this.timer = delay;
    this.triggered = false;
    this.dead = false;
    this.game = game;
    this.color = style?.color ?? 0xff5a3c;
    this.damage = style?.damage ?? 34;
    this.hostDamage = style?.host ?? 0;
    this.label = style?.label || 'TISSUE EVENT';
    const group = new THREE.Group();
    group.position.set(x, 0.06, z);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 48), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    const discMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), discMat);
    this.disc.rotation.x = -Math.PI / 2;
    group.add(this.ring, this.disc);
    scene.add(group);
    this.group = group;
    this.ringMat = ringMat;
    this.discMat = discMat;
    this.ringGeom = this.ring.geometry;
    this.discGeom = this.disc.geometry;
  }

  update(dt) {
    if (this.dead) return;
    this.timer -= dt;
    if (!this.triggered) {
      // Telegraph only while the hazard is arming. The old code kept writing
      // these values after the blast, and a long stalled frame could push the
      // disc's additive opacity far past 1, turning the floor into a white sun.
      const t = clamp(1 - this.timer / Math.max(0.01, this.delay), 0, 1);
      this.discMat.opacity = 0.025 + t * 0.16;
      this.ringMat.opacity = clamp(0.4 + Math.sin(this.timer * 18) * 0.22, 0, 0.72);
    }
    if (this.timer <= 0 && !this.triggered) {
      this.triggered = true;
      const d = dist2(this.x, this.z, this.game.player.pos.x, this.game.player.pos.z);
      if (d < this.radius && this.game.player.airHeight < PLAYER.airDodgeHeight) {
        this.game.damagePlayer(this.damage, { x: this.x, z: this.z }, 'ENVIRONMENTAL HAZARD');
        if (this.hostDamage > 0) this.game.damageHost(this.hostDamage, 'environment');
      }
      this.game.fx.burst(new THREE.Vector3(this.x, 0.4, this.z), this.color, 36, 7);
      this.game.fx.shockwave(new THREE.Vector3(this.x, 0, this.z), this.color, this.radius, 0.4);
      this.game.audio.explosion();
    }
    if (this.triggered) {
      this.ringMat.opacity = Math.max(0, this.ringMat.opacity - dt * 3);
      this.discMat.opacity = Math.max(0, this.discMat.opacity - dt * 2);
      if (this.ringMat.opacity <= 0.005 && this.discMat.opacity <= 0.005) this.destroy();
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.group.removeFromParent();
    this.ringGeom.dispose();
    this.discGeom.dispose();
    this.ringMat.dispose();
    this.discMat.dispose();
  }
}

// ===================================================================== PICKUPS
export class Pickup {
  constructor(scene, x, z, kind) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.life = 60;
    this.phase = Math.random() * TAU;
    this.dead = false;
    const group = new THREE.Group();
    group.position.set(x, 0.65, z);
    // Surgical resupply, not a glowing crate. Each pickup is a small kit with
    // a readable silhouette: latched bio-cell case, trauma box or fracture
    // canister. At hip height the old gold cubes were the least believable
    // objects in the organ.
    const caseMat = new THREE.MeshPhysicalMaterial({
      color: 0x35413a,
      roughness: 0.66,
      metalness: 0.12,
      clearcoat: 0.18,
      clearcoatRoughness: 0.5,
    });
    const lidMat = new THREE.MeshPhysicalMaterial({ color: 0x4b574d, roughness: 0.6, metalness: 0.14 });
    const brass = new THREE.MeshPhysicalMaterial({ color: 0x9a7a4e, roughness: 0.38, metalness: 0.72 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c211e, roughness: 0.78, metalness: 0.08 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xd9d4c6, roughness: 0.72, metalness: 0.02, clearcoat: 0.08 });
    const red = new THREE.MeshStandardMaterial({ color: 0x9e2b28, roughness: 0.55, metalness: 0.05, emissive: 0x2a0505, emissiveIntensity: 0.2 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe8de, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 0.6 });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffb765, toneMapped: false });
    const teal = new THREE.MeshBasicMaterial({ color: 0x86e6cf, toneMapped: false });
    if (kind === 'ammo') {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.14, 0.185, 3, 0.016), caseMat);
      const lid = new THREE.Mesh(new RoundedBoxGeometry(0.255, 0.036, 0.19, 2, 0.01), lidMat);
      lid.position.y = 0.086;
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.018, 0.15, 2, 0.006), dark);
      foot.position.y = -0.079;
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.018, 0.03, 2, 0.007), dark);
      handle.position.y = 0.116;
      group.add(body, lid, foot, handle);
      for (const side of [-1, 1]) {
        const latch = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.032, 0.026, 2, 0.004), brass);
        latch.position.set(side * 0.09, 0.078, 0.096);
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.036, 0.004), amber);
        window.position.set(0, 0.02, side * 0.096);
        const cage = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.004, 0.006), dark);
        cage.position.set(0, 0.002, side * 0.098);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.02), dark);
        post.position.set(side * 0.04, 0.1, 0);
        group.add(latch, window, cage, post);
      }
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.002, 0.042), white);
      label.position.set(-0.055, 0.106, 0.025);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.002, 0.007), red);
      stripe.position.set(-0.055, 0.1075, 0.037);
      group.add(label, stripe);
      this.materials = [caseMat, lidMat, brass, dark, white, red];
    } else if (kind === 'medkit') {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.13, 0.2, 3, 0.016), white);
      const lid = new THREE.Mesh(new RoundedBoxGeometry(0.275, 0.03, 0.205, 2, 0.009), lidMat);
      lid.position.y = 0.08;
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.005, 0.032), red);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.005, 0.14), red);
      cross1.position.y = 0.0975;
      cross2.position.y = 0.0975;
      const clasp = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.035, 0.016, 2, 0.004), brass);
      clasp.position.set(0, 0.01, 0.106);
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.018, 0.03, 2, 0.007), dark);
      handle.position.y = 0.111;
      const status = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, 0.002), teal);
      status.position.set(0.07, 0.025, 0.102);
      group.add(body, lid, cross1, cross2, clasp, handle, status);
      this.materials = [white, lidMat, red, brass, dark];
    } else {
      // Fracture grenade: canister, hazard band and a pull pin that reads as a
      // weapon rather than a floating gem.
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.078, 0.19, 14), caseMat);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.028, 14), red);
      band.position.y = 0.006;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 12), dark);
      foot.position.y = -0.105;
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.045, 12), brass);
      collar.position.y = 0.115;
      const pin = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 4, 12), brass);
      pin.position.set(0.04, 0.15, 0);
      pin.rotation.y = Math.PI / 2;
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.02), dark);
      lever.position.set(-0.052, 0.145, 0);
      group.add(body, band, foot, collar, pin, lever);
      this.materials = [caseMat, red, brass, dark];
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.009, 4, 24),
      new THREE.MeshBasicMaterial({
        color: kind === 'medkit' ? 0x6fe3d2 : 0xe8a34a,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.ring = ring;
    this.ringMat = ring.material;
    this.group = group;
    this.scene.add(group);
  }

  update(dt, player, game) {
    if (this.dead) return;
    this.life -= dt;
    this.phase += dt * 2;
    this.group.position.y = 0.55 + Math.sin(this.phase) * 0.045;
    this.group.rotation.y += dt * 0.5;
    this.ring.rotation.z += dt * 0.4;
    this.ringMat.opacity = 0.24 + Math.sin(this.phase * 1.4) * 0.08;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    if (dist2(this.x, this.z, player.pos.x, player.pos.z) < 1.6) {
      game.collectPickup(this);
      this.destroy();
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
