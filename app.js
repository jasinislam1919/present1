import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createLilyTextureSet } from './textures.js';
import { createLily, STAGE } from './lily.js';
import { sampleMessageAndMonogramPoints, createHeartText } from './heartText.js';

const container = document.getElementById('canvas-container');
const phaseLabel = document.getElementById('phase-label');
const stageStatus = document.getElementById('stage-status');
const replayBtn = document.getElementById('replay-btn');
const rotateBtn = document.getElementById('rotate-btn');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.048);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / Math.max(window.innerHeight, 1),
  0.1,
  100
);

function getIdealCameraDistance() {
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  return aspect < 0.75 ? 9.6 : aspect < 1.1 ? 8.3 : 7.4;
}

camera.position.set(0.35, 1.15, getIdealCameraDistance());

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.85, 0.25);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 4.2;
controls.maxDistance = 14.5;
controls.minPolarAngle = Math.PI * 0.22;
controls.maxPolarAngle = Math.PI * 0.72;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.5;
controls.update();

let userInteracting = false;
controls.addEventListener('start', () => { userInteracting = true; });
controls.addEventListener('end', () => { userInteracting = false; });

const hemiLight = new THREE.HemisphereLight(0xffeef6, 0x0a1a12, 0.85);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff5fa, 2.2);
keyLight.position.set(3.2, 5.5, 4.5);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xff9ec4, 1.45);
rimLight.position.set(-3.5, 4.2, -3.8);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0x52d681, 0.9, 12);
fillLight.position.set(-1.5, 0.4, 2.5);
scene.add(fillLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.56,
  0.65,
  0.72
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

async function init() {
  // Wait briefly for Cormorant Garamond webfont so heart text typography is crisp
  if (document.fonts && document.fonts.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 900))
      ]);
    } catch (_) {}
  }

  const textures = createLilyTextureSet();
  const lily = createLily({ textures });
  lily.group.position.set(0, 0.35, 0);
  scene.add(lily.group);

  const { mainPoints, monoPoints } = sampleMessageAndMonogramPoints({
    lines: ['Jasin Loves You Most', 'Forever Yours...'],
    monogram: 'J+R',
    maxPoints: 2600
  });

  const worldOrigins = lily.anchors.all.map((anchor) => anchor.clone().add(lily.group.position));

  const heartText = createHeartText({
    mainPoints,
    monoPoints,
    textures,
    origins: worldOrigins
  });
  scene.add(heartText.group);

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const textPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.68);
  const hitPoint = new THREE.Vector3();

  function onPointerMove(event) {
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    if (raycaster.ray.intersectPlane(textPlane, hitPoint)) {
      heartText.setPointer(hitPoint.x, hitPoint.y, true);
    }
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', () => heartText.setPointer(999, 999, false), { passive: true });

  const DURATION = 30.0;
  let elapsed = 0;

  replayBtn.addEventListener('click', () => {
    elapsed = 0;
  });

  rotateBtn.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    rotateBtn.classList.toggle('active', controls.autoRotate);
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);
    const totalTime = clock.elapsedTime;
    elapsed += dt;

    const progress = Math.min(elapsed / DURATION, 1.0);
    const pct = Math.round(progress * 100);

    if (progress < STAGE.growthEnd) {
      phaseLabel.textContent = 'Phase I · Cellular Lattice';
      stageStatus.textContent = `Stem ${pct}%`;
    } else if (progress < STAGE.bloomEnd) {
      phaseLabel.textContent = 'Phase II · Petal Morphogenesis';
      stageStatus.textContent = `Blooming ${pct}%`;
    } else if (progress < 0.845) {
      phaseLabel.textContent = 'Phase III · Message: Jasin Loves You Most';
      stageStatus.textContent = `Message ${pct}%`;
    } else if (progress < 0.985) {
      phaseLabel.textContent = 'Finale · J+R Heart Monogram';
      stageStatus.textContent = `J+R ${pct}%`;
    } else {
      phaseLabel.textContent = 'Complete · J+R Forever';
      stageStatus.textContent = 'J+R ♥';
    }

    if (!userInteracting && !controls.autoRotate) {
      const baseZ = getIdealCameraDistance();
      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        Math.sin(totalTime * 0.18) * 0.55,
        0.02
      );
      camera.position.z = THREE.MathUtils.lerp(
        camera.position.z,
        baseZ + Math.cos(totalTime * 0.14) * 0.35,
        0.02
      );
    }

    lily.update(progress, totalTime);
    heartText.update(progress, totalTime);

    controls.update();
    composer.render();
  }

  animate();
}

window.addEventListener('load', init);
  </script>