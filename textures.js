import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
a |= 0;
a = (a + 0x6d2b79f5) | 0;
let t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPetalTextures() {
  const w = 512, h = 1024;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const ctx = colorCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bctx = bumpCanvas.getContext('2d');

  // Base creamy white petal gradient
  const baseGrad = ctx.createLinearGradient(0, h, 0, 0);
  baseGrad.addColorStop(0.0, '#c8e09e');  // pale lime-green throat base
  baseGrad.addColorStop(0.14, '#f8dce6'); // soft blush
  baseGrad.addColorStop(0.55, '#fff6f9'); // delicate ivory-pink
  baseGrad.addColorStop(1.0, '#ffffff');  // crisp white tip
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Central Stargazer magenta/crimson flame stripe
  const stripeGrad = ctx.createRadialGradient(w * 0.5, h * 0.72, 12, w * 0.5, h * 0.62, w * 0.44);
  stripeGrad.addColorStop(0.0, 'rgba(198, 22, 92, 0.94)');
  stripeGrad.addColorStop(0.45, 'rgba(226, 62, 126, 0.78)');
  stripeGrad.addColorStop(0.78, 'rgba(244, 148, 184, 0.28)');
  stripeGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = stripeGrad;
  ctx.fillRect(0, 0, w, h);

  // Longitudinal botanical veins (color + bump)
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, w, h);

  for (let i = -18; i <= 18; i++) {
    const norm = i / 18;
    ctx.beginPath();
    bctx.beginPath();
    for (let y = 0; y <= h; y += 16) {
      const v = 1 - y / h;
      const envelope = Math.sin(Math.pow(v, 0.7) * Math.PI);
      const x = w * 0.5 + norm * (w * 0.42) * envelope;
      if (y === 0) {
        ctx.moveTo(x, y);
        bctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        bctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = Math.abs(norm) < 0.35 ? 'rgba(175, 25, 85, 0.16)' : 'rgba(220, 170, 190, 0.14)';
    ctx.lineWidth = Math.abs(norm) < 0.06 ? 3.2 : 1.4;
    ctx.stroke();

    bctx.strokeStyle = Math.abs(norm) < 0.06 ? '#d8d8d8' : '#a4a4a4';
    bctx.lineWidth = Math.abs(norm) < 0.06 ? 4.0 : 1.8;
    bctx.stroke();
  }

  // Characteristic Stargazer dark crimson/magenta raised papillae spots
  const rand = mulberry32(9012);
  for (let i = 0; i < 165; i++) {
    const v = 0.16 + rand() * 0.56; // lower-to-mid throat
    const spread = (1 - Math.abs(v - 0.42) * 1.4) * 0.34;
    const u = 0.5 + (rand() - 0.5) * 2 * Math.max(0.05, spread);
    const px = u * w;
    const py = (1 - v) * h;
    const rx = 2.0 + rand() * 3.4;
    const ry = rx * (1.2 + rand() * 0.6);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((rand() - 0.5) * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = rand() > 0.3 ? 'rgba(138, 12, 58, 0.88)' : 'rgba(175, 28, 82, 0.75)';
    ctx.fill();
    ctx.restore();

    bctx.beginPath();
    bctx.arc(px, py, rx * 1.15, 0, Math.PI * 2);
    bctx.fillStyle = '#ffffff';
    bctx.fill();
  }

  const petalColor = new THREE.CanvasTexture(colorCanvas);
  petalColor.colorSpace = THREE.SRGBColorSpace;
  petalColor.anisotropy = 4;

  const petalBump = new THREE.CanvasTexture(bumpCanvas);
  petalBump.anisotropy = 4;

  return { petalColor, petalBump };
}

function createBudAndLeafTextures() {
  // Bud texture (pale celadon green transitioning to blush-pink tip)
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 256;
  bCanvas.height = 512;
  const bCtx = bCanvas.getContext('2d');
  const bGrad = bCtx.createLinearGradient(0, 512, 0, 0);
  bGrad.addColorStop(0.0, '#2d6a36');
  bGrad.addColorStop(0.45, '#7ab86b');
  bGrad.addColorStop(0.78, '#e3b5c4');
  bGrad.addColorStop(1.0, '#d96b92');
  bCtx.fillStyle = bGrad;
  bCtx.fillRect(0, 0, 256, 512);
  const budColor = new THREE.CanvasTexture(bCanvas);
  budColor.colorSpace = THREE.SRGBColorSpace;

  // Leaf texture (deep emerald green with lighter parallel venation)
  const lCanvas = document.createElement('canvas');
  lCanvas.width = 256;
  lCanvas.height = 512;
  const lCtx = lCanvas.getContext('2d');
  const lGrad = lCtx.createLinearGradient(0, 512, 0, 0);
  lGrad.addColorStop(0.0, '#133d1e');
  lGrad.addColorStop(0.55, '#226633');
  lGrad.addColorStop(1.0, '#3e8c49');
  lCtx.fillStyle = lGrad;
  lCtx.fillRect(0, 0, 256, 512);

  const lbCanvas = document.createElement('canvas');
  lbCanvas.width = 256;
  lbCanvas.height = 512;
  const lbCtx = lbCanvas.getContext('2d');
  lbCtx.fillStyle = '#808080';
  lbCtx.fillRect(0, 0, 256, 512);

  for (let i = -8; i <= 8; i++) {
    const x = 128 + i * 13;
    lCtx.strokeStyle = i === 0 ? 'rgba(145, 215, 140, 0.35)' : 'rgba(95, 175, 100, 0.16)';
    lCtx.lineWidth = i === 0 ? 3 : 1.2;
    lCtx.beginPath();
    lCtx.moveTo(128, 512);
    lCtx.quadraticCurveTo(x, 256, 128, 0);
    lCtx.stroke();

    lbCtx.strokeStyle = i === 0 ? '#d0d0d0' : '#9c9c9c';
    lbCtx.lineWidth = i === 0 ? 3.5 : 1.5;
    lbCtx.beginPath();
    lbCtx.moveTo(128, 512);
    lbCtx.quadraticCurveTo(x, 256, 128, 0);
    lbCtx.stroke();
  }

  const leafColor = new THREE.CanvasTexture(lCanvas);
  leafColor.colorSpace = THREE.SRGBColorSpace;
  const leafBump = new THREE.CanvasTexture(lbCanvas);

  // Soft glowing sprite for ambient dust
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 64;
  sCanvas.height = 64;
  const sCtx = sCanvas.getContext('2d');
  const sGrad = sCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  sGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  sGrad.addColorStop(0.35, 'rgba(255, 220, 235, 0.65)');
  sGrad.addColorStop(1.0, 'rgba(255, 200, 225, 0.0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 64, 64);
  const softSprite = new THREE.CanvasTexture(sCanvas);

  return { budColor, leafColor, leafBump, softSprite };
}


export function createLilyTextureSet() {
  return {
...createPetalTextures(),
...createBudAndLeafTextures()
  };
}