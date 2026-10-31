// The snap-to-grid track kit. Every road piece is a Kenney Racing Kit tile with a centre line that runs
// from socket A to socket B; the track is the chain of pieces you get by driving out of the start piece.
// Units: piece paths are in tile units in the model's own frame (x 0..W, z -D..0, the car drives toward -z).
// The world is metres: one tile is T metres. Nothing here draws or simulates.

export const T = 8
export const ROAD_HALF = 0.42 * T // asphalt is 0.082..0.918 of a tile
export const GRID = 40 // cells per side in the editor

const line = (pts) => (n) => {
  const out = []
  for (let k = 0; k <= n; k++) {
    const u = k / n, f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), w = f - i
    out.push([0, 1, 2].map((c) => pts[i][c] + (pts[i + 1][c] - pts[i][c]) * w))
  }
  return out
}
const arc = (R) => (n) => {
  const out = []
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI / 2; out.push([R + 0.5 - R * Math.cos(a), 0, -R * Math.sin(a)]) }
  return out
}
const skew = (n) => {
  const out = []
  for (let k = 0; k <= n; k++) { const u = k / n; out.push([0.5 + u * u * (3 - 2 * u), 0, -2 * u]) }
  return out
}
const hump = (len, h) => (n) => {
  const out = []
  for (let k = 0; k <= n; k++) { const u = k / n; out.push([0.5, h * (1 - Math.cos(2 * Math.PI * u)) / 2, -len * u]) }
  return out
}

// road pieces: w x d footprint in tiles, a centre line, how long it is (for sampling)
export const ROADS = {
  roadStartPositions: { name: "Start", w: 1, d: 2, path: line([[0.5, 0, 0], [0.5, 0, -2]]), start: true },
  roadStraight: { name: "Straight", w: 1, d: 1, path: line([[0.5, 0, 0], [0.5, 0, -1]]) },
  roadStraightLong: { name: "Long straight", w: 1, d: 2, path: line([[0.5, 0, 0], [0.5, 0, -2]]) },
  roadStraightArrow: { name: "Arrow", w: 1, d: 1, path: line([[0.5, 0, 0], [0.5, 0, -1]]) },
  roadCornerSmall: { name: "Tight corner", w: 1, d: 1, path: arc(0.5) },
  roadCornerLarge: { name: "Corner", w: 2, d: 2, path: arc(1.5) },
  roadCornerLarger: { name: "Wide corner", w: 3, d: 3, path: arc(2.5) },
  roadStraightSkew: { name: "Lane shift", w: 2, d: 2, path: skew },
  roadRamp: { name: "Jump", w: 1, d: 1, path: line([[0.5, 0, 0], [0.5, 0.26, -1]]), oneWay: true },
  roadRampLong: { name: "Big jump", w: 1, d: 2, path: line([[0.5, 0, 0], [0.5, 0.51, -2]]), oneWay: true },
  roadStraightLongBump: { name: "Hill", w: 1, d: 4, path: hump(4, 0.5) },
  roadBump: { name: "Bumps", w: 1, d: 2, path: line([[0.5, 0, 0], [0.5, 0, -2]]) },
}

// props sit on top of the roads, one per cell. tile: the model is drawn for the grid (keep its corner origin);
// otherwise it is centred in the cell. dyn: it is a loose body you can knock over. box: a weapon box row.
export const PROPS = {
  itemBox: { name: "Weapon boxes", model: "toy/item-box", box: true },
  zombies: { name: "Zombies", model: "grave/character-zombie", baddie: "smash", count: 2, scale: 2.4 },
  skeletons: { name: "Skeletons", model: "grave/character-skeleton", baddie: "smash", count: 3, scale: 2.6 },
  vampire: { name: "Vampire", model: "grave/character-vampire", baddie: "dodge", count: 1, scale: 5 },
  barrierWall: { name: "Barrier", model: "track/barrierWall", tile: true },
  pylon: { name: "Pylons", model: "car/cone", dyn: true, count: 3, scale: 2.2 },
  crate: { name: "Crates", model: "car/box", dyn: true, count: 2, scale: 2 },
  ramp: { name: "Kicker", model: "track/ramp", tile: true },
  treeLarge: { name: "Tree", model: "track/treeLarge", scale: 1, tile: true },
  treeSmall: { name: "Small tree", model: "track/treeSmall", tile: true },
  grandStand: { name: "Stand", model: "track/grandStandCovered", tile: true },
  tent: { name: "Tent", model: "track/tent", tile: true },
  billboard: { name: "Billboard", model: "track/billboard", tile: true },
  overheadLights: { name: "Gantry", model: "track/overheadLights", tile: true },
  flagCheckers: { name: "Flag", model: "track/flagCheckers", tile: true },
}

// rotation r (0..3) about the anchor cell's centre, the same sense as three.js rotation.y
export function toWorld(pc, lx, ly, lz) {
  const th = pc.r * Math.PI / 2, c = Math.cos(th), s = Math.sin(th)
  const x = (lx - 0.5) * T, z = (lz + 0.5) * T
  return [(pc.i + 0.5) * T + x * c + z * s, ly * T, (pc.j + 0.5) * T - x * s + z * c]
}
export const cellOf = (x, z) => [Math.floor(x / T), Math.floor(z / T)]

export function footprint(pc) {
  const def = ROADS[pc.p]
  const out = []
  for (let cx = 0; cx < def.w; cx++) for (let cz = -def.d; cz < 0; cz++) {
    const [x, , z] = toWorld(pc, cx + 0.5, 0, cz + 0.5)
    out.push(cellOf(x, z))
  }
  return out
}

// the piece's centre line in world metres, A to B
export function worldPath(pc) {
  const def = ROADS[pc.p]
  const n = Math.max(4, Math.round((def.d + def.w) * 6))
  return def.path(n).map((p) => toWorld(pc, p[0], p[1], p[2]))
}

const near = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.8

// Walk the chain from the start piece. Returns { ok, samples, length, order, start, why, at }
// samples: [{ x, y, z, s, tx, tz }] every ~1 m, s from the finish line (start piece's B end) round the loop.
export function buildCircuit(track) {
  const pieces = track.pieces || []
  const starts = pieces.filter((p) => ROADS[p.p] && ROADS[p.p].start)
  if (starts.length === 0) return { ok: false, why: "Place a Start piece." }
  if (starts.length > 1) return { ok: false, why: "Only one Start piece. Remove the others.", at: worldPath(starts[1])[0] }
  const paths = pieces.map((p) => (ROADS[p.p] ? worldPath(p) : null))
  const si = pieces.indexOf(starts[0])
  const used = new Set([si])
  const order = [si]
  const chain = [paths[si]]
  let tip = paths[si][paths[si].length - 1]
  for (let guard = 0; guard < 2000; guard++) {
    if (near(tip, paths[si][0]) && order.length > 1) break
    let found = -1, rev = false
    for (let k = 0; k < pieces.length; k++) {
      if (used.has(k) || !paths[k]) continue
      if (near(paths[k][0], tip)) { found = k; break }
      if (near(paths[k][paths[k].length - 1], tip)) { found = k; rev = true; break }
    }
    if (found < 0) {
      if (near(tip, paths[si][0])) break
      return { ok: false, why: "The road ends here. Join it back to the Start.", at: tip, order }
    }
    if (rev && ROADS[pieces[found].p].oneWay) return { ok: false, why: "This jump faces the wrong way. Turn it round.", at: tip, order }
    used.add(found); order.push(found)
    const pth = rev ? paths[found].slice().reverse() : paths[found]
    chain.push(pth)
    tip = pth[pth.length - 1]
  }
  if (!near(tip, paths[si][0])) return { ok: false, why: "The road ends here. Join it back to the Start.", at: tip, order }
  // rotate so the loop begins at the finish line: the start piece's B end
  const pts = []
  for (let c = 1; c < chain.length; c++) for (let k = c === 1 ? 0 : 1; k < chain[c].length; k++) pts.push(chain[c][k])
  for (let k = 1; k < chain[0].length; k++) pts.push(chain[0][k])
  // resample every ~1 m
  const samples = []
  let s = 0
  samples.push({ x: pts[0][0], y: pts[0][1], z: pts[0][2], s: 0 })
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k]
    const d = Math.hypot(b[0] - a[0], b[2] - a[2])
    const steps = Math.max(1, Math.round(d))
    for (let q = 1; q <= steps; q++) {
      const u = q / steps
      s += d / steps
      samples.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, s })
    }
  }
  samples.pop() // the last one is the finish line again
  const N = samples.length
  for (let k = 0; k < N; k++) {
    const a = samples[(k - 1 + N) % N], b = samples[(k + 1) % N]
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
    samples[k].tx = (b.x - a.x) / l; samples[k].tz = (b.z - a.z) / l
  }
  const unused = pieces.length - used.size
  return { ok: true, samples, length: s, order, start: starts[0], unused }
}

// does a new road piece fit? props have their own layer
export function overlaps(track, pc, skip = -1) {
  const mine = footprint(pc)
  for (const [i, j] of mine) if (i < 0 || j < 0 || i >= GRID || j >= GRID) return true
  const taken = new Set()
  track.pieces.forEach((p, k) => { if (k !== skip) for (const [i, j] of footprint(p)) taken.add(i + "," + j) })
  return mine.some(([i, j]) => taken.has(i + "," + j))
}

// a short name for a track's layout: speed runs and ghosts are kept per layout, so an edit starts a new board
export function trackKey(track) {
  const s = JSON.stringify([track.pieces.map((p) => [p.p, p.i, p.j, p.r]), (track.props || []).map((p) => [p.p, p.i, p.j, p.r || 0])])
  let h = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519) }
  return (h >>> 0).toString(36) + (h2 >>> 0).toString(36)
}
