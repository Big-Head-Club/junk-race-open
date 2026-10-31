// Make the next N daily tracks and send a hard bot round each one (weapons on, solo):
//   bun tools/daily-check.mjs [days=20] [from=today]
import { readFileSync } from "node:fs"
import { Race, initPhysics } from "../public/sim.mjs"
import { dailyTrack, today } from "../public/daily.mjs"
import { buildCircuit } from "../public/pieces.mjs"
const [days = 20, from = today()] = process.argv.slice(2)
await initPhysics()
const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
let bad = 0
for (let i = 0; i < +days; i++) {
  const d = new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10)
  const t = dailyTrack(d), len = buildCircuit(t).length
  const race = new Race(t, geo, { racers: 1, human: -1, skill: "hard", seed: 1, laps: 1 })
  const k = race.karts[0], ev = {}
  while (!k.done && race.raceT < 200) { race.step({}); for (const e of race.events) ev[e.t] = (ev[e.t] || 0) + 1 }
  if (!k.done) bad++
  console.log(`${d} ${Math.round(len)} m  ${k.done ? k.finishT.toFixed(1) + " s" : "DID NOT FINISH"}  respawns ${ev[11] || 0} smashes ${ev[17] || 0} bites ${ev[18] || 0} fires ${ev[5] || 0}`)
}
console.log(bad ? `${bad} did not finish` : "all finished")
