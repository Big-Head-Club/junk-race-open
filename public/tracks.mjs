// The house tracks, laid with the turtle so they always close. Props go on cells the loop passes through
// (weapon boxes, pylons) or on free cells beside it (stands, trees).
import { lay } from "./turtle.mjs"
import { buildCircuit, footprint, cellOf, T } from "./pieces.mjs"

const headingR = (tx, tz) => (Math.abs(tx) > Math.abs(tz) ? (tx > 0 ? 3 : 1) : tz > 0 ? 2 : 0)

export function dress(track, { boxes, pylons, crates, stands, trees, seed, zombies = [], skeletons = [], vampires = [] }) {
  const c = buildCircuit(track)
  const at = (s) => c.samples[Math.floor(s * c.samples.length) % c.samples.length]
  const put = (p, s) => { const q = at(s); const [i, j] = cellOf(q.x, q.z); track.props.push({ p, i, j, r: headingR(q.tx, q.tz) }) }
  boxes.forEach((s) => put("itemBox", s)); pylons.forEach((s) => put("pylon", s)); crates.forEach((s) => put("crate", s))
  zombies.forEach((s) => put("zombies", s)); skeletons.forEach((s) => put("skeletons", s)); vampires.forEach((s) => put("vampire", s))
  const road = new Set(); track.pieces.forEach((p) => footprint(p).forEach(([i, j]) => road.add(i + "," + j)))
  const used = new Set(track.props.map((p) => p.i + "," + p.j))
  let x = seed
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647)
  const beside = []
  // two cells out, with a clear cell between, so a wide line through a corner hits grass, not a tree
  const near = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => road.has(i + a + "," + (j + b)))
  road.forEach((k) => { const [i, j] = k.split(",").map(Number); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ci = i + 2 * a, cj = j + 2 * b, n = ci + "," + cj; if (!road.has(n) && !used.has(n) && !near(ci, cj)) beside.push([ci, cj, a, b]) } })
  const take = (p, n, face) => { for (let k = 0; k < n && beside.length; k++) { const [i, j, a, b] = beside.splice(Math.floor(rnd() * beside.length), 1)[0]; if (used.has(i + "," + j)) { k--; continue } used.add(i + "," + j); track.props.push({ p, i, j, r: face ? (a === 1 ? 3 : a === -1 ? 1 : b === 1 ? 2 : 0) : Math.floor(rnd() * 4) }) } }
  take("grandStand", stands, true); take("treeLarge", trees, false); take("treeSmall", trees, false); take("tent", 2, true)
  return track
}

const SHORT = { S: "roadStraight", L2: "roadStraightLong", H: "roadStraightLongBump", J: "roadRamp", BJ: "roadRampLong", B: "roadBump", SK: "roadStraightSkew:R", cR: "roadCornerSmall:R", cL: "roadCornerSmall:L", CR: "roadCornerLarge:R", CL: "roadCornerLarge:L", WR: "roadCornerLarger:R", WL: "roadCornerLarger:L" }
const seq = (s) => s.split(",").map((x) => SHORT[x])

export const HOUSE = {
  // 673 m: a hill and a jump up the west side, a dip south through two jumps, a big jump down the east side
  junkyard: () => dress({
    v: 1, name: "Junkyard Loop", laps: 3, props: [],
    pieces: lay({ p: "roadStartPositions", i: 6, j: 34, r: 0 }, seq("H,S,L2,J,L2,CR,L2,SK,L2,CR,S,S,CL,L2,J,L2,CL,S,S,WR,B,L2,CR,H,L2,BJ,S,S,S,CR,L2,B,L2,H,L2,J,L2,L2,L2,L2,L2,cR")),
  }, { boxes: [0.05, 0.16, 0.27, 0.38, 0.5, 0.61, 0.72, 0.85], pylons: [0.33, 0.8], crates: [0.44, 0.92], stands: 6, trees: 14, seed: 7, zombies: [0.09, 0.2, 0.42, 0.58, 0.66, 0.82], skeletons: [0.13, 0.31, 0.47, 0.75, 0.89], vampires: [0.24, 0.36, 0.53, 0.7, 0.79, 0.95] }),
}
export const DEFAULT_TRACK = HOUSE.junkyard()
