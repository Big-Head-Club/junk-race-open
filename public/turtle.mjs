// Lays road pieces end to end from a start cell: ["roadStraight", "roadCornerLarge:L", ...].
// :L and :R pick which way a corner turns or a lane shift steps.
// Used for the house tracks and the tests; the editor places pieces by hand.
import { ROADS, worldPath } from "./pieces.mjs"

const close = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.5
const dir = (p, q) => { const l = Math.hypot(q[0] - p[0], q[2] - p[2]); return [(q[0] - p[0]) / l, (q[2] - p[2]) / l] }

export function lay(start, seq) {
  const pieces = [start]
  let path = worldPath(start)
  let tip = path[path.length - 1], head = dir(path[path.length - 2], tip)
  for (const item of seq) {
    const [p, turn] = item.split(":")
    let best = null
    // the way the piece was drawn first (a jump only works one way round), then reversed
    for (const rev of [false, true]) for (let r = 0; r < 4 && !best; r++) for (let di = -4; di <= 4 && !best; di++) for (let dj = -4; dj <= 4 && !best; dj++) {
      const pc = { p, i: Math.floor(tip[0] / 8) + di, j: Math.floor(tip[2] / 8) + dj, r }
      const w = worldPath(pc)
      const q = rev ? w.slice().reverse() : w
      if (!close(q[0], tip)) continue
      const h = dir(q[0], q[1])
      if (h[0] * head[0] + h[1] * head[1] < 0.95) continue
      // R ends up to the right of the way in, L to the left (x right, z down on the map)
      const e = q[q.length - 1], side = head[0] * (e[2] - tip[2]) - head[1] * (e[0] - tip[0])
      if ((turn === "R" && side < 0.5) || (turn === "L" && side > -0.5)) continue
      if (rev && ROADS[p].oneWay) continue
      best = { pc, q }
    }
    if (!best) throw new Error("cannot lay " + item + " at " + tip.map((x) => x.toFixed(1)))
    pieces.push(best.pc)
    tip = best.q[best.q.length - 1]; head = dir(best.q[best.q.length - 2], tip)
  }
  pieces.tip = tip // where the road ends, for callers that size the next run to close a loop
  return pieces
}
