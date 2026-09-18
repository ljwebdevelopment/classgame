// Central tuning knobs. Everything gameplay-feel related lives here so the
// handling can be dialled in without touching engine code.

export const TRACK = {
  SAMPLES: 720,        // centreline samples used for physics + geometry
  HALF_WIDTH: 6.5,     // asphalt half width
  CURB_WIDTH: 1.4,     // red/white kerb ribbon outside the asphalt
  WALL_MARGIN: 5.0,    // grass runout past the asphalt before the wall
  BARRIER_OFFSET: 6.4, // where the visual barriers sit
  CHECKPOINTS: 8,      // sectors that must be taken in order for a valid lap

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
  ENGINE: 30,          // forward acceleration, units/s^2
  BRAKE: 46,
  REVERSE: 13,
  MAX_REVERSE: 14,

  DRAG_QUAD: 0.006,    // with ENGINE above this settles around 57 u/s
  DRAG_LIN: 0.18,

  GRIP: 7.0,           // lateral velocity damping, 1/s
  GRIP_DRIFT: 1.3,     // handbrake held: the back end lets go
  DRIFT_MIN_SPEED: 9,
  DRIFT_SCRUB: 1.2,    // drifting bleeds a little forward speed too

  MAX_YAW: 2.2,        // rad/s at full lock
  YAW_SPEED_REF: 13,   // steering authority ramps in up to this speed
  DRIFT_YAW: 1.0,      // extra rotation while drifting

  STEER_RATE: 4.0,     // how fast the wheels turn towards the input
  STEER_RETURN: 6.0,   // how fast they centre again

  OFF_DRAG: 2.4,       // grass: heavy drag, no grip, less power
  OFF_GRIP: 3.5,
  OFF_ENGINE_SCALE: 0.45,

  WALL_SCRUB: 1.4,     // speed bled per second while scraping a barrier
  WALL_BOUNCE: 1.1,

  WIDTH: 2.0,
  LENGTH: 3.8,
  WHEEL_RADIUS: 0.42,
};

export const GHOST_HZ = 30;   // ghost recording rate
export const STORAGE_KEY = 'apex-drift.best.v1';
