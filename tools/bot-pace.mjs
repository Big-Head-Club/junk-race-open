// Bot pace: average speed, resets, and where on the loop they crawl. bun tools/bot-pace.mjs [v1|v2] [secs]
import { readFileSync } from "node:fs"
import { Race, initPhysics, HZ, EV } from "../public/sim.mjs"
import { DEFAULT_TRACK } from "../public/tracks.mjs"
await initPhysics()
const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
const race = new Race(DEFAULT_TRACK, geo, { racers: 6, human: -1, seed: 4, handling: process.argv[2] || "v2" })
// no weapon boxes: this measures driving alone
race.boxes.length = 0
const secs = +(process.argv[3] || 60), slow = {}, resp = {}
let sum = 0, n = 0
for (let s = 0; s < HZ * secs; s++) {
  race.step()
  if (race.phase !== "race") continue
  for (const k of race.karts) { const v = Math.abs(k.v.currentVehicleSpeed()); sum += v; n++; if (v < 6) { const b = Math.floor(k.idx / 20) * 20; slow[b] = (slow[b] || 0) + 1 } }
  for (const e of race.events) if (e.t === EV.respawn) { const b = Math.floor(race.karts[e.k].idx / 20) * 20; resp[b] = (resp[b] || 0) + 1 }
}
console.log(process.argv[2] || "v2", "avg speed", (sum / n).toFixed(1), "m/s; laps", race.karts.map((k) => (k.prog / race.circuit.length).toFixed(2)).join(" "))
console.log("  crawl (<6 m/s) by sample:", JSON.stringify(Object.fromEntries(Object.entries(slow).filter(([, c]) => c > 60))))
console.log("  resets by sample:", JSON.stringify(resp))
