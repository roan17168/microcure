// MicroCure — particles, tracers, impacts, shockwaves, camera shake.
import * as THREE from 'three';
import { PERFORMANCE } from './content.js';

function makeSoftPoint() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let pointTexture = null;
let splatterTexture = null;

// A real splatter has a wet central pool, thrown droplets and a few long
// arterial smears. This is painted once at boot and reused by every decal.
function makeSplatterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.beginPath();
  const cx = 128 + (Math.random() - 0.5) * 18;
  const cy = 128 + (Math.random() - 0.5) * 18;
  for (let i = 0; i <= 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    const r = 58 + Math.sin(a * 5 + 1.7) * 14 + Math.sin(a * 11) * 7 + Math.random() * 8;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.82;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 55 + Math.random() * 62;
    const r = 2 + Math.random() * 11;
    g.globalAlpha = 0.42 + Math.random() * 0.48;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r, r * (0.5 + Math.random()), a, 0, Math.PI * 2);
    g.fill();
  }
  // Thrown streaks.
  g.globalAlpha = 0.58;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 76 + Math.random() * 44;
    const len = 10 + Math.random() * 26;
    g.lineWidth = 1 + Math.random() * 3.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8);
    g.lineTo(cx + Math.cos(a) * (d + len), cy + Math.sin(a) * (d + len) * 0.8);
    g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One instanced quad holds every blood pool in the organ. The old approach of
// spawning a mesh per hit would have added dozens of draws; this adds one.
class SplatterField {
  constructor(scene, count = 96) {
    if (!splatterTexture) splatterTexture = makeSplatterTexture();
    this.count = count;
    this.cursor = 0;
    this.dummy = new THREE.Object3D();
    const mat = new THREE.MeshBasicMaterial({
      map: splatterTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.86,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'blood-pools';
    this.dummy.position.set(0, -99, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    const dark = new THREE.Color(0x5a0b10);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, dark);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  splat(point, size = 1.2, color = 0x5a0b10, normal = null) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    if (normal) {
      // Wall tissue: lay the decal on the surface and throw it along the wall,
      // so shooting the patient visibly damages the room you are standing in.
      const n = normal.clone().normalize();
      this.dummy.position.copy(point).addScaledVector(n, 0.012);
      this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      this.dummy.rotateZ(Math.random() * Math.PI * 2);
    } else {
      this.dummy.position.set(point.x, 0.022 + (i % 7) * 0.0007, point.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    }
    const sx = size * (0.65 + Math.random() * 0.7);
    const sy = size * (0.5 + Math.random() * 0.55);
    this.dummy.scale.set(sx, sy, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    const c = new THREE.Color(color);
    c.offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.06);
    this.mesh.setColorAt(i, c);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Small physical chunks for deaths. Instanced, so a butcher's floor still costs
// one draw call, and they settle into the blood pools instead of vanishing.
class DebrisField {
  constructor(scene, geometry, material, count = 28) {
    this.count = count;
    this.cursor = 0;
    this.dummy = new THREE.Object3D();
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'gore-chunks';
    this.items = Array.from({ length: count }, () => ({ alive: false }));
    this.dummy.position.set(0, -99, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(0x5a1117));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  emit(point, direction, count, color, opts = {}) {
    const { speed = 3.6, life = 2.6, scale = 0.08 } = opts;
    const base = direction?.clone().normalize() || new THREE.Vector3(0, 1, 0);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const p = this.items[i];
      p.alive = true;
      p.x = point.x + (Math.random() - 0.5) * 0.2;
      p.y = point.y + (Math.random() - 0.5) * 0.16;
      p.z = point.z + (Math.random() - 0.5) * 0.2;
      p.vx = (base.x + (Math.random() - 0.5) * 1.1) * speed;
      p.vy = (base.y + 0.35 + Math.random() * 0.8) * speed;
      p.vz = (base.z + (Math.random() - 0.5) * 1.1) * speed;
      p.rx = Math.random() * 5;
      p.ry = Math.random() * 5;
      p.rz = Math.random() * 5;
      p.spinX = (Math.random() - 0.5) * 7;
      p.spinY = (Math.random() - 0.5) * 7;
      p.spinZ = (Math.random() - 0.5) * 7;
      p.scale = scale * (0.45 + Math.random() * 1.1);
      p.life = life * (0.7 + Math.random() * 0.7);
      p.maxLife = p.life;
      p.color = new THREE.Color(color).offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.12);
      this.mesh.setColorAt(i, p.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.items[i];
      if (!p.alive) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.dummy.position.set(0, -99, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.035) {
        p.y = 0.035;
        p.vy = Math.abs(p.vy) * 0.22;
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.spinX *= 0.5;
        p.spinZ *= 0.5;
      }
      p.rx += p.spinX * dt;
      p.ry += p.spinY * dt;
      p.rz += p.spinZ * dt;
      const fade = Math.min(1, p.life / 0.7);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rx, p.ry, p.rz);
      this.dummy.scale.setScalar(p.scale * fade);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

class ParticleField {
  constructor(scene, count, blending, gravity, drag, sizeScale = 1) {
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.sizeScale = sizeScale;
    this.cursor = 0;
    this.live = 0;
    this.dormant = true;
    this.particles = Array.from({ length: count }, () => ({
      alive: false,
      x: 0, y: -999, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1, size: 1, gravity: 1, drag: 1,
      r: 1, g: 1, b: 1, alpha: 1, floor: true, bounce: 0.2,
    }));
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);
    if (!pointTexture) pointTexture = makeSoftPoint();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: pointTexture } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (300.0 / max(1.0, -mv.z)), 0.0, 90.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float mask = texture2D(uMap, gl_PointCoord).a;
          if (mask < 0.01) discard;
          gl_FragColor = vec4(vColor, vAlpha * mask);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  emit(origin, count, color, opts = {}) {
    const {
      speed = 4,
      spread = 1,
      life = 0.8,
      size = 0.1,
      gravity = 1,
      drag = 1,
      direction = null,
      up = 1,
      floor = true,
      bounce = 0.2,
      colorJitter = 0.06,
    } = opts;
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.count;
      let dx = Math.random() * 2 - 1;
      let dy = Math.random() * 2 - 1;
      let dz = Math.random() * 2 - 1;
      if (direction) {
        dx = direction.x + dx * 0.55;
        dy = direction.y + dy * 0.55;
        dz = direction.z + dz * 0.55;
      }
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = speed * (0.35 + Math.random() * spread);
      if (!p.alive) this.live++;
      p.alive = true;
      this.dormant = false;
      p.x = origin.x + (Math.random() - 0.5) * 0.18;
      p.y = origin.y + (Math.random() - 0.5) * 0.18;
      p.z = origin.z + (Math.random() - 0.5) * 0.18;
      p.vx = (dx / len) * sp;
      p.vy = (dy / len) * sp + up * (0.3 + Math.random());
      p.vz = (dz / len) * sp;
      p.maxLife = life * (0.65 + Math.random() * 0.7);
      p.life = p.maxLife;
      p.size = size * (0.6 + Math.random() * 0.9) * this.sizeScale;
      p.gravity = gravity;
      p.drag = drag;
      p.r = Math.max(0, Math.min(1, c.r + (Math.random() - 0.5) * colorJitter));
      p.g = Math.max(0, Math.min(1, c.g + (Math.random() - 0.5) * colorJitter));
      p.b = Math.max(0, Math.min(1, c.b + (Math.random() - 0.5) * colorJitter));
      p.alpha = 1;
      p.floor = floor;
      p.bounce = bounce;
    }
  }

  update(dt) {
    // A quiet corridor should not upload two 1,500-particle buffers every
    // frame. The field falls dormant the moment its last spark dies.
    if (this.dormant) return;
    const pos = this.pos;
    const col = this.col;
    const sizes = this.sizes;
    const alphas = this.alphas;
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        alphas[i] = 0;
        continue;
      }
      alive++;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.live = Math.max(0, this.live - 1);
        alphas[i] = 0;
        pos[i * 3 + 1] = -999;
        alive--;
        continue;
      }
      p.vy -= 9.8 * this.gravity * p.gravity * dt;
      const drag = Math.max(0, 1 - this.drag * p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.floor && p.y < 0.04) {
        p.y = 0.04;
        p.vy = Math.abs(p.vy) * p.bounce;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const t = p.life / p.maxLife;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g;
      col[i * 3 + 2] = p.b;
      sizes[i] = p.size * (0.55 + t * 0.9);
      alphas[i] = Math.min(1, t * 2.4);
    }
    if (!alive) this.dormant = true;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geo.dispose();
    this.points.material.dispose();
  }
}

// Ground telegraphs for enemy wind-ups. One instanced ring mesh holds every
// active warning, so a room full of charging enemies still costs one draw call.
// Colour is modulated per instance because additive blending reads brightness
// as opacity; no per-instance alpha is needed.
class TelegraphField {
  constructor(scene, capacity = 24) {
    this.capacity = capacity;
    this.cursor = 0;
    this.dirty = false;
    this.dummy = new THREE.Object3D();
    // A 12% band read as a hairline on a red floor from five metres. 30% is
    // legible at a glance without becoming a UI decal pasted on the world.
    const geo = new THREE.RingGeometry(0.7, 1, 48, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'enemy-telegraphs';
    this.dummy.position.set(0, -99, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(0x000000));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  begin() {
    this.cursor = 0;
  }

  add(x, z, radius, intensity, color) {
    if (this.cursor >= this.capacity) return;
    this.dummy.position.set(x, 0.045, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(radius, 1, radius);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, this.dummy.matrix);
    const k = Math.max(0.06, Math.min(1, intensity));
    const c = new THREE.Color(color);
    // Bias toward white so the warning separates from the red tissue behind it,
    // then scale toward black (additive reads brightness as opacity).
    c.lerp(new THREE.Color(0xffffff), 0.3);
    c.multiplyScalar(k * 1.15);
    this.mesh.setColorAt(this.cursor, c);
    this.cursor++;
    this.dirty = true;
  }

  end() {
    // Blank any slot used last frame but not this one.
    if (this.cursor < this.capacity) {
      this.dummy.position.set(0, -99, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      for (let i = this.cursor; i < this.capacity; i++) {
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.mesh.setColorAt(i, new THREE.Color(0x000000));
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.sparks = new ParticleField(scene, 900, THREE.AdditiveBlending, 0.55, 1.8, 1.0);
    this.gore = new ParticleField(scene, 700, THREE.NormalBlending, 1.1, 0.6, 1.0);
    this.smoke = new ParticleField(scene, 320, THREE.NormalBlending, 0.35, 1.7, 1.0);
    this.splats = new SplatterField(scene);
    this.telegraphs = new TelegraphField(scene);
    this.debris = new DebrisField(
      scene,
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.03, flatShading: true }),
      28
    );
    // One line mesh holds every tracer. The old code allocated a BufferGeometry
    // and a LineBasicMaterial for every shot, then disposed them 75 ms later.
    this.tracerCapacity = 48;
    this.tracerPos = new Float32Array(this.tracerCapacity * 6);
    this.tracerCol = new Float32Array(this.tracerCapacity * 6);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.tracerLines = new THREE.LineSegments(this.tracerGeo, this.tracerMat);
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    this.tracerSlots = Array.from({ length: this.tracerCapacity }, () => ({ life: 0, max: 0.075, r: 0, g: 0, b: 0 }));
    this.tracerCursor = 0;
    this.rings = [];
    this.lights = [];
    this.shake = 0;
    this.shakeScale = 1;
    this.motionScale = 1;
    this.shakeTime = 0;
    this.roll = 0;
    this.dust = this.makeDust();
    this.time = 0;
    this._lightCursor = 0;
    // One muzzle light is enough to sell the flash. Three of them made every
    // distant wall pay for a flicker that is only visible on the weapon.
    for (let i = 0; i < 1; i++) {
      // Hide the light when its flash is over. Intensity 0 still occupies a
      // forward-render light slot and costs every lit fragment.
      const l = new THREE.PointLight(0xffc27a, 0, 7, 2);
      l.visible = false;
      this.scene.add(l);
      this.lights.push({ light: l, life: 0 });
    }
  }

  makeDust() {
    const count = 320;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc9a0,
      size: 0.045,
      map: pointTexture || (pointTexture = makeSoftPoint()),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, geo, mat, positions, phases, count };
  }

  setBiome(palette) {
    if (this.dust) this.dust.mat.color.setHex(palette.glow);
    this.lights.forEach((l) => l.light.color.setHex(palette.glow));
  }

  updateDust(camera, dt) {
    if (!this.dust) return;
    this.dustAcc = (this.dustAcc || 0) + dt;
    if (this.dustAcc < 1 / PERFORMANCE.dustHz) return;
    dt = this.dustAcc;
    this.dustAcc = 0;
    const { positions, phases, count } = this.dust;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (let i = 0; i < count; i++) {
      phases[i] += dt * (0.3 + (i % 7) * 0.04);
      positions[i * 3] += Math.sin(phases[i]) * dt * 0.08;
      positions[i * 3 + 1] += Math.cos(phases[i] * 0.7) * dt * 0.05;
      // Wrap dust around the player so the field always feels populated.
      let x = positions[i * 3] - cx;
      let z = positions[i * 3 + 2] - cz;
      if (x > 17) positions[i * 3] -= 34;
      if (x < -17) positions[i * 3] += 34;
      if (z > 17) positions[i * 3 + 2] -= 34;
      if (z < -17) positions[i * 3 + 2] += 34;
      // A mote that drifts onto the lens becomes a full-screen bokeh and drowns
      // the HUD. Keep the decorative shell outside arm's reach.
      x = positions[i * 3] - cx;
      z = positions[i * 3 + 2] - cz;
      const near = Math.hypot(x, z);
      if (near < 2.2) {
        const a = phases[i] * 1.7 + i * 0.63;
        const safe = 2.2 + (i % 5) * 0.16;
        positions[i * 3] = cx + Math.cos(a) * safe;
        positions[i * 3 + 2] = cz + Math.sin(a) * safe;
      }
      if (positions[i * 3 + 1] > 9) positions[i * 3 + 1] = 0.2;
      if (positions[i * 3 + 1] < 0.2) positions[i * 3 + 1] = 0.4;
    }
    this.dust.geo.attributes.position.needsUpdate = true;
  }

  tracer(from, to, color = 0x9bffe4) {
    const slot = this.tracerCursor;
    this.tracerCursor = (this.tracerCursor + 1) % this.tracerCapacity;
    const i = slot * 6;
    this.tracerPos[i] = from.x;
    this.tracerPos[i + 1] = from.y;
    this.tracerPos[i + 2] = from.z;
    this.tracerPos[i + 3] = to.x;
    this.tracerPos[i + 4] = to.y;
    this.tracerPos[i + 5] = to.z;
    const c = new THREE.Color(color);
    for (let v = 0; v < 2; v++) {
      this.tracerCol[i + v * 3] = c.r;
      this.tracerCol[i + v * 3 + 1] = c.g;
      this.tracerCol[i + v * 3 + 2] = c.b;
    }
    const s = this.tracerSlots[slot];
    s.life = 0.075;
    s.max = 0.075;
    s.r = c.r;
    s.g = c.g;
    s.b = c.b;
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
  }

  muzzle(point, color = 0xffd9a0) {
    const entry = this.lights[this._lightCursor];
    this._lightCursor = (this._lightCursor + 1) % this.lights.length;
    entry.light.position.copy(point);
    entry.light.color.setHex(color);
    entry.light.visible = true;
    entry.light.intensity = 8;
    entry.life = 0.055;
    this.sparks.emit(point, 4, color, {
      speed: 2.2,
      life: 0.16,
      size: 0.055,
      gravity: 0.2,
      floor: false,
      up: 0.2,
    });
    this.smoke.emit(point, 4, 0x81766a, {
      speed: 0.38,
      spread: 0.8,
      life: 0.78,
      size: 0.18,
      gravity: -0.06,
      up: 0.24,
      floor: false,
      colorJitter: 0.025,
    });
  }

  casing(point, right) {
    const dir = right?.clone().normalize() || new THREE.Vector3(1, 0.4, 0);
    this.gore.emit(point, 2, 0xc09555, {
      speed: 2.8,
      spread: 1.0,
      life: 0.52,
      size: 0.032,
      gravity: 2.4,
      direction: dir,
      up: 0.8,
      floor: true,
      bounce: 0.55,
      colorJitter: 0.03,
    });
  }

  splat(point, size = 1.1, color = 0x5a0b10) {
    this.splats.splat(point, size, color);
  }

  wallSplat(point, normal, size = 0.8, color = 0x50080d) {
    this.splats.splat(point, size, color, normal);
  }

  gib(point, direction, count = 5, color = 0x5a1117) {
    this.debris.emit(point, direction, count, color, { speed: 4.1, life: 2.8, scale: 0.075 });
  }

  // Aerosolised blood. It hangs in the air far longer than the droplets and is
  // what makes a hit read as wet tissue rather than a red spark.
  bloodMist(point, direction = null, count = 4) {
    this.smoke.emit(point, count, 0x5e0a10, {
      speed: 0.55,
      spread: 1.2,
      life: 1.1,
      size: 0.2,
      gravity: -0.04,
      direction: direction?.clone().normalize(),
      up: 0.3,
      floor: false,
      colorJitter: 0.035,
    });
  }

  impact(point, color = 0xffb08a, count = 10, direction = null) {
    this.sparks.emit(point, count, color, {
      speed: 5.5,
      life: 0.35,
      size: 0.06,
      gravity: 0.9,
      direction,
      floor: true,
      bounce: 0.35,
    });
    this.gore.emit(point, Math.round(count * 0.5), 0x7a1f22, {
      speed: 2.4,
      life: 0.8,
      size: 0.11,
      gravity: 1.2,
      direction,
      floor: true,
      bounce: 0.1,
      colorJitter: 0.04,
    });
  }

  blood(point, direction, count = 14) {
    this.gore.emit(point, count, 0xa51f2b, {
      speed: 5,
      life: 1.0,
      size: 0.14,
      gravity: 1.3,
      direction,
      floor: true,
      bounce: 0.15,
      colorJitter: 0.05,
    });
    this.bloodMist(point, direction, Math.max(2, Math.round(count * 0.22)));
    if (Math.random() < 0.58) this.splat(point, 0.7 + Math.random() * 0.9, 0x52080d);
    this.sparks.emit(point, Math.round(count * 0.35), 0xff5a4a, {
      speed: 6,
      life: 0.3,
      size: 0.05,
      gravity: 0.5,
      direction,
      floor: true,
    });
  }

  burst(point, color = 0xffd0a0, count = 26, speed = 7) {
    this.sparks.emit(point, count, color, {
      speed,
      life: 0.7,
      size: 0.1,
      gravity: 0.8,
      up: 1.4,
      floor: true,
      bounce: 0.4,
    });
    this.gore.emit(point, Math.round(count * 0.4), 0x8f2028, {
      speed: speed * 0.6,
      life: 1.2,
      size: 0.18,
      gravity: 1.4,
      floor: true,
      colorJitter: 0.05,
    });
  }

  shockwave(point, color = 0xffb45e, maxRadius = 4.5, duration = 0.55) {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(point);
    ring.position.y = 0.08;
    this.scene.add(ring);
    this.rings.push({ ring, life: duration, max: duration, maxRadius });
  }

  pulseRing(point, color = 0xff5d48) {
    const geo = new THREE.RingGeometry(0.9, 1.0, 40);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(point);
    ring.position.y = 0.06;
    this.scene.add(ring);
    return ring;
  }

  addShake(amount) {
    this.shake = Math.min(0.9, this.shake + amount);
  }

  addRoll(amount) {
    this.roll = Math.max(-0.12, Math.min(0.12, this.roll + amount));
  }

  applyCamera(camera) {
    // The reduced-motion preset stills all camera shake and residual roll. The
    // impact audio, hit marker and horde remain, so the player loses no signal.
    if (this.motionScale <= 0) {
      this.roll = 0;
      return;
    }
    if (this.shake <= 0.0001) {
      this.roll *= 0.86;
      if (Math.abs(this.roll) > 0.0001) camera.rotateZ(this.roll);
      return;
    }
    const s = this.shake * this.shakeScale;
    const t = this.time;
    camera.position.x += Math.sin(t * 71.3) * s * 0.045;
    camera.position.y += Math.cos(t * 63.7) * s * 0.035;
    camera.rotateZ(Math.sin(t * 41.1) * s * 0.018 + this.roll);
    this.roll *= 0.9;
  }

  // Called once per fixed step: begin, add one per winding enemy, end.
  beginTelegraphs() {
    this.telegraphs.begin();
  }

  telegraph(x, z, radius, intensity, color) {
    this.telegraphs.add(x, z, radius, intensity, color);
  }

  endTelegraphs() {
    this.telegraphs.end();
  }

  update(dt) {
    this.time += dt;
    this.sparks.update(dt);
    this.gore.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.9);
    let tracerDirty = false;
    for (let i = 0; i < this.tracerCapacity; i++) {
      const s = this.tracerSlots[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      const fade = Math.max(0, s.life / s.max);
      const base = i * 6;
      for (let v = 0; v < 2; v++) {
        const o = base + v * 3;
        this.tracerCol[o] = s.r * fade;
        this.tracerCol[o + 1] = s.g * fade;
        this.tracerCol[o + 2] = s.b * fade;
      }
      tracerDirty = true;
      if (s.life <= 0) s.life = 0;
    }
    if (tracerDirty) this.tracerGeo.attributes.color.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      const radius = 0.5 + t * r.maxRadius;
      r.ring.scale.setScalar(radius);
      r.ring.material.opacity = (1 - t) * 0.75;
      if (r.life <= 0) {
        r.ring.removeFromParent();
        r.ring.geometry.dispose();
        r.ring.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (const entry of this.lights) {
      if (entry.life > 0) {
        entry.life -= dt;
        entry.light.intensity = Math.max(0, entry.light.intensity - dt * 170);
      } else {
        entry.light.intensity = 0;
        entry.light.visible = false;
      }
    }
  }

  dispose() {
    this.sparks.dispose();
    this.gore.dispose();
    this.smoke.dispose();
    this.splats.dispose();
    this.debris.dispose();
    this.tracerLines.removeFromParent();
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
    for (const r of this.rings) {
      r.ring.removeFromParent();
      r.ring.geometry.dispose();
      r.ring.material.dispose();
    }
    this.rings.length = 0;
    for (const l of this.lights) l.light.removeFromParent();
    if (this.dust) {
      this.dust.points.removeFromParent();
      this.dust.geo.dispose();
      this.dust.mat.dispose();
    }
  }
}
