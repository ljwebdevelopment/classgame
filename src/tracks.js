// Circuit definitions. Each one carries its own plan (control points on the XZ
// plane), its own height profile, and a palette, so adding a track is data
// rather than code.
//
// ELEVATION keyframes are [progress, height, easing]: 's' smoothsteps for
// rolling hills, 'l' interpolates straight, which is what shapes ramp faces.
// The last keyframe must return to the height of the first - it is a loop.

export const TRACKS = [
  {
    id: 'ridgeline',
    name: 'Ridgeline',
    blurb: 'Rolling hills and two big ramps. The circuit everything else is measured against.',
    difficulty: 'Medium',
    laps: 3,
    theme: {
      skyTop: '#3f86c9', skyBottom: '#cfe3f2', fog: '#a9cbe6',
      grass: '#5f8f41', trees: '#2f7a42', bush: '#3d8c4b',
      rock: '#8a8f96', hills: '#6f94a8', sun: '#fff4e0',
    },
    points: [
      [   0,  145], [  95,  138], [ 152,  112], [ 176,   58],
      [ 150,   12], [ 100,   -8], [  58,  -34], [  74,  -82],
      [ 132,  -96], [ 166, -136], [ 130, -178], [  58, -182],
      [   8, -150], [  -6,  -98], [ -46,  -78], [ -96,  -94],
      [-132,  -54], [-116,    2], [-152,   46], [-130,  102],
      [ -68,  132],
    ],
    elevation: [
      [0.000,  0.0, 'l'],
      [0.015,  0.0, 'l'],   // ramp one, take-off face
      [0.040,  6.0, 'l'],   // lip
      [0.052,  0.0, 's'],
      [0.180, 11.0, 's'],
      [0.300, 16.0, 's'],   // high point
      [0.420,  6.0, 's'],
      [0.470,  3.0, 's'],
      [0.485,  3.0, 'l'],   // ramp two
      [0.508,  8.8, 'l'],
      [0.520,  3.0, 's'],
      [0.640,  9.0, 's'],
      [0.760, 14.0, 's'],
      [0.880,  4.0, 's'],
      [1.000,  0.0, 's'],
    ],
  },

  {
    id: 'harbour',
    name: 'Harbour Mile',
    blurb: 'Long open sweepers and a flat-out back straight, broken by one nasty chicane.',
    difficulty: 'Easy',
    laps: 3,
    theme: {
      skyTop: '#4f9fd0', skyBottom: '#e3eef2', fog: '#cfe0e6',
      grass: '#8a9358', trees: '#4a7a46', bush: '#5d8a4b',
      rock: '#a8a294', hills: '#8fa8b4', sun: '#fff6e6',
    },
    points: [
      [   0,  205], [ 120,  198], [ 205,  162], [ 238,   88],
      [ 232,   -5], [ 205,  -92], [ 152, -152], [  72, -182],
      [  14, -160], [ -44, -196], [-108, -178], [-172, -140],
      [-212,  -72], [-220,   16], [-198,  104], [-146,  166],
      [ -66,  200],
    ],
    elevation: [
      [0.000,  0.0, 'l'],
      [0.030,  0.0, 'l'],   // one long ramp off the main straight
      [0.058,  7.2, 'l'],
      [0.072,  0.0, 's'],
      [0.220,  5.0, 's'],
      [0.380,  2.0, 's'],
      [0.540,  8.0, 's'],
      [0.700,  3.0, 's'],
      [0.860,  6.5, 's'],
      [1.000,  0.0, 's'],
    ],
  },

  {
    id: 'hollow',
    name: 'Pine Hollow',
    blurb: 'Tight, low and relentless. Almost no straight long enough to rest in.',
    difficulty: 'Hard',
    laps: 4,
    theme: {
      skyTop: '#2f6a96', skyBottom: '#b9cfd6', fog: '#93b0b8',
      grass: '#41682f', trees: '#1f5c33', bush: '#2a6b3a',
      rock: '#6e7568', hills: '#4c6b62', sun: '#ffeed6',
    },
    points: [
      [   0,  146], [  86,  134], [ 140,   94], [ 150,   32],
      [ 118,  -18], [ 150,  -70], [ 136, -130], [  78, -164],
      [   2, -158], [ -58, -124], [ -66,  -58], [-114,  -32],
      [-168,  -58], [-194,   10], [-170,   76], [-126,  120],
      [ -58,  150],
    ],
    elevation: [
      [0.000,  0.0, 's'],
      [0.140,  4.5, 's'],
      [0.280,  1.0, 's'],
      [0.430,  6.0, 's'],
      [0.560,  2.0, 's'],
      [0.700,  7.0, 's'],
      [0.850,  2.5, 's'],
      [1.000,  0.0, 's'],
    ],
  },
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

// Height at a normalised distance around a given circuit.
export function elevationAt(def, u) {
  const kf = def.elevation;
  u -= Math.floor(u);
  let i = 0;
  while (i < kf.length - 2 && kf[i + 1][0] <= u) i++;
  const [u0, h0, ease] = kf[i];
  const [u1, h1] = kf[i + 1];
  const t = u1 > u0 ? (u - u0) / (u1 - u0) : 0;
  return h0 + (h1 - h0) * (ease === 'l' ? t : t * t * (3 - 2 * t));
}
