# Junk Race

Sloppy little karts, wild weapons and slow bad guys. A low poly kart racer in the browser, with a daily time trial,
ghosts you can send to friends, races against bots, and a snap-to-grid track builder.

Play it at https://junkrace.xyz

## Run it

You need [Bun](https://bun.sh) 1.3 or newer.

    bun install
    bun server.js

Then open http://localhost:4731. The track builder is at http://localhost:4731/build.

Boards and saved tracks go in `data/` (or `DATA_DIR`), as plain JSON.

## What's in here

- `public/sim.mjs` the race: karts, weapons, bad guys, on Rapier physics, stepped at 60 Hz
- `public/view.mjs`, `public/scene.mjs` drawing it with three.js
- `public/game.mjs` the screens: home, race, results
- `public/daily.mjs` today's track, made from the date
- `public/editor.mjs` the track builder
- `server.js` the static files, shared tracks and the time-trial boards
- `tools/` race sims, screenshot and check scripts (Playwright)
- `docs/DECISIONS.md` every design call and the numbers behind it

## No sound effects

The game's sound effects come from the Sonniss GDC bundles, whose licence does not allow sharing the files, so they
are not in this copy. The game runs silent where they would play. Drop your own `bonk`, `clang`, `go`, `lose`,
`pickup`, `thud`, `tick`, `whoosh` and `win` mp3s into `public/sfx/` to hear them. The music is here (CC0).

## Credits

Design and direction: Mack Flavelle. Built with Claude Code.
Karts, track pieces and props: Kenney (kenney.nl), CC0. Music: Abstraction (abstractionmusic.com), CC0.
Physics: Rapier (Dimforge). Rendering: three.js. Fonts: Kenney Future (CC0), Space Grotesk (OFL).
Full list in `credits.json`.

This copy is refreshed from the game's own repo, so pull requests here will not be merged back by hand.
