// Handling check on open grass: turn radius, side grip, does it stay upright, how a drift ends.
//   bun tools/handling.mjs [v1|v2]
import { readFileSync } from "node:fs"
import { Race, initPhysics, HZ, EV } from "../public/sim.mjs"
import { DEFAULT_TRACK as track } from "../public/tracks.mjs"
await initPhysics()
const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
const handling = process.argv[2] || "v2"
const run = (steer, vT, drift = false, secs = 14) => {
  const race = new Race(track, geo, { racers: 1, human: 0, handling })
  race.phase = "race"; race.track_ = () => {}
  const k = race.karts[0]; k.body.setTranslation({ x: 60, y: 0.5, z: 30 }, true)
  let pts = [], minUp = 1, boosts = 0, yaw = 0, n = 0
  for (let s = 0; s < HZ * secs; s++) {
    const v = k.v.currentVehicleSpeed()
    race.step({ 0: { gas: v < vT ? 1 : 0, steer: s > HZ * 5 ? steer : 0, drift: drift && s > HZ * 5 && s < HZ * 8 } })
    for (const e of race.events) if (e.t === EV.boost) boosts++
    if (s > HZ * 9) { const p = k.body.translation(); pts.push([p.x, p.z]); minUp = Math.min(minUp, race.up(k).y); yaw += Math.abs(k.body.angvel().y); n++ }
  }
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const v = k.v.currentVehicleSpeed()
  const R = v / (yaw / n)
  return `steer ${steer} v ${v.toFixed(1)} radius ${R.toFixed(1)} lat ${(v * v / R).toFixed(1)} m/s² min-up ${minUp.toFixed(2)}${drift ? " boosts " + boosts : ""}`
}
console.log(handling)
for (const [s, v] of [[1, 8], [1, 16], [1, 26], [0.4, 26], [0.15, 26]]) console.log("  " + run(s, v))
console.log("  drift " + run(1, 26, true))
