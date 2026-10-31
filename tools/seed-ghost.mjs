// Put a bot's speed run on a track's board so the first player has a ghost to chase:
//   bun tools/seed-ghost.mjs [track=house|daily|YYYY-MM-DD] [skill=hard] [name=Oobi] [server=http://localhost:4731]
import { readFileSync } from "node:fs"
import { Race, initPhysics } from "../public/sim.mjs"
import { DEFAULT_TRACK } from "../public/tracks.mjs"
import { trackKey } from "../public/pieces.mjs"
import { dailyTrack, today } from "../public/daily.mjs"
import { Recorder } from "../public/ghost.mjs"
const [which = "house", skill = "hard", name = "Oobi", server = "http://localhost:4731"] = process.argv.slice(2)
const TRACK = which === "house" ? DEFAULT_TRACK : dailyTrack(which === "daily" ? today() : which)
await initPhysics()
const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
let best = null
for (let seed = 1; seed <= 4; seed++) {
  const race = new Race(TRACK, geo, { racers: 1, human: -1, skill, seed, laps: 1, weapons: false })
  const k = race.karts[0], rec = new Recorder()
  while (!k.done && race.raceT < 300) { race.step({}); rec.step(race, k) }
  console.log(`seed ${seed}: ${k.done ? k.finishT.toFixed(2) + "s" : "did not finish"}`)
  if (k.done && (!best || k.finishT < best.time)) best = { time: k.finishT, frames: rec.f, model: k.model }
}
if (!best) process.exit(1)
const r = await fetch(`${server}/api/runs/${trackKey(TRACK)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, pid: "bot" + name.toLowerCase(), ...best }) }).then((x) => x.json())
console.log(JSON.stringify(r))
