// Central tuning knobs. Everything gameplay-feel related lives here so the
// handling can be dialled in without touching engine code.

export const TRACK = {
  SAMPLES: 720,        // centreline samples used for physics + geometry
  HALF_WIDTH: 6.5,     // asphalt half width
  CURB_WIDTH: 1.4,     // red/white kerb ribbon outside the asphalt
  WALL_MARGIN: 5.0,    // grass runout past the asphalt before the wall
  BARRIER_OFFSET: 6.4, // where the visual barriers sit
  CHECKPOINTS: 8,      // sectors that must be taken in order for a valid lap
  EMBANKMENT: 30,      // grass slope carrying the raised roadbed down to ground

  // Control points of the circuit, on the XZ plane. Closed centripetal
  // Catmull-Rom loop: long start straight, fast right sweeper, a chicane,
  // a wide far corner and a tight hairpin before the run back.
  POINTS: [
    [   0,  145], [  95,  138], [ 152,  112], [ 176,   58],
    [ 150,   12], [ 100,   -8], [  58,  -34], [  74,  -82],
    [ 132,  -96], [ 166, -136], [ 130, -178], [  58, -182],
    [   8, -150], [  -6,  -98], [ -46,  -78], [ -96,  -94],
    [-132,  -54], [-116,    2], [-152,   46], [-130,  102],
    [ -68,  132],
  ],
};

export const CAR = {
  // Acceleration and drag are tuned as a pair: both were halved from the
  // original so the car still tops out around 57 u/s, it just takes
  // noticeably longer to get there.
  ENGINE: 17,          // forward acceleration, units/s^2
  BRAKE: 46,
  HANDBRAKE: 74,       // space: hauls the car down to a standstill
  REVERSE: 13,
  MAX_REVERSE: 14,

  DRAG_QUAD: 0.0035,
  DRAG_LIN: 0.10,

  GRIP: 7.0,           // lateral velocity damping, 1/s
  GRIP_DRIFT: 1.3,     // handbrake held: the back end lets go
  DRIFT_MIN_SPEED: 9,
  DRIFT_SCRUB: 1.2,    // drifting bleeds a little forward speed too

  MAX_YAW: 2.2,        // rad/s at full lock
  YAW_SPEED_REF: 13,   // steering authority ramps in up to this speed
  DRIFT_YAW: 1.0,      // extra rotation while drifting

  STEER_RATE: 4.0,     // how fast the wheels turn towards the input
  STEER_RETURN: 6.0,   // how fast they centre again

  // grass costs you roughly half your top speed - a real penalty you can
  // still drive out of, not a trap that stops the car dead
  OFF_DRAG: 0.25,
  OFF_GRIP: 4.5,
  OFF_ENGINE_SCALE: 0.7,

  GRAVITY: 24,         // pulls the car back down after a jump
  SLOPE_PULL: 22,      // gravity along the chassis: climbs cost speed
  AIR_YAW: 0.35,       // how much steering authority survives mid-flight
  AIR_GRIP: 0.2,       // almost none - you keep the trajectory you launched on
  LAND_SCRUB: 0.04,    // speed lost on touchdown
  LAUNCH_STICK: 4.0,   // how fast the ground may fall away before wheels lift
  REAL_JUMP: 0.15,     // airtime below this is a bump, not a jump

  WALL_SCRUB: 0.5,     // speed bled per second while scraping a barrier
  WALL_BOUNCE: 1.1,

  WIDTH: 2.0,
  LENGTH: 3.8,
  WHEEL_RADIUS: 0.42,
};

export const GHOST_HZ = 30;   // ghost recording rate
// v2: ghost samples carry height now, so old flat-track ghosts are discarded
export const STORAGE_KEY = 'apex-drift.best.v2';

// Height profile around the lap as [progress, height, easing]. 'l' is a
// straight slope (ramp faces), 's' a smoothstep (rolling hills). The last
// keyframe must return to the height of the first - it is a closed loop.
export const ELEVATION = [
  [0.000,  0.0, 'l'],   // flat over the start line
  [0.015,  0.0, 'l'],   // ramp one, take-off face (start straight, ~5 deg bend)
  [0.040,  6.0, 'l'],   // lip
  [0.052,  0.0, 's'],   // back side drops away
  [0.180, 11.0, 's'],   // long climb
  [0.300, 16.0, 's'],   // high point of the circuit
  [0.420,  6.0, 's'],   // descent
  [0.470,  3.0, 's'],   // approach levels out
  [0.485,  3.0, 'l'],   // ramp two, take-off face (gentle kink, ~13 deg)
  [0.508,  8.8, 'l'],   // lip
  [0.520,  3.0, 's'],   // back side drops away
  [0.640,  9.0, 's'],
  [0.760, 14.0, 's'],
  [0.880,  4.0, 's'],
  [1.000,  0.0, 's'],
];

// Height at a normalised distance around the lap.
export function elevationAt(u) {
  u -= Math.floor(u);
  let i = 0;
  while (i < ELEVATION.length - 2 && ELEVATION[i + 1][0] <= u) i++;
  const [u0, h0, ease] = ELEVATION[i];
  const [u1, h1] = ELEVATION[i + 1];
  const t = u1 > u0 ? (u - u0) / (u1 - u0) : 0;
  return h0 + (h1 - h0) * (ease === 'l' ? t : t * t * (3 - 2 * t));
}
