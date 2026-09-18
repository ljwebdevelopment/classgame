# Apex Drift

A low-poly 3D kart time trial that runs in the browser. One circuit over rolling
hills with two jump ramps, one clock: every lap you set is recorded and replayed
as a translucent ghost car you race on the next lap, with a live delta against
it.

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
  runtime dependencies. All textures (asphalt, grass, start line) are generated
  on a canvas at load, so there are no image assets to ship.

## Deploying

The project is plain static files with no build step. From the repo root:

```bash
npx vercel deploy --prod
```

`vercel.json` only sets cache headers; there is nothing to configure.

## Layout

```
index.html        page shell and HUD markup
style.css         HUD, title screen and touch controls
src/config.js     tuning constants and the track control points
src/track.js      spline, road/kerb/barrier geometry, physics queries
src/car.js        arcade kart physics and the car mesh
src/scenery.js    sky, ground, trees, hills, skid marks
src/ghost.js      lap recording, playback and localStorage
src/input.js      keyboard and touch input
src/audio.js      synthesised engine and tyre noise
src/hud.js        HUD formatting and updates
src/main.js       scene setup, game loop, lap logic, camera
vendor/           Three.js (MIT), vendored
```
