import * as THREE from 'three';
import { mulberry32 } from './textures.js';

export const STAGE = Object.freeze({ growthEnd: 0.30, bloomEnd: 0.68 });

function applyStage(material, { grow = 1, shade = 1, grid = 1 }) {
  if (!material || !material.uniforms) return;
  if (material.uniforms.uGrow) material.uniforms.uGrow.value = grow;
  if (material.uniforms.uShade) material.uniforms.uShade.value = shade;
  if (material.uniforms.uGridAmount) material.uniforms.uGridAmount.value = grid;
}

const COMMON_GRID_GLSL = /* glsl */ `
  float computeGridLine(vec2 uv, vec2 density, float thickness) {
    vec2 g = uv * density;
    vec2 f = abs(fract(g - 0.5) - 0.5);
    vec2 fw = max(fwidth(g), vec2(0.0005));
    vec2 line = smoothstep(vec2(thickness), vec2(thickness) + fw * 1.35, f);
    return 1.0 - min(line.x, line.y);
  }
`;

function createStemMaterial({
  gridDensity = [24, 6],
  radius = 0.05,
  taper = 0.65,
  colorA = 0x1a5429,
  colorB = 0x5fae5a
} = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uGrow: { value: 0 },
      uShade: { value: 0 },
      uGridAmount: { value: 1 },
      uGridDensity: { value: new THREE.Vector2(gridDensity[0], gridDensity[1]) },
      uTaper: { value: taper },
      uRadius: { value: radius },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uGridColor: { value: new THREE.Color(0x7dffb3) },
      uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.6).normalize() }
    },
    vertexShader: /* glsl */ `
      uniform float uTaper;
      uniform float uRadius;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        // Smooth natural taper along stem length (uv.x in TubeGeometry)
        float scaleTaper = mix(1.0, uTaper, pow(uv.x, 0.85));
        vec3 pos = position - normal * (uRadius * (1.0 - scaleTaper));
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGrow;
      uniform float uShade;
      uniform float uGridAmount;
      uniform vec2 uGridDensity;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uGridColor;
      uniform vec3 uLightDir;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      ${COMMON_GRID_GLSL}

      void main() {
        float axis = vUv.x;
        if (axis > uGrow) discard;

        // Leading-edge bright cellular compile pulse
        float edgeDist = uGrow - axis;
        float leadingPulse = (1.0 - smoothstep(0.0, 0.09, edgeDist)) * step(0.001, uGrow);

        float grid = computeGridLine(vUv, uGridDensity, 0.055) * uGridAmount;
        float shadeMask = smoothstep(0.0, 0.28, uShade - axis * 0.22);

        vec3 n = normalize(vNormalW);
        float ndl = max(dot(n, uLightDir), 0.0) * 0.72 + 0.28;
        float fresnel = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 2.5);

        vec3 organic = mix(uColorA, uColorB, vUv.x) * ndl + uColorB * fresnel * 0.25;
        vec3 wireCol = uGridColor * (1.15 + leadingPulse * 1.4);

        // Wireframe phase shows luminous grid + faint translucent core; solid phase fills smoothly
        float wireVisibility = max(grid * 0.95, 0.14);
        vec3 col = mix(wireCol * wireVisibility, organic, shadeMask);
        col += wireCol * grid * (1.0 - shadeMask * 0.82) * 0.85;
        col += uGridColor * leadingPulse * 0.75;

        float alpha = mix(max(grid, 0.18), 1.0, shadeMask);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
}

function createLeafMaterial({
  size = [0.1, 1.2],
  arch = 0.8,
  fold = 0.4,
  wave = 0.12,
  seed = 0.2,
  colorMap,
  bumpMap,
  gridDensity = [6, 28]
}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uGrow: { value: 0 },
      uShade: { value: 0 },
      uGridAmount: { value: 1 },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uArch: { value: arch },
      uFold: { value: fold },
      uWave: { value: wave },
      uSeed: { value: seed },
      uColorMap: { value: colorMap },
      uBumpMap: { value: bumpMap },
      uGridDensity: { value: new THREE.Vector2(gridDensity[0], gridDensity[1]) },
      uGridColor: { value: new THREE.Color(0x88ffbe) },
      uLightDir: { value: new THREE.Vector3(0.4, 0.85, 0.5).normalize() }
    },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      uniform float uArch;
      uniform float uFold;
      uniform float uWave;
      uniform float uSeed;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        float u = uv.x * 2.0 - 1.0; // -1..1 across leaf width
        float v = uv.y;             // 0..1 base to pointed tip

        // Slender lance-shaped lily leaf silhouette
        float widthEnv = sin(pow(v, 0.62) * 3.14159265) * (1.0 - pow(v, 3.2) * 0.35);
        float x = u * uSize.x * widthEnv;
        float y = v * uSize.y;

        // Graceful downward arch + V-fold along central midrib
        float z = pow(v, 1.85) * uArch * uSize.y * 0.48;
        z -= abs(u) * uFold * uSize.x * widthEnv;
        z += sin(v * 9.0 + uSeed * 6.28) * uWave * uSize.x * widthEnv * v;

        // Analytic normal approximation
        vec3 nLocal = normalize(vec3(-sign(u) * uFold * 0.45, -v * uArch * 0.55, 1.0));
        vec4 worldPos = modelMatrix * vec4(x, y, z, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * nLocal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGrow;
      uniform float uShade;
      uniform float uGridAmount;
      uniform sampler2D uColorMap;
      uniform vec2 uGridDensity;
      uniform vec3 uGridColor;
      uniform vec3 uLightDir;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      ${COMMON_GRID_GLSL}

      void main() {
        float axis = vUv.y;
        if (axis > uGrow) discard;

        float edgeDist = uGrow - axis;
        float leadingPulse = (1.0 - smoothstep(0.0, 0.11, edgeDist)) * step(0.001, uGrow);

        float grid = computeGridLine(vUv, uGridDensity, 0.055) * uGridAmount;
        float shadeMask = smoothstep(0.0, 0.32, uShade - axis * 0.25);

        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;

        float ndl = max(dot(n, uLightDir), 0.0) * 0.68 + 0.32;
        float backLight = pow(max(dot(-n, uLightDir), 0.0), 1.6) * 0.35;
        vec3 texCol = texture2D(uColorMap, vUv).rgb;
        vec3 organic = texCol * ndl + vec3(0.28, 0.72, 0.36) * backLight;

        vec3 wireCol = uGridColor * (1.1 + leadingPulse * 1.4);
        vec3 col = mix(wireCol * max(grid, 0.14), organic, shadeMask);
        col += wireCol * grid * (1.0 - shadeMask * 0.85) * 0.85;
        col += uGridColor * leadingPulse * 0.65;

        float alpha = mix(max(grid, 0.18), 0.96, shadeMask);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
}

function createPetalMaterial({
  size = [0.28, 1.05],
  seed = 0.5,
  colorMap,
  bumpMap,
  recurve = 1.2,
  cup = 0.14,
  ruffle = 0.18,
  ruffleFreq = 18.0,
  translColor = 0xff9fb4,
  transl = 0.55,
  gridDensity = [7, 14]
}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uGrow: { value: 0 },
      uShade: { value: 0 },
      uBloom: { value: 0 },
      uGridAmount: { value: 1 },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uSeed: { value: seed },
      uColorMap: { value: colorMap },
      uBumpMap: { value: bumpMap },
      uRecurve: { value: recurve },
      uCup: { value: cup },
      uRuffle: { value: ruffle },
      uRuffleFreq: { value: ruffleFreq },
      uTranslColor: { value: new THREE.Color(translColor) },
      uTransl: { value: transl },
      uGridDensity: { value: new THREE.Vector2(gridDensity[0], gridDensity[1]) },
      uGridColor: { value: new THREE.Color(0xffe6f0) },
      uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.55).normalize() }
    },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      uniform float uBloom;
      uniform float uRecurve;
      uniform float uCup;
      uniform float uRuffle;
      uniform float uRuffleFreq;
      uniform float uSeed;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        float u = uv.x * 2.0 - 1.0; // -1..1 across petal width
        float v = uv.y;             // 0..1 base to pointed apex

        // Stargazer Lily ovate-lanceolate petal profile
        float widthEnv = sin(pow(v, 0.58) * 3.14159265) * (1.0 - pow(v, 4.0) * 0.25);
        float x = u * uSize.x * widthEnv;
        float y = v * uSize.y;

        // Graceful outward recurve as the flower blooms (uBloom 0 -> 1)
        float bloomEase = uBloom * uBloom * (3.0 - 2.0 * uBloom);
        float bend = pow(v, 2.05) * uRecurve * bloomEase * 0.42;

        // Cross-sectional cupping + delicate wavy margin ruffle
        float cupOffset = -(1.0 - u * u) * uCup * widthEnv * (1.0 - bloomEase * 0.35);
        float edgeFactor = pow(abs(u), 2.2) * sin(v * 3.14159265);
        float waveOffset = sin(v * uRuffleFreq + uSeed * 6.2831) * uRuffle * edgeFactor * 0.14 * bloomEase;

        float z = bend + cupOffset + waveOffset;

        vec3 nLocal = normalize(vec3(
          u * uCup * 1.6,
          -v * uRecurve * bloomEase * 0.85,
          1.0
        ));

        vec4 worldPos = modelMatrix * vec4(x, y, z, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * nLocal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGrow;
      uniform float uShade;
      uniform float uGridAmount;
      uniform sampler2D uColorMap;
      uniform vec2 uGridDensity;
      uniform vec3 uGridColor;
      uniform vec3 uTranslColor;
      uniform float uTransl;
      uniform vec3 uLightDir;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      ${COMMON_GRID_GLSL}

      void main() {
        float axis = vUv.y;
        if (axis > uGrow) discard;

        float edgeDist = uGrow - axis;
        float leadingPulse = (1.0 - smoothstep(0.0, 0.12, edgeDist)) * step(0.001, uGrow);

        float grid = computeGridLine(vUv, uGridDensity, 0.05) * uGridAmount;
        float shadeMask = smoothstep(0.0, 0.34, uShade - axis * 0.24);

        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        vec3 vDir = normalize(vViewDir);

        float ndl = max(dot(n, uLightDir), 0.0) * 0.62 + 0.38;
        // Subsurface scattering / backlit translucency through delicate petals
        float sss = pow(max(dot(-vDir, uLightDir), 0.0), 2.0) * uTransl;
        float rim = pow(1.0 - max(dot(n, vDir), 0.0), 2.4) * 0.25;

        vec3 texCol = texture2D(uColorMap, vUv).rgb;
        vec3 organic = texCol * ndl + texCol * uTranslColor * sss + vec3(1.0, 0.92, 0.96) * rim;

        // Luminous holographic wireframe lattice before solid bloom fills in
        vec3 wireCol = uGridColor * (1.2 + leadingPulse * 1.5);
        vec3 col = mix(wireCol * max(grid, 0.16), organic, shadeMask);
        col += wireCol * grid * (1.0 - shadeMask * 0.88) * 0.9;
        col += uGridColor * leadingPulse * 0.7;

        float alpha = mix(max(grid, 0.2), 0.98, shadeMask);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
}

function createSolidMaterial({
  color = 0x8a2a10,
  emissive = 0x2a0c02,
  shininess = 30,
  specular = 0.3,
  appear = 0
}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uAppear: { value: appear },
      uColor: { value: new THREE.Color(color) },
      uEmissive: { value: new THREE.Color(emissive) },
      uShininess: { value: shininess },
      uSpecular: { value: specular },
      uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.55).normalize() }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAppear;
      uniform vec3 uColor;
      uniform vec3 uEmissive;
      uniform float uShininess;
      uniform float uSpecular;
      uniform vec3 uLightDir;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      void main() {
        if (uAppear <= 0.001) discard;
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(vViewDir);
        vec3 h = normalize(uLightDir + v);
        float diff = max(dot(n, uLightDir), 0.0) * 0.72 + 0.28;
        float spec = pow(max(dot(n, h), 0.0), uShininess) * uSpecular;
        vec3 col = uColor * diff + uEmissive + vec3(1.0, 0.85, 0.65) * spec;
        gl_FragColor = vec4(col, uAppear);
      }
    `
  });
}

/* ======================================================================
   3. STARGAZER LILY (LILIUM ORIENTALIS) PROCEDURAL BUILDER
   ====================================================================== */

const STAGE = Object.freeze({ growthEnd: 0.3, bloomEnd: 0.68 });

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const seg = (x, a, b) => ease((x - a) / Math.max(b - a, 1e-6));

const UP = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _r = new THREE.Vector3();
const _m = new THREE.Matrix4();

const STEM_POINTS = [
  [0.0, -0.65, 0.0],
  [0.12, 0.15, 0.05],
  [-0.1, 0.95, 0.02],
  [-0.18, 1.75, 0.06],
  [-0.02, 2.45, 0.18],
  [0.18, 2.85, 0.28],
  [0.35, 3.15, 0.35]
];

const BLOOMS = [
  {
    name: 'top',
    position: [0.35, 3.15, 0.35],
    axis: [0.35, 0.85, 0.35],
    scale: 1.0,
    spin: 0.2,
    seed: 11,
    attach: null,
    timeline: { grow: [0.00, 0.22], shade: [0.08, 0.44], open: [0.26, 0.86] }
  },
  {
    name: 'middle',
    position: [-1.1, 1.85, 0.35],
    axis: [-0.45, 0.75, 0.55],
    scale: 0.9,
    spin: 0.9,
    seed: 23,
    attach: 0.56,
    pedicel: [0.0, 0.2],
    timeline: { grow: [0.12, 0.34], shade: [0.20, 0.56], open: [0.36, 0.94] }
  },
  {
    name: 'low',
    position: [1.05, 1.1, 0.4],
    axis: [0.5, 0.7, 0.55],
    scale: 0.8,
    spin: 1.7,
    seed: 37,
    attach: 0.36,
    pedicel: [0.06, 0.26],
    timeline: { grow: [0.20, 0.42], shade: [0.28, 0.64], open: [0.46, 1.00] }
  },
  {
    name: 'upperLeft',
    position: [-0.85, 2.68, 0.22],
    axis: [-0.38, 0.86, 0.34],
    scale: 0.76,
    spin: 2.3,
    seed: 43,
    attach: 0.76,
    pedicel: [0.12, 0.32],
    timeline: { grow: [0.24, 0.46], shade: [0.32, 0.66], open: [0.50, 1.00] }
  },
  {
    name: 'lowerLeft',
    position: [-0.92, 0.85, 0.36],
    axis: [-0.48, 0.68, 0.55],
    scale: 0.72,
    spin: 2.9,
    seed: 47,
    attach: 0.24,
    pedicel: [0.14, 0.34],
    timeline: { grow: [0.28, 0.50], shade: [0.36, 0.70], open: [0.54, 1.00] }
  }
];

const BUDS = [
  {
    name: 'budRight',
    isBud: true,
    position: [1.9, 2.35, 0.1],
    axis: [0.7, 0.65, 0.1],
    scale: 0.55,
    spin: 0.4,
    seed: 51,
    attach: 0.7,
    via: [
      [0.5, 2.28, 0.2],
      [1.3, 2.15, 0.2]
    ],
    pedicel: [0.1, 0.32],
    maxOpen: 0.2,
    timeline: { grow: [0.20, 0.42], shade: [0.28, 0.62], open: [0.58, 1.10] }
  },
  {
    name: 'budLeft',
    isBud: true,
    position: [-1.6, 3.0, -0.1],
    axis: [-0.5, 0.8, -0.2],
    scale: 0.5,
    spin: 1.2,
    seed: 63,
    attach: 0.8,
    via: [[-0.5, 2.8, 0.05]],
    pedicel: [0.16, 0.38],
    maxOpen: 0.1,
    timeline: { grow: [0.28, 0.50], shade: [0.34, 0.68], open: [0.64, 1.16] }
  },
  {
    name: 'budCrownRight',
    isBud: true,
    position: [1.35, 2.95, 0.18],
    axis: [0.42, 0.88, 0.2],
    scale: 0.48,
    spin: 1.9,
    seed: 79,
    attach: 0.86,
    via: [[0.65, 2.85, 0.24]],
    pedicel: [0.2, 0.42],
    maxOpen: 0.15,
    timeline: { grow: [0.34, 0.56], shade: [0.40, 0.74], open: [0.70, 1.20] }
  }
];


function makeTube(points, radius, matOptions, segments, cell) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 10, false);
  const along = Math.max(6, Math.round(length / cell));
  const around = Math.max(3, Math.round((Math.PI * 2 * radius) / cell));
  const material = createStemMaterial({ gridDensity: [along, around], radius, ...matOptions });
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, curve, material, geometry, length };
}

function buildLeaves(stem, textures, geometry) {
  const leaves = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    const t = 0.02 + i * 0.055;
    const az = i * 2.399963 + 0.5;
    const el = lerp(0.5, 0.95, f);
    const length = lerp(1.65, 0.95, f);
    const halfWidth = lerp(0.12, 0.075, f);
    const arch = lerp(1.05, 0.55, f);

    const base = stem.curve.getPointAt(t);
    const radial = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));

    const down = new THREE.Vector3(0, -1, 0);
    const zAxis = down.clone().addScaledVector(dir, -down.dot(dir)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(dir, zAxis).normalize();

    const material = createLeafMaterial({
      size: [halfWidth, length],
      arch,
      fold: 0.4,
      wave: 0.12,
      seed: (i * 0.137 + 0.21) % 1,
      colorMap: textures.leafColor,
      bumpMap: textures.leafBump,
      gridDensity: [Math.max(4, Math.round((halfWidth * 2) / 0.035)), Math.round(length / 0.035)]
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.quaternion.setFromRotationMatrix(_m.makeBasis(xAxis, dir, zAxis));
    mesh.position.copy(base).addScaledVector(radial, 0.035);

    leaves.push({ mesh, material, start: 0.05 + t * 1.2 });
  }
  return leaves;
}

function createBloom(cfg, shared) {
  const { textures, petalGeometry, antherGeometry } = shared;
  const rand = mulberry32(cfg.seed);
  const isBud = !!cfg.isBud;
  const maxOpen = cfg.maxOpen ?? 1;
  const tl = cfg.timeline;

  const root = new THREE.Group();
  root.position.fromArray(cfg.position);
  root.quaternion.setFromUnitVectors(UP, new THREE.Vector3().fromArray(cfg.axis).normalize());
  root.scale.setScalar(cfg.scale);

  const petalRoot = new THREE.Group();
  petalRoot.rotation.y = cfg.spin;
  root.add(petalRoot);

  const petals = [];
  for (let k = 0; k < 6; k++) {
    const inner = (k & 1) === 1;
    const material = createPetalMaterial({
      size: inner ? [0.3, 1.04] : [0.255, 1.08],
      seed: rand(),
      colorMap: isBud ? textures.budColor : textures.petalColor,
      bumpMap: textures.petalBump,
      recurve: inner ? 1.1 : 1.35,
      cup: 0.14,
      ruffle: inner ? 0.22 : 0.15,
      ruffleFreq: 16 + rand() * 6,
      translColor: isBud ? 0xcfe8a8 : 0xff9fb4,
      transl: isBud ? 0.35 : 0.55,
      gridDensity: [7, 14]
    });
    const mesh = new THREE.Mesh(petalGeometry, material);
    mesh.frustumCulled = false;
    petalRoot.add(mesh);

    petals.push({
      mesh,
      material,
      phi: (k * Math.PI) / 3 + (rand() - 0.5) * 0.08,
      stagger: inner ? 0.1 : 0,
      thetaClosed: inner ? 0.03 : 0.07,
      thetaOpen: (inner ? 1.2 : 1.36) + (rand() - 0.5) * 0.12,
      rbClosed: inner ? 0.12 : 0.18
    });
  }

  const stamens = [];
  let filamentMaterial = null;
  let antherMaterial = null;
  let pistil = null;
  let stigmaMaterial = null;

  if (!isBud) {
    const filamentCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.01, 0.3, 0),
        new THREE.Vector3(0.05, 0.6, 0),
        new THREE.Vector3(0.12, 0.85, 0)
      ],
      false,
      'centripetal'
    );
    const filamentGeometry = new THREE.TubeGeometry(filamentCurve, 28, 0.011, 6, false);
    filamentMaterial = createStemMaterial({
      gridDensity: [14, 3],
      radius: 0.011,
      taper: 0.85,
      colorA: 0xcfd9a0,
      colorB: 0xf3efd0
    });
    antherMaterial = createSolidMaterial({
      color: 0x8a2a10,
      emissive: 0x2a0c02,
      shininess: 30,
      specular: 0.3,
      appear: 0
    });
    const tip = filamentCurve.getPointAt(1);

    for (let k = 0; k < 6; k++) {
      const azimuth = new THREE.Group();
      azimuth.rotation.y = -(k * (Math.PI / 3) + Math.PI / 6);
      azimuth.scale.setScalar(0.9 + rand() * 0.12);
      const tilt = new THREE.Group();
      azimuth.add(tilt);

      const filament = new THREE.Mesh(filamentGeometry, filamentMaterial);
      tilt.add(filament);

      const anther = new THREE.Mesh(antherGeometry, antherMaterial);
      anther.position.copy(tip);
      anther.rotation.z = -1.25;
      anther.scale.set(0.034, 0.14, 0.034);
      tilt.add(anther);

      petalRoot.add(azimuth);
      stamens.push({ tilt });
    }

    const pistilCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.004, 0.4, 0),
        new THREE.Vector3(0.02, 0.85, 0),
        new THREE.Vector3(0.07, 1.12, 0)
      ],
      false,
      'centripetal'
    );
    const pistilGeometry = new THREE.TubeGeometry(pistilCurve, 32, 0.014, 6, false);
    const pistilMaterial = createStemMaterial({
      gridDensity: [18, 3],
      radius: 0.014,
      taper: 0.9,
      colorA: 0xd8e8b0,
      colorB: 0xf6efe0
    });
    stigmaMaterial = createSolidMaterial({
      color: 0xe8a0b8,
      emissive: 0x2a0816,
      shininess: 50,
      specular: 0.4,
      appear: 0
    });
    const pistilGroup = new THREE.Group();
    pistilGroup.rotation.y = 0.4;
    const pistilTilt = new THREE.Group();
    pistilGroup.add(pistilTilt);
    pistilTilt.add(new THREE.Mesh(pistilGeometry, pistilMaterial));
    const stigma = new THREE.Mesh(antherGeometry, stigmaMaterial);
    stigma.position.copy(pistilCurve.getPointAt(1));
    stigma.scale.set(0.05, 0.045, 0.05);
    pistilTilt.add(stigma);
    petalRoot.add(pistilGroup);
    pistil = { tilt: pistilTilt, material: pistilMaterial };
  }

  function update(s2, time) {
    const grow = seg(s2, tl.grow[0], tl.grow[1]);
    const shade = seg(s2, tl.shade[0], tl.shade[1]);
    const open = seg(s2, tl.open[0], tl.open[1]) * maxOpen;

    petalRoot.rotation.y = cfg.spin + Math.sin(time * 0.17 + cfg.seed) * 0.04;

    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      const bp = clamp01((open - p.stagger) / Math.max(1 - p.stagger, 1e-3));
      const be = ease(bp);

      p.material.uniforms.uBloom.value = bp;
      applyStage(p.material, { grow, shade, grid: 1 });

      const theta = lerp(p.thetaClosed, p.thetaOpen, be);
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      _r.set(Math.cos(p.phi), 0, Math.sin(p.phi));
      _y.set(0, c, 0).addScaledVector(_r, s);
      _z.set(0, s, 0).addScaledVector(_r, -c);
      _x.crossVectors(_y, _z);
      _m.makeBasis(_x, _y, _z);
      p.mesh.quaternion.setFromRotationMatrix(_m);
      p.mesh.position.copy(_r).multiplyScalar(p.rbClosed * (1 - ease(bp * 1.2)));
      p.mesh.scale.set(lerp(0.42, 1.0, ease(bp * 1.15)), 1, 1);
    }

    if (!isBud) {
      const sGrow = seg(open, 0.22, 0.7);
      const sShade = seg(open, 0.3, 0.85);
      const appear = seg(open, 0.4, 0.8);
      const spread = lerp(0.05, 0.5, ease(open));

      applyStage(filamentMaterial, { grow: sGrow, shade: sShade, grid: 1 });
      applyStage(pistil.material, { grow: sGrow, shade: sShade, grid: 1 });
      antherMaterial.uniforms.uAppear.value = appear;
      stigmaMaterial.uniforms.uAppear.value = appear;

      for (let i = 0; i < stamens.length; i++) stamens[i].tilt.rotation.z = -spread;
      pistil.tilt.rotation.z = -lerp(0.0, 0.18, ease(open));
    }
  }

  return { root, update };
}

function createLily(options = {}) {
  const { textures } = options;
  const group = new THREE.Group();
  group.name = 'StargazerLily';

  const petalGeometry = new THREE.PlaneGeometry(1, 1, 16, 40);
  const leafGeometry = new THREE.PlaneGeometry(1, 1, 8, 56);
  const antherGeometry = new THREE.SphereGeometry(1, 16, 12);
  const shared = { textures, petalGeometry, antherGeometry };

  const stem = makeTube(
    STEM_POINTS.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    0.055,
    { taper: 0.62, colorA: 0x1a5429, colorB: 0x5fae5a },
    220,
    0.085
  );
  group.add(stem.mesh);

  const leaves = buildLeaves(stem, textures, leafGeometry);
  leaves.forEach((l) => group.add(l.mesh));

  const pedicels = [];
  const blooms = [];

  const addBloom = (cfg) => {
    if (cfg.attach !== null && cfg.attach !== undefined) {
      const p0 = stem.curve.getPointAt(cfg.attach);
      const end = new THREE.Vector3().fromArray(cfg.position);
      const axis = new THREE.Vector3().fromArray(cfg.axis).normalize();
      const pts = [p0];
      if (cfg.via) {
        cfg.via.forEach((v) => pts.push(new THREE.Vector3().fromArray(v)));
      } else {
        pts.push(p0.clone().lerp(end, 0.35).add(new THREE.Vector3(0, 0.2, 0)));
      }
      pts.push(end.clone().addScaledVector(axis, -0.45));
      pts.push(end.clone());
      const ped = makeTube(pts, 0.026, { taper: 0.8, colorA: 0x1d5a2e, colorB: 0x4f9e52 }, 56, 0.07);
      group.add(ped.mesh);
      pedicels.push({ material: ped.material, window: cfg.pedicel || [0, 0.2] });
    }
    const bloom = createBloom(cfg, shared);
    group.add(bloom.root);
    blooms.push(bloom);
  };

  BLOOMS.forEach(addBloom);
  BUDS.forEach(addBloom);

  const anchors = {
    top: new THREE.Vector3().fromArray(BLOOMS[0].position),
    middle: new THREE.Vector3().fromArray(BLOOMS[1].position),
    low: new THREE.Vector3().fromArray(BLOOMS[2].position),
    upperLeft: new THREE.Vector3().fromArray(BLOOMS[3].position),
    lowerLeft: new THREE.Vector3().fromArray(BLOOMS[4].position),
    all: BLOOMS.map((cfg) => new THREE.Vector3().fromArray(cfg.position))
  };

  function update(progress, time) {
    const s1 = progress / STAGE.growthEnd;
    const s2 = (progress - STAGE.growthEnd) / (STAGE.bloomEnd - STAGE.growthEnd);

    applyStage(stem.material, { grow: seg(s1, 0, 0.85), shade: seg(s1, 0.12, 1.07), grid: 1 });

    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      applyStage(l.material, {
        grow: seg(s1, l.start, l.start + 0.42),
        shade: seg(s1, l.start + 0.1, l.start + 0.7),
        grid: 1
      });
    }

    for (let i = 0; i < pedicels.length; i++) {
      const p = pedicels[i];
      applyStage(p.material, {
        grow: seg(s2, p.window[0], p.window[1]),
        shade: seg(s2, p.window[0] + 0.08, p.window[1] + 0.3),
        grid: 1
      });
    }

    for (let i = 0; i < blooms.length; i++) blooms[i].update(s2, time);

    group.rotation.z = Math.sin(time * 0.23) * 0.012;
  }

  update(0, 0);
  return { group, update, anchors };
}

export { createLily };
