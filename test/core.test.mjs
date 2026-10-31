import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { buildCircuit, overlaps } from "../public/pieces.mjs"
import { lay } from "../public/turtle.mjs"
import { DEFAULT_TRACK } from "../public/tracks.mjs"
import { Race, initPhysics, HZ, EV, WEAPONS } from "../public/sim.mjs"

test("house track closes", () => { const c = buildCircuit(DEFAULT_TRACK); expect(c.ok).toBe(true); expect(c.length).toBeGreaterThan(250) })
test("an open road says where it ends", () => {
  const t = { pieces: DEFAULT_TRACK.pieces.slice(0, -1) }
  const c = buildCircuit(t); expect(c.ok).toBe(false); expect(c.at).toBeTruthy()
})
test("a backwards jump is refused", () => {
  const t = { pieces: DEFAULT_TRACK.pieces.map((p) => (p.p === "roadRamp" ? { ...p, r: (p.r + 2) % 4 } : p)) }
  expect(buildCircuit(t).ok).toBe(false)
})
test("road pieces cannot overlap", () => { expect(overlaps(DEFAULT_TRACK, { ...DEFAULT_TRACK.pieces[1] })).toBe(true) })
test("six bots finish three laps and every weapon fires", async () => {
  await initPhysics()
  const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
  const race = new Race(DEFAULT_TRACK, geo, { racers: 6, human: -1, seed: 3 })
  const fired = new Set()
  let n = 0, forced = 0
  // force one of each weapon early so the test covers them all
  race.step()
  while (race.phase !== "done" && n < HZ * 420) {
    if (race.phase === "race" && n % 240 === 0 && forced < WEAPONS.length) { const k = race.karts[n % 6]; k.weapon = WEAPONS[forced++]; race.fire(k); for (const e of race.events) if (e.t === EV.fire) fired.add(e.w) }
    race.step(); n++
    for (const e of race.events) if (e.t === EV.fire) fired.add(e.w)
  }
  expect(race.phase).toBe("done")
  expect(fired.size).toBe(WEAPONS.length)
}, 120000)

test("a speed run: one kart, no boxes, bad guys on the road, a ghost that plays back where it drove", async () => {
  await initPhysics()
  const { Recorder, sample, progress, progAt, STRIDE } = await import("../public/ghost.mjs")
  const geo = JSON.parse(readFileSync(new URL("../public/geo.json", import.meta.url)))
  const race = new Race(DEFAULT_TRACK, geo, { racers: 1, human: -1, skill: "hard", seed: 3, laps: 1, weapons: false })
  expect(race.karts.length).toBe(1)
  expect(race.boxes.length).toBe(0)
  expect(race.baddies.some((b) => b.kind === "smash")).toBe(true)
  expect(race.baddies.some((b) => b.kind === "dodge")).toBe(true)
  const k = race.karts[0], idx0 = k.idx, prog0 = k.prog, rec = new Recorder()
  let smash = 0
  while (!k.done && race.raceT < 240) { race.step({}); rec.step(race, k); smash += race.events.filter((e) => e.t === EV.smash).length }
  expect(k.done).toBe(true)
  expect(smash).toBeGreaterThan(0)
  const n = rec.f.length / STRIDE
  expect(Math.abs(n - k.finishT * 20)).toBeLessThanOrEqual(2)
  const end = sample(rec.f, k.finishT), p = k.body.translation()
  expect(Math.hypot(end.x - p.x, end.z - p.z)).toBeLessThan(3)
  const pr = progress(rec.f, race.circuit, idx0, prog0)
  expect(progAt(pr, k.finishT)).toBeGreaterThan(race.circuit.length - 10)
}, 120000)

test("every daily track for 60 days closes, fits the grid, and is the same for everyone on the day", async () => {
  const { dailyTrack } = await import("../public/daily.mjs")
  const { trackKey } = await import("../public/pieces.mjs")
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 9, 29) + i * 864e5).toISOString().slice(0, 10)
    const t = dailyTrack(d)
    expect(t).toBeTruthy()
    const c = buildCircuit(t)
    expect(c.ok).toBe(true)
    expect(t.props.some((p) => p.p === "vampire")).toBe(true)
    if (i === 0) expect(trackKey(dailyTrack(d))).toBe(trackKey(t))
  }
})
