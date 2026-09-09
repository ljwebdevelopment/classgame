// Tiny generated pixel-art placeholders. Pass 2 swaps these for real
// Claude Design images via the ASSETS lookup below — nothing else changes.

const HUMANOID = [
  '00111100',
  '01111110',
  '01122110',
  '01111110',
  '00211200',
  '02111120',
  '02111120',
  '00200200'
];

const BEAST = [
  '10000001',
  '11000011',
  '11211112',
  '12111121',
  '11222211',
  '01111110',
  '00111100',
  '01000010'
];

export const SPRITES = {
  knight: { pattern: HUMANOID, base: '#4fd6ff', accent: '#1d5f73' },
  traveler: { pattern: HUMANOID, base: '#8bd450', accent: '#3f6b1f' },
  beast: { pattern: BEAST, base: '#ff5555', accent: '#7a1414' }
};

// Pass 2: set ASSETS.knight = 'assets/knight.png' etc. Any id present here
// is drawn as an image instead of a generated pixel avatar.
export const ASSETS = {};

const imageCache = new Map();
function getImage(src) {
  if (!imageCache.has(src)) {
    const img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return imageCache.get(src);
}

export function drawAvatar(ctx, id, x, y, size) {
  if (ASSETS[id]) {
    const img = getImage(ASSETS[id]);
    if (img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, size, size);
      return;
    }
  }
  const sprite = SPRITES[id] || SPRITES.knight;
  const pixelSize = size / 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const c = sprite.pattern[row][col];
      if (c === '0') continue;
      ctx.fillStyle = c === '2' ? sprite.accent : sprite.base;
      ctx.fillRect(
        x + col * pixelSize,
        y + row * pixelSize,
        Math.ceil(pixelSize),
        Math.ceil(pixelSize)
      );
    }
  }
}
