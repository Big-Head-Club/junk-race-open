// Headless races: six bots on a track at each skill. Proves the track can be finished and the weapons fire.
//   bun tools/race-sim.mjs [skill] [races]
import { readFileSync } from "node:fs"
import { Race, initPhysics, HZ, EV, WEAPONS } from "../public/sim.mjs"
import { DEFAULT_TRACK } from "../public/tracks.mjs"

await initPhysics()
const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
const skills = process.argv[2] ? [process.argv[2]] : ["easy", "normal", "hard"]
const races = Number(process.argv[3] || 2)
for (const skill of skills) for (let r = 0; r < races; r++) {
  const race = new Race(DEFAULT_TRACK, geo, { racers: 6, human: -1, skill, seed: 11 + r })
  const tally = {}
  let steps = 0
  const t0 = performance.now()
  while (race.phase !== "done" && steps < HZ * 420) {
    race.step()
    for (const e of race.events) { const n = Object.keys(EV).find((k) => EV[k] === e.t); tally[n] = (tally[n] || 0) + 1; if (e.t === EV.fire) tally["w_" + e.w] = (tally["w_" + e.w] || 0) + 1 }
    steps++
  }
  const ms = performance.now() - t0
  const times = race.karts.map((k) => (k.done ? k.finishT.toFixed(1) : "DNF@" + (k.prog / race.circuit.length).toFixed(2)))
  console.log(skill, "race", r, "finish", race.phase === "done" ? "yes" : "NO", "in", (steps / HZ).toFixed(0) + "s", "times", times.join(" "), `(${(ms / steps).toFixed(2)} ms/step)`)
  console.log("   ", JSON.stringify(tally))
}
