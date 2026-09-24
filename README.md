# Apex Drift

A low-poly 3D racing game that runs in the browser. Three circuits, two modes:
time trial against the ghost of your own best lap, or a race from the back of a
six-car grid.

| Circuit | Length | Tightest corner | Character |
| --- | --- | --- | --- |
| Harbour Mile | 1418u | R27 | Easy — open sweepers, one chicane |
| Ridgeline | 1263u | R23 | Medium — rolling hills, two jump ramps |
| Pine Hollow | 1148u | R16 | Hard — tight, low, relentless |

Circuits are data (`src/tracks.js`): control points, a height profile, a lap
count and a palette. The difficulty labels are the measured tightest corner
radius, not a guess.

## Play

Open `index.html` through any static web server (ES modules need `http://`,
not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Input | Action |
| --- | --- |
| `W` / `Up` | throttle |
| `S` / `Down` | brake, then reverse |
| `A` `D` / `Left` `Right` | steer |
| `Space` | stop — hauls the car to a standstill, never into reverse |
| `Shift` | handbrake drift |
| `R` | rescue back onto the racing line |
| `Enter` | restart the lap |
| `Esc` / `P` | pause, settings and quality |
| `M` | mute/unmute |
| `C` | clear the stored best lap and ghost |

Touch controls appear automatically on phones and tablets.

## How it works

- **Track** — a closed centripetal Catmull-Rom spline on the XZ plane
  (`src/config.js` holds the control points), with a separate height profile
  laid over it. It is sampled at even arc-length intervals once, and that
  single sample array drives the road geometry, the kerbs, the barriers and
  every physics query, so the collision surface always matches what is drawn.
- **Hills and ramps** — `ELEVATION` in `src/config.js` is a list of
  `[progress, height, easing]` keyframes. `'s'` smoothsteps between them for
  rolling hills; `'l'` interpolates straight, which is what shapes the two jump
  ramps. Beyond the barriers the roadbed is carried down to ground level by a
  grass embankment, and scenery is planted on whatever height it lands on.
- **Physics** — `src/car.js` splits the car's world velocity into forward and
  lateral components each step. Steering rotates the chassis; lateral grip
  decides how much of the old velocity survives. Pulling the handbrake drops
  the grip, which is what makes the back end step out. It runs on a fixed
  120 Hz step so lap times do not depend on your frame rate.
- **Jumps** — the car leaves the ground exactly when staying on it would need
  more downward acceleration than gravity supplies, which is what the lip of a
  ramp does, and lands when the ground catches up with it again. No jump
  triggers or trigger volumes: it falls out of the height profile. Mid-air it
  keeps almost no grip and little steering authority, so you commit to the line
  you took off on. Gravity also acts along the chassis, so climbs cost speed
  and descents give it back.
- **Lap validation** — the lap is cut into eight sectors that must be passed in
  order, so shortcutting the course does not shorten a lap.
- **Ghosts** — the current lap is sampled at 30 Hz (position, heading and lap
  progress). A new best replaces the stored ghost in `localStorage`; lap
  progress in each sample is what makes the live `+/-` delta possible.
- **Rendering** — Three.js, vendored in `vendor/` so the page has no external
  runtime dependencies. Every texture — asphalt, grass, start line, sponsor
  banners, braking boards, catch fencing, clouds, particle sprites — is drawn
  on a canvas at load, so there are no image assets to ship at all.
- **Startup** — the build runs as labelled stages that yield to the browser
  between each one (`src/loader.js`), so the progress bar paints instead of the
  page freezing. The last stage calls `renderer.compile()`, which moves shader
  compilation off the first frame and out of the opening corner.
- **Detail** — trackside dressing is placed off measured curvature rather than
  fixed distances: `findCorners()` in `src/props.js` reads the sampled tangents,
  so tyre stacks and 100/50 braking boards land on the corners that actually
  exist and on the correct side of them.
- **Effects** — one instanced pool per blend mode (`src/particles.js`): soft
  puffs for tyre smoke, grass spray and landing dust, additive specks for
  barrier sparks. The whole effects layer is two draw calls. Camera shake is
  driven by landing force and barrier contact, and the speed vignette is a CSS
  overlay rather than a post-processing pass.
- **Opponents** — six AI drivers (`src/ai.js`) run through the same `Car` and
  the same physics the player does: no rubber-banding and no grip advantage.
  They read the curvature ahead to choose a corner speed, take a line that
  swings wide then tightens, and lift only when actually closing on a slower
  car — reacting to mere proximity deadlocks a standing grid, where every car
  brakes for the stationary one in front of it. Skill buys cornering
  commitment as well as straight-line pace, which is what strings a field out
  on a twisty circuit rather than leaving it nose-to-tail.
- **Rivals and career** — `src/stats.js` keeps per-circuit bests and ghosts
  plus career totals. The rival board is generated per circuit from its length
  against a par lap, and your best is slotted in by time. Those rivals are
  in-game content, not real players, and the board says so.
- **Quality** — two tiers scale shadows, pixel ratio, scenery and particle
  counts (`src/settings.js`). The tier is guessed from the device on first run,
  corrected once if the first few seconds of racing cannot hold ~32fps, and
  overridable from the pause menu. `prefers-reduced-motion` disables the
  vignette, camera shake and the countdown animation.

## Deploying

The project is plain static files with no build step. From the repo root:

```bash
npx vercel deploy --prod
```

`vercel.json` only sets cache headers; there is nothing to configure.

## Layout

```
index.html        page shell, HUD, loading, pause and failure screens
style.css         HUD, menus, touch controls, speed vignette
src/config.js     tuning constants, track control points, height profile
src/track.js      spline, road/kerb/barrier geometry, physics queries
src/car.js        arcade kart physics, car mesh and brake lights
src/scenery.js    sky, ground, trees, bushes, hills, skid marks
src/props.js      tyre stacks, banners, braking boards, grandstand, fence
src/particles.js  instanced smoke, dirt, sparks and landing dust
src/ghost.js      lap recording, playback and localStorage
src/input.js      keyboard and touch input
src/audio.js      synthesised engine and tyre noise
src/hud.js        HUD formatting and updates
src/loader.js     staged startup so the loading bar actually paints
src/settings.js   quality tiers and persisted preferences
src/main.js       scene setup, game loop, lap logic, camera, effects
vendor/           Three.js (MIT), vendored
```
