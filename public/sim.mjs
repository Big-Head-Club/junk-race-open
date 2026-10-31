// The race: Rapier world, track colliders, karts on raycast wheels, weapons, weapon boxes, bots, laps.
// Runs in the browser (view.mjs draws it) and headless in bun (tools/race-sim.mjs). Nothing here draws.
// Metres, seconds, y up. A kart's nose points along its local +z.
import RAPIER from "@dimforge/rapier3d-compat"
import { T, ROADS, PROPS, toWorld, buildCircuit, ROAD_HALF } from "./pieces.mjs"

export const HZ = 60
export const DT = 1 / HZ
export const KS = 1.6 // kart model scale
export const SKILLS = ["easy", "normal", "hard"]
export const WEAPONS = ["junk", "harpoon", "flip", "ball", "fan", "rain", "portal", "tornado"]
export const WEAPON_NAME = { junk: "Junk Cannon", harpoon: "Harpoon", flip: "Gravity Flip", ball: "Wrecking Ball", fan: "Big Fan", rain: "Golf Ball Storm", portal: "Portal", tornado: "Tornado" }
export const WEAPON_RULE = {
  junk: "Fires a sofa, a fridge and a bathtub straight ahead.",
  harpoon: "Hooks the kart ahead of you and reels you past it.",
  flip: "Turns gravity off for every kart near you. They float, then drop.",
  ball: "Drags a giant ball behind you on a rope for 9 seconds.",
  fan: "Blows every kart in front of you off the road.",
  rain: "Drops giant golf balls on the race leader.",
  portal: "Grabs the kart ahead and drops it far back down the track, still at full speed.",
  tornado: "Sends a tornado down the road. Every kart it hits goes straight up, very high.",
}
export const JUNK = ["loungeSofa", "kitchenFridge", "toilet", "bathtub", "washer", "bear"]
export const DEBRIS = ["debris-bumper", "debris-door", "debris-tire", "debris-spoiler-a", "debris-spoiler-b", "debris-plate-small-a", "debris-bolt"]
export const KARTS = ["kart-oobi", "kart-oodi", "kart-ooli", "kart-oopi", "kart-oozi"]
export const EV = { bonk: 1, eject: 2, land: 3, pickup: 4, fire: 5, hook: 6, finish: 7, lap: 8, go: 9, count: 10, respawn: 11, jump: 12, boxback: 13, boost: 14, portal: 15, toss: 16, smash: 17, bite: 18 }

export const TUNE = {
  g: 18, mass: 160, engine: 1100, brake: 18, reverse: 500, vmax: 27, steerLo: 0.55, steerHi: 0.2,
  restLen: 0.32, wheelR: 0.34, stiff: 70, comp: 4.0, relax: 4.5, slip: 1.5, slipDrift: 0.7, side: 1.0,
  grassDrag: 1.6, grassEngine: 0.55, airYaw: 3.0, airPitch: 3.2,
  bonkDv: 6.5, ejectDv: 12, ejectT: 1.4, upsideT: 1.3, lostD: 26,
  laps: 3, countT: 3, boxT: 3.5, junkV: 34, harpoonT: 2.2, harpoonK: 5200, flipT: 1.9, flipUp: 1.55, ballT: 9, ballR: 1.4,
  fanT: 2.6, fanRange: 30, fanPush: 5200, rainN: 11, rainR: 1.1,
  portalBack: 90, tornadoT: 8, tornadoV: 31, tornadoR: 4.5, tossV: 44,
}
// handling: "v2" is the assisted arcade feel (yaw follows the stick, side slip is held, no flips from
// steering, a drift charges a boost); "v1" is the first build's raw raycast car. ?tweaks flips between them.
export const HANDLING = {
  v2: { steerLo: 0.42, steerHi: 0.08, yawLo: 2.3, yawHi: 1.35, yawK: 14, grip: 4.5, driftGrip: 1.1, driftYaw: 1.55, roll: 7, level: 4, airYaw: 2.2, airPitch: 2.4 },
  v1: null,
}
// bots: how much engine, how wobbly the line, how long before they use a weapon, how well they aim
export const SKILL = {
  easy: { engine: 0.8, wander: 2.2, think: 2.6, aim: 0.4, brake: 0.85 },
  normal: { engine: 0.92, wander: 1.3, think: 1.4, aim: 0.7, brake: 0.95 },
  hard: { engine: 1.0, wander: 0.6, think: 0.6, aim: 0.95, brake: 1.05 },
}

let ready = null
export const initPhysics = () => (ready ||= RAPIER.init())

const rng = (seed) => { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296) }
const len = (v) => Math.hypot(v.x, v.y, v.z)
const rot = (q, v) => { // rotate v by quaternion q
  const { x, y, z, w } = q, ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x }
}
const yawQ = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) })

export class Race {
  // track: the JSON from the editor. geo: public/geo.json. opts: { racers, human (index or -1), skill, seed, laps }
  constructor(track, geo, opts = {}) {
    this.track = track
    this.geo = geo
    this.circuit = buildCircuit(track)
    if (!this.circuit.ok) throw new Error(this.circuit.why)
    this.laps = opts.laps || track.laps || TUNE.laps
    this.skill = opts.skill || "normal"
    this.handling = opts.handling === "v1" ? null : { ...HANDLING.v2, ...(opts.tune || {}) }
    this.rnd = rng(opts.seed || 1)
    this.t = 0
    this.phase = "count" // count -> race -> done
    this.clock = TUNE.countT
    this.events = []
    this.world = new RAPIER.World({ x: 0, y: -TUNE.g, z: 0 })
    this.world.timestep = DT
    this.loose = [] // junk, debris, balls, props: { body, model, scale, die }
    this.boxes = []
    this.ropes = []
    this.tornados = []
    this.baddies = []
    this.weaponsOn = opts.weapons !== false
    this.portals = []
    this.buildTrack()
    this.karts = []
    const n = opts.racers || 6
    for (let k = 0; k < n; k++) this.addKart(k, k === opts.human ? "human" : "bot")
    this.finishOrder = []
    this.raceT = 0
    this.rank()
  }

  emit(t, a = {}) { this.events.push({ t, ...a }) }

  buildTrack() {
    const W = this.world
    // the grass: a big flat floor under everything
    const floor = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(T * 14, -0.6, T * 14))
    W.createCollider(RAPIER.ColliderDesc.cuboid(T * 40, 0.5, T * 40).setFriction(0.9), floor)
    this.floorY = -0.1
    for (const pc of this.track.pieces) {
      const g = this.geo.pieces[pc.p]
      if (!g || !ROADS[pc.p]) continue
      const pos = new Float32Array(g.pos.length)
      for (let k = 0; k < g.pos.length; k += 3) { const w = toWorld(pc, g.pos[k], g.pos[k + 1], g.pos[k + 2]); pos[k] = w[0]; pos[k + 1] = w[1]; pos[k + 2] = w[2] }
      const body = W.createRigidBody(RAPIER.RigidBodyDesc.fixed())
      W.createCollider(RAPIER.ColliderDesc.trimesh(pos, new Uint32Array(g.idx)).setFriction(1.0), body)
    }
    for (const pr of this.track.props || []) this.addProp(pr)
  }

  // the road's height under a point (0 on the grass): weapon boxes and loose props sit on it, not in it
  groundY(x, z) {
    let best = null, bd = Infinity
    for (const q of this.circuit.samples) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q } }
    return best && Math.sqrt(bd) < ROAD_HALF + 1 ? best.y : 0
  }

  propBox(model, scale) {
    const b = this.geo.boxes[model]
    return { hx: ((b.max[0] - b.min[0]) / 2) * scale, hy: ((b.max[1] - b.min[1]) / 2) * scale, hz: ((b.max[2] - b.min[2]) / 2) * scale, cx: ((b.max[0] + b.min[0]) / 2) * scale, cy: ((b.max[1] + b.min[1]) / 2) * scale, cz: ((b.max[2] + b.min[2]) / 2) * scale }
  }

  addProp(pr) {
    const def = PROPS[pr.p]
    if (!def) return
    const W = this.world
    const th = pr.r * Math.PI / 2
    if (def.box) {
      if (!this.weaponsOn) return
      // a row of three boxes across the road
      for (let k = -1; k <= 1; k++) {
        const [x, , z] = toWorld(pr, 0.5 + k * 0.28, 0, -0.5)
        this.boxes.push({ x, y: this.groundY(x, z) + 1.1, z, back: 0, id: this.boxes.length })
      }
      return
    }
    if (def.baddie) {
      // bad guys walk a fixed beat (a function of the clock) so every speed run meets them the same way
      const th2 = pr.r * Math.PI / 2
      const fwd = { x: -Math.sin(th2), z: -Math.cos(th2) }, across = { x: Math.cos(th2), z: -Math.sin(th2) }
      const [cx, , cz] = toWorld(pr, 0.5, 0, -0.5)
      for (let k = 0; k < def.count; k++) {
        const b = { kind: def.baddie, model: def.model, scale: def.scale, cx, cz, cy: this.groundY(cx, cz), fwd, across, phase: k * (2 * Math.PI / def.count) + (pr.i * 7 + pr.j * 3) % 6, alive: true, back: 0, id: this.baddies.length, x: cx, z: cz, y: 0, face: 0 }
        if (b.kind === "dodge") {
          b.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, b.cy, cz))
          W.createCollider(RAPIER.ColliderDesc.capsule(1.3, 1.1).setTranslation(0, 2.4, 0).setFriction(0.2).setRestitution(0.6), b.body)
        }
        let best = Infinity
        this.circuit.samples.forEach((q, i) => { const d = (q.x - cx) ** 2 + (q.z - cz) ** 2; if (d < best) { best = d; b.si = i } })
        this.baddies.push(b)
        this.moveBaddie(b, 0)
      }
      return
    }
    const scale = def.scale || T
    if (def.dyn) {
      const bx = this.propBox(def.model, scale)
      for (let k = 0; k < (def.count || 1); k++) {
        const u = def.count > 1 ? (k / (def.count - 1) - 0.5) * 0.55 : 0
        const [x, , z] = toWorld(pr, 0.5 + u, 0, -0.5)
        const body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, this.groundY(x, z) + bx.hy + 0.05, z).setRotation(yawQ(th)).setLinearDamping(0.3).setAngularDamping(0.4).setCanSleep(true))
        // pylons are light and round so a kart shoves them aside instead of beaching on them
        const cd = pr.p === "pylon" ? RAPIER.ColliderDesc.capsule(bx.hy * 0.6, Math.min(bx.hx, bx.hz) * 0.8).setDensity(1.5) : RAPIER.ColliderDesc.cuboid(bx.hx, bx.hy, bx.hz).setDensity(3)
        W.createCollider(cd.setFriction(0.5).setRestitution(0.4), body)
        this.loose.push({ body, model: def.model, scale, ox: -bx.cx, oy: -bx.cy, oz: -bx.cz, die: Infinity, kind: "prop" })
      }
      return
    }
    // a fixed prop drawn for the tile grid: one box collider over its bounds
    const b = this.geo.boxes[def.model]
    const s = def.scale && !def.tile ? def.scale : T
    const lx = (b.min[0] + b.max[0]) / 2, ly = (b.min[1] + b.max[1]) / 2, lz = (b.min[2] + b.max[2]) / 2
    const [x, , z] = def.tile ? toWorld(pr, lx * s / T, 0, lz * s / T) : toWorld(pr, 0.5, 0, -0.5)
    const hx = ((b.max[0] - b.min[0]) / 2) * s, hy = ((b.max[1] - b.min[1]) / 2) * s, hz = ((b.max[2] - b.min[2]) / 2) * s
    if (pr.p === "ramp") {
      // the kicker is a wedge: a tilted box
      const body = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, z).setRotation(yawQ(th)))
      const slope = Math.atan2(b.max[1] - b.min[1], b.max[2] - b.min[2])
      const half = Math.hypot(hy, hz)
      const q = { x: Math.sin(slope / 2), y: 0, z: 0, w: Math.cos(slope / 2) }
      W.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.15, half).setRotation(q).setTranslation(0, hy - 0.15, 0).setFriction(0.8), body)
      return
    }
    if (pr.p === "overheadLights") return // drive under it
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, hy, z).setRotation(yawQ(th)))
    W.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(hx, 0.1), hy, Math.max(hz, 0.1)).setFriction(0.5).setRestitution(0.2), body)
  }

  gridSpot(k) {
    const c = this.circuit, N = c.samples.length
    const row = Math.floor(k / 2), lane = k % 2 ? 1 : -1
    const s = Math.round(3 + row * 4.5)
    const q = c.samples[(N - s) % N]
    return { x: q.x + q.tz * lane * -1.7, y: 0.6, z: q.z - q.tx * lane * -1.7, yaw: Math.atan2(q.tx, q.tz), s: -s }
  }

  addKart(k, who) {
    const W = this.world
    const sp = this.gridSpot(k)
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(sp.x, sp.y, sp.z).setRotation(yawQ(sp.yaw)).setLinearDamping(0.05).setAngularDamping(0.8).setCcdEnabled(true))
    const col = W.createCollider(RAPIER.ColliderDesc.roundCuboid(0.6, 0.22, 0.85, 0.12).setTranslation(0, 0.8, 0.15).setFriction(0.4).setRestitution(0.35)
      .setMassProperties(TUNE.mass, { x: 0, y: -0.5, z: -0.1 }, { x: 70, y: 80, z: 40 }, { x: 0, y: 0, z: 0, w: 1 }), body)
    const v = W.createVehicleController(body)
    v.indexUpAxis = 1
    v.setIndexForwardAxis = 2
    const wx = 0.28 * KS, wz = [0.32 * KS, -0.36 * KS], wy = 0.21 * KS + TUNE.restLen
    for (const [x, z] of [[wx, wz[0]], [-wx, wz[0]], [wx, wz[1]], [-wx, wz[1]]]) {
      v.addWheel({ x, y: wy, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, TUNE.restLen, TUNE.wheelR)
    }
    for (let i = 0; i < 4; i++) {
      v.setWheelSuspensionStiffness(i, TUNE.stiff); v.setWheelSuspensionCompression(i, TUNE.comp); v.setWheelSuspensionRelaxation(i, TUNE.relax)
      v.setWheelFrictionSlip(i, TUNE.slip); v.setWheelSideFrictionStiffness(i, TUNE.side); v.setWheelMaxSuspensionTravel(i, 0.32); v.setWheelMaxSuspensionForce(i, 40000)
    }
    const kart = {
      id: k, who, body, col, v, model: KARTS[k % KARTS.length],
      input: { steer: 0, gas: 0, drift: false, fire: false, respawn: false },
      prog: sp.s, idx: (this.circuit.samples.length + sp.s) % this.circuit.samples.length, lap: 0, done: false, finishT: 0, place: k + 1,
      weapon: null, fireLatch: false, busy: 0, ejected: 0, driver: null, upside: 0, lastV: { x: 0, y: 0, z: 0 }, air: 0, grounded: true,
      flip: 0, fan: 0, hook: null, ball: null, offroad: false, lane: (this.rnd() - 0.5) * 2, laneT: 0, think: 0, stuck: 0, backT: 0, boost: 0, hitT: 0,
    }
    this.karts.push(kart)
    return kart
  }

  // --- the step -------------------------------------------------------------------------------
  step(inputs = {}) {
    this.events.length = 0
    this.t += DT
    if (this.phase === "count") {
      const before = Math.ceil(this.clock)
      this.clock -= DT
      if (Math.ceil(this.clock) !== before && this.clock > 0) this.emit(EV.count, { n: Math.ceil(this.clock) })
      if (this.clock <= 0) { this.phase = "race"; this.raceT = 0; this.emit(EV.go) }
    } else this.raceT += DT
    for (const k of this.karts) {
      if (k.who === "human" && inputs[k.id]) Object.assign(k.input, inputs[k.id])
      if (k.who === "bot") this.drive(k)
      this.control(k)
    }
    this.weaponsStep()
    this.baddiesStep()
    this.world.step()
    for (const k of this.karts) this.after(k)
    this.boxesStep()
    this.cleanup()
    this.rank()
  }

  forward(k) { return rot(k.body.rotation(), { x: 0, y: 0, z: 1 }) }
  up(k) { return rot(k.body.rotation(), { x: 0, y: 1, z: 0 }) }

  control(k) {
    const v = k.v, inp = k.input, body = k.body, H = this.handling
    const frozen = this.phase === "count" || k.ejected > 0
    const speed = v.currentVehicleSpeed()
    const skill = k.who === "bot" ? SKILL[this.skill] : { engine: 1 }
    const spd = Math.min(1, Math.abs(speed) / TUNE.vmax)
    const lo = H ? H.steerLo : TUNE.steerLo, hi = H ? H.steerHi : TUNE.steerHi
    const steer = -inp.steer * (lo + (hi - lo) * spd)
    v.setWheelSteering(0, steer); v.setWheelSteering(1, steer)
    // drift: hold it through a corner, let go for a boost
    const drifting = H && inp.drift && k.grounded && Math.abs(speed) > 9 && Math.abs(inp.steer) > 0.3 && !frozen
    if (drifting) k.driftT = (k.driftT || 0) + DT
    else if (k.driftT) {
      if (k.driftT > 0.6 && H) { k.boost = Math.max(k.boost, k.driftT > 1.5 ? 1.1 : 0.6); this.emit(EV.boost, { k: k.id, big: k.driftT > 1.5 }) }
      k.driftT = 0
    }
    let engine = 0, brake = 0
    if (frozen) brake = TUNE.brake * 0.4
    else if (inp.gas > 0) {
      const top = TUNE.vmax * (k.boost > 0 ? 1.35 : 1) * (k.offroad ? 0.6 : 1)
      const low = H ? 1 + 0.6 * (1 - spd) : 1 // more shove off the line
      engine = speed < top ? inp.gas * TUNE.engine * low * skill.engine * (k.offroad ? TUNE.grassEngine : 1) * (k.boost > 0 ? 1.8 : 1) : 0
    } else if (inp.gas < 0) {
      if (speed > 1) brake = -inp.gas * TUNE.brake
      else engine = inp.gas * TUNE.reverse
    } else brake = 0.6
    const rearSlip = H ? (drifting ? 0.9 : TUNE.slip) : inp.drift ? TUNE.slipDrift : TUNE.slip
    for (const i of [2, 3]) { v.setWheelEngineForce(i, engine); v.setWheelBrake(i, brake); v.setWheelFrictionSlip(i, rearSlip) }
    for (const i of [0, 1]) { v.setWheelEngineForce(i, 0); v.setWheelBrake(i, brake) }
    v.updateVehicle(DT)
    let contact = 0
    for (let i = 0; i < 4; i++) if (v.wheelIsInContact(i)) contact++
    k.grounded = contact >= 2
    const up = this.up(k), fw = this.forward(k)
    const right = { x: up.y * fw.z - up.z * fw.y, y: up.z * fw.x - up.x * fw.z, z: up.x * fw.y - up.y * fw.x }
    const I = 80 // about the kart's yaw inertia
    if (H && k.grounded && !frozen && k.flip <= 0) {
      // the kart turns at the rate the stick asks for, not whatever the tyres happen to do
      const w = body.angvel()
      const wy = w.x * up.x + w.y * up.y + w.z * up.z
      const dir = speed < -0.5 ? -1 : 1
      const rate = Math.min(1, Math.abs(speed) / 6) * (H.yawLo + (H.yawHi - H.yawLo) * spd) * (drifting ? H.driftYaw : 1)
      const want = -inp.steer * rate * dir
      const J = (want - wy) * I * Math.min(1, H.yawK * DT)
      // roll and pitch from steering are damped out: hits flip you, corners do not
      const wr = w.x * fw.x + w.y * fw.y + w.z * fw.z, wp = w.x * right.x + w.y * right.y + w.z * right.z
      const dR = -wr * 60 * Math.min(1, H.roll * DT), dP = -wp * 70 * Math.min(1, H.roll * DT) * 0.5
      body.applyTorqueImpulse({ x: up.x * J + fw.x * dR + right.x * dP, y: up.y * J + fw.y * dR + right.y * dP, z: up.z * J + fw.z * dR + right.z * dP }, true)
      // side slip: the tyres hold the line; a drift lets the back step out
      const lv = body.linvel()
      const side = lv.x * right.x + lv.y * right.y + lv.z * right.z
      const keep = Math.max(0, 1 - (drifting ? H.driftGrip : H.grip) * DT)
      const ds = side * (keep - 1)
      // what the tyres scrub off the side goes partly into going forward
      const fwd = Math.abs(ds) * 0.35 * Math.sign(speed || 1)
      body.setLinvel({ x: lv.x + right.x * ds + fw.x * fwd, y: lv.y, z: lv.z + right.z * ds + fw.z * fwd }, true)
    }
    if (!k.grounded) {
      k.air += DT
      if (!frozen) {
        const airYaw = H ? H.airYaw : TUNE.airYaw, airPitch = H ? H.airPitch : TUNE.airPitch
        // new handling: tricks only while Drift is held; otherwise the kart rights itself for the landing
        const trick = !H || inp.drift
        const ty = -inp.steer * airYaw * DT * 60, tp = trick ? inp.gas * airPitch * DT * 60 : 0
        let lx = 0, ly = 0, lz = 0
        if (H && !trick && k.flip <= 0) {
          const ax = up.y * 0 - up.z * 1, az = up.x * 1 - up.y * 0 // up x worldUp
          const L = H.level * DT * 60
          lx = ax * L * 1.2; lz = az * L * 1.2
          const w = body.angvel(); lx -= w.x * 0.6; lz -= w.z * 0.6
        }
        body.applyTorqueImpulse({ x: up.x * ty + right.x * tp + lx, y: up.y * ty + right.y * tp + ly, z: up.z * ty + right.z * tp + lz }, true)
      }
    } else {
      if (k.air > 0.45) this.emit(EV.land, { k: k.id, air: k.air })
      k.air = 0
    }
    // grass slows you down
    if (k.offroad && k.grounded) {
      const lv = body.linvel(), f = Math.max(0, 1 - TUNE.grassDrag * DT)
      body.setLinvel({ x: lv.x * f, y: lv.y, z: lv.z * f }, true)
    }
    // fire
    if (inp.fire && !k.fireLatch && k.weapon && this.phase === "race" && !k.ejected) this.fire(k)
    k.fireLatch = inp.fire
    if (inp.respawn && !k.respawnLatch && this.phase === "race") this.respawn(k)
    k.respawnLatch = inp.respawn
  }

  after(k) {
    const p = k.body.translation(), lv = k.body.linvel()
    // a big change of velocity in one step is a hit: shed a part, maybe lose the driver
    const dv = Math.hypot(lv.x - k.lastV.x, lv.z - k.lastV.z, (lv.y - k.lastV.y) * 0.35)
    k.lastV = { x: lv.x, y: lv.y, z: lv.z }
    if (k.hitT > 0) k.hitT -= DT
    if (dv > TUNE.bonkDv && k.hitT <= 0 && this.phase === "race") {
      k.hitT = 0.25
      this.emit(EV.bonk, { k: k.id, x: p.x, y: p.y, z: p.z, pow: dv })
      this.shed(k, dv > TUNE.ejectDv ? 3 : 1)
      if (dv > TUNE.ejectDv && !k.ejected) this.eject(k)
    }
    if (k.ejected > 0) {
      k.ejected -= DT
      if (k.ejected <= 0) { this.world.removeRigidBody(k.driver); k.driver = null; this.emit(EV.land, { k: k.id, driver: true }) }
    }
    if (k.boost > 0) k.boost -= DT
    // upside down too long, fell off the world, or lost: back on the road
    const up = this.up(k)
    k.upside = up.y < 0.25 ? k.upside + DT : 0
    if (k.upside > TUNE.upsideT || p.y < -15) this.respawn(k)
    this.track_(k)
  }

  track_(k) {
    const c = this.circuit, S = c.samples, N = S.length
    const p = k.body.translation()
    let best = k.idx, bd = Infinity
    for (let d = -30; d <= 30; d++) {
      const q = S[(k.idx + d + N) % N]
      const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
      if (dd < bd) { bd = dd; best = (k.idx + d + N) % N }
    }
    let ds = best - k.idx
    if (ds > N / 2) ds -= N
    if (ds < -N / 2) ds += N
    const L = c.length / N
    k.prog += ds * L
    k.idx = best
    k.dist = Math.sqrt(bd)
    k.offroad = k.dist > ROAD_HALF + 0.4 && !this.onProp(p)
    if (k.dist > TUNE.lostD && this.phase === "race") this.respawn(k)
    // under the road: beside a hill or a ramp, on the grass, pushing against its side
    k.under = p.y < S[best].y - 1.2 ? (k.under || 0) + DT : 0
    if (k.under > 2.5 && this.phase === "race") { k.under = 0; this.respawn(k) }
    const lap = Math.floor(k.prog / c.length) + 1
    if (lap > k.lap && this.phase === "race" && !k.done) {
      if (lap > this.laps) {
        k.done = true; k.finishT = this.raceT
        this.finishOrder.push(k.id)
        this.emit(EV.finish, { k: k.id, place: this.finishOrder.length })
      } else if (lap > 1) this.emit(EV.lap, { k: k.id, lap })
      k.lap = Math.min(lap, this.laps)
    }
  }
  onProp() { return false }

  rank() {
    const live = this.karts.slice().sort((a, b) => {
      const fa = this.finishOrder.indexOf(a.id), fb = this.finishOrder.indexOf(b.id)
      if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb)
      return b.prog - a.prog
    })
    live.forEach((k, i) => (k.place = i + 1))
    this.order = live
    // the race is over for you when you finish (the bots keep driving behind the results)
    const humans = this.karts.filter((k) => k.who === "human")
    if (this.phase === "race" && (humans.length ? humans.every((k) => k.done) : this.karts.every((k) => k.done))) this.phase = "done"
  }

  respawn(k) {
    const S = this.circuit.samples, N = S.length
    // a few metres back, on the centre of the road
    const q = S[(k.idx - 4 + N) % N]
    const hit = this.world.castRay(new RAPIER.Ray({ x: q.x, y: q.y + 30, z: q.z }, { x: 0, y: -1, z: 0 }), 60, true, undefined, undefined, undefined, k.body)
    const y = hit ? q.y + 30 - hit.timeOfImpact + 0.6 : q.y + 1
    k.body.setTranslation({ x: q.x, y, z: q.z }, true)
    k.body.setRotation(yawQ(Math.atan2(q.tx, q.tz)), true)
    k.body.setLinvel({ x: q.tx * 6, y: 0, z: q.tz * 6 }, true)
    k.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    k.lastV = { x: q.tx * 6, y: 0, z: q.tz * 6 }
    k.upside = 0; k.flip = 0; k.idx = (k.idx - 4 + N) % N; k.prog -= 4 * this.circuit.length / N
    if (k.hook) k.hook = null
    this.emit(EV.respawn, { k: k.id, x: q.x, y, z: q.z })
  }

  // --- slop -------------------------------------------------------------------------------------
  shed(k, n) {
    const p = k.body.translation(), lv = k.body.linvel()
    for (let i = 0; i < n; i++) {
      const model = DEBRIS[Math.floor(this.rnd() * DEBRIS.length)]
      this.spawnLoose("car/" + model, KS, { x: p.x + (this.rnd() - 0.5), y: p.y + 1.2, z: p.z + (this.rnd() - 0.5) },
        { x: lv.x * 0.5 + (this.rnd() - 0.5) * 8, y: 5 + this.rnd() * 5, z: lv.z * 0.5 + (this.rnd() - 0.5) * 8 }, 6, 2)
    }
  }

  eject(k) {
    const p = k.body.translation(), lv = k.body.linvel()
    k.ejected = TUNE.ejectT
    const d = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + 1.6, p.z).setLinvel(lv.x * 0.6 + (this.rnd() - 0.5) * 6, 9 + this.rnd() * 4, lv.z * 0.6 + (this.rnd() - 0.5) * 6)
      .setAngvel({ x: (this.rnd() - 0.5) * 20, y: (this.rnd() - 0.5) * 20, z: (this.rnd() - 0.5) * 20 }))
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.45).setDensity(3).setRestitution(0.6), d)
    k.driver = d
    this.emit(EV.eject, { k: k.id, x: p.x, y: p.y, z: p.z })
  }

  spawnLoose(model, scale, at, vel, life, density = 4, spin = 6, kind = "junk") {
    const bx = this.propBox(model, scale)
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setLinvel(vel.x, vel.y, vel.z)
      .setAngvel({ x: (this.rnd() - 0.5) * spin, y: (this.rnd() - 0.5) * spin, z: (this.rnd() - 0.5) * spin }).setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(0.3))
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.08, bx.hx), Math.max(0.08, bx.hy), Math.max(0.08, bx.hz)).setDensity(density).setFriction(0.6).setRestitution(0.35), body)
    const o = { body, model, scale, ox: -bx.cx, oy: -bx.cy, oz: -bx.cz, die: this.t + life, kind }
    this.loose.push(o)
    return o
  }

  spawnBall(model, r, at, vel, life, density) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setLinvel(vel.x, vel.y, vel.z).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.2))
    this.world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(density).setFriction(0.3).setRestitution(0.55), body)
    const o = { body, model, scale: r / 0.035, ox: 0, oy: 0, oz: 0, die: this.t + life, kind: "ball", r }
    this.loose.push(o)
    return o
  }

  cleanup() {
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const o = this.loose[i]
      const p = o.body.translation()
      if (this.t > o.die || p.y < -20) {
        for (const r of this.ropes) if (r.ball === o) r.dead = true
        this.world.removeRigidBody(o.body); this.loose.splice(i, 1)
      }
    }
    this.ropes = this.ropes.filter((r) => {
      if (!r.dead && this.t < r.until) return true
      if (r.joint) this.world.removeImpulseJoint(r.joint, true)
      return false
    })
  }

  // --- weapons ------------------------------------------------------------------------------------
  boxesStep() {
    for (const b of this.boxes) {
      if (b.back > this.t) continue
      for (const k of this.karts) {
        if (k.ejected > 0) continue
        const p = k.body.translation()
        if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < 2.4 * 2.4 && Math.abs(p.y + 0.6 - b.y) < 2.5) {
          b.back = this.t + TUNE.boxT
          this.emit(EV.boxback, { box: b.id, x: b.x, y: b.y, z: b.z })
          if (!k.weapon) { k.weapon = this.roll(k); this.emit(EV.pickup, { k: k.id, w: k.weapon }) }
          break
        }
      }
    }
  }

  roll(k) {
    // the further back you are, the more you get the weapons that hit the leaders
    const back = (k.place - 1) / Math.max(1, this.karts.length - 1)
    const w = { junk: 1.2 - back * 0.5, harpoon: 0.4 + back * 1.2, flip: 0.8, ball: 1.1 - back * 0.4, fan: 0.9, rain: back * 1.4, portal: 0.3 + back * 1.3, tornado: 0.9 }
    if (k.place === 1) w.rain = 0
    // alone on the road (a time trial) a box only gives what does something with nobody to hit
    if (this.karts.length === 1) { w.harpoon = 0; w.flip = 0; w.portal = 0 }
    let sum = 0
    for (const n of WEAPONS) sum += Math.max(0, w[n])
    let x = this.rnd() * sum
    for (const n of WEAPONS) { x -= Math.max(0, w[n]); if (x <= 0) return n }
    return "junk"
  }

  ahead(k, range, cone) {
    const p = k.body.translation(), f = this.forward(k)
    let best = null, bd = range
    for (const o of this.karts) {
      if (o === k) continue
      const q = o.body.translation(), d = Math.hypot(q.x - p.x, q.z - p.z)
      if (d > bd || d < 0.5) continue
      const dot = ((q.x - p.x) * f.x + (q.z - p.z) * f.z) / d
      if (dot < Math.cos(cone)) continue
      best = o; bd = d
    }
    return best
  }

  fire(k) {
    const w = k.weapon
    k.weapon = null
    const p = k.body.translation(), f = this.forward(k), lv = k.body.linvel()
    this.emit(EV.fire, { k: k.id, w, x: p.x, y: p.y, z: p.z })
    if (w === "junk") {
      const picks = [JUNK[Math.floor(this.rnd() * 4)], "bathtub", JUNK[Math.floor(this.rnd() * JUNK.length)]]
      picks.forEach((m, i) => {
        const at = { x: p.x + f.x * (2.6 + i * 1.6), y: p.y + 1.6 + i * 0.5, z: p.z + f.z * (2.6 + i * 1.6) }
        const side = (i - 1) * 2.2
        this.spawnLoose("junk/" + m, 2.6, at, { x: lv.x + f.x * TUNE.junkV + f.z * side, y: 3 + i, z: lv.z + f.z * TUNE.junkV - f.x * side }, 8, 6, 5)
      })
    } else if (w === "harpoon") {
      const target = this.ahead(k, 70, 0.6)
      k.hook = { target: target ? target.id : -1, until: this.t + TUNE.harpoonT, miss: target ? null : { x: p.x + f.x * 40, y: p.y + 1, z: p.z + f.z * 40 } }
      if (target) this.emit(EV.hook, { k: k.id, target: target.id })
    } else if (w === "flip") {
      for (const o of this.karts) {
        if (o === k) continue
        const q = o.body.translation()
        if (Math.hypot(q.x - p.x, q.z - p.z) < 38) {
          o.flip = TUNE.flipT
          o.body.applyTorqueImpulse({ x: (this.rnd() - 0.5) * 900, y: (this.rnd() - 0.5) * 500, z: (this.rnd() - 0.5) * 900 }, true)
        }
      }
      k.flipFx = this.t
    } else if (w === "ball") {
      const at = { x: p.x - f.x * 7, y: p.y + 1.6, z: p.z - f.z * 7 }
      const ball = this.spawnBall("golf/ball-red", TUNE.ballR, at, lv, TUNE.ballT + 4, 90)
      const jd = RAPIER.JointData.rope(7.5, { x: 0, y: 0.6, z: -1.0 }, { x: 0, y: 0, z: 0 })
      const joint = this.world.createImpulseJoint(jd, k.body, ball.body, true)
      this.ropes.push({ k: k.id, ball, joint, until: this.t + TUNE.ballT })
    } else if (w === "fan") {
      k.fan = TUNE.fanT
    } else if (w === "rain") {
      const lead = this.order.find((o) => o !== k && !o.done) || this.order[0]
      const S = this.circuit.samples, N = S.length
      for (let i = 0; i < TUNE.rainN; i++) {
        const q = S[(lead.idx + 10 + Math.floor(i * 5.5) + N) % N]
        const off = (this.rnd() - 0.5) * ROAD_HALF * 1.6
        const m = ["golf/ball-red", "golf/ball-blue", "golf/ball-green"][i % 3]
        this.spawnBall(m, TUNE.rainR, { x: q.x + q.tz * off, y: q.y + 26 + i * 2.2, z: q.z - q.tx * off }, { x: 0, y: -6, z: 0 }, 9, 40)
      }
      this.rainOn = { k: lead.id, t: this.t }
    } else if (w === "portal") {
      // the kart just ahead in the race (or just behind, if you lead) goes back down the road
      const byProg = this.karts.filter((o) => o !== k && !o.done)
      const ahead = byProg.filter((o) => o.prog > k.prog).sort((a, b) => a.prog - b.prog)[0]
      const behind = byProg.filter((o) => o.prog <= k.prog).sort((a, b) => b.prog - a.prog)[0]
      const t = ahead || behind
      if (t) this.portal(t, k)
    } else if (w === "tornado") {
      const S = this.circuit.samples, N = S.length
      this.tornados.push({ owner: k.id, s: k.idx + 4, x: p.x + f.x * 5, z: p.z + f.z * 5, y: p.y, born: this.t, id: this.t, hit: new Map(), phase: this.rnd() * 6 })
    }
  }

  // move a kart back along the road, keeping its speed and its angle to the road
  portal(t, by) {
    const S = this.circuit.samples, N = S.length, L = this.circuit.length / N
    const back = Math.round(TUNE.portalBack / L)
    const from = t.body.translation()
    const a = S[t.idx], b = S[(t.idx - back + N * 4) % N]
    // where it sits across the road, and which way it points relative to the road, carry over
    const off = (from.x - a.x) * a.tz - (from.z - a.z) * a.tx
    const lv = t.body.linvel()
    const ya = Math.atan2(a.tx, a.tz), yb = Math.atan2(b.tx, b.tz), turn = yb - ya
    const c = Math.cos(turn), sn = Math.sin(turn)
    const nv = { x: lv.x * c + lv.z * sn, y: Math.max(lv.y, 0), z: -lv.x * sn + lv.z * c }
    const q = t.body.rotation(), dq = yawQ(turn)
    const nq = { x: dq.w * q.x + dq.x * q.w + dq.y * q.z - dq.z * q.y, y: dq.w * q.y - dq.x * q.z + dq.y * q.w + dq.z * q.x, z: dq.w * q.z + dq.x * q.y - dq.y * q.x + dq.z * q.w, w: dq.w * q.w - dq.x * q.x - dq.y * q.y - dq.z * q.z }
    const x = b.x + b.tz * off, z = b.z - b.tx * off
    const hit = this.world.castRay(new RAPIER.Ray({ x, y: b.y + 30, z }, { x: 0, y: -1, z: 0 }), 60, true, undefined, undefined, undefined, t.body)
    const y = (hit ? b.y + 30 - hit.timeOfImpact : b.y) + (from.y - (a.y || 0)) + 0.4
    t.body.setTranslation({ x, y, z }, true)
    t.body.setRotation(nq, true)
    t.body.setLinvel(nv, true)
    t.lastV = nv
    t.prog -= back * L; t.idx = (t.idx - back + N * 4) % N
    if (t.hook) t.hook = null
    for (const o of this.karts) if (o.hook && o.hook.target === t.id) o.hook = null
    this.portals.push({ a: { x: from.x, y: from.y, z: from.z, yaw: ya }, b: { x, y, z, yaw: yb }, t: this.t, k: t.id })
    this.emit(EV.portal, { k: by.id, target: t.id })
  }

  weaponsStep() {
    const S = this.circuit.samples, N = S.length
    this.portals = this.portals.filter((p) => this.t - p.t < 1.6)
    this.tornados = this.tornados.filter((tw) => {
      if (this.t - tw.born > TUNE.tornadoT) return false
      // it runs down the road, weaving from side to side
      tw.s += TUNE.tornadoV * DT / (this.circuit.length / N)
      const q = S[Math.floor(tw.s) % N]
      const off = Math.sin((this.t - tw.born) * 1.7 + tw.phase) * ROAD_HALF * 0.75
      const tx = q.x + q.tz * off, tz = q.z - q.tx * off
      tw.x += (tx - tw.x) * Math.min(1, DT * 6); tw.z += (tz - tw.z) * Math.min(1, DT * 6); tw.y = q.y
      for (const o of this.karts) {
        if (o.id === tw.owner && this.t - tw.born < 1) continue
        if (tw.hit.has(o.id)) continue
        const p = o.body.translation()
        if (Math.hypot(p.x - tw.x, p.z - tw.z) > TUNE.tornadoR || p.y > tw.y + 12) continue
        tw.hit.set(o.id, this.t)
        o.body.setLinvel({ x: (this.rnd() - 0.5) * 3, y: TUNE.tossV, z: (this.rnd() - 0.5) * 3 }, true)
        o.body.setAngvel({ x: (this.rnd() - 0.5) * 4, y: 9 + this.rnd() * 6, z: (this.rnd() - 0.5) * 4 }, true)
        o.lastV = o.body.linvel()
        o.tossed = this.t
        this.emit(EV.toss, { k: tw.owner, target: o.id })
      }
      for (const o of this.loose) {
        const p = o.body.translation()
        if (Math.hypot(p.x - tw.x, p.z - tw.z) < TUNE.tornadoR && p.y < tw.y + 6 && o.kind !== "prop") o.body.applyImpulse({ x: 0, y: o.body.mass() * 2, z: 0 }, true)
      }
      return true
    })
    for (const k of this.karts) {
      const body = k.body
      if (k.flip > 0) {
        k.flip -= DT
        const lv = body.linvel()
        if (lv.y < 9) body.applyImpulse({ x: 0, y: TUNE.mass * TUNE.g * TUNE.flipUp * DT, z: 0 }, true)
      }
      if (k.hook) {
        if (this.t > k.hook.until) k.hook = null
        else if (k.hook.target >= 0) {
          const o = this.karts[k.hook.target]
          const p = body.translation(), q = o.body.translation()
          const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
          if (d < 2.5) { k.hook = null; k.boost = 1.2 } // reeled past: slingshot
          else {
            const n = { x: (q.x - p.x) / d, y: (q.y - p.y) / d + 0.15, z: (q.z - p.z) / d }
            const J = TUNE.harpoonK * DT
            body.applyImpulse({ x: n.x * J, y: n.y * J * 0.5, z: n.z * J }, true)
            o.body.applyImpulse({ x: -n.x * J * 0.8, y: J * 0.25, z: -n.z * J * 0.8 }, true)
          }
        }
      }
      if (k.fan > 0) {
        k.fan -= DT
        const p = body.translation(), f = this.forward(k)
        const push = (b, scale) => {
          const q = b.translation(), dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz)
          if (d > TUNE.fanRange || d < 0.5) return
          const ahead = (dx * f.x + dz * f.z) / d
          if (ahead < 0.75) return
          const side = Math.sign(dx * f.z - dz * f.x) || 1
          const J = TUNE.fanPush * DT * (1 - d / TUNE.fanRange) * scale
          b.applyImpulse({ x: f.x * J * 0.6 + f.z * side * J, y: J * 0.18, z: f.z * J * 0.6 - f.x * side * J }, true)
        }
        for (const o of this.karts) if (o !== k) push(o.body, 1)
        for (const o of this.loose) push(o.body, o.body.mass() / TUNE.mass * 1.2)
      }
    }
  }

  moveBaddie(b, t) {
    const prevX = b.x, prevZ = b.z
    if (b.kind === "smash") {
      // shuffle back and forth across the road
      const u = Math.sin(t * 0.42 + b.phase)
      b.x = b.cx + b.across.x * u * ROAD_HALF * 0.9 + b.fwd.x * Math.cos(b.phase) * 2
      b.z = b.cz + b.across.z * u * ROAD_HALF * 0.9 + b.fwd.z * Math.cos(b.phase) * 2
    } else {
      // a slow prowl up and down the cell, drifting across
      const u = Math.sin(t * 0.3 + b.phase), w = Math.sin(t * 0.21 + b.phase * 2)
      b.x = b.cx + b.fwd.x * u * T * 0.45 + b.across.x * w * ROAD_HALF * 0.55
      b.z = b.cz + b.fwd.z * u * T * 0.45 + b.across.z * w * ROAD_HALF * 0.55
      b.body.setNextKinematicTranslation({ x: b.x, y: b.cy, z: b.z })
    }
    b.y = b.cy
    if (Math.hypot(b.x - prevX, b.z - prevZ) > 1e-4) b.face = Math.atan2(b.x - prevX, b.z - prevZ)
  }

  baddiesStep() {
    for (const b of this.baddies) {
      this.moveBaddie(b, this.t)
      if (!b.alive) { if (this.t > b.back) b.alive = true; else continue }
      for (const k of this.karts) {
        const p = k.body.translation()
        const d = Math.hypot(p.x - b.x, p.z - b.z)
        if (Math.abs(p.y - b.y) > 3) continue
        if (b.kind === "smash" && d < 1.9) {
          // smash: it flies, you get a shove forward
          const lv = k.body.linvel()
          b.alive = false; b.back = this.t + 7
          this.spawnLoose(b.model, b.scale, { x: b.x, y: b.y + 1.2, z: b.z }, { x: lv.x * 1.15 + (this.rnd() - 0.5) * 6, y: 9 + this.rnd() * 5, z: lv.z * 1.15 + (this.rnd() - 0.5) * 6 }, 4, 1, 14, "baddie")
          k.boost = Math.max(k.boost, 0.45)
          this.emit(EV.smash, { k: k.id, x: b.x, y: b.y, z: b.z })
          break
        }
        if (b.kind === "dodge" && d < 2.3 && (k.bitT || 0) < this.t && !k.ejected) {
          k.bitT = this.t + 4 // a bitten kart gets a few seconds to get clear
          if (!k.ejected && this.phase === "race") this.eject(k)
          const lv = k.body.linvel()
          k.body.setLinvel({ x: lv.x * 0.2 + (p.x - b.x) * 3, y: 6, z: lv.z * 0.2 + (p.z - b.z) * 3 }, true)
          this.emit(EV.bite, { k: k.id, x: b.x, y: b.y, z: b.z })
        }
      }
    }
  }

  // --- bots -------------------------------------------------------------------------------------
  drive(k) {
    const sk = SKILL[this.skill]
    const S = this.circuit.samples, N = S.length
    const p = k.body.translation(), f = this.forward(k)
    const speed = k.v.currentVehicleSpeed()
    k.laneT -= DT
    if (k.laneT <= 0) { k.laneT = 1.5 + this.rnd() * 2.5; k.lane = Math.max(-1, Math.min(1, k.lane + (this.rnd() - 0.5) * sk.wander)) }
    const look = Math.round(7 + Math.max(0, speed) * 0.45)
    const q = S[(k.idx + look) % N]
    let off = k.lane * ROAD_HALF * 0.5
    // steer round a vampire on the road ahead
    for (const b of this.baddies) {
      if (b.kind !== "dodge") continue
      const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz)
      if (!b.alive || d > 34 || (dx * f.x + dz * f.z) < -2) continue
      const s = S[b.si] // where it is across the road, measured at its own bit of road
      const side = (b.x - s.x) * s.tz - (b.z - s.z) * s.tx
      off = side > 0 ? Math.min(off, side - 3.2) : Math.max(off, side + 3.2)
      off = Math.max(-ROAD_HALF * 0.9, Math.min(ROAD_HALF * 0.9, off))
    }
    const tx = q.x + q.tz * off, tz = q.z - q.tx * off
    const want = Math.atan2(tx - p.x, tz - p.z), have = Math.atan2(f.x, f.z)
    let da = want - have
    while (da > Math.PI) da -= 2 * Math.PI
    while (da < -Math.PI) da += 2 * Math.PI
    // how hard the road bends 20-30 m ahead sets the corner speed
    const a = S[(k.idx + 8) % N], b = S[(k.idx + 30) % N]
    const bend = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz))
    const vCorner = Math.sqrt(12 * 22 / Math.max(0.05, bend)) * sk.brake
    let gas = speed > vCorner + 2 ? -0.6 : 1
    // stuck against something: back out
    k.stuck = speed < 1.5 && this.phase === "race" && k.backT <= 0 ? k.stuck + DT : 0
    if (k.stuck > 1.2) { k.backT = 0.9; k.stuck = 0; k.tries = (k.tries || 0) + 1 }
    if (speed > 6) k.tries = 0
    if (k.tries > 2) { k.tries = 0; this.respawn(k) }
    let steer = Math.max(-1, Math.min(1, -da * 2.2))
    if (k.backT > 0) { k.backT -= DT; gas = -1; steer = -steer }
    k.input.steer = steer
    k.input.gas = gas
    k.input.drift = bend > 1.0 && speed > 16 && sk.brake > 1
    // weapons: wait a moment after a pickup, then use it when it would hit
    k.input.fire = false
    if (k.weapon) {
      k.think += DT
      if (k.think > sk.think) {
        const w = k.weapon
        const ahead = this.ahead(k, w === "fan" ? TUNE.fanRange : w === "harpoon" ? 60 : 35, w === "junk" ? 0.25 : 0.5)
        const near = this.karts.some((o) => o !== k && (() => { const q = o.body.translation(); return Math.hypot(q.x - p.x, q.z - p.z) < 30 })())
        const chasers = this.karts.some((o) => o !== k && o.prog < k.prog && k.prog - o.prog < 25)
        const close = this.karts.some((o) => o !== k && o.prog > k.prog && o.prog - k.prog < 80)
        let go = w === "rain" ? true : w === "flip" ? near : w === "ball" ? chasers || k.think > sk.think + 4 : w === "portal" ? close : w === "tornado" ? !!this.ahead(k, 70, 0.45) : !!ahead
        if (this.rnd() > sk.aim) go = this.rnd() < 0.02 // a poor shot fires at random
        if (k.think > sk.think + 8) go = true
        if (go) { k.input.fire = true; k.think = 0 }
      }
    }
  }

  // for the view and the results screen
  standings() {
    return this.order.map((k) => ({ id: k.id, who: k.who, place: k.place, lap: k.lap, done: k.done, t: k.finishT, model: k.model }))
  }
}
