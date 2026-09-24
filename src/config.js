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

