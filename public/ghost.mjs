// Speed-run ghosts: a run is the kart's place and turn 20 times a second from GO, packed as whole
// numbers (metres x100, quaternion x1000). The same file records your run and plays the others back.
export const HZ = 20
export const STRIDE = 7

export class Recorder {
  constructor() { this.f = [] }
  // call every sim step; it writes one frame for every 1/20 s of race time that has gone by
  step(race, k) {
    if (race.phase !== "race" || k.done) return
    const want = Math.floor(race.raceT * HZ + 1e-6)
    while (this.f.length / STRIDE <= want) {
      const p = k.body.translation(), q = k.body.rotation()
      this.f.push(Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100), Math.round(q.x * 1000), Math.round(q.y * 1000), Math.round(q.z * 1000), Math.round(q.w * 1000))
    }
  }
}

// where the ghost is at race time t: { x, y, z, qx, qy, qz, qw }
export function sample(f, t) {
  const n = f.length / STRIDE
  if (!n) return null
  const u = Math.max(0, Math.min(n - 1, t * HZ)), i = Math.floor(u), j = Math.min(n - 1, i + 1), a = u - i
  const g = (k, s) => (f[i * STRIDE + k] * (1 - a) + f[j * STRIDE + k] * a) / s
  const o = { x: g(0, 100), y: g(1, 100), z: g(2, 100), qx: g(3, 1000), qy: g(4, 1000), qz: g(5, 1000), qw: g(6, 1000) }
  const l = Math.hypot(o.qx, o.qy, o.qz, o.qw) || 1
  o.qx /= l; o.qy /= l; o.qz /= l; o.qw /= l
  return o
}

// how far round the loop the ghost is at each frame, in the same metres the sim uses for karts
export function progress(f, circuit, idx0, prog0) {
  const S = circuit.samples, N = S.length, L = circuit.length / N, out = []
  let idx = idx0, prog = prog0
  for (let i = 0; i < f.length; i += STRIDE) {
    const x = f[i] / 100, z = f[i + 2] / 100
    let best = idx, bd = Infinity
    for (let d = -30; d <= 30; d++) {
      const q = S[(idx + d + N) % N], dd = (q.x - x) ** 2 + (q.z - z) ** 2
      if (dd < bd) { bd = dd; best = (idx + d + N) % N }
    }
    let ds = best - idx
    if (ds > N / 2) ds -= N
    if (ds < -N / 2) ds += N
    prog += ds * L; idx = best
    out.push(prog)
  }
  return out
}
export const progAt = (pr, t) => pr[Math.max(0, Math.min(pr.length - 1, Math.floor(t * HZ)))] ?? 0

export const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`
