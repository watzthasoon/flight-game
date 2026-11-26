# EMBERWING — Canyon Courier

[![Make the best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/watzthasoon/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/watzthasoon/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An original 3D flight game built for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057). Fly the Kestrel K-7 bush plane down a river canyon at dusk, thread the glowing rings, mind your fuel, and put her down on the lit strip at Ember Flats.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open http://localhost:8080) and fly with keyboard and mouse. No network needed — everything the game loads lives under `game/`.

| Control | Action |
| --- | --- |
| `W` / `S` | Throttle up / down |
| `↑` / `↓` | Pitch up / down (rotate for takeoff) |
| `A` / `D` or `←` / `→` | Bank left / right (turns the plane) |
| Mouse | Hold the button and move to steer — the pointer is a virtual stick |
| `Space` | Airbrake |
| `C` | Cycle camera (chase / cockpit / high) |
| `P` | Pause |
| `M` | Mute |
| `R` | Restart the sortie |
| `Enter` | Start / confirm |

## The sorties

1. **First Light** — 6 rings, gentle wind, generous fuel. Learn the canyon.
2. **Canyon Run** — 10 rings, crosswind gusts, tighter fuel.
3. **Night Mail** — 12 rings in the dark, narrow gaps, thinnest fuel.

Each ring is worth points and a splash of fuel. Land on the Ember Flats strip to finish a sortie: a soft, centred landing pays a bonus. Hit the rock, run dry, or slam the strip and the sortie is over.

## What is inside

- `game/index.html` — the page and the HUD.
- `game/styles.css` — HUD and menu styling.
- `game/src/config.js` — missions, tuning, palette, bindings.
- `game/src/util.js` — maths, seeded random, value noise.
- `game/src/terrain.js` — canyon heightfield, river, strips, sky, clouds, lights.
- `game/src/aircraft.js` — the Kestrel K-7, built from primitives.
- `game/src/rings.js` — ring placement, beacons, pass detection.
- `game/src/physics.js` — the flight model: lift, drag, stall, wind, landings.
- `game/src/audio.js` — synthesised engine, wind and chimes (WebAudio, no files).
- `game/src/hud.js` — instruments, compass, minimap, menus, toasts.
- `game/src/game.js` — state machine, missions, scoring, camera, main loop.
- `game/src/main.js` — boot.
- `game/vendor/three.min.js` — vendored Three.js r149 (MIT).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
- `screenshots/` — real renders of the game running in a browser.

## Build the hand-in locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` is Node 22, standard library only, and writes the same bytes on every run.
