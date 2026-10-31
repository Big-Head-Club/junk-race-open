// The daily time trial track: one loop a day for everyone, made from the date (UTC).
// A loop is four sides joined by right-hand corners. Each side is a run of straights, hills, bumps and jumps,
// with lane shifts in pairs and a step (a left-right wiggle) on some days. The last two runs are sized so the
// loop closes; a layout that crosses itself or leaves the grid is thrown away and the next seed tried.
import { lay } from "./turtle.mjs"
import { buildCircuit, footprint, worldPath, GRID, T } from "./pieces.mjs"
import { dress } from "./tracks.mjs"

export const today = () => new Date().toISOString().slice(0, 10)

const S = "roadStraight", L2 = "roadStraightLong", H = "roadStraightLongBump", J = "roadRamp", BJ = "roadRampLong", B = "roadBump"
const CORNER = { 0.5: "roadCornerSmall", 1.5: "roadCornerLarge", 2.5: "roadCornerLarger" }

function rng(seed) { let x = seed % 2147483647 || 1; return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646 }
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }

// n tiles of road: hills, bumps and jumps, a jump always lands on two tiles of straight
function run(n, rnd, plain = false) {
  const out = []
  while (n > 0) {
    const r = rnd()
    if (!plain && n >= 4 && r < 0.2) { out.push(H); n -= 4 }
    else if (!plain && n >= 4 && r < 0.32) { out.push(BJ, L2); n -= 4 }
    else if (!plain && n >= 3 && r < 0.45) { out.push(J, L2); n -= 3 }
    else if (!plain && n >= 2 && r < 0.55) { out.push(B); n -= 2 }
    else if (n >= 2) { out.push(L2); n -= 2 }
    else { out.push(S); n -= 1 }
  }
  return out
}

function attempt(rnd) {
  const d = [0, 1, 2, 3].map(() => [1.5, 1.5, 2.5][Math.floor(rnd() * 3)]) // corner sizes
  const C = (i, side = ":R") => CORNER[d[i]] + side
  const a = 6 + Math.floor(rnd() * 10), b = 8 + Math.floor(rnd() * 12), far = 10 + Math.floor(rnd() * 12)
  // lane shifts come in pairs on opposite sides so they cancel out
  const sNS = rnd() < 0.5 ? (rnd() < 0.5 ? ":R" : ":L") : null, sEW = rnd() < 0.4 ? (rnd() < 0.5 ? ":R" : ":L") : null
  const sk = (s) => (s ? ["roadStraightSkew" + s] : [])
  const step = rnd() < 0.6 ? 2 + Math.floor(rnd() * 4) : 0, sd = rnd() < 0.5 ? 1.5 : 0.5 // a right-left wiggle on the far side
  const wiggle = step ? [CORNER[sd] + ":R", ...run(step, rnd, true), CORNER[sd] + ":L"] : []
  const head = [
    ...run(a, rnd), ...sk(sNS), C(0),
    ...run(b, rnd), ...sk(sEW), C(1),
    ...run(Math.floor(far / 2), rnd), ...wiggle, ...run(far - Math.floor(far / 2), rnd), ...sk(sNS), C(2),
    ...sk(sEW),
  ]
  const start = { p: "roadStartPositions", i: 0, j: 0, r: 0 }
  // lay it once with no west run and no tail to see how far is left to go, then size both to close
  let probe
  try { probe = lay(start, [...head, C(3)]) } catch { return null }
  const s0 = worldPath(start)[0], w = (probe.tip[0] - s0[0]) / T, t = (probe.tip[2] - s0[2]) / T
  if (w < 3 || t < 2 || Math.abs(w - Math.round(w)) > 0.05 || Math.abs(t - Math.round(t)) > 0.05) return null
  let pieces
  try { pieces = lay(start, [...head, ...run(Math.round(w), rnd), C(3), ...run(Math.round(t), rnd, true)]) } catch { return null }
  // centre it on the grid, then check it fits, closes and never crosses itself
  const cells = pieces.flatMap(footprint)
  const mi = Math.min(...cells.map((c) => c[0])), xi = Math.max(...cells.map((c) => c[0]))
  const mj = Math.min(...cells.map((c) => c[1])), xj = Math.max(...cells.map((c) => c[1]))
  if (xi - mi > GRID - 8 || xj - mj > GRID - 8) return null
  const oi = Math.floor((GRID - (xi - mi)) / 2) - mi, oj = Math.floor((GRID - (xj - mj)) / 2) - mj
  pieces = pieces.map((p) => ({ ...p, i: p.i + oi, j: p.j + oj }))
  const seen = new Set()
  for (const [i, j] of pieces.flatMap(footprint)) { const key = i + "," + j; if (seen.has(key)) return null; seen.add(key) }
  const track = { v: 1, name: "", laps: 1, props: [], pieces }
  const c = buildCircuit(track)
  if (!c.ok || c.length < 380 || c.length > 760) return null
  return track
}

export function dailyTrack(date = today()) {
  const rnd = rng(hash("junk-race:" + date))
  for (let tries = 0; tries < 400; tries++) {
    const t = attempt(rnd)
    if (!t) continue
    const n = Math.round(buildCircuit(t).length / 55) // a box row, a pack of bad guys, about every 55 m
    // spaced round the loop, clear of the start grid and the run-in to the line
    const spread = (k, from) => Array.from({ length: k }, (_, i) => 0.06 + 0.86 * ((from + i / k + rnd() * 0.04) % 1))
    t.name = "Daily " + date.slice(5).replace("-", "/")
    t.date = date
    return dress(t, {
      boxes: spread(Math.max(4, Math.round(n * 0.6)), 0.06), pylons: spread(2, 0.3), crates: spread(2, 0.55),
      zombies: spread(Math.ceil(n * 0.35), 0.1), skeletons: spread(Math.ceil(n * 0.3), 0.2), vampires: spread(Math.ceil(n * 0.3), 0.15),
      stands: 5, trees: 14, seed: (rnd() * 1e6) | 1,
    })
  }
  return null
}
