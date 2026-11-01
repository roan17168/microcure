// MicroCure — boot, fixed-step simulation, run state machine and combat resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { GAME, DISCIPLINES, WEAPON, PLAYER, HOST, BOSS, BOSS_VARIANTS, ENEMIES, ORGANS, ORGAN_HAZARDS, ORGAN_AMBIENCE, MUTATIONS, PROTOCOLS, ROUTES, ADAPTATIONS, GRADES, RESEARCH, DIRECTIVES, COMBAT, FOCUS, PERFORMANCE, SCORING, MEDALS, CRISES, PICKUPS, GAMEPAD, generatePatient } from './content.js';
import { Player, Enemy, Boss, Projectile, Pickup, Hazard } from './entities.js';
import { Level } from './level.js';
import { FX } from './fx.js';
import { audio } from './audio.js';
import { UI } from './ui.js';
import {
  STEP,
  clamp,
  dist2,
  hashString,
  shortSeed,
  storage,
  downloadFile,
  readFileText,
  formatClock,
  bestGrade,
  RNG,
} from './utils.js';

const DEFAULT_SETTINGS = {
  sensitivity: 1,
  fov: 78,
  volume: 0.7,
  invertY: false,
  shake: 1,
  aberration: true,
  quality: 'high',
  highContrast: false,
  reduceMotion: false,
  colorVision: 'off',
};

const COLOR_VISION_MODES = ['off', 'deuteranopia', 'protanopia', 'tritanopia'];

const DEFAULT_META = {
  rp: 0,
  unlocked: [],
  claimed: [],
  stats: { kills: 0, clean: 0, elites: 0, cases: 0, organs: 0, perfect: 0, adaptations: 0, bosses: 0 },
  bestGrade: null,
  bestScore: 0,
  bestChain: 0,
  medals: {},
  runs: 0,
  completed: 0,
};

const freshMeta = () => ({
  ...DEFAULT_META,
  unlocked: [],
  claimed: [],
  medals: {},
  stats: { ...DEFAULT_META.stats },
});

const CHECKPOINT_KEY = `${GAME.saveKey}.checkpoint`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uAberration: { value: 1 },
    uVignette: { value: 1 },
    uColorVision: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDamage;
    uniform float uAberration;
    uniform float uVignette;
    uniform int uColorVision;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    // LMS daltonization. The matrices are the linear-sRGB transforms used by
    // the standard daltonize implementation (Viénot/Brettel/Mollon simulation,
    // then an error-redistribution matrix). This is deliberately applied after
    // grading, before output conversion: the scene is still linear light, so
    // the colour math is physically meaningful. It moves the red/green
    // infection contrast into channels a dichromat can still separate.
    vec3 rgbToLms(vec3 c) {
      return vec3(
        dot(c, vec3(0.3904725, 0.54990437, 0.00890159)),
        dot(c, vec3(0.07092586, 0.96310739, 0.00135809)),
        dot(c, vec3(0.02314268, 0.12801221, 0.93605194))
      );
    }

    vec3 lmsToRgb(vec3 c) {
      return vec3(
        dot(c, vec3(2.85831110, -1.62870796, -0.02481870)),
        dot(c, vec3(-0.21043478, 1.15841493, 0.00032046)),
        dot(c, vec3(-0.04188950, -0.11815433, 1.06888657))
      );
    }

    vec3 colorVision(vec3 c) {
      if (uColorVision == 0) return c;
      vec3 lms = rgbToLms(max(c, vec3(0.0)));
      vec3 sim;
      if (uColorVision == 1) {
        sim = vec3(lms.r, 1.10104433 * lms.r - 0.00901975 * lms.b, lms.b);
      } else if (uColorVision == 2) {
        sim = vec3(0.90822864 * lms.g + 0.008192 * lms.b, lms.g, lms.b);
      } else {
        sim = vec3(lms.r, lms.g, -0.15773032 * lms.r + 1.19465634 * lms.g);
      }
      vec3 err = max(c, vec3(0.0)) - lmsToRgb(sim);
      return clamp(max(c, vec3(0.0)) + vec3(0.0, 0.7 * err.r + err.g, 0.7 * err.r + err.b), 0.0, 1.0);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ab = 0.0017 * uAberration * (1.0 + uDamage * 1.8);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // Clinical film grade: cool the shadows, keep the tissue warm, and give
      // the wet surfaces enough midtone contrast to read as material rather
      // than brown fog. Kept below clipping so blood highlights stay red.
      col = pow(max(col, vec3(0.0)), vec3(0.98));
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, 1.06);
      col = (col - 0.5) * 1.055 + 0.5;
      col += vec3(0.016, 0.007, -0.002) * (1.0 - luma);
      col += vec3(-0.004, 0.002, 0.011) * luma;
      col = max(col, vec3(0.0));
      col += vec3(0.012, 0.018, 0.02) * (1.0 - col);
      col *= 1.0 - vec3(0.03, 0.0, 0.02) * r2;

      float vig = 1.0 - smoothstep(0.2, 0.9, length(c));
      col *= mix(1.0, 0.45 + 0.55 * vig, 0.42 * uVignette);

      float grain = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0) - 0.5;
      col += grain * (0.016 + uDamage * 0.012);
      col *= 1.0 - 0.009 * sin(uv.y * 900.0);
      col += vec3(0.35, 0.015, 0.005) * uDamage * 0.45;
      col = colorVision(max(col, vec3(0.0)));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// A tileable specimen texture for the title-table model. Painted veins keep the
// menu organic without shipping an image asset.
function makeMenuTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#6d3437';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 30 + Math.random() * 130;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${Math.random() > 0.5 ? '30,4,7' : '240,190,165'},0.12)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 30; i++) {
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    let a = Math.random() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      const len = 16 + Math.random() * 34;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      a += (Math.random() - 0.5) * 1.1;
      g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(35,4,8,0.34)';
    g.lineWidth = 1 + Math.random() * 2;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A tiny procedural equirectangular environment. It gives the wet tissue and
// the rifle something real to reflect; without it, PBR metal renders as soot.
function makeEnvironmentTexture(renderer) {
  if (!renderer) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#fff0d8');
  grad.addColorStop(0.16, '#8d6f58');
  grad.addColorStop(0.42, '#2b2520');
  grad.addColorStop(0.66, '#141a16');
  grad.addColorStop(0.85, '#1d2521');
  grad.addColorStop(1, '#050706');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const warm = g.createRadialGradient(300, 110, 8, 300, 110, 330);
  warm.addColorStop(0, 'rgba(255,238,210,0.9)');
  warm.addColorStop(0.3, 'rgba(209,176,142,0.22)');
  warm.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, 1024, 512);
  const cool = g.createRadialGradient(760, 300, 10, 760, 300, 300);
  cool.addColorStop(0, 'rgba(185,205,196,0.2)');
  cool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = cool;
  g.fillRect(0, 0, 1024, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.state = 'boot';
    this.audio = audio;
    this.settings = this.sanitiseSettings(storage.get(`${GAME.saveKey}.settings`, {}));
    this.meta = { ...freshMeta(), ...(storage.get(`${GAME.saveKey}.meta`, {}) || {}) };
    this.normaliseMeta();
    this.checkpoint = this.readCheckpoint();
    this.preview = this.makeCasePreview(hashString(`preview-${this.meta.completed || 0}-${this.meta.runs || 0}`));
    this.patient = this.preview.patient;

    this.renderer = null;
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.camera = null;
    this.scene = null;
    this.menuScene = null;
    this.menuCamera = null;
    this.menuGroup = null;
    this.menuTime = 0;
    this.fx = null;
    this.level = null;
    this.player = null;
    this.boss = null;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.hazards = [];
    this.run = null;
    this.keys = new Set();
    this.actions = new Set();
    this.fire = false;
    this.aim = false;
    // A pad is a second input device, not a replacement. Its axes and held
    // buttons live separately so releasing the controller never clears a held
    // mouse button or a keyboard key.
    this.pad = {
      connected: false,
      moveX: 0,
      moveZ: 0,
      lookX: 0,
      lookY: 0,
      fire: false,
      aim: false,
      interact: false,
      sprint: false,
      jump: false,
    };
    this.padPrev = [];
    this.padHintShown = false;
    this.padMenuTimer = 0;
    this.padMenuDir = 0;
    this.padMenuScreen = null;
    this.hitstop = 0;
    this.pointerLocked = false;
    this.booted = false;
    this.lockErrorAt = 0;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.renderScale = PERFORMANCE.maxRenderScale;
    this.hudTimer = 0;
    this.hudDt = 0;
    this.perf = { frameMs: 16.7, fps: 60, acc: 0, samples: 0, cooldown: 0, scale: this.renderScale, drawCalls: 0, auto: true, bloomAllowed: true };
    this.renderErrorShown = false;
    this.runtimeErrorShown = false;
    this.entryShieldHintShown = false;
    this.perfVisible = false;
    this.perfHudTimer = 0;
    this.heartTimer = 0;
    this.tensionTimer = 0;
    this.focusTimer = 0;
    this.focusTipShown = false;
    this.damageUniform = 0;
    this.victoryTimer = 0;
    this.tips = new Set();
    this.injectionToken = 0;
    this.raf = 0;
    this.enteredRooms = new Set();
    this.pendingWave = null;
    this.spawnQueue = [];
    this.nodeBroodTimer = 0;
    this.skitterTimer = 0;
    this.lastRoomId = null;

    try {
      this.initRenderer();
      this.initPost();
      this.initMenu();
      this.initInput();
      this.ui = new UI(this);
      this.applySettings(false);
      this.showTitle();
      this.loop = this.loop.bind(this);
      this.lastFrame = performance.now();
      requestAnimationFrame(this.loop);
    } catch (err) {
      console.error(err);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div style="position:fixed;inset:0;z-index:9999;background:#080506;color:#f2e6d4;font-family:monospace;padding:40px;display:grid;place-items:center;text-align:center">
          <div><h1 style="color:#ff6a55">NEXUS LINK FAILED</h1><p>WebGL2 is required. Try a current Chrome, Edge or Firefox build with hardware acceleration enabled.</p><pre style="opacity:.6">${String(err.message || err)}</pre></div>
        </div>`
      );
    }
  }

  // ---------------------------------------------------------------- setup
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // The composer renders through an offscreen target, so canvas MSAA buys
      // nothing but memory. Image quality comes from the bloom/grade pipeline.
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.applyRenderScale();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x070506, 1);
    this.envTexture = makeEnvironmentTexture(this.renderer);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 140);
    this.camera.rotation.order = 'YXZ';

    // Suit lamp: a short-range omni wash. A spotlight produced a hard conical
    // pool on the floor that read as a painted path, not light.
    this.headlamp = new THREE.PointLight(0xffd7b8, 0.6, 9, 1.9);
    this.headlamp.position.set(0, 0.1, 0);
    this.camera.add(this.headlamp);

    // Dragging a window edge fires resize dozens of times. Rebuilding every
    // composer target on each event is a guaranteed stutter; coalesce it.
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.resize(), 110);
    });

    // A lost GPU context is recoverable, not a hard crash. Freeze the run so
    // the patient does not die behind a black canvas, tell the player, and
    // rebuild on the restored context.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.state === 'playing') this.pause();
      this.ui?.toast('GRAPHICS DEVICE RESET', 'RECOVERING THE SURGICAL FEED…', 'warn', 8000);
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      // Keep the feed frozen until the page rebuilds. Re-rendering into the
      // restored context uploads textures that were created for the old one
      // and emits driver warnings for a frame the player never needs to see.
      this.contextLost = true;
      // The GPU state is gone with the context. Preserve the run before the
      // full rebuild so a driver reset cannot erase the patient's progress.
      try {
        this.saveCheckpoint();
      } catch {
        /* storage may be unavailable; reload is still the safe recovery */
      }
      this.ui?.toast('FEED RESTORED', 'RE-ENTERING THE THEATRE', 'good', 2400);
      setTimeout(() => location.reload(), 900);
    });
  }

  initPost() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    // Bloom is a highlight, not a light source. At 0.34 every emissive prop
    // grew a halo and the ceiling lamps looked like suns.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.38, 1.02);
    this.gradePass = new ShaderPass(GradeShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
    this.bloomPass.enabled = this.settings.quality === 'high';
    this.resizeBloom();
  }

  // Bloom is a soft veil, not a readable texture. Rendering its mip chain at
  // half resolution is visually identical at speed and removes three quarters
  // of its fragment work on a 2x display.
  resizeBloom() {
    if (!this.bloomPass || !this.renderer) return;
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(16, Math.floor(window.innerWidth * pr * PERFORMANCE.bloomScale));
    const h = Math.max(16, Math.floor(window.innerHeight * pr * PERFORMANCE.bloomScale));
    this.bloomPass.setSize(w, h);
  }

  // A scene swap can leave the bloom pass holding a target from the previous
  // level; the next composite then fills the screen with the stale white mip.
  // Rebuilding the pass at the moment the new organ is installed is cheap (once
  // per transition) and removes the one failure that made a run unplayable.
  refreshBloomPass() {
    if (!this.composer || !this.bloomPass || !this.renderer) return;
    const old = this.bloomPass;
    const index = this.composer.passes.indexOf(old);
    if (index < 0) return;
    const w = Math.max(16, Math.floor(window.innerWidth * this.renderer.getPixelRatio() * PERFORMANCE.bloomScale));
    const h = Math.max(16, Math.floor(window.innerHeight * this.renderer.getPixelRatio() * PERFORMANCE.bloomScale));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.38, 1.02);
    bloom.enabled = this.settings.quality === 'high';
    this.composer.removePass(old);
    this.composer.insertPass(bloom, index);
    old.dispose?.();
    this.bloomPass = bloom;
    this.resizeBloom();
  }

  initMenu() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e0d);
    scene.fog = new THREE.FogExp2(0x0a0e0d, 0.052);
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.32;
    const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 60);
    camera.position.set(0, 0.4, 8.2);

    const hemi = new THREE.HemisphereLight(0xffe2c6, 0x101d19, 0.75);
    scene.add(hemi);
    const key = new THREE.SpotLight(0xffe8cf, 240, 30, 0.6, 1, 1.35);
    key.position.set(-4.5, 7.5, 5.5);
    key.target.position.set(0, 0, 0);
    scene.add(key, key.target);
    const fill = new THREE.PointLight(0xb8c9c0, 14, 17, 2);
    fill.position.set(4, -0.3, 3);
    scene.add(fill);
    const rim = new THREE.PointLight(0xffb18f, 32, 15, 2);
    rim.position.set(3.5, 2.6, -4);
    scene.add(rim);

    // A specimen tray grounds the organic form in a clinical space.
    const tray = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.6, 0.16, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0x161a17,
        metalness: 0.55,
        roughness: 0.32,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
      })
    );
    tray.position.y = -2.75;
    scene.add(tray);

    const group = new THREE.Group();
    scene.add(group);

    const shellGeo = new THREE.IcosahedronGeometry(2.5, 4);
    const pos = shellGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const d = 1 + Math.sin(n.x * 7 + n.y * 5) * 0.035 + Math.sin(n.z * 11) * 0.025;
      pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
    }
    shellGeo.computeVertexNormals();
    const shellMat = new THREE.MeshPhysicalMaterial({
      map: makeMenuTexture(),
      color: 0xffffff,
      emissive: 0x210607,
      emissiveIntensity: 0.2,
      roughness: 0.36,
      metalness: 0.05,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.9,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    group.add(shell);

    const woundMat = new THREE.MeshStandardMaterial({
      color: 0x4a0b0c,
      emissive: 0xc43122,
      emissiveIntensity: 1.7,
      roughness: 0.4,
    });
    const wound = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const nodule = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.22, 10, 8), woundMat);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.7;
      nodule.position.set(0.6 + Math.cos(a) * r, 0.4 + Math.sin(a) * r * 0.8, 2.2 + Math.random() * 0.18);
      wound.add(nodule);
    }
    group.add(wound);
    const woundLight = new THREE.PointLight(0xff4a32, 16, 7, 2);
    woundLight.position.set(0.6, 0.4, 2.5);
    group.add(woundLight);
    this.menuWound = wound;
    this.menuWoundLight = woundLight;

    // A thin pool of fluid catches the surgical light under the specimen.
    const fluid = new THREE.Mesh(
      new THREE.CircleGeometry(3.1, 48),
      new THREE.MeshBasicMaterial({
        color: 0x2a1110,
        transparent: true,
        opacity: 0.45,
      })
    );
    fluid.rotation.x = -Math.PI / 2;
    fluid.position.y = -2.64;
    group.add(fluid);
    this.menuFluid = fluid;

    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(520 * 3);
    for (let i = 0; i < 520; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const r = 3.2 + Math.random() * 4.5;
      dustPos[i * 3] = Math.sin(b) * Math.cos(a) * r;
      dustPos[i * 3 + 1] = Math.cos(b) * r * 0.7;
      dustPos[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xf1d9b8,
        size: 0.022,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      })
    );
    group.add(dust);

    this.menuScene = scene;
    this.menuCamera = camera;
    this.menuGroup = group;
    this.menuTime = 0;
  }

  initInput() {
    window.addEventListener('pointerdown', () => {
      document.documentElement.dataset.input = 'keyboard';
    }, true);
    window.addEventListener('keydown', (e) => {
      document.documentElement.dataset.input = 'keyboard';
      if (e.code === 'F3') {
        e.preventDefault();
        this.togglePerfHud();
        return;
      }
      // Tab is a gameplay key only inside the organ. In menus it must reach the
      // browser so keyboard-only players can traverse every screen control.
      if (this.state !== 'playing') return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
          const text = this.level ? this.level.getObjectiveText(this.player.pos) : 'CLEAR INFECTION';
          this.ui.toast('ACTIVE OBJECTIVE', text, 'info', 5200);
        }
        return;
      }
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        if (e.code === 'KeyR') this.actions.add('reload');
        if (e.code === 'KeyF') this.actions.add('medkit');
        if (e.code === 'KeyQ') this.actions.add('stabilize');
        if (e.code === 'KeyG') this.actions.add('grenade');
        if (e.code === 'KeyV') this.actions.add('focus');
        if (e.code === 'Space') this.actions.add('jump');
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.actions.add('dash');
        if (e.code === 'KeyE') this.actions.add('interact');
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      document.documentElement.dataset.input = 'keyboard';
      if (e.button !== 0 && e.button !== 2) return;
      if (this.state === 'playing') {
        if (document.pointerLockElement !== this.canvas) {
          this.requestLock();
          return;
        }
        if (e.button === 0) this.fire = true;
        else this.aim = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.aim = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) this.requestLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas || this.state !== 'playing' || !this.player) return;
      this.player.look(e.movementX || 0, e.movementY || 0, this.settings.sensitivity, this.settings.invertY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.syncLockHint();
      if (!this.pointerLocked && this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLocked = false;
      this.syncLockHint();
      if (this.state !== 'playing') return;
      const now = performance.now();
      if (now - this.lockErrorAt < 2500) return;
      this.lockErrorAt = now;
      this.ui?.toast('MOUSE CAPTURE BLOCKED', 'CLICK THE VIEW TO AIM', 'warn', 3200);
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        audio.suspendForHidden();
      } else {
        audio.wakeFromHidden();
        this.lastFrame = performance.now();
      }
    });
    // beforeunload is unreliable on mobile Safari and is skipped when a page
    // enters the back/forward cache. pagehide is the durable hook.
    const persist = () => {
      if (this.state === 'playing' && this.run) this.saveCheckpoint();
      audio.suspendForHidden();
    };
    window.addEventListener('pagehide', persist);
    window.addEventListener('beforeunload', persist);
    window.addEventListener('pageshow', () => {
      this.lastFrame = performance.now();
    });
  }

  requestLock() {
    if (!this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p?.catch) p.catch(() => this.syncLockHint());
    } catch {
      this.syncLockHint();
    }
  }

  // The browser can refuse mouse capture (a re-lock within ~1s of Escape, an
  // embedded frame, a permission policy). Say so and keep the game clickable
  // rather than letting input look broken.
  syncLockHint() {
    const el = document.getElementById('aim-lock');
    if (!el) return;
    const supported = typeof this.canvas?.requestPointerLock === 'function';
    const wanted = this.state === 'playing' && !this.pointerLocked && supported && !this.pad.connected;
    el.classList.toggle('hidden', !wanted);
  }

  applyRenderScale() {
    if (!this.renderer) return;
    const quality = this.settings.quality;
    const qualityCap = quality === 'high'
      ? PERFORMANCE.maxPixelRatioHigh
      : PERFORMANCE.maxPixelRatioLow;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, qualityCap);
    // High adapts below 1×; medium holds a high-resolution floor without bloom;
    // low pins the render scale so old laptops get a predictable frame cost.
    const scale = quality === 'low'
      ? PERFORMANCE.lowRenderScale
      : clamp(this.renderScale, quality === 'high' ? PERFORMANCE.minRenderScale : PERFORMANCE.lowRenderScale, PERFORMANCE.maxRenderScale);
    const ratio = Math.max(0.5, this.basePixelRatio * scale);
    this.renderer.setPixelRatio(ratio);
    if (this.perf) {
      this.perf.scale = scale;
      this.perf.ratio = ratio;
    }
  }

  refreshRenderSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.applyRenderScale();
    this.renderer.setSize(w, h);
    // EffectComposer keeps its own pixel ratio. Calling setSize alone would
    // leave its internal targets at the old resolution and quietly make the
    // adaptive governor cosmetic.
    if (this.composer) this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.resizeBloom();
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.menuCamera) {
      this.menuCamera.aspect = w / h;
      this.menuCamera.updateProjectionMatrix();
    }
    if (this.injectCamera) {
      this.injectCamera.aspect = w / h;
      this.injectCamera.updateProjectionMatrix();
    }
  }

  resize() {
    this.refreshRenderSize();
  }

  applySettings(save = true) {
    const s = this.settings;
    audio.setVolume(s.volume);
    // Accessibility is presentation only. These flags reach the camera, the
    // screen shake and CSS — never damage, Host Integrity, timers or scoring.
    document.documentElement.dataset.contrast = s.highContrast ? 'high' : 'normal';
    document.documentElement.dataset.motion = s.reduceMotion ? 'reduced' : 'normal';
    document.documentElement.dataset.vision = COLOR_VISION_MODES.includes(s.colorVision) ? s.colorVision : 'off';
    if (this.gradePass) {
      this.gradePass.uniforms.uColorVision.value = Math.max(0, COLOR_VISION_MODES.indexOf(s.colorVision));
    }
    if (this.player) {
      this.player.baseFov = s.fov;
      this.player.applyCamera();
    }
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (this.fx) {
      this.fx.shakeScale = s.reduceMotion ? 0 : s.shake;
      this.fx.motionScale = s.reduceMotion ? 0 : 1;
    }
    if (this.gradePass) this.gradePass.uniforms.uAberration.value = s.aberration ? 1 : 0;
    if (this.bloomPass) this.bloomPass.enabled = s.quality === 'high';
    this.refreshRenderSize();
    if (save) this.save();
  }

  updateSetting(key, value, persist = true) {
    if (key === 'quality') {
      value = ['low', 'medium', 'high'].includes(value) ? value : value ? 'high' : 'low';
      this.renderScale = PERFORMANCE.maxRenderScale;
      if (this.perf) {
        this.perf.acc = 0;
        this.perf.samples = 0;
        this.perf.cooldown = 0;
        this.perf.bloomAllowed = true;
        this.perf.emergency = false;
      }
    }
    this.settings[key] = value;
    this.applySettings(persist);
  }

  save() {
    storage.set(`${GAME.saveKey}.settings`, this.settings);
    storage.set(`${GAME.saveKey}.meta`, this.meta);
  }

  recordStat(key, amount = 1) {
    const stats = this.meta.stats;
    stats[key] = (stats[key] || 0) + amount;
    this.checkDirectives();
  }

  checkDirectives() {
    let changed = false;
    for (const directive of DIRECTIVES) {
      if (this.meta.claimed.includes(directive.id)) continue;
      if ((this.meta.stats[directive.stat] || 0) < directive.target) continue;
      this.meta.claimed.push(directive.id);
      this.meta.rp = (this.meta.rp || 0) + directive.reward;
      this.ui.toast('DIRECTIVE COMPLETE', `${directive.name} // +${directive.reward} RP`, 'good', 5600);
      changed = true;
    }
    if (changed) this.save();
  }

  exportSave() {
    const data = {
      game: 'microcure',
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: this.meta,
      settings: this.settings,
    };
    downloadFile(`microcure-save-${Date.now()}.json`, JSON.stringify(data, null, 2));
    this.ui.toast('SAVE EXPORTED', 'PORTABLE JSON // LOCAL RECORD', 'good');
  }

  async importSave(file) {
    try {
      const text = await readFileText(file);
      const data = JSON.parse(text);
      if (!data || data.game !== 'microcure' || !data.meta) return false;
      this.meta = { ...freshMeta(), ...data.meta };
      this.normaliseMeta();
      this.settings = this.sanitiseSettings(data.settings);
      this.preview = null;
      this.patient = null;
      this.save();
      this.applySettings(true);
      return true;
    } catch {
      return false;
    }
  }

  // Imported saves are JSON from disk, not trusted runtime state. Clamp the
  // controls that feed shaders and the mixer so a hand-edited file cannot set
  // NaN FOV, negative volume or an unknown quality tier.
  sanitiseSettings(raw) {
    const settings = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object') return settings;
    if (Number.isFinite(raw.sensitivity)) settings.sensitivity = clamp(raw.sensitivity, 0.2, 2.5);
    if (Number.isFinite(raw.fov)) settings.fov = clamp(raw.fov, 65, 100);
    if (Number.isFinite(raw.volume)) settings.volume = clamp(raw.volume, 0, 1);
    if (Number.isFinite(raw.shake)) settings.shake = clamp(raw.shake, 0, 1.5);
    if (typeof raw.invertY === 'boolean') settings.invertY = raw.invertY;
    if (typeof raw.aberration === 'boolean') settings.aberration = raw.aberration;
    if (typeof raw.highContrast === 'boolean') settings.highContrast = raw.highContrast;
    if (typeof raw.reduceMotion === 'boolean') settings.reduceMotion = raw.reduceMotion;
    if (COLOR_VISION_MODES.includes(raw.colorVision)) settings.colorVision = raw.colorVision;
    if (['low', 'medium', 'high'].includes(raw.quality)) settings.quality = raw.quality;
    return settings;
  }

  normaliseMeta() {
    if (!Array.isArray(this.meta.unlocked)) this.meta.unlocked = [];
    if (!Array.isArray(this.meta.claimed)) this.meta.claimed = [];
    if (!this.meta.stats || typeof this.meta.stats !== 'object') this.meta.stats = {};
    if (!this.meta.medals || typeof this.meta.medals !== 'object') this.meta.medals = {};
    this.meta.stats = { ...DEFAULT_META.stats, ...this.meta.stats };
    for (const key of Object.keys(DEFAULT_META.stats)) {
      if (!Number.isFinite(this.meta.stats[key])) this.meta.stats[key] = 0;
    }
    for (const key of ['rp', 'bestScore', 'bestChain', 'runs', 'completed']) {
      this.meta[key] = Number.isFinite(this.meta[key]) ? Math.max(0, Math.floor(this.meta[key])) : 0;
    }
    this.meta.unlocked = this.meta.unlocked.filter((id) => typeof id === 'string').slice(0, 64);
    this.meta.claimed = this.meta.claimed.filter((id) => typeof id === 'string').slice(0, 64);
    if (this.meta.bestGrade && !GRADES.some((g) => g.grade === this.meta.bestGrade)) this.meta.bestGrade = null;
  }

  resetProgress() {
    this.meta = freshMeta();
    this.settings = { ...DEFAULT_SETTINGS };
    this.checkpoint = null;
    this.preview = null;
    this.patient = null;
    storage.remove(CHECKPOINT_KEY);
    this.save();
    this.applySettings(true);
    this.showTitle();
    this.ui.toast('RECORDS ERASED', 'NEXUS HAS NO MEMORY OF YOU', 'warn');
  }

  // ---------------------------------------------------------------- state
  showTitle() {
    this.cleanupRun();
    this.state = 'title';
    this.fire = false;
    this.keys.clear();
    this.actions.clear();
    this.ui.hideScreens?.();
    this.ui.setHudVisible(false);
    this.ui.hideBoss();
    this.ui.hideInjection();
    this.ui.showTitle();
    this.dismissBoot();
    this.checkpoint = this.readCheckpoint();
    audio.stopAmbient();
    audio.setBossLayer(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  returnToTitle() {
    this.showTitle();
  }

  // The boot layer is plain HTML so it paints before the module graph does.
  // Remove it only after the title has had a frame to render behind it.
  dismissBoot() {
    if (this.booted) return;
    this.booted = true;
    const el = document.getElementById('boot');
    if (!el) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.add('boot-out');
        setTimeout(() => el.remove(), 700);
      })
    );
  }

  openHub() {
    this.cleanupRun();
    this.ensurePreview();
    this.state = 'hub';
    this.keys.clear();
    this.actions.clear();
    this.fire = false;
    this.ui.setHudVisible(false);
    this.ui.showHub();
    audio.stopAmbient();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  openCaseFile() {
    if (this.state === 'playing' || this.state === 'paused') this.cleanupRun();
    this.ensurePreview();
    this.state = 'case';
    this.fire = false;
    this.ui.showCaseFile();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  openLoadout() {
    this.state = 'loadout';
    this.fire = false;
    this.ui.showLoadout();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.fire = false;
    this.aim = false;
    this.hitstop = 0;
    this.keys.clear();
    this.actions.clear();
    this.ui.setCrisisActive(false);
    this.ui.showPause();
    this.syncLockHint();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.fire = false;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.hudTimer = 0;
    this.renderErrorShown = false;
    this.runtimeErrorShown = false;
    this.entryShieldHintShown = false;
    this.ui.hideScreens();
    this.ui.setHudVisible(true);
    this.ui.setCrisisActive(!!this.level?.crisis?.active);
    this.requestLock();
    // Chrome rejects a re-lock for about a second after Escape. If the lock did
    // not take, show the click target instead of leaving the camera dead.
    setTimeout(() => this.syncLockHint(), 360);
  }

  startRun(disciplineId) {
    this.cleanupRun();
    this.runtimeErrorShown = false;
    this.entryShieldHintShown = false;
    this.injectionToken++;
    this.requestLock();
    this.state = 'injecting';
    this.fire = false;
    this.keys.clear();
    this.actions.clear();
    this.ui.hideScreens();
    this.ui.setHudVisible(false);
    this.syncLockHint();

    const preview = this.ensurePreview();
    const seed = preview.seed;
    const runRng = new RNG(seed ^ 0x9e3779b9);
    const patient = preview.patient;
    const organs = preview.organs;
    const protocol = preview.protocol || PROTOCOLS[0];
    const mutation = MUTATIONS.find((m) => m.id === patient.mutationId) || runRng.pick(MUTATIONS);
    const bossDef = (this.meta.completed || 0) === 0 ? BOSS_VARIANTS[0] : runRng.pick(BOSS_VARIANTS);
    const discipline = DISCIPLINES.find((d) => d.id === disciplineId) || DISCIPLINES[0];
    const unlocked = (id) => this.meta.unlocked.includes(id);
    const suit = (unlocked('suit') ? 15 : 0) + (unlocked('armor') ? 20 : 0);
    const scaffold = unlocked('scaffold') ? 0.75 : 1;
    const extraStab = unlocked('stabilizer') ? 1 : 0;
    const hostBonus = unlocked('host') ? 10 : 0;
    const protocolHost = protocol.hostMax || 0;
    const hostCap = Math.max(25, HOST.max + Math.max(0, mutation.startHost || 0) + hostBonus + protocolHost);
    const startHost = Math.max(25, HOST.max + (mutation.startHost || 0) + hostBonus + protocolHost);
    const protocolAmmo = Math.round(WEAPON.reserve * ((protocol.ammoMult || 1) - 1));
    this.patient = patient;
    this.run = {
      seed,
      rng: runRng,
      patient,
      organs,
      organCursor: 0,
      caseIndex: (this.meta.completed || 0) + 1,
      tier: this.caseTier(),
      bossDef,
      mutation,
      protocol,
      scoreMult: protocol.scoreMult || 1,
      protocolRp: protocol.rp || 0,
      route: null,
      routePending: false,
      adaptation: null,
      discipline,
      hostMax: hostCap,
      host: Math.min(hostCap, startHost),
      damageMult: discipline.mods.damage * (unlocked('rifle') ? 1.12 : 1),
      nodeDamageMult: (discipline.mods.nodeDamage || 1) * (unlocked('pathology') ? 1.2 : 1),
      collateralMult: discipline.mods.collateral * (mutation.collateral || 1) * scaffold,
      cauteryMult: unlocked('cautery') ? 1.5 : 1,
      fireRateMult: discipline.mods.fireRate || 1,
      reloadMult: (discipline.mods.reload || 1) * (unlocked('loader') ? 0.85 : 1),
      dashCooldownMult: unlocked('adrenal') ? 0.85 : 1,
      medkitHealMult: unlocked('trauma') ? 1.25 : 1,
      reserveBonus: (discipline.mods.reserve || 0) + protocolAmmo,
      enemySlowMult: 1,
      adaptations: [],
      ammoBonus: unlocked('reserve') ? 60 : 0,
      medkitBonus: unlocked('medkit') ? 1 : 0,
      hostDrainMult: mutation.hostDrain || 1,
      stabilizeMult: mutation.stabilize || 1,
      timer: 0,
      totalTime: 0,
      organTime: 0,
      focus: 0,
      score: 0,
      chain: 0,
      chainTimer: 0,
      chainBest: 0,
      organIndex: 0,
      nodesTotalAll: 0,
      nodesClearedTotal: 0,
      cleanTotal: 0,
      collateral: 0,
      kills: 0,
      shots: 0,
      hits: 0,
      injections: PLAYER.injections,
      hasCautery: false,
      boss: null,
      bossDefeated: false,
      ended: false,
      resumed: false,
      suit,
      extraStab,
    };
    this.meta.runs = (this.meta.runs || 0) + 1;
    this.save();
    storage.remove(CHECKPOINT_KEY);
    this.checkpoint = null;
    this.preview = null;

    this.ui.playInjection(ORGANS[organs[0]], () => this.loadOrgan(organs[0]));
  }

  // A case is a patient, a procedural route and the condition they brought in.
  // The preview is generated once and then actually used by startRun, so the
  // chart on the board is never lying about the route.
  makeCasePreview(seed = this.newSeed()) {
    const rng = new RNG((seed >>> 0) ^ 0x85ebca6b);
    const patient = generatePatient(rng, (this.meta.completed || 0) + 1);
    const firstCase = (this.meta.completed || 0) === 0;
    const pool = PROTOCOLS.filter((p) => !firstCase || p.onboarding !== false);
    const protocol = rng.pick(pool);
    return { seed: seed >>> 0 || 1, patient, protocol, organs: this.rollOrgans(rng) };
  }

  ensurePreview() {
    if (!this.preview) this.preview = this.makeCasePreview();
    this.patient = this.preview.patient;
    return this.preview;
  }

  caseTier() {
    return Math.min(9, 1 + Math.floor((this.meta.completed || 0) / 3));
  }

  rollAdaptationOffers(count = 3) {
    if (!this.run) return [];
    const owned = new Set(this.run.adaptations || []);
    const pool = ADAPTATIONS.filter((a) => !owned.has(a.id));
    if (pool.length <= count) return pool;
    const cursor = (this.run.organCursor || 0) + 1;
    const seed = (this.run.seed ^ 0x27d4eb2d ^ (cursor * 0x9e3779b9)) >>> 0;
    return new RNG(seed).shuffle(pool).slice(0, count);
  }

  rollOrgans(rng) {
    const pool = ['lung', 'liver', 'kidney', 'brain', 'marrow', 'intestine', 'lymph'];
    const tier = this.caseTier();
    const nonFinal = tier >= 2 ? 3 : 2;
    const start = (this.meta.completed || 0) === 0 ? 'lung' : rng.pick(pool);
    const middle = rng.shuffle(pool.filter((id) => id !== start)).slice(0, nonFinal - 1);
    return [start, ...middle, 'heart'];
  }

  newSeed() {
    if (window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] || 1;
    }
    return (Math.random() * 0xffffffff) >>> 0 || 1;
  }

  resumeCheckpoint() {
    const cp = this.checkpoint;
    // A stale Continue button must never be a dead click.
    if (!cp) {
      this.showTitle();
      return;
    }
    const mutation = MUTATIONS.find((m) => m.id === cp.mutationId) || MUTATIONS[0];
    const discipline = DISCIPLINES.find((d) => d.id === cp.disciplineId) || DISCIPLINES[0];
    const protocol = PROTOCOLS.find((p) => p.id === cp.protocolId) || this.preview?.protocol || PROTOCOLS[0];
    const route = ROUTES.find((r) => r.id === cp.routeId) || null;
    const adaptation = ADAPTATIONS.find((a) => a.id === cp.adaptationId) || null;
    this.cleanupRun();
    this.runtimeErrorShown = false;
    this.entryShieldHintShown = false;
    this.requestLock();
    this.state = 'injecting';
    this.ui.hideScreens();
    this.ui.setHudVisible(false);
    this.patient = cp.patient || this.ensurePreview().patient;
    this.run = {
      seed: cp.seed,
      rng: new RNG(cp.seed ^ 0x9e3779b9),
      patient: this.patient,
      organs: cp.organs || this.preview?.organs || ['lung', 'heart'],
      organCursor: cp.organCursor || 0,
      caseIndex: cp.caseIndex || 1,
      tier: cp.tier || this.caseTier(),
      mutation,
      protocol,
      scoreMult: cp.scoreMult || protocol.scoreMult || 1,
      protocolRp: protocol.rp || 0,
      bossDef: BOSS_VARIANTS.find((b) => b.id === cp.bossId) || BOSS_VARIANTS[0],
      route,
      routePending: cp.routePending || false,
      adaptation,
      discipline,
      hostMax: cp.hostMax,
      host: cp.host,
      damageMult: cp.damageMult,
      nodeDamageMult: cp.nodeDamageMult || 1,
      collateralMult: cp.collateralMult,
      cauteryMult: cp.cauteryMult || 1,
      fireRateMult: cp.fireRateMult || discipline.mods.fireRate || 1,
      reloadMult: cp.reloadMult || (discipline.mods.reload || 1) * (this.meta.unlocked.includes('loader') ? 0.85 : 1),
      dashCooldownMult: cp.dashCooldownMult || (this.meta.unlocked.includes('adrenal') ? 0.85 : 1),
      medkitHealMult: cp.medkitHealMult || (this.meta.unlocked.includes('trauma') ? 1.25 : 1),
      reserveBonus: cp.reserveBonus || discipline.mods.reserve || 0,
      enemySlowMult: cp.enemySlowMult || 1,
      adaptations: cp.adaptations || [],
      ammoBonus: cp.ammoBonus || 0,
      medkitBonus: cp.medkitBonus || 0,
      hostDrainMult: cp.hostDrainMult,
      stabilizeMult: cp.stabilizeMult,
      timer: cp.timer,
      totalTime: cp.totalTime || 0,
      organTime: 0,
      organIndex: ORGANS[cp.organId]?.index || 1,
      nodesTotalAll: cp.nodesTotalAll || 0,
      nodesClearedTotal: cp.nodesClearedTotal || 0,
      cleanTotal: cp.cleanTotal || 0,
      focus: cp.focus || 0,
      score: cp.score || 0,
      chain: cp.chain || 0,
      chainTimer: cp.chainTimer || 0,
      chainBest: cp.chainBest || 0,
      collateral: cp.collateral || 0,
      kills: 0,
      shots: 0,
      hits: 0,
      injections: cp.injections || PLAYER.injections,
      hasCautery: cp.player?.hasCautery || false,
      boss: null,
      bossDefeated: false,
      ended: false,
      resumed: true,
      suit: cp.suit || 0,
      extraStab: cp.extraStab || 0,
    };
    if (cp.stage === 'interorgan' && cp.interorgan) {
      this.restoreInterorgan(cp);
      return;
    }
    this.ui.playInjection(ORGANS[cp.organId], () => this.loadOrgan(cp.organId, cp));
  }

  // Reloading on the route screen must restore the choice the player was
  // actually making, not silently replay an organ they already cleared.
  restoreInterorgan(cp) {
    const cursor = cp.organCursor;
    const currentId = cp.organs[cursor];
    const def = ORGANS[currentId];
    const nextId = cp.organs[cursor + 1] || 'heart';
    const stop = cp.interorgan;
    this.state = 'interorgan';
    this.fire = false;
    this.keys.clear();
    this.actions.clear();
    this.hudTimer = 0;
    this.victoryTimer = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.hideScreens();
    this.ui.setHudVisible(false);
    this.ui.hideBoss();
    this.audio.stopAmbient();
    this.run.organTime = stop.time || 0;
    const data = {
      organId: currentId,
      organName: def.name,
      copy: def.complete,
      host: stop.host,
      nodesCleared: stop.nodesCleared,
      nodesTotal: stop.nodesTotal,
      clean: stop.clean,
      time: stop.time,
      organIndex: cursor + 1,
      organTotal: cp.organs.length,
      adaptations: this.rollAdaptationOffers(),
      installed: (this.run.adaptations || []).length,
      nextName: ORGANS[nextId].name,
      nextSubtitle: ORGANS[nextId].subtitle,
    };
    this.ui.interorgan = data;
    this.ui.selectedAdaptation = stop.selectedAdaptation;
    this.ui.selectedRoute = stop.selectedRoute;
    this.ui.showInterOrgan();
    this.save();
  }

  saveCheckpoint() {
    if (!this.run || !this.level || !this.player) return;
    const cp = {
      game: 'microcure',
      version: 2,
      seed: this.run.seed,
      patient: this.run.patient,
      organs: this.run.organs,
      organCursor: this.run.organCursor || 0,
      caseIndex: this.run.caseIndex || 1,
      tier: this.run.tier || 1,
      bossId: this.run.bossDef?.id,
      mutationId: this.run.mutation?.id,
      protocolId: this.run.protocol?.id,
      scoreMult: this.run.scoreMult || 1,
      disciplineId: this.run.discipline?.id,
      routeId: this.run.route?.id || null,
      routePending: this.run.routePending || false,
      adaptationId: this.run.adaptation?.id || null,
      organId: this.level.organId,
      host: this.run.host,
      hostMax: this.run.hostMax,
      damageMult: this.run.damageMult,
      nodeDamageMult: this.run.nodeDamageMult || 1,
      collateralMult: this.run.collateralMult,
      cauteryMult: this.run.cauteryMult || 1,
      fireRateMult: this.run.fireRateMult || 1,
      reloadMult: this.run.reloadMult || 1,
      dashCooldownMult: this.run.dashCooldownMult || 1,
      medkitHealMult: this.run.medkitHealMult || 1,
      reserveBonus: this.run.reserveBonus || 0,
      enemySlowMult: this.run.enemySlowMult || 1,
      adaptations: this.run.adaptations || [],
      ammoBonus: this.run.ammoBonus || 0,
      medkitBonus: this.run.medkitBonus || 0,
      hostDrainMult: this.run.hostDrainMult,
      stabilizeMult: this.run.stabilizeMult,
      timer: this.run.timer,
      totalTime: this.run.totalTime,
      nodesTotalAll: this.run.nodesTotalAll,
      nodesClearedTotal: this.run.nodesClearedTotal,
      cleanTotal: this.run.cleanTotal,
      focus: this.run.focus || 0,
      score: this.run.score || 0,
      chain: this.run.chain || 0,
      chainTimer: this.run.chainTimer || 0,
      chainBest: this.run.chainBest || 0,
      collateral: this.run.collateral,
      injections: this.run.injections,
      suit: this.run.suit,
      extraStab: this.run.extraStab,
      stage: this.state === 'interorgan' ? 'interorgan' : 'organ',
      interorgan: this.state === 'interorgan' && this.run.interorgan ? { ...this.run.interorgan } : null,
      player: {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        ammoMag: this.player.ammoMag,
        ammoReserve: this.player.ammoReserve,
        medkits: this.player.medkits,
        stabilizerMax: this.player.stabilizerMax,
        stabilizers: this.player.stabilizers,
        grenades: this.player.grenades,
        hasCautery: this.player.hasCautery,
        fireRateMult: this.player.fireRateMult,
        collateralMult: this.player.collateralMult,
        moveSpeedMult: this.player.moveSpeedMult,
        dashCooldownMult: this.player.dashCooldownMult,
        reloadMult: this.player.reloadMult,
        medkitHealMult: this.player.medkitHealMult,
        cauteryCooldownMult: this.player.cauteryCooldownMult,
      },
    };
    storage.set(CHECKPOINT_KEY, cp);
    this.checkpoint = cp;
  }

  clearCheckpoint() {
    this.checkpoint = null;
    storage.remove(CHECKPOINT_KEY);
  }

  // A checkpoint is untrusted input: it may be from an older build, a failed
  // write or a hand-edited save. Bad data must offer a new case, not crash the
  // continue button. Every number that reaches the HUD, damage maths or the
  // player's saved stats is bounded here; unknown string ids are resolved to
  // data defaults by resumeCheckpoint.
  sanitiseCheckpoint(cp) {
    const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);
    const bounded = (v, lo, hi, fallback) => (Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
    const integer = (v, lo, hi, fallback) => Math.round(bounded(v, lo, hi, fallback));
    const organs = [...new Set(cp.organs)].slice(0, 8);
    const hostMax = bounded(cp.hostMax, 25, 1000, HOST.max);
    const patient = cp.patient && typeof cp.patient === 'object' && typeof cp.patient.name === 'string'
      ? cp.patient
      : undefined;
    const raw = cp.player && typeof cp.player === 'object' ? cp.player : null;
    // A route-stop checkpoint is only valid when the saved cursor still points
    // at the organ that was just cleared, so a hand-edited cursor cannot
    // restore a screen describing an organ the run never reached.
    const stopCursor = Math.round(Number.isFinite(cp.organCursor) ? cp.organCursor : -1);
    const routeStop =
      cp.stage === 'interorgan' &&
      cp.interorgan &&
      typeof cp.interorgan === 'object' &&
      stopCursor >= 0 &&
      stopCursor < organs.length - 1 &&
      organs[stopCursor] === cp.organId;
    const stop = routeStop ? cp.interorgan : null;
    const interorgan = routeStop
      ? {
          organId: cp.organId,
          nodesCleared: integer(stop.nodesCleared, 0, 10000, 0),
          nodesTotal: integer(stop.nodesTotal, 0, 10000, 0),
          clean: integer(stop.clean, 0, 100000, 0),
          time: bounded(stop.time, 0, 21600, 0),
          host: bounded(stop.host, 1, hostMax, hostMax),
          selectedAdaptation: ADAPTATIONS.some((a) => a.id === stop.selectedAdaptation) ? stop.selectedAdaptation : null,
          selectedRoute: ROUTES.some((r) => r.id === stop.selectedRoute) ? stop.selectedRoute : null,
        }
      : null;
    let player;
    if (raw) {
      const maxHp = bounded(raw.maxHp, 25, 10000, PLAYER.maxHp);
      const stabilizerMax = integer(raw.stabilizerMax, 0, 99, PLAYER.stabilizers);
      player = {
        ...raw,
        maxHp,
        hp: bounded(raw.hp, 1, maxHp, maxHp),
        ammoMag: integer(raw.ammoMag, 0, 999, WEAPON.mag),
        ammoReserve: integer(raw.ammoReserve, 0, 9999, WEAPON.reserve),
        medkits: integer(raw.medkits, 0, 99, PLAYER.medkits),
        stabilizerMax,
        stabilizers: integer(raw.stabilizers, 0, stabilizerMax, stabilizerMax),
        grenades: integer(raw.grenades, 0, 9, PLAYER.grenades),
        hasCautery: !!raw.hasCautery,
        fireRateMult: bounded(raw.fireRateMult, 0.1, 5, 1),
        collateralMult: bounded(raw.collateralMult, 0.1, 5, 1),
        moveSpeedMult: bounded(raw.moveSpeedMult, 0.1, 5, 1),
        dashCooldownMult: bounded(raw.dashCooldownMult, 0.1, 5, 1),
        reloadMult: bounded(raw.reloadMult, 0.1, 5, 1),
        medkitHealMult: bounded(raw.medkitHealMult, 0.1, 5, 1),
        cauteryCooldownMult: bounded(raw.cauteryCooldownMult, 0.1, 5, 1),
      };
    }
    return {
      ...cp,
      organs,
      organCursor: integer(cp.organCursor, 0, Math.max(0, organs.length - 1), 0),
      caseIndex: integer(cp.caseIndex, 1, 9999, 1),
      tier: integer(cp.tier, 1, 50, 1),
      scoreMult: bounded(cp.scoreMult, 0.5, 5, 1),
      patient,
      hostMax,
      host: bounded(cp.host, 1, hostMax, hostMax),
      damageMult: bounded(cp.damageMult, 0.1, 5, 1),
      nodeDamageMult: bounded(cp.nodeDamageMult, 0.1, 5, 1),
      collateralMult: bounded(cp.collateralMult, 0.1, 5, 1),
      cauteryMult: bounded(cp.cauteryMult, 0.1, 5, 1),
      fireRateMult: bounded(cp.fireRateMult, 0.1, 5, 1),
      reloadMult: bounded(cp.reloadMult, 0.1, 5, 1),
      dashCooldownMult: bounded(cp.dashCooldownMult, 0.1, 5, 1),
      medkitHealMult: bounded(cp.medkitHealMult, 0.1, 5, 1),
      reserveBonus: integer(cp.reserveBonus, 0, 999, 0),
      enemySlowMult: bounded(cp.enemySlowMult, 0.1, 3, 1),
      hostDrainMult: bounded(cp.hostDrainMult, 0, 8, 1),
      stabilizeMult: bounded(cp.stabilizeMult, 0.1, 5, 1),
      ammoBonus: integer(cp.ammoBonus, 0, 999, 0),
      medkitBonus: integer(cp.medkitBonus, 0, 99, 0),
      timer: bounded(cp.timer, 1, 21600, 600),
      totalTime: bounded(cp.totalTime, 0, 1000000, 0),
      nodesTotalAll: integer(cp.nodesTotalAll, 0, 100000, 0),
      nodesClearedTotal: integer(cp.nodesClearedTotal, 0, 100000, 0),
      cleanTotal: integer(cp.cleanTotal, 0, 100000, 0),
      focus: bounded(cp.focus, 0, 1000, 0),
      score: bounded(cp.score, 0, 1e9, 0),
      chain: integer(cp.chain, 0, 999, 0),
      chainTimer: bounded(cp.chainTimer, 0, 60, 0),
      chainBest: integer(cp.chainBest, 0, 999, 0),
      collateral: bounded(cp.collateral, 0, 100000, 0),
      injections: integer(cp.injections, 1, 9, PLAYER.injections),
      suit: integer(cp.suit, 0, 1000, 0),
      extraStab: integer(cp.extraStab, 0, 99, 0),
      routePending: !!cp.routePending,
      stage: routeStop ? 'interorgan' : 'organ',
      interorgan,
      adaptations: Array.isArray(cp.adaptations)
        ? cp.adaptations.filter((id) => ADAPTATIONS.some((a) => a.id === id)).slice(0, 12)
        : [],
      player,
    };
  }

  readCheckpoint() {
    const cp = storage.get(CHECKPOINT_KEY, null);
    if (!cp || typeof cp !== 'object') return null;
    if (!Number.isFinite(cp.seed) || !ORGANS[cp.organId]) return null;
    if (!Array.isArray(cp.organs) || !cp.organs.length) return null;
    if (!cp.organs.every((id) => !!ORGANS[id])) return null;
    if (!Number.isFinite(cp.host) || !Number.isFinite(cp.timer)) return null;
    return this.sanitiseCheckpoint(cp);
  }

  // ---------------------------------------------------------------- organ loading
  buildPlayerStats() {
    const d = this.run.discipline;
    const suit = this.run.suit || 0;
    const extraStab = this.run.extraStab || 0;
    return {
      maxHp: PLAYER.maxHp + suit + (d.mods.maxHp || 0),
      hp: PLAYER.maxHp + suit + (d.mods.maxHp || 0),
      medkits: PLAYER.medkits + d.mods.extraMedkit + (this.run.mutation.extraMedkit || 0) + (this.run.route?.medkit || 0) + (this.run.medkitBonus || 0),
      stabilizers: PLAYER.stabilizers + d.mods.extraStabilizer + extraStab + (this.run.protocol?.stabilizers || 0),
      grenades: PLAYER.grenades,
      reserveBonus: (this.run.ammoBonus || 0) + (this.run.reserveBonus || 0),
      fireRateMult: this.run.fireRateMult || d.mods.fireRate || 1,
      collateralMult: this.run.collateralMult,
    };
  }

  setupNewScene(organId) {
    const def = ORGANS[organId];
    const palette = def.palette;
    this.disposeOrgan();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(palette.fog);
    this.scene.fog = new THREE.FogExp2(palette.fog, organId === 'heart' ? 0.023 : 0.019);
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.26;
    const protocolLight = this.run?.protocol?.light || 1;
    const hemi = new THREE.HemisphereLight(palette.glow, palette.tissueDeep, 0.62 * protocolLight);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffdcb8, 0.76 * protocolLight);
    key.position.set(6, 14, 3);
    this.scene.add(key);
    // One key direction plus the hemisphere carries the whole organ. The old
    // rim and fill directions were nearly invisible on tissue but multiplied
    // every lit fragment; the roaming room lights provide local shape.
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);
    this.fx = new FX(this.scene, this.camera);
    this.fx.setBiome(palette);
    // FX is rebuilt per organ, after the boot-time applySettings call. Seed its
    // presentation scales here or a persisted accessibility preset silently
    // reverts until the player opens Settings again.
    this.fx.motionScale = this.settings.reduceMotion ? 0 : 1;
    this.fx.shakeScale = this.settings.reduceMotion ? 0 : this.settings.shake;
    this.level = new Level(this.scene, organId, this.run.seed, this.run, this);
  }

  loadOrgan(organId, checkpoint = null) {
    const def = ORGANS[organId];
    this.setupNewScene(organId);
    const spawn = { x: 0, z: 4 };
    const firstOrgan = !this.player;
    if (firstOrgan || !this.player.camera) {
      this.player = new Player(this.camera, this);
    }

    if (checkpoint?.player) {
      const p = checkpoint.player;
      this.player.maxHp = p.maxHp;
      this.player.hp = p.hp;
      this.player.ammoMag = p.ammoMag;
      this.player.ammoReserve = p.ammoReserve;
      this.player.medkits = p.medkits;
      this.player.stabilizerMax = p.stabilizerMax;
      this.player.stabilizers = p.stabilizers;
      this.player.grenades = p.grenades;
      this.player.hasCautery = p.hasCautery;
      this.player.fireRateMult = p.fireRateMult || this.run.fireRateMult || 1;
      this.player.collateralMult = p.collateralMult || this.run.collateralMult;
      this.player.moveSpeedMult = p.moveSpeedMult || 1;
      this.player.dashCooldownMult = p.dashCooldownMult || this.run.dashCooldownMult || 1;
      this.player.reloadMult = p.reloadMult || this.run.reloadMult || 1;
      this.player.medkitHealMult = p.medkitHealMult || this.run.medkitHealMult || 1;
      this.player.cauteryCooldownMult = p.cauteryCooldownMult || 1;
      this.player.injections = checkpoint.injections;
    } else if (firstOrgan || this.player.hp <= 0) {
      this.player.setupStats(this.buildPlayerStats());
      this.player.hasCautery = this.run.hasCautery;
      this.player.fireRateMult = this.run.fireRateMult || 1;
      this.player.reloadMult = this.run.reloadMult || 1;
      if (firstOrgan) {
        this.player.dashCooldownMult = this.run.dashCooldownMult || 1;
        this.player.medkitHealMult = this.run.medkitHealMult || 1;
      }
    } else {
      this.player.hasCautery = this.run.hasCautery;
      this.player.collateralMult = this.run.collateralMult;
      this.player.fireRateMult = this.run.fireRateMult || this.player.fireRateMult;
      this.player.reloadMult = this.run.reloadMult || this.player.reloadMult;
    }

    this.player.baseFov = this.settings.fov;
    // Swap the discipline's hardware before the first frame so the rifle the
    // player saw on the loadout card is the one in their hands.
    this.player.setKit(this.run.discipline?.id || 'trauma');
    this.player.resetForLevel(spawn.x, spawn.z, 0);
    this.enemies = [];
    this.attackSlotCount = 0;
    this.projectiles = [];
    this.pickups = [];
    this.hazards = [];
    this.boss = null;
    this.enteredRooms = new Set();
    this.pendingWave = null;
    this.spawnQueue = [];
    this.nodeBroodTimer = COMBAT.nodeBroodInterval * 0.55;
    this.skitterTimer = 0;
    this.lastRoomId = null;
    this.focusTimer = 0;
    this.cullTimer = 0;

    const spawns = this.level.enemySpawns;
    const initialCap = Math.min(spawns.length, COMBAT.broodCap);
    for (let i = 0; i < initialCap; i++) {
      const s = spawns[i];
      const enemyDef = ENEMIES[s.type];
      if (!enemyDef) continue;
      const enemy = new Enemy(this.scene, this.level, enemyDef, s.x, s.z, this, this.run.seed + i * 19, s.elite || null);
      this.enemies.push(enemy);
    }

    if (organId === 'heart') {
      this.boss = new Boss(this.scene, this.level, this);
      this.run.boss = this.boss;
    } else {
      this.run.boss = null;
    }

    this.run.organIndex = def.index;
    this.run.organTime = 0;
    this.organHazard = ORGAN_HAZARDS[organId] || null;
    this.organHazardTimer = this.organHazard ? this.organHazard.interval * 0.7 : Infinity;
    this.run.nodesTotalAll += this.level.nodes.length;
    if (!checkpoint) {
      const routeTime = (this.run.organCursor || 0) > 0 ? this.run.route?.timer || 0 : 0;
      const protocolTime = this.run.protocol?.timer || 0;
      this.run.timer = Math.max(120, def.timer + routeTime + protocolTime);
    } else {
      this.run.timer = checkpoint.timer;
    }
    this.run.host = clamp(this.run.host, 1, this.run.hostMax);
    this.player.injections = this.run.injections;
    // Compile every organ shader while the injection overlay still covers the
    // viewport. Without this the first combat frame pays a 100 ms compile.
    this.refreshBloomPass();
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      /* a failed prewarm must never block the operation */
    }
    this.heartTimer = 0.4;
    this.tensionTimer = 0;
    this.accumulator = 0;
    this.state = 'playing';
    this.ui.hideScreens();
    this.ui.setHudVisible(true);
    this.ui.fadeIn(600);
    this.ui.showChapter(def.name, def.subtitle);
    this.audio.startAmbient(organId);
    this.audio.setBossLayer(false);
    this.tips.clear();
    this.showTip(
      'intro',
      organId === 'lung'
        ? 'WASD · SPACE jump · SHIFT dash · LMB fire · RMB brace. Aim for the glowing sacs.'
        : 'Clear every node to release the Warden seal. SHIFT through a wind-up to break it.'
    );
    this.saveCheckpoint();
    if (document.pointerLockElement !== this.canvas) this.requestLock();
    setTimeout(() => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
        this.ui.toast('MOUSE RELEASED', 'CLICK THE VIEW TO CAPTURE AIM', 'warn', 6000);
      }
    }, 900);
  }

  showTip(id, text) {
    if (this.tips.has(id)) return;
    this.tips.add(id);
    this.ui.showTutorial(text);
  }

  // ---------------------------------------------------------------- cleanup
  disposeOrgan() {
    if (this.enemies) {
      this.enemies.forEach((e) => e?.dispose?.());
      this.enemies = [];
    }
    if (this.boss) {
      this.boss.dispose();
      this.boss = null;
    }
    this.projectiles.forEach((p) => p.destroy(this, false));
    this.projectiles = [];
    this.pickups.forEach((p) => p.destroy());
    this.pickups = [];
    this.hazards.forEach((h) => h.destroy());
    this.hazards = [];
    this.fx?.dispose();
    this.fx = null;
    this.level?.dispose();
    this.level = null;
    if (this.scene) {
      this.scene.remove(this.camera);
      this.scene.clear();
    }
  }

  cleanupRun() {
    this.injectionToken++;
    this.ui?.hideInjection();
    if (this.boss) {
      this.boss.dispose();
      this.boss = null;
    }
    this.enemies.forEach((e) => e?.dispose?.());
    this.enemies = [];
    this.projectiles.forEach((p) => p.destroy(this, false));
    this.projectiles = [];
    this.pickups.forEach((p) => p.destroy());
    this.pickups = [];
    this.hazards.forEach((h) => h.destroy());
    this.hazards = [];
    this.fx?.dispose();
    this.fx = null;
    this.level?.dispose();
    this.level = null;
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    if (this.scene) {
      this.scene.remove(this.camera);
      this.scene.clear();
    }
    this.scene = null;
    this.run = null;
    this.focusTimer = 0;
    this.focusTipShown = false;
    this.hitstop = 0;
    this.fire = false;
    this.aim = false;
    audio.stopAmbient();
    audio.setBossLayer(false);
  }

  clearPadState() {
    const pad = this.pad;
    if (!pad) return;
    pad.moveX = 0;
    pad.moveZ = 0;
    pad.lookX = 0;
    pad.lookY = 0;
    pad.fire = false;
    pad.aim = false;
    pad.interact = false;
    pad.sprint = false;
    pad.jump = false;
  }

  // Standard-mapping gamepad. The controller is a second input device: axes
  // and held buttons are kept separate from mouse/keyboard state so releasing
  // one device never clears the other.
  pollGamepad(dt = 1 / 60) {
    const pads = typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads() || []) : [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) {
      if (this.pad.connected) {
        this.pad.connected = false;
        this.padPrev = [];
        this.clearPadState();
      }
      return;
    }
    this.pad.connected = true;
    const buttons = pad.buttons || [];
    const pressed = Array.from(buttons, (b) => !!b?.pressed || (b?.value || 0) > GAMEPAD.fireThreshold);
    const just = (i) => !!pressed[i] && !this.padPrev[i];
    const axis = (i) => {
      const v = pad.axes?.[i] || 0;
      return Math.abs(v) < GAMEPAD.deadzone ? 0 : v;
    };
    let moveX = axis(0);
    let moveY = axis(1);
    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveY /= magnitude;
    }
    const lookX = axis(2);
    const lookY = axis(3);
    if (pressed.some(Boolean) || Math.abs(moveX) + Math.abs(moveY) + Math.abs(lookX) + Math.abs(lookY) > 0.001) {
      document.documentElement.dataset.input = 'gamepad';
    }

    if (this.state === 'playing') {
      this.pad.moveX = moveX;
      this.pad.moveZ = -moveY;
      this.pad.lookX = lookX;
      this.pad.lookY = lookY;
      this.pad.fire = pressed[7];
      this.pad.aim = pressed[6];
      this.pad.interact = pressed[5];
      this.pad.sprint = pressed[10];
      this.pad.jump = pressed[0];
      if (!this.padHintShown) {
        this.padHintShown = true;
        this.ui.toast('CONTROLLER LINKED', 'RT FIRE // LT BRACE // RB CAUTERY // START PAUSE', 'good', 5200);
      }
      if (just(9)) {
        this.pause();
        this.padPrev = pressed;
        return;
      }
      if (just(8) && this.level && this.player) {
        this.ui.toast('ACTIVE OBJECTIVE', this.level.getObjectiveText(this.player.pos), 'info', 5200);
      }
      if (just(0)) this.actions.add('jump');
      if (just(11)) this.actions.add('dash');
      if (just(2)) this.actions.add('reload');
      if (just(3)) this.actions.add('medkit');
      if (just(1)) this.actions.add('stabilize');
      if (just(4)) this.actions.add('grenade');
      if (just(12)) this.actions.add('focus');
    } else {
      this.clearPadState();
      if (this.state === 'paused' && this.ui.currentScreen === 'pause') {
        if (just(9) || just(1)) {
          this.resume();
          this.padPrev = pressed;
          return;
        }
      }
      this.gamepadMenu(pressed, dt);
    }
    this.padPrev = pressed;
  }

  gamepadMenu(pressed, dt) {
    const root = this.ui?.root;
    if (!root || this.state === 'injecting' || this.state === 'victory') return;
    const focusables = [...root.querySelectorAll('button:not([disabled]), select, input:not([type="hidden"])')]
      .filter((el) => !el.disabled && el.getClientRects().length > 0);
    if (!focusables.length) return;
    // Start on the screen's forward action, not whichever control happens to
    // come first in the DOM (usually a back button).
    const initial = focusables.find((el) => el.matches('.cta, .menu-btn.primary')) || focusables[0];
    // Screens replace their DOM, which drops focus. When the controller is the
    // active device, put the cursor back on that forward action so the d-pad is
    // immediately usable instead of silently doing nothing on the new screen.
    const screenKey = `${this.state}:${this.ui.currentScreen}`;
    let focusRestored = false;
    if (screenKey !== this.padMenuScreen) {
      this.padMenuScreen = screenKey;
      if (document.documentElement.dataset.input === 'gamepad') {
        initial.focus();
        focusRestored = true;
      }
    }
    let active = document.activeElement;
    if (!root.contains(active) || !focusables.includes(active)) active = null;
    // A press that only establishes focus must not also activate the control;
    // otherwise the controller skips a screen and lands on a button it never
    // showed the player.
    let focusedThisPress = false;
    if (!active && pressed[0] && !this.padPrev[0]) {
      active = initial;
      active.focus();
      focusedThisPress = true;
    }

    const up = !!pressed[12];
    const down = !!pressed[13];
    let dir = down ? 1 : up ? -1 : 0;
    if (dir !== this.padMenuDir) {
      this.padMenuDir = dir;
      this.padMenuTimer = 0;
    }
    if (dir) {
      this.padMenuTimer -= dt;
      if (this.padMenuTimer <= 0) {
        this.padMenuTimer = GAMEPAD.menuRepeat;
        // With nothing focused the d-pad reveals the screen's forward action
        // instead of jumping to a back button. Once focused, it steps normally.
        // The frame that restores focus does not also move it.
        if (focusRestored) {
          // Focus only; the next press navigates.
        } else if (!active) {
          active = initial;
          initial.focus();
        } else {
          const index = focusables.indexOf(active);
          const next = focusables[(index + dir + focusables.length) % focusables.length];
          next?.focus();
        }
      }
    } else {
      this.padMenuTimer = 0;
    }

    const left = !!pressed[14];
    const right = !!pressed[15];
    if (active && (left || right)) {
      const step = left ? -1 : 1;
      if (active.type === 'range') {
        const min = parseFloat(active.min || '0');
        const max = parseFloat(active.max || '100');
        const increment = parseFloat(active.step || '0.05') * step;
        active.value = String(clamp(parseFloat(active.value) + increment, min, max));
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
        active.focus();
      } else if (active.tagName === 'SELECT') {
        active.selectedIndex = clamp(active.selectedIndex + step, 0, active.options.length - 1);
        active.dispatchEvent(new Event('change', { bubbles: true }));
        active.focus();
      }
    }

    if (pressed[0] && !this.padPrev[0] && active && !focusedThisPress && !focusRestored) {
      active.click();
    }
    if (pressed[1] && !this.padPrev[1]) {
      if (this.ui.currentScreen === 'settings' && this.ui.settingsBack) this.ui.settingsBack();
      else if (this.ui.currentScreen === 'manual' && this.ui.manualBack) this.ui.manualBack();
      else {
        const back = root.querySelector('[data-action="settings-back"], [data-action="manual-back"], [data-action="debrief-hub"], [data-action="title"]');
        back?.click();
      }
    }
  }

  // ---------------------------------------------------------------- loop
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    // The upper bound protects a stalled tab; the lower bound protects the
    // whole simulation from a clock that steps backwards (rAF timestamp vs
    // performance.now after a tab switch). A negative dt used to grow the hit
    // flash without limit and fill the screen with white.
    const rawDt = Math.max(0, Math.min(0.12, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    // A hidden tab owns no frame budget. The loop still wakes, but does not
    // submit GPU work or animate a menu nobody can see.
    if (document.hidden) return;
    this.pollGamepad(rawDt);
    const menuLike = ['title', 'hub', 'case', 'loadout', 'manual', 'settings', 'debrief', 'failed', 'paused'].includes(this.state);
    if (menuLike) {
      if (now - (this.lastMenuFrame || 0) < 1000 / PERFORMANCE.menuHz) return;
      this.lastMenuFrame = now;
    }
    if (this.perfVisible) {
      this.perfHudTimer -= rawDt;
      if (this.perfHudTimer <= 0) {
        this.perfHudTimer = 0.25;
        this.updatePerfHud();
      }
    }

    if (this.state === 'playing') {
      this.updatePerformance(rawDt);
      // A short hitstop is presentation only: the fixed steps are skipped, not
      // stretched, so a heavy kill lands with weight without changing physics.
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - rawDt);
        this.accumulator = 0;
        this.actions.clear();
        this.renderGame(rawDt);
      } else {
        this.accumulator = Math.min(0.25, this.accumulator + rawDt);
        let steps = 0;
        try {
          while (this.accumulator >= STEP && steps < 8) {
            this.update(STEP);
            this.accumulator -= STEP;
            steps++;
            if (this.state !== 'playing') break;
          }
        } catch (err) {
          // A simulation fault pauses to the options screen with one clear
          // message. The old behaviour let the exception repeat every frame and
          // bury the actual cause in a console flood.
          this.handleRuntimeError(err);
        }
        this.actions.clear();
        if (this.state === 'playing' || this.state === 'paused') this.renderGame(rawDt);
      }
    } else if (this.state === 'paused' || this.state === 'debrief' || this.state === 'failed' || this.state === 'recovering') {
      this.renderGame(0);
    } else if (this.state === 'victory') {
      this.victoryTimer -= rawDt;
      this.fx?.update(rawDt);
      this.boss?.update(rawDt, this.player, this);
      this.renderGame(rawDt, false);
      if (this.victoryTimer <= 0) this.finishRun();
    } else if (this.state === 'injecting' && this.injectScene) {
      this.renderInjection(rawDt);
    } else if (this.state === 'injecting' || this.state === 'interorgan') {
      if (this.scene) this.renderGame(rawDt, false);
      else this.renderMenu(rawDt);
    } else {
      this.renderMenu(rawDt);
    }
  }

  togglePerfHud(force) {
    const el = document.getElementById('perf-hud');
    if (!el) return;
    this.perfVisible = force ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !this.perfVisible);
    if (this.perfVisible) {
      this.perfHudTimer = 0;
      this.updatePerfHud();
    }
  }

  updatePerfHud() {
    if (!this.perfVisible || !this.perf) return;
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== text) el.textContent = text;
    };
    let lights = 0;
    let alive = 0;
    let active = 0;
    if (this.scene) this.scene.traverse((o) => { if (o.isLight && o.visible) lights++; });
    for (const e of this.enemies) {
      if (e.dead) continue;
      alive++;
      if (!e.culled) active++;
    }
    set('perf-fps', String(this.perf.fps || 0));
    set('perf-frame', `${this.perf.frameMs.toFixed(1)} MS`);
    set('perf-draws', String(this.perf.drawCalls || 0));
    set('perf-scale', `${Math.round((this.perf.scale || 1) * 100)}%`);
    set('perf-threat', `${active} / ${alive}`);
    set('perf-lights', String(lights));
    set(
      'perf-quality',
      this.settings.quality === 'high'
        ? this.perf.emergency ? 'AUTO // SAFE' : 'AUTO'
        : this.settings.quality === 'medium' ? 'MID' : 'LOW'
    );
  }

  // Keep the garrison alive only where the surgeon can actually be reached.
  // Updates are cheap here, but every hidden creature is also a cluster of
  // draw calls and a load-time allocation the frame should not carry.
  updateCulling(dt) {
    if (!this.level || !this.player) return;
    this.cullTimer = (this.cullTimer || 0) - dt;
    if (this.cullTimer > 0) return;
    this.cullTimer = PERFORMANCE.cullInterval;
    const limit = PERFORMANCE.enemyCullDistance;
    const currentRoom = this.level.currentRoom;
    for (const enemy of this.enemies) {
      const home = enemy.homeRoom?.id;
      // dist2 is euclidean distance, not squared; keep the naming honest so a
      // future threshold cannot silently stop culling again.
      const distance = dist2(enemy.pos.x, enemy.pos.z, this.player.pos.x, this.player.pos.z);
      const culled = home !== currentRoom && distance > limit;
      enemy.culled = culled;
      enemy.group.visible = !culled;
    }
  }

  updatePerformance(rawDt) {
    if (!this.perf || document.hidden) return;
    this.perf.acc += rawDt;
    this.perf.samples++;
    this.perf.cooldown = Math.max(0, this.perf.cooldown - rawDt);
    if (this.perf.acc < PERFORMANCE.sampleInterval || !this.perf.samples) return;
    const ms = (this.perf.acc / this.perf.samples) * 1000;
    this.perf.acc = 0;
    this.perf.samples = 0;
    this.perf.frameMs = ms;
    this.perf.fps = Math.round(1000 / Math.max(1, ms));
    if (this.settings.quality === 'low' || this.perf.cooldown > 0) return;
    const scaleFloor = this.settings.quality === 'high' ? PERFORMANCE.minRenderScale : PERFORMANCE.lowRenderScale;
    if (ms > PERFORMANCE.highFrameMs && this.renderScale > scaleFloor) {
      this.renderScale = Math.max(scaleFloor, this.renderScale - PERFORMANCE.scaleStep);
      this.perf.cooldown = PERFORMANCE.adjustInterval;
      this.refreshRenderSize();
    } else if (ms < PERFORMANCE.lowFrameMs && this.renderScale < PERFORMANCE.maxRenderScale) {
      this.renderScale = Math.min(PERFORMANCE.maxRenderScale, this.renderScale + PERFORMANCE.scaleStep);
      this.perf.cooldown = PERFORMANCE.adjustInterval;
      this.refreshRenderSize();
    } else if (ms > PERFORMANCE.emergencyFrameMs && this.renderScale <= PERFORMANCE.minRenderScale + 0.001) {
      // Last resort before the player feels a stutter: drop the bloom chain.
      // The base render, grade and UI stay intact, so this is presentation only.
      this.perf.bloomAllowed = false;
      this.perf.emergency = true;
      this.perf.cooldown = PERFORMANCE.adjustInterval * 2;
    }
  }

  update(dt) {
    if (this.state !== 'playing' || !this.run || !this.level || !this.player) return;
    const run = this.run;
    const wasFocused = this.focusTimer > 0;
    if (wasFocused) {
      this.focusTimer = Math.max(0, this.focusTimer - dt);
      if (this.focusTimer <= 0) this.audio.focusEnd();
    }
    // VITAL FOCUS dilates the infection, not the surgeon or the patient's
    // clock. Every simulated step is still 1/60; only the target of that step
    // changes, so the fixed-step contract is preserved.
    const combatDt = wasFocused ? dt * FOCUS.enemyTime : dt;
    run.totalTime += dt;
    run.organTime += dt;
    run.timer -= dt;
    if (run.chainTimer > 0) {
      run.chainTimer = Math.max(0, run.chainTimer - dt);
      if (run.chainTimer <= 0) run.chain = 0;
    }

    const nodes = this.level.activeNodeCount ?? this.level.activeNodes().length;
    const def = ORGANS[this.level.organId];
    const drain = (def.baseDrain + nodes * def.nodeDrain) * run.hostDrainMult;
    this.damageHost(drain * dt, 'infection', true);

    this.player.update(dt, this, this.level);
    // Keep the audio listener on the camera so world sounds can be panned.
    this.audio.setListener(this.player.pos.x, this.player.pos.z, this.player.camera);
    this.audio.ambientTick(dt, this.audioTension ?? 0.3);
    this.level.update(dt, this.player);
    this.updateCulling(dt);

    // Signature environmental event. It is telegraphed on the floor, damages
    // the surgeon suit and only the declared hazards touch Host Integrity.
    if (this.organHazard && !this.boss?.active) {
      this.organHazardTimer -= dt;
      if (this.organHazardTimer <= 0) {
        const h = this.organHazard;
        this.organHazardTimer = h.interval * (0.85 + (run.rng?.next?.() ?? Math.random()) * 0.3);
        const room = this.level.rooms.find((r) => r.id === this.level.currentRoom);
        const cx = room?.x ?? this.player.pos.x;
        const cz = room?.z ?? this.player.pos.z;
        const rr = room?.r ?? 6;
        const a = (run.rng?.next?.() ?? Math.random()) * Math.PI * 2;
        const dist = rr * (0.25 + (run.rng?.next?.() ?? Math.random()) * 0.45);
        this.spawnHazard(cx + Math.cos(a) * dist, cz + Math.sin(a) * dist, h.radius, h.delay, h);
        this.audio.alarm();
        this.ui.toast(h.label, h.host > 0 ? `MOVE // HOST −${h.host}` : 'MOVE // SUIT DAMAGE', 'warn', 2200);
      }
    }

    this.updateThreat(dt);

    // The sterile entry is a room, not just a damage immunity. Without a
    // physical seal a crawler can walk in and fill the camera before the
    // player has taken a step, which reads as a broken spawn even while the
    // shield holds. Enemies are held at the chamber lip: if a step would cross
    // the boundary, that step is undone. Restoring the previous valid position
    // keeps the garrison out of walls, unlike a radial push.
    const entryGuard = this.level?.entryProtected ? this.level.entryRoom : null;
    const entryKeep = entryGuard ? entryGuard.r * 0.9 : 0;
    this.fx?.beginTelegraphs?.();
    for (const enemy of this.enemies) {
      if (!enemy.dead && enemy.culled) continue;
      if (enemy.dead) {
        enemy.updateDeath(combatDt);
        continue;
      }
      const guardX = enemy.pos.x;
      const guardZ = enemy.pos.z;
      enemy.update(combatDt, this.player, this);
      // A wind-up that only squashes the body is easy to miss when four
      // enemies converge. The ring states the strike radius and fills toward
      // release, which is the timing cue the leap and charge actually need.
      // This must run before the entry-guard `continue`, or every telegraph
      // disappears the moment the airlock opens.
      if (enemy.windup > 0 && !enemy.dead) {
        const wMax = enemy.def?.windup || 0.4;
        const p = clamp(1 - enemy.windup / wMax, 0, 1);
        const radius = (enemy.def?.range || 2) + 0.55;
        this.fx.telegraph(enemy.pos.x, enemy.pos.z, radius, 0.32 + p * 0.68, enemy.def?.glow || 0xff8a5a);
      }
      if (!entryGuard) continue;
      const wasInside = dist2(guardX, guardZ, entryGuard.x, entryGuard.z) < entryKeep;
      const nowInside = dist2(enemy.pos.x, enemy.pos.z, entryGuard.x, entryGuard.z) < entryKeep;
      if (nowInside && !wasInside) {
        enemy.pos.x = guardX;
        enemy.pos.z = guardZ;
        enemy.group.position.set(guardX, enemy.group.position.y, guardZ);
      }
    }
    this.fx?.endTelegraphs?.();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.dead || enemy.deathTimer > 0) continue;
      enemy.dispose();
      const last = this.enemies.pop();
      if (i < this.enemies.length) this.enemies[i] = last;
    }

    if (this.boss) {
      if (!this.boss.active && !this.boss.dead && this.level.currentRoom === 'boss') this.boss.activate();
      this.boss.update(combatDt, this.player, this);
    }

    for (const p of this.projectiles) p.update(combatDt, this.player, this.level, this);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].dead) continue;
      const last = this.projectiles.pop();
      if (i < this.projectiles.length) this.projectiles[i] = last;
    }

    for (const h of this.hazards) h.update(combatDt);
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (!this.hazards[i].dead) continue;
      const last = this.hazards.pop();
      if (i < this.hazards.length) this.hazards[i] = last;
    }

    for (const p of this.pickups) p.update(dt, this.player, this);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (!this.pickups[i].dead) continue;
      const last = this.pickups.pop();
      if (i < this.pickups.length) this.pickups[i] = last;
    }

    this.fx.update(dt);
    this.fx.updateDust(this.camera, dt);
    this.fx.applyCamera(this.camera);

    // The body has a tempo, not a metronome. Host damage, the room heart
    // landmark and the boss all tighten it; the heart organ runs hotter than
    // the lung. Presentation only: no damage or timer is derived from this.
    this.heartKick = Math.max(0, (this.heartKick || 0) - dt * 4.4);
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      const amb = ORGAN_AMBIENCE[this.level?.organId] || ORGAN_AMBIENCE.lung;
      const prox = this.level?.heartProximity?.(this.player.pos) || 0;
      const low = 1 - clamp(run.host / run.hostMax, 0, 1);
      const bossHeat = this.boss?.active ? 1 : 0;
      // Your own vitals matter as much as the patient's. Previously the pulse
      // tracked only host integrity, proximity and the boss, so the surgeon
      // could be at 8 HP with the body still sounding calm.
      const hurt = 1 - clamp(this.player.hp / Math.max(1, this.player.maxHp), 0, 1);
      const strength = clamp(low * 0.6 + prox * 0.5 + bossHeat * 0.16 + hurt * 0.66, 0, 1);
      this.heartTimer = clamp(
        1.28 - amb.heartRate * 0.38 - low * 0.34 - prox * 0.5 - bossHeat * 0.1 - hurt * 0.44,
        0.3,
        1.3
      );
      this.heartKick = Math.max(this.heartKick, 0.3 + strength * 0.7);
      this.audio.heartbeat(strength);
      // The screen pulse is reserved for the heart organ, close landmarks and
      // real distress. A calm lung should not throb in time with a menu.
      if (prox > 0.08 || amb.heartKick > 0.25 || low > 0.32 || hurt > 0.45) this.ui.pulseHeart(strength);
    }
    this.tensionTimer -= dt;
    if (this.tensionTimer <= 0) {
      this.tensionTimer = 0.5;
      const tension = clamp(1 - run.host / run.hostMax + (this.boss?.active ? 0.25 : 0), 0.15, 1);
      this.audioTension = tension;
      this.audio.setTension(tension);
    }

    if (run.host <= 0) {
      this.patientLost('HOST INTEGRITY ZERO', 'The patient arrested with you still inside.');
      return;
    }
    if (run.timer <= 0) {
      this.patientLost('EXTRACTION WINDOW EXPIRED', 'The infection reached the aortic root first.');
      return;
    }
    if (this.player.dead && this.state === 'playing') {
      // playerDown() runs inside Player.takeDamage and already chose between a
      // re-injection and the terminal fail screen. Only downgrade a live frame;
      // overwriting 'failed' here used to strand the run behind a hidden HUD.
      this.state = 'recovering';
    }
  }

  // ---------------------------------------------------------------- injection dive
  // A real pre-op descent: a giant syringe, a living skin surface, then a
  // vessel tunnel that hands the eye over to the organ. The CSS dossier stays
  // on top as the clinical read; this scene is the body-entry shot behind it.
  // Reduced motion and low quality return false and keep the accessible card.
  beginInjection3D(organ) {
    this.endInjection3D();
    if (!this.renderer) return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (document.body.classList.contains('quality-low')) return false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080403);
    scene.fog = new THREE.FogExp2(0x080403, 0.035);
    const camera = new THREE.PerspectiveCamera(56, window.innerWidth / Math.max(1, window.innerHeight), 0.01, 70);
    camera.position.set(0, 0.8, 8);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const rng = new RNG((this.run?.seed || 1) ^ 0x51ed270b);
    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0x5c2a22, 0.78));
    // The gameplay grade is tuned for dark organs. A normal portrait key at
    // this distance clipped the skin to white, so the dive is lit like a wet
    // macro specimen: a warm surgical key, a cold rim and a close fill.
    // Candela falls off with distance squared, so the old 22 at ~7 m landed
    // under 0.5 and the membrane read as a brown void. These are tuned at the
    // actual camera distance, not guessed.
    const key = new THREE.PointLight(0xffb894, 76, 40, 2);
    key.position.set(2.6, 3.4, 5.2);
    const rim = new THREE.PointLight(0x9ff0e0, 30, 30, 2);
    rim.position.set(-4.2, -1.4, 2.2);
    // Cold counter-key from below-left keeps the near edge of the dome from
    // flattening into a single warm mass.
    const fill = new THREE.PointLight(0xbfe6dc, 18, 26, 2);
    fill.position.set(-2.6, 2.2, 4.4);
    scene.add(key, rim, fill);
    const diveLight = new THREE.PointLight(0xffc0a0, 12, 7, 2);
    scene.add(diveLight);

    // Living skin: a shallow mound around the puncture, with pores and fine
    // hairs. Geometry is displaced, not textured, so the surface catches the
    // key light as one continuous wet membrane.
    const surfaceZ = (x, y) => {
      const r = Math.hypot(x, y * 1.1);
      return (
        Math.sin(x * 1.3) * 0.09 +
        Math.sin(y * 1.7 + 1.2) * 0.07 +
        Math.sin((x + y) * 2.6) * 0.035 +
        Math.exp(-r * r * 0.08) * 0.36 -
        Math.exp(-r * r * 3.5) * 0.17
      );
    };
    const skinGeo = new THREE.PlaneGeometry(24, 16, 48, 32);
    const skinPos = skinGeo.attributes.position;
    for (let i = 0; i < skinPos.count; i++) {
      skinPos.setZ(i, surfaceZ(skinPos.getX(i), skinPos.getY(i)));
    }
    skinGeo.computeVertexNormals();
    // A generated mottled-skin map. A flat albedo at this scale reads as a
    // beige dome no matter how good the lighting is; the pores and veins have
    // to travel with the surface. Canvas-only, no external texture.
    const skinCanvas = document.createElement('canvas');
    skinCanvas.width = 512;
    skinCanvas.height = 512;
    const sctx = skinCanvas.getContext('2d');
    sctx.fillStyle = '#6b332e';
    sctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 420; i++) {
      sctx.fillStyle = i % 2 ? 'rgba(42, 12, 12, 0.12)' : 'rgba(176, 106, 88, 0.07)';
      sctx.beginPath();
      sctx.arc(rng.float(0, 512), rng.float(0, 512), rng.float(4, 38), 0, Math.PI * 2);
      sctx.fill();
    }
    // Veins are painted into the albedo with a soft shadow rather than left as
    // hard 3D lines. Floating line segments over the dome read as marker
    // doodles; a blurred, low-contrast stroke reads as something under skin.
    sctx.save();
    sctx.shadowColor = 'rgba(26, 4, 8, 0.4)';
    sctx.shadowBlur = 5;
    sctx.lineCap = 'round';
    // Short, branching capillaries. Long wandering strokes read as pen
    // scribbles at this scale; a fine web reads as vasculature.
    for (let v = 0; v < 34; v++) {
      sctx.strokeStyle = `rgba(${40 + (v % 3) * 6}, ${9 + (v % 2) * 3}, 14, ${rng.float(0.07, 0.14)})`;
      sctx.lineWidth = rng.float(0.7, 2.2);
      let vx = rng.float(0, 512);
      let vy = rng.float(0, 512);
      const dir = rng.float(0, Math.PI * 2);
      sctx.beginPath();
      sctx.moveTo(vx, vy);
      for (let s = 0; s < 4; s++) {
        vx += Math.cos(dir + rng.float(-0.7, 0.7)) * rng.float(8, 26);
        vy += Math.sin(dir + rng.float(-0.7, 0.7)) * rng.float(8, 26);
        sctx.lineTo(vx, vy);
      }
      sctx.stroke();
    }
    sctx.restore();
    for (let i = 0; i < 520; i++) {
      sctx.fillStyle = 'rgba(28, 7, 6, 0.35)';
      sctx.beginPath();
      sctx.arc(rng.float(0, 512), rng.float(0, 512), rng.float(0.6, 2.4), 0, Math.PI * 2);
      sctx.fill();
    }
    for (let i = 0; i < 1300; i++) {
      sctx.fillStyle = i % 2 ? 'rgba(255, 200, 180, 0.035)' : 'rgba(0, 0, 0, 0.045)';
      sctx.fillRect(rng.float(0, 512), rng.float(0, 512), 1, 1);
    }
    const skinTex = new THREE.CanvasTexture(skinCanvas);
    skinTex.wrapS = skinTex.wrapT = THREE.RepeatWrapping;
    // The plane is 24 m wide. A 2.6x tile stretched one 512 px canvas across
    // 9 m, which from the approach read as smoke rather than a membrane. Five
    // tiles keeps pores at roughly real skin scale.
    skinTex.repeat.set(5.4, 3.6);
    skinTex.colorSpace = THREE.SRGBColorSpace;
    skinTex.anisotropy = 8;
    const skinMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: skinTex,
      // The same canvas drives a shallow bump. Without it the dome lights as a
      // single flat gradient no matter how good the albedo is.
      bumpMap: skinTex,
      bumpScale: 0.6,
      roughness: 0.46,
      metalness: 0.02,
      clearcoat: 0.72,
      clearcoatRoughness: 0.28,
      sheen: 0.42,
      sheenColor: 0xffc4a8,
      emissive: 0x140403,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 1,
    });
    this.injectTextures = [skinTex];
    const skin = new THREE.Mesh(skinGeo, skinMat);
    root.add(skin);

    const poreGeo = new THREE.CircleGeometry(1, 7);
    const poreMat = new THREE.MeshBasicMaterial({ color: 0x3b1512, transparent: true, opacity: 0.42, depthWrite: false });
    const pores = new THREE.InstancedMesh(poreGeo, poreMat, 180);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 180; i++) {
      const x = rng.float(-9.5, 9.5);
      const y = rng.float(-6.5, 6.5);
      dummy.position.set(x, y, surfaceZ(x, y) + 0.012);
      const s = rng.float(0.012, 0.045);
      dummy.scale.set(s, s * 0.72, 1);
      dummy.rotation.z = rng.float(0, Math.PI * 2);
      dummy.updateMatrix();
      pores.setMatrixAt(i, dummy.matrix);
    }
    pores.instanceMatrix.needsUpdate = true;
    root.add(pores);

    const hairPos = [];
    for (let i = 0; i < 90; i++) {
      const x = rng.float(-9, 9);
      const y = rng.float(-6, 6);
      const z = surfaceZ(x, y) + 0.008;
      hairPos.push(x, y, z, x + rng.float(-0.03, 0.03), y + rng.float(-0.02, 0.02), z + 0.02);
    }
    const hairGeo = new THREE.BufferGeometry();
    hairGeo.setAttribute('position', new THREE.Float32BufferAttribute(hairPos, 3));
    const hairs = new THREE.LineSegments(hairGeo, new THREE.LineBasicMaterial({ color: 0x2b0e0b, transparent: true, opacity: 0.38 }));
    root.add(hairs);

    // Subdermal veins are painted into the albedo above. A second, very faint
    // set of surface capillaries follows the displaced geometry so the dome is
    // not perfectly smooth, but they stay under 10% opacity: at full strength
    // thin polylines read as pen scribbles on a balloon.
    const capMat = new THREE.LineBasicMaterial({ color: 0x54181a, transparent: true, opacity: 0.1 });
    for (let v = 0; v < 5; v++) {
      const pts = [];
      let x = rng.float(-6, 6);
      let y = rng.float(-4.5, 4.5);
      for (let s = 0; s < 26; s++) {
        x += Math.cos(v * 1.9 + s * 0.29) * 0.13;
        y += Math.sin(v * 1.4 + s * 0.24) * 0.12;
        pts.push(new THREE.Vector3(x, y, surfaceZ(x, y) + 0.008));
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), capMat));
    }

    const woundMat = new THREE.MeshPhysicalMaterial({
      color: 0x4e1013,
      roughness: 0.36,
      metalness: 0.02,
      clearcoat: 0.55,
      emissive: 0x2a0304,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 1,
    });
    const wound = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.08, 8, 40), woundMat);
    // The skin surface at the puncture is ~0.19 m tall. These sit on top of it;
    // behind it they were invisible and the needle appeared to hover over a
    // smooth beige dome with no wound at all.
    wound.position.z = 0.27;
    root.add(wound);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x060102, transparent: true, opacity: 1 });
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), holeMat);
    hole.position.z = 0.205;
    root.add(hole);
    const wetMat = new THREE.MeshBasicMaterial({
      color: 0xff8a72,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wet = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.64, 40), wetMat);
    // A shallow pool spreading from the puncture. The hole alone was a 0.6 m
    // ring at eight metres and disappeared; the pool gives the entry a scale
    // reference on an otherwise untextured field of skin.
    const poolCanvas = document.createElement('canvas');
    poolCanvas.width = poolCanvas.height = 256;
    const pctx = poolCanvas.getContext('2d');
    const pg = pctx.createRadialGradient(128, 128, 6, 128, 128, 126);
    pg.addColorStop(0, 'rgba(38, 2, 5, 0.92)');
    pg.addColorStop(0.4, 'rgba(30, 3, 6, 0.68)');
    pg.addColorStop(0.76, 'rgba(20, 2, 4, 0.2)');
    pg.addColorStop(1, 'rgba(14, 1, 2, 0)');
    pctx.fillStyle = pg;
    pctx.fillRect(0, 0, 256, 256);
    pctx.save();
    pctx.shadowColor = 'rgba(20, 1, 3, 0.5)';
    pctx.shadowBlur = 4;
    for (let i = 0; i < 16; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0.25, 1.35);
      pctx.fillStyle = `rgba(${26 + rng.int(0, 14)}, ${3 + rng.int(0, 4)}, 6, ${rng.float(0.22, 0.5)})`;
      pctx.beginPath();
      pctx.ellipse(128 + Math.cos(a) * r * 28, 128 + Math.sin(a) * r * 28, rng.float(2, 7), rng.float(1.4, 4.5), a, 0, Math.PI * 2);
      pctx.fill();
    }
    pctx.restore();
    const poolTex = new THREE.CanvasTexture(poolCanvas);
    // Canvas pixels are authored in sRGB. Without this flag the pool renders
    // as bright crimson arterial spray instead of dark venous blood.
    poolTex.colorSpace = THREE.SRGBColorSpace;
    this.injectTextures.push(poolTex);
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    // Conform the pool to the displaced membrane. A flat 4.6 m quad sat inside
    // the skin's own bumps, so the surface cut it into visible flat facets.
    const poolGeo = new THREE.PlaneGeometry(4.6, 4.6, 28, 28);
    const poolPos = poolGeo.attributes.position;
    for (let i = 0; i < poolPos.count; i++) {
      const px = poolPos.getX(i);
      const py = poolPos.getY(i);
      // The skin mesh is much coarser (0.5 m quads) than this decal, so its
      // interpolated surface dips below the analytic height between vertices.
      // 14 mm was not enough clearance and the membrane poked through the pool
      // as flat tan polygons.
      poolPos.setZ(i, surfaceZ(px, py) + 0.055);
    }
    poolGeo.computeVertexNormals();
    poolMat.polygonOffset = true;
    poolMat.polygonOffsetFactor = -4;
    const pool = new THREE.Mesh(poolGeo, poolMat);
    root.add(pool);
    this.injectPool = pool;
    wet.position.z = 0.225;
    root.add(wet);
    const crackPts = [];
    for (let c = 0; c < 9; c++) {
      const a = (c / 9) * Math.PI * 2;
      const r0 = 0.66;
      const r1 = 0.82 + rng.float(0, 0.22);
      crackPts.push(Math.cos(a) * r0, Math.sin(a) * r0, 0.23, Math.cos(a) * r1, Math.sin(a) * r1, 0.23);
    }
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(crackPts, 3));
    root.add(new THREE.LineSegments(crackGeo, new THREE.LineBasicMaterial({ color: 0x2a0507, transparent: true, opacity: 0.55 })));

    // The syringe. The shaft points into the patient; the barrel and plunger
    // sit toward the eye, so the first read is unmistakably an injection.
    const needle = new THREE.Group();
    // No environment map in this isolated scene: a near-pure metal rendered as
    // a black blob. A semi-metal keeps the steel readable from the diffuse
    // key while the clearcoat still carries the wet specular.
    const steel = new THREE.MeshPhysicalMaterial({ color: 0xd6ded9, metalness: 0.38, roughness: 0.26, clearcoat: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x6d7a72, metalness: 0.28, roughness: 0.44 });
    // The hub and plunger sit closest to the lens. A physically black polymer
    // there becomes a featureless disc, so they get their own small rim light
    // and a lifted albedo.
    const fluid = new THREE.MeshPhysicalMaterial({
      color: 0x6a1714,
      metalness: 0,
      roughness: 0.2,
      emissive: 0x220404,
      emissiveIntensity: 0.4,
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.044, 3.0, 16), steel);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 1.85;
    needle.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.46, 16), steel);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = 0.34;
    needle.add(tip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.05, 20), fluid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 2.85;
    needle.add(barrel);
    const barrelGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 1.12, 20, 1, true),
      new THREE.MeshPhysicalMaterial({ color: 0xaab5b0, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.08 })
    );
    barrelGlass.rotation.x = Math.PI / 2;
    barrelGlass.position.z = 2.85;
    needle.add(barrelGlass);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.19, 0.55, 16), dark);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 3.62;
    needle.add(hub);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 24), dark);
    flange.rotation.x = Math.PI / 2;
    flange.position.z = 3.32;
    needle.add(flange);
    for (const z of [3.35, 3.55, 3.75]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18), steel);
      rib.position.z = z;
      needle.add(rib);
    }
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 12), dark);
    plunger.rotation.x = Math.PI / 2;
    plunger.position.z = 4.3;
    needle.add(plunger);
    const plungerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 20), dark);
    plungerCap.rotation.x = Math.PI / 2;
    plungerCap.position.z = 4.82;
    needle.add(plungerCap);
    needle.position.z = 1.7;
    // A dedicated bounce on the syringe so the near barrel, flange and plunger
    // still have a lit edge when the camera swings around the barrel.
    const needleLight = new THREE.PointLight(0xffd8c0, 9, 5.5, 2);
    needleLight.position.set(1.5, 1.1, 4.9);
    needle.add(needleLight);
    root.add(needle);

    // Vessel tunnel. The camera enters through the puncture and follows a
    // wet, ribbed tube toward the organ light at the far end.
    const curve = new THREE.CatmullRomCurve3([
      // Start behind the skin. When the tunnel opened in front of the membrane
      // the ribs read through the body before the needle had even landed.
      new THREE.Vector3(0, 0, -0.35),
      new THREE.Vector3(0.35, 0.22, -3),
      new THREE.Vector3(-0.5, -0.28, -7),
      new THREE.Vector3(0.45, 0.18, -12),
      new THREE.Vector3(-0.2, -0.12, -19),
      new THREE.Vector3(0.15, 0.05, -28),
    ]);
    const tunnelMat = new THREE.MeshPhysicalMaterial({
      color: 0x5c1216,
      roughness: 0.46,
      metalness: 0.02,
      clearcoat: 0.62,
      clearcoatRoughness: 0.4,
      side: THREE.BackSide,
      emissive: 0x1b0304,
      emissiveIntensity: 0.55,
    });
    const tunnel = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 2.4, 20, false), tunnelMat);
    root.add(tunnel);
    const ribMat = new THREE.MeshPhysicalMaterial({
      color: 0x8a3b38,
      roughness: 0.55,
      emissive: 0x210506,
      emissiveIntensity: 0.5,
      clearcoat: 0.3,
    });
    const forward = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 14; i++) {
      const u = (i + 1) / 15;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.09, 6, 28), ribMat);
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(forward, tan);
      root.add(ring);
    }
    const fiberMat = new THREE.LineBasicMaterial({ color: 0xa96a5a, transparent: true, opacity: 0.22 });
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let f = 0; f < 10; f++) {
      const a = (f / 10) * Math.PI * 2;
      const points = [];
      // 120 samples, not 30. A 30-point helix cuts the chord across a 2.4 m
      // bore and renders as straight lines hanging in the middle of the tunnel.
      for (let s = 0; s <= 120; s++) {
        const u = s / 120;
        const p = curve.getPointAt(u);
        const tan = curve.getTangentAt(u);
        side.crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        up.crossVectors(side, tan).normalize();
        // On the wall (2.34 vs a 2.4 tube), not floating a quarter-metre in.
        points.push(p.clone().addScaledVector(side, 2.34 * Math.cos(a)).addScaledVector(up, 2.34 * Math.sin(a)));
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), fiberMat));
    }
    const endGlow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9bffe4 }));
    endGlow.position.set(0.15, 0.05, -26.5);
    root.add(endGlow);
    const endLight = new THREE.PointLight(0x8fe8d8, 90, 34, 2);
    endLight.position.set(0.15, 0.05, -25);
    scene.add(endLight);
    const particlePos = [];
    for (let i = 0; i < 140; i++) {
      const u = rng.float(0.15, 1);
      const p = curve.getPointAt(u);
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0.2, 1.9);
      particlePos.push(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.z);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(particlePos, 3));
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({ color: 0xffc0a8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false })
    );
    root.add(particles);

    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        color: 0xffe2cf,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    flash.position.z = -0.4;
    flash.renderOrder = 999;
    camera.add(flash);

    this.injectScene = scene;
    this.injectCamera = camera;
    this.injectRoot = root;
    this.injectSkin = skin;
    this.injectSkinMat = skinMat;
    this.injectWound = wound;
    this.injectWoundMat = woundMat;
    this.injectHole = hole;
    this.injectWet = wet;
    this.injectWetMat = wetMat;
    this.injectNeedle = needle;
    this.injectFlash = flash;
    this.injectDiveLight = diveLight;
    this.injectTime = 0;
    this.injectOrgan = organ;
    return true;
  }

  animateInjection(t) {
    const cam = this.injectCamera;
    if (!cam) return;
    const ease = (x) => {
      const c = clamp(x, 0, 1);
      return c * c * (3 - 2 * c);
    };
    const seg = (a, b) => ease((t - a) / (b - a));
    // Hold the camera behind the syringe hub until the needle has landed.
    // Moving in at the old speed put the lens inside the barrel by 0.4 s.
    const appr = seg(0, 0.6);
    const enter = seg(0.9, 1.8);
    const dive = seg(1.7, 2.4);
    // Start 3.1 m behind the plunger cap, not 0.3 m. The old path put the lens
    // almost inside the cap at the moment of puncture, so the largest object on
    // screen was an unlit black disc instead of the needle going in.
    const z = 9.6 - 1.1 * appr - 12.6 * enter - 11.5 * dive;
    const y = 0.8 - 0.32 * appr - 0.2 * enter;
    // A small side-step keeps the eye from passing through the syringe barrel
    // while the needle is still in frame.
    // Swing to the left so the syringe and puncture read on the right, away
    // from the dossier docked on the left.
    cam.position.set(-3.1 * Math.sin(Math.PI * clamp(t / 1.25, 0, 1)), y, z);
    const lookZ = -14 * enter - 18 * dive;
    cam.lookAt(0, 0.05, lookZ);
    cam.fov = 56 + 11 * appr + 16 * enter;
    cam.rotation.z = Math.sin(t * 1.4) * 0.003 + Math.exp(-Math.pow((t - 0.62) / 0.1, 2)) * 0.02;
    cam.updateProjectionMatrix();

    if (this.injectDiveLight) this.injectDiveLight.position.set(cam.position.x, cam.position.y + 0.2, cam.position.z - 0.8);
    if (this.injectNeedle) {
      const drop = ease(clamp(t / 0.55, 0, 1));
      this.injectNeedle.position.z = 1.7 - 1.7 * drop;
      // Hidden before the camera crosses the plunger plane, while the puncture
      // flash is already at full white.
      this.injectNeedle.visible = t < 1.0;
    }
    const fade = 1 - ease(clamp((t - 0.86) / 0.24, 0, 1));
    if (this.injectSkin) {
      this.injectSkin.visible = fade > 0.01;
      this.injectSkinMat.opacity = fade;
      this.injectSkinMat.depthWrite = fade > 0.98;
    }
    if (this.injectWound) {
      this.injectWound.visible = fade > 0.01;
      this.injectWoundMat.opacity = fade;
    }
    if (this.injectHole) this.injectHole.visible = fade > 0.01;
    if (this.injectPool) this.injectPool.visible = fade > 0.01;
    if (this.injectWet) {
      this.injectWetMat.opacity = 0.14 * fade + 0.45 * Math.exp(-Math.pow((t - 0.62) / 0.11, 2));
      this.injectWet.visible = fade > 0.01;
    }
    if (this.injectFlash) {
      const f = Math.exp(-Math.pow((t - 0.63) / 0.07, 2));
      // A 0.72 full-screen additive flash erased the puncture at the exact
      // frame it mattered. This is a bloom around the entry, not a fade to white.
      this.injectFlash.material.opacity = 0.34 * f;
    }
  }

  renderInjection(dt) {
    if (!this.injectScene) return;
    this.injectTime = Math.min(3.2, this.injectTime + Math.min(dt, 0.08));
    this.animateInjection(this.injectTime);
    // The gameplay grade is built for a dark organ: a large warm membrane under
    // the key light clipped through the grade and bloom into a white field.
    // The dive is direct-rendered; the CSS vignette supplies the frame.
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.injectScene, this.injectCamera);
  }

  endInjection3D() {
    if (this.injectScene) {
      this.injectScene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose?.();
        }
      });
    }
    this.injectTextures?.forEach((t) => t.dispose());
    this.injectTextures = null;
    this.injectScene = null;
    this.injectCamera = null;
    this.injectRoot = null;
    this.injectSkin = null;
    this.injectSkinMat = null;
    this.injectWound = null;
    this.injectWoundMat = null;
    this.injectHole = null;
    this.injectPool = null;
    this.injectWet = null;
    this.injectWetMat = null;
    this.injectNeedle = null;
    this.injectFlash = null;
    this.injectDiveLight = null;
    this.ui?.injectionEl?.classList.remove('inject3d');
  }

  renderGame(dt, hud = true) {
    if (!this.scene) {
      this.renderMenu(dt);
      return;
    }
    // DOM updates are far more expensive than they look. The simulation still
    // runs at 60 Hz; the HUD samples it at 20 Hz, which is indistinguishable
    // for numbers and bars but removes three style recalcs per frame.
    this.hudTimer -= dt;
    this.hudDt += dt;
    if (hud && this.state === 'playing' && this.hudTimer <= 0) {
      this.hudTimer = 1 / PERFORMANCE.hudHz;
      this.ui.setHud(this.run, this.player, this.level, this.camera, this.hudDt);
      this.hudDt = 0;
    }
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    this.gradePass.uniforms.uTime.value += dt;
    this.damageUniform = Math.min(1, Math.max(0, this.damageUniform * Math.max(0, 1 - dt * 4)));
    this.gradePass.uniforms.uDamage.value = this.damageUniform;
    this.gradePass.uniforms.uAberration.value = this.settings.aberration ? 1 : 0;
    this.bloomPass.enabled = this.settings.quality === 'high' && this.perf.bloomAllowed !== false;
    this.renderFrame();
  }

  renderFrame() {
    if (this.contextLost) return;
    try {
      this.renderer.info.autoReset = false;
      this.renderer.info.reset();
      this.composer.render();
      if (this.perf) {
        this.perf.drawCalls = this.renderer.info.render.calls;
        this.perf.triangles = this.renderer.info.render.triangles;
      }
    } catch (err) {
      this.handleRenderError(err);
    }
  }

  handleRuntimeError(err) {
    if (this.runtimeErrorShown) return;
    this.runtimeErrorShown = true;
    console.error('[microcure] simulation failure', err);
    this.pause();
    this.ui?.toast('SIMULATION FAULT', 'THE FEED WAS SUSPENDED — RESUME TO RETRY', 'bad', 9000);
  }

  handleRenderError(err) {
    if (this.renderErrorShown) return;
    this.renderErrorShown = true;
    console.error('[microcure] render failure', err);
    if (this.state === 'playing') this.pause();
    this.ui?.toast('RENDER FAULT', 'THE FEED WAS SUSPENDED — RESUME TO RETRY', 'bad', 9000);
  }

  renderMenu(dt) {
    this.menuTime += dt;
    const t = this.menuTime;
    if (this.menuGroup) {
      this.menuGroup.rotation.y = t * 0.035;
      this.menuGroup.rotation.x = Math.sin(t * 0.09) * 0.04;
      this.menuGroup.position.y = Math.sin(t * 0.2) * 0.08;
    }
    // The specimen is alive: a slow wound swell, a flickering wet light and a
    // breathing fluid pool. The menu should feel like a specimen table, not a
    // static product render.
    if (this.menuWound) this.menuWound.rotation.z = Math.sin(t * 0.21) * 0.018;
    if (this.menuWoundLight) {
      this.menuWoundLight.intensity = 13 + Math.sin(t * 1.27) * 3.2 + Math.sin(t * 7.3) * 0.7;
    }
    if (this.menuFluid) this.menuFluid.material.opacity = 0.42 + Math.sin(t * 0.6) * 0.035;
    this.menuCamera.position.x = Math.sin(t * 0.07) * 0.9;
    this.menuCamera.position.y = 0.4 + Math.cos(t * 0.09) * 0.25;
    this.menuCamera.lookAt(0, 0, 0);
    this.renderPass.scene = this.menuScene;
    this.renderPass.camera = this.menuCamera;
    this.gradePass.uniforms.uTime.value += dt;
    this.damageUniform = Math.min(1, Math.max(0, this.damageUniform * Math.max(0, 1 - dt * 4)));
    this.gradePass.uniforms.uDamage.value = this.damageUniform * 0.35;
    this.gradePass.uniforms.uAberration.value = this.settings.aberration ? 0.55 : 0;
    this.bloomPass.enabled = this.settings.quality === 'high' && this.perf.bloomAllowed !== false;
    this.renderFrame();
  }

  // ---------------------------------------------------------------- input adapter
  consumeAction(name) {
    if (this.actions.has(name)) {
      this.actions.delete(name);
      return true;
    }
    return false;
  }

  // Player calls input.consumeAction; game itself implements the interface.
  // (The object passed to Player.update is this Game.)

  // ---------------------------------------------------------------- combat
  fireShot(player, spread) {
    if (!this.level) return false;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    // Shot spread is gameplay, not FX: keep the run seed authoritative so a
    // repeated seed produces the same trigger pattern.
    const shotRng = this.run?.rng;
    const a = (shotRng ? shotRng.next() : Math.random()) * Math.PI * 2;
    const r = Math.sqrt(shotRng ? shotRng.next() : Math.random()) * spread;
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

    let wall = this.level.rayWallDistance(origin, dir, WEAPON.range);
    let target = null;
    let targetT = wall;
    const trySphere = (center, radius, payload) => {
      const t = this.raySphere(origin, dir, center, radius);
      if (t !== null && t > 0 && t < targetT) {
        targetT = t;
        target = payload;
      }
    };

    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.culled) continue;
      // A glowing sac, eye or core is a smaller target inside the body volume.
      // Resolve it first so a deliberate shot is rewarded even though the body
      // capsule overlaps it.
      const weak = enemy.weakSphere?.();
      if (weak) {
        const tw = this.raySphere(origin, dir, weak.center, weak.radius);
        if (tw !== null && tw > 0 && tw < targetT) {
          targetT = tw;
          target = { kind: 'enemy', enemy, hitzone: 'weak', label: weak.label, mult: weak.mult };
          continue;
        }
      }
      const s = enemy.hitSphere();
      trySphere(s.center, s.radius, { kind: 'enemy', enemy, hitzone: 'body' });
    }
    for (const node of this.level.nodes) {
      if (!node.active) continue;
      trySphere(new THREE.Vector3(node.x, 2, node.z), 1.25, { kind: 'node', node });
    }
    if (this.boss) {
      for (const s of this.boss.getShootables()) {
        trySphere(s.center, s.radius, { ...s, kind: s.kind });
      }
    }
    // The arterial wound is a valid hit target precisely so that it can be a
    // valid mistake. Resolving it before the miss branch means cover fire
    // reports a tear instead of silently passing through the patient.
    const openCrisis = this.level.crisis;
    if (openCrisis?.active) {
      trySphere(new THREE.Vector3(openCrisis.x, 1.05, openCrisis.z), 0.78, { kind: 'crisis', crisis: openCrisis });
    }

    const muzzle = player.getMuzzleWorld().clone();
    if (target) {
      const end = origin.clone().addScaledVector(dir, targetT);
      this.fx.tracer(muzzle, end, 0x9bffe4);
      this.fx.muzzle(muzzle, 0xffcf9a);
      if (target.kind === 'enemy') {
        const weak = target.hitzone === 'weak';
        const mult = weak ? target.mult || COMBAT.weakpointDamage : COMBAT.bodyDamage;
        target.enemy.takeDamage(WEAPON.damage * this.run.damageMult * mult, this, target.hitzone, dir);
        if (weak) {
          this.fx.impact(end, target.enemy.def.glow, 16, dir.clone().negate());
          this.fx.pulseRing(end, 0xffd8a0);
        }
      } else if (target.kind === 'node') {
        this.level.damageNode(target.node, WEAPON.damage * this.run.damageMult * (this.run.nodeDamageMult || 1), false, this);
      } else if (target.kind === 'bossNode') {
        this.boss.damageNode(target.node, WEAPON.damage * this.run.damageMult * (this.run.nodeDamageMult || 1), this);
      } else if (target.kind === 'bossCore') {
        this.boss.takeDamage(WEAPON.damage * this.run.damageMult, this);
      } else if (target.kind === 'crisis') {
        this.level.damageCrisis(CRISES.shotPenalty, this);
      }
      if (target.kind !== 'crisis') this.ui.hitmarker();
      return true;
    }

    const end = origin.clone().addScaledVector(dir, wall);
    this.fx.tracer(muzzle, end, 0x9bffe4);
    this.fx.muzzle(muzzle, 0xffcf9a);
    // A miss still cuts the patient. The wall answers with bone dust, arterial
    // spatter and a wet decal, rather than polite neon sparks.
    const back = dir.clone().negate();
    this.fx.impact(end, 0xd8b48c, 7, back);
    this.fx.blood(end, back, 3);
    this.fx.wallSplat(end, back, 0.45 + Math.random() * 0.5, 0x4c070c);
    const cost = WEAPON.collateral * player.collateralMult;
    this.damageHost(cost, 'collateral', false);
    return false;
  }

  raySphere(origin, dir, center, radius) {
    const oc = new THREE.Vector3().subVectors(origin, center);
    const b = oc.dot(dir);
    const c = oc.dot(oc) - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t0 = -b - sq;
    const t1 = -b + sq;
    if (t0 > 0) return t0;
    if (t1 > 0) return t1;
    return null;
  }

  damageHost(amount, source = 'collateral', silent = false) {
    if (!this.run || this.run.ended) return;
    const before = this.run.host;
    this.run.host = clamp(this.run.host - amount, 0, this.run.hostMax);
    if (source === 'collateral') this.run.collateral += amount;
    if (!silent && before > 0) {
      if (amount > 0.9 && Math.random() < 0.7) this.audio.hostHurt();
      this.damageUniform = Math.min(0.8, this.damageUniform + Math.min(0.35, amount * 0.015));
    }
    if (this.run.host <= 0.001) {
      this.run.host = 0;
      if (this.state === 'playing') this.patientLost('HOST INTEGRITY ZERO', 'The patient arrested with you still inside.');
    }
  }

  healHost(amount) {
    if (!this.run) return;
    this.run.host = clamp(this.run.host + amount, 0, this.run.hostMax);
    this.ui.healFlash();
  }

  // Melee commitment. Returns true if this creature may start a wind-up now.
  // Reservations expire by time instead of being released by hand, so a corpse,
  // a culled body or an interrupted wind-up can never leak the whole budget.
  tryAttackSlot(enemy) {
    if (!this.run || !this.enemies) return true;
    const now = this.run.totalTime;
    if ((enemy.attackSlotUntil || 0) > now) return true;
    const tier = this.caseTier ? this.caseTier() : 1;
    const limit = COMBAT.meleeSlots + (tier >= 3 ? COMBAT.meleeSlotTierBonus : 0);
    let active = 0;
    for (const other of this.enemies) {
      if (other === enemy || other.dead || other.culled) continue;
      if ((other.attackSlotUntil || 0) > now) active++;
      if (active >= limit) return false;
    }
    enemy.attackSlotUntil = now + COMBAT.meleeSlotHold;
    return true;
  }

  damagePlayer(amount, source = null, cause = null) {
    if (!this.player || !this.run || this.state !== 'playing') return;
    // Spawn grace is a place, not a timer: the sterile entry chamber is
    // protected until the surgeon leaves it once. The cue matters — a hit that
    // silently does nothing reads as a bug, not as safety.
    if (this.level?.entryProtected) {
      if (!this.entryShieldHintShown) {
        this.entryShieldHintShown = true;
        this.ui?.toast('STERILE FIELD', 'ENTRY PROTECTED — MOVE IN', 'good', 2400);
      }
      this.fx?.shockwave(new THREE.Vector3(this.player.pos.x, 0.1, this.player.pos.z), 0x8fffe0, 1.3, 0.24);
      return;
    }
    const before = this.player.hp;
    this.player.takeDamage(amount, this);
    if (this.player.hp < before) {
      this.breakChain();
      // Remember what did it. The fail card can only explain a death if the
      // last blow still knows its source when the player goes down.
      this.run.lastHit = { label: cause || 'UNCONTACTED TRAUMA', at: this.run.totalTime };
      this.audio.heartbeat(clamp(1 - this.player.hp / Math.max(1, this.player.maxHp), 0.5, 1));
      // A little weight behind the hit: enough to register, short enough that
      // it never steals control.
      this.hitstop = Math.max(this.hitstop, 0.035);
    }
    // Tell the player which side the hit came from. Without this, a flanker or
    // a ceiling crawler lands and the damage has no readable source.
    if (this.player.hp < before && source) {
      const p = this.player.pos;
      const v = new THREE.Vector3(
        source.x ?? p.x,
        p.y + 1.2,
        source.z ?? p.z
      );
      this.player.camera.worldToLocal(v);
      // Camera-local: +x is right, -z is forward.
      const deg = Math.atan2(v.x, -v.z) * (180 / Math.PI);
      this.ui.damageDirection(deg);
    }
    this.damageUniform = Math.min(0.8, this.damageUniform + 0.2);
  }

  cauteryBurst(player) {
    if (!this.level) return;
    this.fx.shockwave(new THREE.Vector3(player.pos.x, 0, player.pos.z), 0x9bffe4, PLAYER.cauteryRange, 0.45);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.culled) continue;
      const d = dist2(enemy.pos.x, enemy.pos.z, player.pos.x, player.pos.z);
      if (d < PLAYER.cauteryRange + 0.8) {
        const dir = new THREE.Vector3(enemy.pos.x - player.pos.x, 0, enemy.pos.z - player.pos.z).normalize();
        if (dir.dot(forward) > 0.15 || d < 2.2) {
          enemy.takeDamage(PLAYER.cauteryDamage * this.run.damageMult * (this.run.cauteryMult || 1), this);
          enemy.attackCd = Math.max(enemy.attackCd, 1.1);
        }
      }
    }
    if (this.boss?.active && this.boss.phase > 0) {
      const d = dist2(this.boss.group.position.x, this.boss.group.position.z, player.pos.x, player.pos.z);
      if (d < 9) this.boss.takeDamage(20 * (this.run.cauteryMult || 1), this);
    }
  }

  throwGrenade() {
    const player = this.player;
    if (!player) return;
    const origin = player.getMuzzleWorld().clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x554e42, emissive: 0xff8a4a, emissiveIntensity: 1.2, roughness: 0.4 })
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const vel = dir.multiplyScalar(15);
    vel.y += 4.5;
    this.projectiles.push({
      grenade: true,
      pos: origin.clone(),
      vel,
      mesh,
      timer: 1.35,
      dead: false,
      update: (dt, p, level, game) => {
        this._updateGrenade(this.projectiles[this.projectiles.length - 1], dt, level, game);
      },
    });
    // Replace the generic object with a closure-safe wrapper.
    const g = this.projectiles[this.projectiles.length - 1];
    g.update = (dt, p, level, game) => this.updateGrenade(g, dt, level, game);
  }

  updateGrenade(g, dt, level) {
    if (g.dead) return;
    g.timer -= dt;
    g.vel.y -= 18 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.15) {
      g.pos.y = 0.15;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.mesh.position.copy(g.pos);
    if (g.timer <= 0) {
      g.dead = true;
      g.mesh.removeFromParent();
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
      const point = g.pos.clone();
      this.fx.burst(point, 0xffb25c, 50, 9);
      this.fx.shockwave(point, 0xff8a4a, PLAYER.grenadeRadius, 0.6);
      this.fx.addShake(0.5);
      this.audio.explosion();
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.culled) continue;
        const d = dist2(enemy.pos.x, enemy.pos.z, point.x, point.z);
        if (d < PLAYER.grenadeRadius) {
          const falloff = 1 - d / PLAYER.grenadeRadius;
          enemy.takeDamage(PLAYER.grenadeDamage * falloff * this.run.damageMult, this);
        }
      }
      if (this.boss?.active) {
        const d = dist2(this.boss.group.position.x, this.boss.group.position.z, point.x, point.z);
        if (d < PLAYER.grenadeRadius + 1.5) this.boss.takeDamage(PLAYER.grenadeDamage * 0.5, this);
      }
      this.damageHost(PLAYER.grenadeHostCost * this.player.collateralMult, 'collateral');
      this.damageUniform = Math.min(0.8, this.damageUniform + 0.35);
    }
  }

  spawnEnemyProjectile(origin, target, speed, damage, color) {
    const p = new Projectile(this.scene, origin, target, speed, damage, color, 'enemy');
    this.projectiles.push(p);
  }

  spawnBossProjectile(origin, target, speed, damage, color) {
    const p = new Projectile(this.scene, origin, target, speed, damage, color, 'boss');
    this.projectiles.push(p);
  }

  spawnHazard(x, z, radius, delay, style = null) {
    this.hazards.push(new Hazard(this.scene, x, z, radius, delay, this, style));
  }

  spawnEnemyAt(type, x, z) {
    const def = ENEMIES[type];
    if (!def || !this.level) return;
    let alive = 0;
    for (const e of this.enemies) if (!e.dead) alive++;
    if (alive >= COMBAT.broodCap) return null;
    const p = new THREE.Vector3(x, 0, z);
    this.level.constrain(p, def.radius);
    // A constrained point can collapse onto the player when the requested spot
    // is inside a wall. Brood waves then arrived already touching the surgeon,
    // which reads as an unfair spawn rather than a flank. Keep a real gap.
    const px = p.x - this.player.pos.x;
    const pz = p.z - this.player.pos.z;
    const pd = Math.hypot(px, pz);
    const minSpawnGap = 4.4;
    if (pd < minSpawnGap) {
      if (pd < 0.001) return null;
      p.x = this.player.pos.x + (px / pd) * minSpawnGap;
      p.z = this.player.pos.z + (pz / pd) * minSpawnGap;
      this.level.constrain(p, def.radius);
      if (Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < 2.8) return null;
    }
    const enemy = new Enemy(this.scene, this.level, def, p.x, p.z, this, this.run?.rng ? this.run.rng.float(0, 1e9) : Math.random() * 1e9);
    this.enemies.push(enemy);
    this.fx.burst(new THREE.Vector3(p.x, enemy.height + 0.4, p.z), def.glow, 18, 4);
    return enemy;
  }

  spawnDrop(x, z) {
    const ammoChance = PICKUPS.ammoChance * (this.run.mutation.ammoDrop || 1);
    const r = this.run?.rng ? this.run.rng.next() : Math.random();
    let kind = null;
    if (r < ammoChance) kind = 'ammo';
    else if (r < ammoChance + PICKUPS.medkitChance) kind = 'medkit';
    else if (r < ammoChance + PICKUPS.medkitChance + PICKUPS.grenadeChance) kind = 'grenade';
    if (!kind) return;
    const p = new THREE.Vector3(x, 0, z);
    this.level.constrain(p, 0.3);
    this.pickups.push(new Pickup(this.scene, p.x, p.z, kind));
  }

  collectPickup(pickup) {
    if (pickup.kind === 'ammo') {
      const amount = Math.round(PICKUPS.ammoAmount * (this.run.mutation.ammoDrop || 1));
      this.player.ammoReserve += amount;
      this.ui.toast('BIO-AMMO', `+${amount} RESERVE`, 'good', 2600);
    } else if (pickup.kind === 'medkit') {
      this.player.medkits = Math.min(PICKUPS.medkitCap, this.player.medkits + 1);
      this.ui.toast('MEDKIT', '+1 DOSE', 'good', 2600);
    } else {
      this.player.grenades = Math.min(PICKUPS.grenadeCap, this.player.grenades + 1);
      this.ui.toast('FRACTURE GRENADE', '+1', 'good', 2600);
    }
    this.audio.pickup(pickup.kind);
    this.fx.burst(new THREE.Vector3(pickup.x, 0.6, pickup.z), 0x9bffe4, 18, 3);
  }

  // One chained kill is worth more than a lone one. The multiplier is applied
  // before the new link so the displayed chain always matches the points paid.
  awardChain(base, links = 1) {
    if (!this.run) return;
    const chain = this.run.chain || 0;
    const multiplier = 1 + Math.min(SCORING.chainCap, chain) * SCORING.chainStep;
    const protocolMult = this.run.scoreMult || 1;
    this.run.score = (this.run.score || 0) + Math.round(base * multiplier * protocolMult);
    if (links > 0) {
      this.run.chain = chain + links;
      this.run.chainTimer = SCORING.chainWindow;
      this.run.chainBest = Math.max(this.run.chainBest || 0, this.run.chain);
      const crossed = SCORING.milestones.find((mark) => chain < mark && this.run.chain >= mark);
      if (crossed) {
        const nextMultiplier = 1 + Math.min(SCORING.chainCap, this.run.chain) * SCORING.chainStep;
        this.audio.chain(this.run.chain);
        this.ui.toast(`CHAIN ${this.run.chain}`, `MULTIPLIER ×${nextMultiplier.toFixed(1)}`, 'good', 1900);
      }
    }
  }

  breakChain() {
    if (!this.run) return;
    this.run.chain = 0;
    this.run.chainTimer = 0;
  }

  addFocus(amount) {
    if (!this.run || this.focusTimer > 0 || amount <= 0) return;
    const before = this.run.focus || 0;
    this.run.focus = clamp(before + amount, 0, FOCUS.max);
    if (before < FOCUS.max && this.run.focus >= FOCUS.max && !this.focusTipShown) {
      this.focusTipShown = true;
      this.audio.focusReady();
      this.ui.toast('VITAL FOCUS READY', 'PRESS V // SLOW THE INFECTION, NOT THE HOST', 'good', 5200);
    }
  }

  activateFocus() {
    if (!this.run || this.state !== 'playing') return false;
    if (this.focusTimer > 0 || (this.run.focus || 0) < FOCUS.max) return false;
    this.run.focus = 0;
    this.focusTimer = FOCUS.duration;
    this.audio.focusStart();
    this.ui.toast('VITAL FOCUS', 'THE INFECTION SLOWS // THE HOST DOES NOT', 'good', 3000);
    this.fx.shockwave(new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z), 0x6fe3d2, 6.5, 0.65);
    this.fx.addShake(0.08);
    return true;
  }

  // ---------------------------------------------------------------- gameplay callbacks
  onEnemyKilled(enemy) {
    this.run.kills++;
    this.recordStat('kills');
    if (enemy.elite) {
      this.recordStat('elites');
      this.addFocus(FOCUS.eliteKillGain);
    }
    const weak = !!enemy.killedByWeak;
    if (weak) this.hitstop = Math.max(this.hitstop, 0.055);
    // The damaging hit already flashed the white marker; this second, amber
    // beat is what tells the player the thing is actually dead.
    this.ui.hitmarkerKill();
    this.player?.addGore?.(weak ? 0.3 : 0.12);
    const base = (enemy.def?.score || 20) *
      (weak ? SCORING.weakMultiplier : 1) *
      (enemy.elite ? SCORING.eliteMultiplier : 1);
    this.awardChain(base, weak ? 2 : 1);
    this.spawnDrop(enemy.pos.x, enemy.pos.z);
  }

  onEnemyRemoved() {
    /* self-destructed spores do not drop loot */
  }

  onNodeDestroyed(node, clean) {
    this.run.nodesClearedTotal++;
    if (clean) {
      this.run.cleanTotal++;
      this.recordStat('clean');
      this.addFocus(FOCUS.cleanNodeGain);
      this.awardChain(SCORING.cleanNode, 1);
    } else {
      this.run.score = (this.run.score || 0) + Math.round(SCORING.nodeDestroyed * (this.run.scoreMult || 1));
    }
    const nodesLeft = this.level.activeNodeCount;
    this.ui.toast(
      clean ? 'NODE CAUTERIZED' : 'NODE DESTROYED',
      clean ? 'CLEAN // NO HOST COST' : `HOST −${HOST.shotNodeCost} // COLLATERAL`,
      clean ? 'good' : 'warn',
      3000
    );
    if (nodesLeft === 0) {
      this.audio.alarm();
      this.ui.toast('INFECTION CLEARED', 'SEALS RELEASING // PROCEED', 'good', 4200);
    }
  }

  onSealsReleased() {
    this.ui.toast('SEAL RELEASED', 'THE PATH IS OPEN', 'good', 3600);
    this.audio.doorOpen();
  }

  onExitStateChanged(active) {
    if (active) this.ui.toast('EXTRACTION OPEN', 'GET TO THE HILAR PORTAL', 'good', 3800);
  }

  resolveInteraction(target) {
    if (!target || this.state !== 'playing') return;
    if (target.type === 'gate') {
      if (!this.player.hasCautery) return;
      if (this.level.openGate(target.gate)) {
        this.ui.toast('MEMBRANE CAUTERIZED', target.gate.label, 'good', 3200);
        this.player.cauteryCooldown = 0.8;
      }
    } else if (target.type === 'node') {
      if (!this.player.hasCautery) return;
      this.level.cauterizeNode(target.node, this);
      this.player.cauteryCooldown = 1.2;
    } else if (target.type === 'crisis') {
      if (!this.player.hasCautery) return;
      if (this.level.sealCrisis(target.crisis, this)) this.player.cauteryCooldown = 0.8;
    }
  }

  onRoomEnter(room) {
    if (room.type === 'boss') {
      const def = ORGANS[this.level.organId];
      this.ui.showChapter(def.name, def.subtitle);
    }
    if (room.type === 'secret' && this.level.gates.find((g) => g.requires === 'tool' && !g.open)) {
      // Optional archive; no noise.
    }
    this.player.currentRoom = room.id;

    // Every non-entry chamber answers the intrusion once. The base spawns are
    // the garrison; this is the room waking up and opening its brood sacs.
    if (room.type !== 'entry' && room.type !== 'boss' && !this.enteredRooms.has(room.id)) {
      this.enteredRooms.add(room.id);
      const wave = COMBAT.broodWave[room.type] || [];
      if (wave.length) {
        this.pendingWave = { room: room.id, timer: COMBAT.broodWaveDelay, wave: wave.slice() };
        this.audio.brood();
        this.fx.addShake(0.025);
        if (room.type === 'infection') this.ui.toast('BROOD SIGNAL', 'THE WALLS ARE MOVING', 'bad', 2200);
      }
    }
  }

  updateThreat(dt) {
    const room = this.level?.rooms?.find((r) => r.id === this.level.currentRoom);
    if (!room) return;
    this.lastRoomId = room.id;

    let alive = 0;
    for (const e of this.enemies) if (!e.dead) alive++;

    // A room-entry wave crawls out of the nearest wall sacs after a short tell.
    if (this.pendingWave) {
      this.pendingWave.timer -= dt;
      if (this.pendingWave.timer <= 0) {
        const wave = this.pendingWave.wave;
        const nest = this.level.flareBrood(this.pendingWave.room, this.player);
        const spawn = nest || { x: room.x, z: room.z };
        wave.forEach((type, i) => {
          if (alive + i >= COMBAT.broodCap) return;
          this.spawnQueue.push({
            type,
            x: spawn.x + Math.cos(i * 2.1) * 0.7,
            z: spawn.z + Math.sin(i * 2.1) * 0.7,
            timer: 0.18 + i * 0.24,
          });
        });
        this.pendingWave = null;
      }
    }

    // Live nodes keep breeding while they exist. This is the pressure that
    // makes clearing them worth the Host cost instead of farming kills.
    if (room.type !== 'entry' && room.type !== 'boss') {
      let activeHere = 0;
      for (const n of this.level.nodes) if (n.active && n.room === room.id) activeHere++;
      if (activeHere > 0) {
        this.nodeBroodTimer -= dt;
        if (this.nodeBroodTimer <= 0) {
          this.nodeBroodTimer = COMBAT.nodeBroodInterval + (this.run.rng?.next?.() ?? Math.random()) * COMBAT.nodeBroodJitter;
          if (alive < COMBAT.broodCap) {
            const roster = this.level.def.roster;
            const type = this.run.rng?.pick?.(roster) || 'crawler';
            const nest = this.level.flareBrood(room.id, this.player);
            if (nest) {
              this.spawnQueue.push({ type, x: nest.x, z: nest.z, timer: 0.42 });
              this.audio.brood();
            }
          }
        }
      } else {
        this.nodeBroodTimer = Math.max(this.nodeBroodTimer, 2.5);
      }
    }

    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.timer -= dt;
      if (s.timer > 0) continue;
      this.spawnQueue.splice(i, 1);
      if (alive >= COMBAT.broodCap) continue;
      const spawned = this.spawnEnemyAt(s.type, s.x, s.z);
      if (spawned) {
        alive++;
        this.fx.addShake(0.045);
      }
    }

    // Dry skittering tells you something is close before it rounds the tissue.
    this.skitterTimer -= dt;
    if (this.skitterTimer <= 0) {
      let nearest = Infinity;
      let nearestEnemy = null;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist2(e.pos.x, e.pos.z, this.player.pos.x, this.player.pos.z);
        if (d < nearest) {
          nearest = d;
          nearestEnemy = e;
        }
      }
      if (nearest < 16) {
        // Pan the tell toward the creature that made it; with the skitter
        // centred, every direction sounded like it was behind you.
        if (nearestEnemy) {
          const sx = nearestEnemy.pos.x;
          const sz = nearestEnemy.pos.z;
          this.audio.playAt(sx, sz, () => this.audio.skitter(1 - nearest / 16));
        } else {
          this.audio.skitter(1 - nearest / 16);
        }
        this.skitterTimer = 0.36 + Math.random() * 0.6;
      } else {
        this.skitterTimer = 1.1;
      }
    }
  }

  acquireCautery() {
    this.player.hasCautery = true;
    this.run.hasCautery = true;
    this.ui.toast('CAUTERY CHARGE ACQUIRED', 'HOLD E AT MEMBRANES AND NODES', 'good', 5200);
    this.ui.showTutorial('HOLD E AT MEMBRANES AND NODES. CLEAN CUTS COST NO HOST. SHOOTING A NODE COSTS 6.');
    this.audio.pickup('medkit');
    this.fx.burst(this.player.pos.clone().setY(1.4), 0x6fe3d2, 40, 4);
  }

  collectLore(def) {
    this.ui.showSubtitle(def.title, def.text, 10500);
    this.ui.toast('ARCHIVE SHARD', '+1 PATIENT RECORD', 'info', 3200);
    this.audio.pickup('medkit');
  }

  completeOrgan() {
    if (this.state !== 'playing' || !this.level) return;
    const current = this.level.organId;
    const cursor = this.run.organCursor || 0;
    if (this.run.organs?.[cursor] !== current) return;
    if (current === 'heart') return;
    const def = ORGANS[current];
    const nextId = this.run.organs?.[cursor + 1] || 'heart';
    this.recordStat('organs');
    const time = this.run.organTime;
    this.state = 'interorgan';
    this.fire = false;
    this.keys.clear();
    this.actions.clear();
    this.ui.setHudVisible(false);
    this.ui.hideBoss();
    this.audio.stopAmbient();
    if (document.pointerLockElement) document.exitPointerLock();
    // The route choice is a continuation, not a checkpoint gap. Save enough to
    // rebuild this exact screen (organ, stats and both selections) so a reload
    // never replays an organ the player has already cleared.
    const nodesCleared = this.level.nodes.filter((n) => !n.active).length;
    const nodesTotal = this.level.nodes.length;
    this.run.interorgan = {
      organId: current,
      nodesCleared,
      nodesTotal,
      clean: this.run.cleanTotal,
      time,
      host: this.run.host,
      selectedAdaptation: null,
      selectedRoute: null,
    };
    this.saveCheckpoint();
    this.save();
    this.ui.showInterOrgan({
      organId: current,
      organName: def.name,
      copy: def.complete,
      host: this.run.host,
      nodesCleared,
      nodesTotal,
      clean: this.run.cleanTotal,
      time,
      organIndex: cursor + 1,
      organTotal: this.run.organs.length,
      adaptations: this.rollAdaptationOffers(),
      installed: (this.run.adaptations || []).length,
      nextName: ORGANS[nextId].name,
      nextSubtitle: ORGANS[nextId].subtitle,
    });
  }

  // Selections happen before descent, so persist them while the screen is up.
  recordInterorganChoice() {
    if (this.state !== 'interorgan' || !this.run?.interorgan) return;
    this.run.interorgan.selectedAdaptation = this.ui.selectedAdaptation || null;
    this.run.interorgan.selectedRoute = this.ui.selectedRoute || null;
    this.saveCheckpoint();
  }

  descend(adaptationId, routeId) {
    if (this.state !== 'interorgan') return;
    const adaptation = ADAPTATIONS.find((a) => a.id === adaptationId);
    const route = ROUTES.find((r) => r.id === routeId);
    if (!adaptation || !route) return;
    const cursor = this.run.organCursor || 0;
    const nextId = this.run.organs?.[cursor + 1] || 'heart';
    this.run.adaptation = adaptation;
    this.run.route = route;
    this.run.routePending = !!route.addElite;
    this.run.interorgan = null;
    const e = adaptation.effects || {};
    this.run.adaptations = this.run.adaptations || [];
    if (!this.run.adaptations.includes(adaptation.id)) {
      this.run.adaptations.push(adaptation.id);
      this.recordStat('adaptations');
    }
    if (this.player) {
      if (e.maxHp) {
        this.player.maxHp = Math.max(50, this.player.maxHp + e.maxHp);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + (e.healNow || 0));
      } else if (e.healNow) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + e.healNow);
      }
      if (e.hostMax) this.run.hostMax += e.hostMax;
      if (e.hostHeal) this.run.host = Math.min(this.run.hostMax, this.run.host + e.hostHeal);
      if (e.stabilizer) {
        this.player.stabilizerMax += e.stabilizer;
        this.player.stabilizers += e.stabilizer;
      }
      if (e.medkit) this.player.medkits += e.medkit;
      if (e.ammo) this.player.ammoReserve += e.ammo;
      if (e.grenade) this.player.grenades = Math.min(4, this.player.grenades + e.grenade);
      if (e.hostDrain) this.run.hostDrainMult *= e.hostDrain;
      if (e.damage) this.run.damageMult *= e.damage;
      if (e.nodeDamage) this.run.nodeDamageMult *= e.nodeDamage;
      if (e.enemySlow) this.run.enemySlowMult *= e.enemySlow;
      if (e.fireRate) {
        this.run.fireRateMult *= e.fireRate;
        this.player.fireRateMult = this.run.fireRateMult;
      }
      if (e.reload) {
        this.run.reloadMult *= e.reload;
        this.player.reloadMult = this.run.reloadMult;
      }
      if (e.collateral) {
        this.player.collateralMult *= e.collateral;
        this.run.collateralMult *= e.collateral;
      }
      if (e.moveSpeed) this.player.moveSpeedMult *= e.moveSpeed;
      if (e.dashCooldown) this.player.dashCooldownMult *= e.dashCooldown;
      if (e.medkitHeal) this.player.medkitHealMult *= e.medkitHeal;
      if (e.cautery) this.run.cauteryMult *= e.cautery;
      if (e.cauteryCooldown) this.player.cauteryCooldownMult *= e.cauteryCooldown;
      if (route.host) this.run.host = Math.min(this.run.hostMax, this.run.host + route.host);
      if (route.ammo) this.player.ammoReserve += route.ammo;
      this.player.refillForOrgan(PLAYER.interOrganHeal, PLAYER.interOrganAmmo);
      this.player.ammoReserve += this.run.ammoBonus || 0;
      this.player.medkits += route.medkit || 0;
      this.player.stabilizers = this.player.stabilizerMax;
    }
    this.run.organCursor = cursor + 1;
    this.state = 'injecting';
    this.requestLock();
    this.ui.hideScreens();
    this.ui.setHudVisible(false);
    this.ui.playInjection(ORGANS[nextId], () => this.loadOrgan(nextId));
  }

  playerDown() {
    if (this.state !== 'playing' || !this.run) return;
    this.run.injections--;
    const cause = this.run.lastHit?.label || 'UNCONTACTED TRAUMA';
    this.fire = false;
    this.keys.clear();
    if (this.run.injections <= 0) {
      this.run.ended = true;
      this.state = 'failed';
      if (document.pointerLockElement) document.exitPointerLock();
      this.ui.setHudVisible(false);
      this.audio.stopAmbient();
      this.audio.deflate();
      this.clearCheckpoint();
      this.save();
      this.ui.showFail({
        code: 'SURGEON LOST',
        title: 'SURGEON<br><em>LOST.</em>',
        reason: 'Neural sync lost. No surgeon left inside.',
        host: this.run.host,
        time: this.run.totalTime,
        nodesCleared: this.run.nodesClearedTotal,
        nodesTotal: this.run.nodesTotalAll,
        seed: this.run.seed,
        cause,
        survived: this.run.totalTime,
      });
      return;
    }
    this.state = 'recovering';
    this.focusTimer = 0;
    this.player.dead = true;
    this.projectiles.forEach((p) => p.destroy(this, false));
    this.projectiles = [];
    this.hazards.forEach((h) => h.destroy());
    this.hazards = [];
    this.run.host = Math.max(1, this.run.host - PLAYER.respawnHostCost);
    this.run.timer = Math.max(1, this.run.timer - PLAYER.respawnTimeLoss);
    this.ui.fadeOut(() => {
      if (!this.player || !this.level) return;
      this.player.dead = false;
      this.player.hp = PLAYER.respawnHp;
      this.player.resetForLevel(0, 4, 0);
      this.player.stabilizers = Math.max(0, this.player.stabilizers);
      this.player.iframes = PLAYER.respawnIFrames;
      this.state = 'playing';
      this.accumulator = 0;
      this.ui.setHudVisible(true);
      this.ui.fadeIn(500);
      this.ui.toast('EMERGENCY RE-INJECTION', `${cause} // HOST −${PLAYER.respawnHostCost} // ${formatClock(this.run.timer)} LEFT`, 'warn', 5200);
      this.audio.alarm();
    }, 650);
  }

  onBossNodeDestroyed() {
    this.player?.addGore?.(0.16);
    this.awardChain(SCORING.bossNode, 1);
  }

  onBossDefeated() {
    if (!this.run) return;
    this.awardChain(SCORING.bossKill, 0);
    this.run.bossDefeated = true;
    this.state = 'victory';
    this.victoryTimer = 2.8;
    this.fire = false;
    this.keys.clear();
    this.actions.clear();
    this.ui.setHudVisible(false);
    this.ui.hideBoss();
    this.audio.stopAmbient();
    this.audio.victory();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  finishRun() {
    if (!this.run) return;
    const run = this.run;
    if (run.ended) return;
    run.ended = true;
    const hostPct = run.host / run.hostMax;
    const accuracy = run.shots ? run.hits / run.shots : 0;
    const cleanRatio = run.nodesTotalAll ? run.cleanTotal / run.nodesTotalAll : 0;
    const par = 300 + (run.organs?.length || 2) * 210;
    const timeScore = clamp(1 - run.totalTime / (par * 1.25), 0, 1);
    const chainBonus = Math.min(SCORING.gradeChainCap, (run.chainBest || 0) * SCORING.gradeChainStep);
    const score = clamp(
      hostPct * 55 + timeScore * 18 + cleanRatio * 12 + accuracy * 10 + 5 - Math.min(12, run.collateral * 0.08) + chainBonus,
      0,
      100
    );
    const medalValues = {
      host: hostPct * 100,
      collateral: run.collateral,
      cleanRatio,
      bestChain: run.chainBest || 0,
      underPar: run.totalTime <= par ? 1 : 0,
    };
    const earned = MEDALS.filter((medal) => {
      const value = medalValues[medal.stat];
      if (!Number.isFinite(value)) return false;
      if (medal.min !== undefined && value < medal.min) return false;
      if (medal.max !== undefined && value > medal.max) return false;
      return true;
    });
    for (const medal of earned) this.meta.medals[medal.id] = (this.meta.medals[medal.id] || 0) + 1;
    this.meta.bestScore = Math.max(this.meta.bestScore || 0, run.score || 0);
    this.meta.bestChain = Math.max(this.meta.bestChain || 0, run.chainBest || 0);
    let grade = GRADES[GRADES.length - 1].grade;
    for (const g of GRADES) {
      if (score >= g.min) {
        grade = g.grade;
        break;
      }
    }
    const protocolRp = run.protocol?.rp || 0;
    const research = Math.max(1, 2 + (grade === 'S' ? 2 : grade === 'A' ? 1 : 0) + (run.cleanTotal >= 4 ? 1 : 0)) + protocolRp;
    this.meta.rp = (this.meta.rp || 0) + research;
    this.meta.bestGrade = bestGrade(this.meta.bestGrade, grade);
    this.meta.completed = (this.meta.completed || 0) + 1;
    this.recordStat('cases');
    this.recordStat('bosses');
    if (hostPct >= 0.85) this.recordStat('perfect');
    this.save();
    this.clearCheckpoint();
    this.state = 'debrief';
    this.ui.setHudVisible(false);
    this.ui.hideBoss();
    const pronoun = run.patient?.pronoun || { subject: 'they', possessive: 'their' };
    const subject = pronoun.subject.charAt(0).toUpperCase() + pronoun.subject.slice(1);
    const outcome =
      run.host >= 80
        ? `${subject} wakes with no memory of the last four hours.`
        : run.host >= 45
          ? `${subject} lives. The infection is gone. Some of the tissue is not.`
          : `${subject} lives. The chart will say the rest was unavoidable.`;
    this.ui.showDebrief({
      grade,
      host: run.host,
      hostMax: run.hostMax,
      time: run.totalTime,
      parTime: par,
      collateral: run.collateral,
      nodesCleared: run.nodesClearedTotal,
      nodesTotal: run.nodesTotalAll,
      clean: run.cleanTotal,
      accuracy: Math.round(accuracy * 100),
      research,
      protocol: run.protocol,
      protocolRp,
      scoreMult: run.scoreMult || 1,
      seed: run.seed,
      patientAlive: true,
      patient: run.patient,
      tier: run.tier || 1,
      outcome,
      score: run.score || 0,
      bestChain: run.chainBest || 0,
      medals: earned.map((m) => m.id),
    });
    this.checkpoint = null;
  }

  patientLost(code, reason) {
    if (!this.run || this.run.ended) return;
    this.run.ended = true;
    this.state = 'failed';
    this.fire = false;
    this.keys.clear();
    this.audio.stopAmbient();
    this.audio.setBossLayer(false);
    this.audio.deflate();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.setHudVisible(false);
    this.ui.hideBoss();
    this.clearCheckpoint();
    this.meta.runs = this.meta.runs || 0;
    this.save();
    this.ui.showFail({
      code,
      title: 'PATIENT<br><em>LOST.</em>',
      reason,
      host: Math.max(0, this.run.host),
      time: this.run.totalTime,
      nodesCleared: this.run.nodesClearedTotal,
      nodesTotal: this.run.nodesTotalAll,
      seed: this.run.seed,
      foot: 'NEXUS WILL NOT LOG THIS AS A MALPRACTICE EVENT.',
    });
  }

  retryCase() {
    const discipline = this.run?.discipline?.id || 'trauma';
    this.cleanupRun();
    this.startRun(discipline);
  }

  restartCase() {
    this.retryCase();
  }

  abandonToHub() {
    this.clearCheckpoint();
    this.cleanupRun();
    this.openHub();
  }

  returnToHub() {
    this.meta.runs = this.meta.runs || 0;
    this.save();
    this.cleanupRun();
    this.openHub();
  }

  buyResearch(id) {
    const def = RESEARCH.find((r) => r.id === id);
    if (!def || this.meta.unlocked.includes(id)) return;
    if (this.meta.rp < def.cost) {
      this.ui.toast('INSUFFICIENT RESEARCH', `${def.cost} RP REQUIRED`, 'warn');
      return;
    }
    this.meta.rp -= def.cost;
    this.meta.unlocked.push(id);
    this.save();
    this.ui.toast('RESEARCH INSTALLED', def.name, 'good');
  }
}

// The game object doubles as the input adapter consumed by Player.update.
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  // Production ships no inspectable handle. The dev server keeps both globals
  // so automated checks can drive a run without reaching into private scope.
  if (import.meta.env.DEV) {
    window.__microcure = game;
    window.__mcDebug = { game, THREE };
  }
  // Touch devices get an explanation; this is the only dismissal path.
  document.getElementById('device-continue')?.addEventListener('click', () => {
    document.body.classList.add('device-gate-dismissed');
  });
});
