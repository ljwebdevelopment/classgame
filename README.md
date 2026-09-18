# Apex Drift

A low-poly 3D kart time trial that runs in the browser. One circuit, one clock:
every lap you set is recorded and replayed as a translucent ghost car you race
on the next lap, with a live delta against it.

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
| `W` `A` `S` `D` / arrows | throttle, steer, brake and reverse |
| `Space` or `Shift` | handbrake drift |
| `R` | rescue back onto the racing line |
| `Enter` | restart the lap |
| `M` | mute/unmute | 
| `C` | clear the stored best lap and ghost |

Touch controls appear automatically on phones and tablets.

## How it works

- **Track** — a closed centripetal Catmull-Rom spline (`src/config.js` holds the
  control points). It is sampled at even arc-length intervals once, and that
  single sample array drives the road geometry, the kerbs, the barriers and
  every physics query, so the collision surface always matches what is drawn.
- **Physics** — `src/car.js` splits the car's world velocity into forward and
  lateral components each step. Steering rotates the chassis; lateral grip
  decides how much of the old velocity survives. Pulling the handbrake drops
  the grip, which is what makes the back end step out. It runs on a fixed
  120 Hz step so lap times do not depend on your frame rate.
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
