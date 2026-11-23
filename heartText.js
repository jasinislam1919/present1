import * as THREE from 'three';
import { mulberry32 } from './textures.js';
import { STAGE } from './lily.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* ======================================================================
   4. 3D HEART PARTICLE TEXT MORPHING ENGINE (MESSAGE + FINALE "J+R")
   ====================================================================== */

const easeInOutCubic = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

function buildHeartGeometry() {
  const shape = new THREE.Shape();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    if (i === 0) shape.moveTo(x * 0.055, y * 0.055);
    else shape.lineTo(x * 0.055, y * 0.055);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.08
  });

  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * Renders crisp offscreen typography for both the romantic dedication and
 * the final "J+R" monogram, sampling dense point clouds so letters read clearly.
 */
function sampleMessageAndMonogramPoints({
  lines = ['Jasin Loves You Most', 'Forever Yours...'],
  monogram = 'J+R',
  maxPoints = 1500
} = {}) {
  const rand = mulberry32(4242);

  function sampleFromCanvas(drawFn, targetCount, metaFn, stepSize = 3) {
    const cw = 2200;
    const ch = 900;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    drawFn(ctx, cw, ch);

    const img = ctx.getImageData(0, 0, cw, ch).data;
    const candidates = [];

    for (let y = 0; y < ch; y += stepSize) {
      for (let x = 0; x < cw; x += stepSize) {
        const idx = (y * cw + x) * 4;
        const lum = img[idx];
        if (lum > 95) {
          const nx = (x / cw) * 2 - 1;
          const ny = -((y / ch) * 2 - 1);
          candidates.push({
            x: nx,
            y: ny,
            weight: lum / 255,
            ...metaFn(nx, ny, x, y, cw, ch)
          });
        }
      }
    }

    // Shuffle deterministically so sub-sampling preserves letter outlines evenly
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    return candidates.slice(0, Math.min(targetCount, candidates.length));
  }

  const mainCount = Math.floor(maxPoints * 0.78);
  const monoCount = maxPoints - mainCount;

  const mainPoints = sampleFromCanvas(
    (ctx, cw, ch) => {
      ctx.font = 'italic 700 184px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(lines[0], cw * 0.5, ch * 0.32);

      ctx.font = 'italic 700 156px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(lines[1], cw * 0.5, ch * 0.72);
    },
    mainCount,
    (_nx, _ny, _x, y, _cw, ch) => ({
      line: y < ch * 0.52 ? 0 : 1
    }),
    3
  );

  const monoPoints = sampleFromCanvas(
    (ctx, cw, ch) => {
      ctx.font = 'italic 700 390px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(monogram, cw * 0.5, ch * 0.52);
    },
    monoCount,
    (nx) => ({
      line: 2,
      isPlus: Math.abs(nx) < 0.11
    }),
    3
  );

  // Add a delicate heart-ring accent around the "J+R" finale monogram
  const ringHearts = 190;
  for (let i = 0; i < ringHearts; i++) {
    const a = (i / ringHearts) * Math.PI * 2;
    monoPoints.push({
      x: Math.cos(a) * 0.62,
      y: Math.sin(a) * 0.68,
      weight: 1.0,
      line: 2,
      isRing: true,
      ringAngle: a
    });
  }

  return { mainPoints, monoPoints };
}

function createHeartText({ mainPoints, monoPoints, textures, origins = [] }) {
  const group = new THREE.Group();
  group.name = 'HeartParticleText';

  const rand = mulberry32(2026);
  const count = Math.max(mainPoints.length, monoPoints.length);

  // Larger, clearer layout below the blooms so every word reads cleanly
  const textWidth = 6.15;
  const textHeight = 2.28;
  const centerY = -1.38;
  const centerZ = 0.68;

  // Finale "J+R" layout
  const monoScaleX = 2.95;
  const monoScaleY = 2.12;
  const monoCenterY = -1.38;

  const heartGeo = buildHeartGeometry();
  const heartMat = new THREE.MeshStandardMaterial({
    color: 0xffc2d4,
    emissive: 0xff3b7f,
    emissiveIntensity: 0.92,
    roughness: 0.24,
    metalness: 0.12,
    toneMapped: true
  });

  const instancedHearts = new THREE.InstancedMesh(heartGeo, heartMat, count);
  instancedHearts.frustumCulled = false;
  instancedHearts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(instancedHearts);

  const palette = [
    new THREE.Color(0xff4d88),
    new THREE.Color(0xff85a8),
    new THREE.Color(0xffd6e5),
    new THREE.Color(0xf72585),
    new THREE.Color(0xfff5f8)
  ];

  const mainTargets = new Float32Array(count * 3);
  const monoTargets = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const swirlParams = new Float32Array(count * 4); // radius, speed, phase, delay
  const baseScales = new Float32Array(count);
  const monoScales = new Float32Array(count);
  const isRingFlags = new Float32Array(count);
  const ringAngles = new Float32Array(count);

  const colorTmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const mp = mainPoints[i % mainPoints.length];
    const jrp = monoPoints[i % monoPoints.length];
    const i3 = i * 3;
    const i4 = i * 4;

    // Primary message target
    mainTargets[i3] = mp.x * (textWidth * 0.5);
    mainTargets[i3 + 1] = centerY + mp.y * (textHeight * 0.5);
    mainTargets[i3 + 2] = centerZ + (rand() - 0.5) * 0.1;

    // Finale "J+R" target
    monoTargets[i3] = jrp.x * (monoScaleX * 0.5);
    monoTargets[i3 + 1] = monoCenterY + jrp.y * (monoScaleY * 0.5);
    monoTargets[i3 + 2] = centerZ + (jrp.isRing ? 0.18 : 0.04) + (rand() - 0.5) * 0.08;

    // Spawn origin from the lily blooms
    const origin = origins[i % origins.length];
    starts[i3] = origin.x + (rand() - 0.5) * 0.55;
    starts[i3 + 1] = origin.y + (rand() - 0.5) * 0.55;
    starts[i3 + 2] = origin.z + (rand() - 0.5) * 0.55;

    swirlParams[i4] = 0.35 + rand() * 1.1;
    swirlParams[i4 + 1] = (rand() > 0.5 ? 1 : -1) * (1.5 + rand() * 2.0);
    swirlParams[i4 + 2] = rand() * Math.PI * 2;
    const lineBias = mp.line === 0 ? 0.0 : 0.14;
    swirlParams[i4 + 3] = clamp01(lineBias + rand() * 0.25);

    // Crisp heart size so letters stay legible without clumping into a blob
    baseScales[i] = lerp(0.0115, 0.0165, rand()) * lerp(0.9, 1.12, mp.weight ?? 1);
    monoScales[i] = jrp.isRing
      ? lerp(0.0105, 0.0145, rand())
      : lerp(0.012, 0.017, rand()) * lerp(0.92, 1.15, jrp.weight ?? 1);

    isRingFlags[i] = jrp.isRing ? 1.0 : 0.0;
    ringAngles[i] = jrp.ringAngle ?? 0.0;

    colorTmp.copy(palette[Math.floor(rand() * palette.length)]);
    instancedHearts.setColorAt(i, colorTmp);
  }

  if (instancedHearts.instanceColor) {
    instancedHearts.instanceColor.needsUpdate = true;
  }

  const dustCount = 280;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (rand() - 0.5) * 9.5;
    dustPositions[i * 3 + 1] = lerp(-3.2, 5.4, rand());
    dustPositions[i * 3 + 2] = (rand() - 0.5) * 6.8;

    dustSeeds[i * 3] = rand() * Math.PI * 2;
    dustSeeds[i * 3 + 1] = 0.2 + rand() * 0.5;
    dustSeeds[i * 3 + 2] = 0.08 + rand() * 0.18;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.095,
    map: textures.softSprite,
    color: 0xffd6e7,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  group.add(dustPoints);

  const pointerWorld = new THREE.Vector3(999, 999, centerZ);
  let pointerActive = false;

  function setPointer(worldX, worldY, active = true) {
    pointerWorld.set(worldX, worldY, centerZ);
    pointerActive = active;
  }

  const dummy = new THREE.Object3D();

  function update(progress, time) {
    // Phase IIIa: Romantic message forms from ~0.60 -> 0.80
    const msgStart = STAGE.bloomEnd - 0.08;
    const msgEnd = 0.80; // message is fully formed before its short hold
    const rawMsg = (progress - msgStart) / Math.max(msgEnd - msgStart, 0.001);

    // Phase IIIb: Finale "J+R" morphs smoothly from ~0.82 -> 0.98
    const jrStart = 0.845;
    const jrEnd = 0.985;
    const jrBlend = easeInOutCubic((progress - jrStart) / Math.max(jrEnd - jrStart, 0.001));

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      const delay = swirlParams[i4 + 3];
      const localT = clamp01((rawMsg - delay) / Math.max(1.0 - delay, 0.001));
      const morph = easeInOutCubic(localT);

      const appearScale = clamp01(localT * 4.5);
      if (appearScale <= 0.0001) {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        instancedHearts.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const sx = starts[i3];
      const sy = starts[i3 + 1];
      const sz = starts[i3 + 2];

      // Morph from stem/blooms into main message, then swirl into "J+R"
      const m1x = lerp(sx, mainTargets[i3], morph);
      const m1y = lerp(sy, mainTargets[i3 + 1], morph);
      const m1z = lerp(sz, mainTargets[i3 + 2], morph);

      // Add an orbital swirl arc during the "J+R" transition
      const jrArc = Math.sin(jrBlend * Math.PI);
      const phase = swirlParams[i4 + 2];
      const swirlAngle = phase + jrArc * 4.2 * (swirlParams[i4 + 1] > 0 ? 1 : -1);
      const swirlRad = jrArc * (0.28 + (swirlParams[i4] * 0.35));

      let tx = m1x;
      let ty = m1y;
      let tz = m1z;

      if (isRingFlags[i] > 0.5) {
        const rotA = ringAngles[i] + time * 0.30 * jrBlend;
        const jrx = Math.cos(rotA) * (monoScaleX * 0.54);
        const jry = monoCenterY + Math.sin(rotA) * (monoScaleY * 0.58);
        const jrz = monoTargets[i3 + 2];
        tx = lerp(m1x, jrx, jrBlend);
        ty = lerp(m1y, jry, jrBlend);
        tz = lerp(m1z, jrz, jrBlend);
      } else {
        tx = lerp(m1x, monoTargets[i3], jrBlend);
        ty = lerp(m1y, monoTargets[i3 + 1], jrBlend);
        tz = lerp(m1z, monoTargets[i3 + 2], jrBlend);
      }

      const flightArc = Math.sin(morph * Math.PI);
      const radius = swirlParams[i4] * flightArc * 0.72;
      const angle = phase + time * swirlParams[i4 + 1] * (1.0 - morph * 0.72);

      let x = tx + Math.cos(angle) * radius + Math.cos(swirlAngle) * swirlRad;
      let y = ty + Math.sin(angle) * radius + flightArc * 0.35 + Math.sin(swirlAngle) * swirlRad * 0.7;
      let z = tz + Math.sin(angle * 0.8) * radius * 0.65 + jrArc * 0.25;

      const settled = clamp01((morph - 0.75) / 0.25);
      x += Math.sin(time * 1.4 + phase) * 0.011 * settled;
      y += Math.cos(time * 1.8 + phase * 1.3) * 0.014 * settled;
      z += Math.sin(time * 1.2 + phase * 0.7) * 0.016 * settled;

      if (pointerActive && settled > 0.2) {
        const dx = x - pointerWorld.x;
        const dy = y - pointerWorld.y;
        const distSq = dx * dx + dy * dy;
        const maxR = 0.85;
        if (distSq < maxR * maxR && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const push = ((maxR - dist) / maxR) * 0.22 * settled;
          x += (dx / dist) * push;
          y += (dy / dist) * push;
          z += push * 0.65;
        }
      }

      dummy.position.set(x, y, z);

      const spinFade = (1.0 - morph) + jrArc * 0.85;
      dummy.rotation.set(
        Math.sin(time * 1.5 + phase) * 0.12 * settled + spinFade * Math.sin(angle),
        Math.cos(time * 1.2 + phase) * 0.18 * settled + spinFade * angle,
        Math.sin(time * 1.6 + phase) * 0.1 * settled
      );

      const targetScale = lerp(baseScales[i], monoScales[i], jrBlend);
      const pulse = 1.0 + Math.sin(time * 1.65 + phase) * 0.075 * settled;
      dummy.scale.setScalar(targetScale * appearScale * pulse);

      dummy.updateMatrix();
      instancedHearts.setMatrixAt(i, dummy.matrix);
    }

    instancedHearts.instanceMatrix.needsUpdate = true;
    heartMat.emissiveIntensity = 0.86 + Math.sin(time * 2.2) * 0.22 + jrBlend * 0.25;

    const posAttr = dustGeo.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      const i3 = i * 3;
      const p0 = dustSeeds[i3];
      const spd = dustSeeds[i3 + 1];
      const amp = dustSeeds[i3 + 2];
      posAttr.array[i3] += Math.sin(time * spd + p0) * amp * 0.008;
      posAttr.array[i3 + 1] += Math.cos(time * spd * 0.8 + p0) * amp * 0.008;
    }
    posAttr.needsUpdate = true;
  }

  update(0, 0);
  return { group, update, setPointer };
}

export { sampleMessageAndMonogramPoints, createHeartText };
