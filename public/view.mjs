// Draws a Race: karts with wobbling drivers, loose junk, weapon boxes, ropes, fans, puffs, the chase camera.
// Reads the sim's bodies directly; never changes the sim.
import { THREE, model, makeWorld, trackGroup, animsOf } from "./scene.mjs"
import { sample } from "./ghost.mjs"
import { KS, TUNE, EV, DT } from "./sim.mjs"

const V3 = THREE.Vector3, Q = THREE.Quaternion
const tmpV = new V3(), tmpQ = new Q()

export class RaceView {
  constructor(renderer) {
    this.r = renderer
    const w = makeWorld()
    Object.assign(this, w)
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.1, 1400)
    this.karts = []
    this.loose = new Map()
    this.boxes = []
    this.puffs = []
    this.shake = 0
    this.camMode = "chase"
    this.focus = 0
    this.camPos = new V3(); this.camLook = new V3()
    this.ropeMat = new THREE.MeshStandardMaterial({ color: "#2b1d12", roughness: 0.8 })
    this.discMat = new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.3, depthWrite: false })
  }

  async load(race) {
    this.race = race
    if (this.trackG) this.scene.remove(this.trackG)
    this.trackG = await trackGroup(race.track)
    this.scene.add(this.trackG)
    for (const k of race.karts) {
      const m = await model("car/" + k.model)
      m.scale.setScalar(KS)
      const parts = {}
      m.traverse((o) => { if (o.name.startsWith("wheel-")) parts[o.name] = o; if (o.name === "character") parts.character = o })
      for (const n in parts) parts[n].userData.base = parts[n].position.clone()
      // your driver wears a lime helmet so you can find yourself in a pile-up
      if (k.who === "human" && parts.character) parts.character.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set("#c6ff1a") } })
      const g = new THREE.Group()
      g.add(m)
      const fan = await model("junk/ceilingFan")
      fan.scale.setScalar(2.2); fan.rotation.x = Math.PI / 2; fan.position.set(-0.55, 1.2, 1.6); fan.visible = false
      g.add(fan)
      const driver = parts.character.clone(true)
      driver.scale.setScalar(KS); driver.visible = false
      this.scene.add(g, driver)
      this.karts.push({ k, g, m, parts, fan, driver, lean: { x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0 }, lastV: new V3(), prevP: new V3(), prevQ: new Q(), curP: new V3(), curQ: new Q() })
    }
    this.mixers = []
    this.baddieFx = []
    for (const b of race.baddies) {
      const m = await model(b.model)
      m.scale.setScalar(b.scale)
      this.scene.add(m)
      const mix = new THREE.AnimationMixer(m)
      const clip = animsOf(b.model).find((c) => c.name === "walk")
      if (clip) { const a = mix.clipAction(clip); a.timeScale = b.kind === "dodge" ? 0.6 : 0.8; a.time = b.phase; a.play() }
      this.mixers.push(mix)
      this.baddieFx.push({ b, m, show: 1 })
    }
    this.boxModel = await model("toy/item-box")
    for (const b of race.boxes) {
      const m = this.boxModel.clone(true)
      m.scale.setScalar(4.2)
      this.scene.add(m)
      this.boxes.push({ b, m, pop: 1 })
    }
    this.puffModel = await model("toy/smoke")
    this.puffModel.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.material = o.material.clone(); o.material.transparent = true } })
    this.portalFx = []
    this.twFx = new Map()
    this.hookHead = await model("wpn/knife_sharp")
    this.hookHead.scale.setScalar(4)
    this.syncPrev(); this.syncCur()
  }

  // interpolation: call before and after each sim step
  syncPrev() { for (const v of this.karts) { v.prevP.copy(v.curP); v.prevQ.copy(v.curQ) } }
  syncCur() {
    for (const v of this.karts) { const p = v.k.body.translation(), q = v.k.body.rotation(); v.curP.set(p.x, p.y, p.z); v.curQ.set(q.x, q.y, q.z, q.w) }
  }

  async events(evs) {
    for (const e of evs) {
      if (e.t === EV.bonk) { this.puff(e.x, e.y + 0.8, e.z, 4, 1.4); if (this.isMe(e.k)) this.shake = Math.min(1, e.pow / 14) }
      if (e.t === EV.land && !e.driver) { const v = this.karts[e.k]; if (v) this.puff(v.curP.x, v.curP.y + 0.2, v.curP.z, Math.min(6, 2 + e.air * 3), 1) }
      if (e.t === EV.eject) this.puff(e.x, e.y + 1.5, e.z, 6, 1.6)
      if (e.t === EV.boxback) { const bv = this.boxes[e.box]; if (bv) { this.puff(e.x, e.y, e.z, 5, 1.2, "#ffe14a") } }
      if (e.t === EV.fire && e.w === "flip") this.puff(e.x, e.y + 1, e.z, 14, 3, "#b9f3ff")
      if (e.t === EV.respawn) this.puff(e.x, e.y, e.z, 6, 1.3, "#ffffff")
      if (e.t === EV.smash) { this.puff(e.x, e.y + 1, e.z, 7, 1.2, "#9be36b"); if (this.isMe(e.k)) this.shake = 0.35 }
      if (e.t === EV.bite) { this.puff(e.x, e.y + 2, e.z, 9, 1.6, "#ff2e88"); if (this.isMe(e.k)) this.shake = 1 }
    }
  }
  isMe(id) { return this.camMode === "chase" && id === this.focus }

  puff(x, y, z, n, size, color) {
    for (let i = 0; i < n; i++) {
      const m = this.puffModel.clone(true)
      if (color) m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(color) } })
      m.position.set(x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5))
      const s = size * (0.6 + Math.random() * 0.8)
      m.scale.setScalar(s)
      this.scene.add(m)
      this.puffs.push({ m, v: new V3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5), life: 0.6 + Math.random() * 0.5, age: 0, s })
    }
  }

  async syncLoose() {
    const live = new Set()
    for (const o of this.race.loose) {
      live.add(o)
      let v = this.loose.get(o)
      if (!v) {
        v = { m: null, pending: true }
        this.loose.set(o, v)
        model(o.model).then((m) => {
          m.scale.setScalar(o.scale)
          m.position.set(o.ox, o.oy, o.oz)
          const g = new THREE.Group(); g.add(m)
          if (o.kind === "ball") { const d = new THREE.Mesh(new THREE.CircleGeometry(o.r * 1.1, 24), this.discMat); d.rotation.x = -Math.PI / 2; this.scene.add(d); v.disc = d }
          if (o.kind === "baddie") { const clip = animsOf(o.model).find((c) => c.name === "fall"); if (clip) { const mx = new THREE.AnimationMixer(m); mx.clipAction(clip).play(); this.mixers.push(mx); v.mixer = mx } }
          v.m = g; v.pending = false
          // an entrance: junk pops out big
          g.scale.setScalar(0.2); v.grow = 0
          this.scene.add(g)
        })
      }
      if (v.m) {
        const p = o.body.translation(), q = o.body.rotation()
        v.m.position.set(p.x, p.y, p.z); v.m.quaternion.set(q.x, q.y, q.z, q.w)
        if (v.grow < 1) { v.grow = Math.min(1, v.grow + 0.12); v.m.scale.setScalar(0.2 + 0.8 * (1 - (1 - v.grow) ** 3)) }
        if (v.disc) { v.disc.position.set(p.x, 0.06, p.z); v.disc.visible = p.y > 2.5; v.disc.material.opacity = 0.35 }
      }
    }
    for (const [o, v] of this.loose) if (!live.has(o)) { if (v.m) this.scene.remove(v.m); if (v.disc) this.scene.remove(v.disc); if (v.mixer) this.mixers.splice(this.mixers.indexOf(v.mixer), 1); this.loose.delete(o) }
  }

  rope(key, a, b, thick) {
    this.ropes ||= new Map()
    let m = this.ropes.get(key)
    if (!m) { m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), this.ropeMat); this.scene.add(m); this.ropes.set(key, m) }
    m.visible = true
    const d = tmpV.subVectors(b, a), L = d.length()
    m.position.copy(a).addScaledVector(d, 0.5)
    m.scale.set(thick, L, thick)
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize())
    m.userData.seen = true
  }

  frame(alpha, dt) {
    const race = this.race
    // karts
    for (const v of this.karts) {
      const k = v.k
      v.g.position.lerpVectors(v.prevP, v.curP, alpha)
      v.g.quaternion.slerpQuaternions(v.prevQ, v.curQ, alpha)
      const veh = k.v
      for (let i = 0; i < 4; i++) {
        const name = ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"][i]
        const w = v.parts[name]; if (!w) continue
        const susp = veh.wheelSuspensionLength(i) ?? TUNE.restLen
        w.position.y = w.userData.base.y + (TUNE.restLen - susp) / KS
        w.rotation.order = "YXZ"
        w.rotation.y = i < 2 ? veh.wheelSteering(i) || 0 : 0
        w.rotation.x = veh.wheelRotation(i) || 0
      }
      // the driver: a loose spring on the seat, leaning against every push
      const lv = k.body.linvel()
      const acc = new V3(lv.x, lv.y, lv.z).sub(v.lastV).divideScalar(Math.max(dt, 1 / 60))
      v.lastV.set(lv.x, lv.y, lv.z)
      acc.applyQuaternion(tmpQ.copy(v.curQ).invert())
      const L = v.lean
      const tx = Math.max(-0.9, Math.min(0.9, -acc.z * 0.035)), tz = Math.max(-0.9, Math.min(0.9, acc.x * 0.035)), ty = Math.max(-0.25, Math.min(0.25, -acc.y * 0.006))
      // small fixed substeps: the spring is stiff and a slow frame would blow it up
      for (let h = dt; h > 1e-6; h -= 1 / 240) {
        const e = Math.min(h, 1 / 240)
        L.vx += ((tx - L.x) * 140 - L.vx * 9) * e; L.x += L.vx * e
        L.vz += ((tz - L.z) * 140 - L.vz * 9) * e; L.z += L.vz * e
        L.vy += ((ty - L.y) * 220 - L.vy * 10) * e; L.y += L.vy * e
      }
      if (!Number.isFinite(L.x + L.z + L.y)) Object.assign(L, { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0 })
      const ch = v.parts.character
      if (ch) {
        ch.visible = !k.driver
        ch.rotation.set(L.x, 0, L.z)
        ch.position.y = ch.userData.base.y + L.y
      }
      if (k.driver) {
        const p = k.driver.translation(), q = k.driver.rotation()
        v.driver.visible = true
        v.driver.position.set(p.x, p.y - 0.5, p.z); v.driver.quaternion.set(q.x, q.y, q.z, q.w)
      } else v.driver.visible = false
      v.fan.visible = k.fan > 0
      if (v.fan.visible) { v.fan.rotation.y += dt * 30; if (Math.random() < 0.6) { const f = new V3(0, 0, 1).applyQuaternion(v.g.quaternion); const p = v.g.position; this.puffs.push(this.stream(p.x + f.x * 3, p.y + 1.4, p.z + f.z * 3, f)) } }
      if (k.flip > 0 && Math.random() < 0.3) this.puff(v.g.position.x, v.g.position.y, v.g.position.z, 1, 0.8, "#b9f3ff")
      if (k.boost > 0 && Math.random() < 0.7) { const f = new V3(0, 0, -1).applyQuaternion(v.g.quaternion); this.puff(v.g.position.x + f.x * 1.5, v.g.position.y + 0.6, v.g.position.z + f.z * 1.5, 1, 0.7, "#ffcf3a") }
    }
    // ropes: harpoon line, wrecking ball chain
    if (this.ropes) for (const m of this.ropes.values()) m.userData.seen = false
    for (const v of this.karts) {
      const k = v.k
      if (k.hook) {
        const a = new V3(0, 1.0, 1.4).applyQuaternion(v.g.quaternion).add(v.g.position)
        const tgt = k.hook.target >= 0 ? this.karts[k.hook.target].g.position.clone().add(new V3(0, 0.9, 0)) : new V3(k.hook.miss.x, k.hook.miss.y, k.hook.miss.z)
        this.rope("hook" + k.id, a, tgt, 0.07)
        this.hookHead.visible = true; this.hookHead.position.copy(tgt); this.hookHead.lookAt(a)
        if (!this.hookHead.parent) this.scene.add(this.hookHead)
      }
    }
    if (!race.karts.some((k) => k.hook) && this.hookHead) this.hookHead.visible = false
    for (const r of race.ropes) {
      const v = this.karts[r.k]
      const a = new V3(0, 0.6, -1.0).applyQuaternion(v.g.quaternion).add(v.g.position)
      const p = r.ball.body.translation()
      this.rope("ball" + r.k + "_" + r.until, a, new V3(p.x, p.y, p.z), 0.12)
    }
    if (this.ropes) for (const [key, m] of this.ropes) if (!m.userData.seen) { this.scene.remove(m); this.ropes.delete(key) }
    // boxes spin and bob, and pop back in
    for (const bv of this.boxes) {
      const gone = bv.b.back > race.t
      bv.m.visible = !gone
      if (gone) bv.pop = 0
      else if (bv.pop < 1) bv.pop = Math.min(1, bv.pop + dt * 3)
      const s = 4.2 * (bv.pop < 1 ? 0.3 + 0.7 * Math.sin(bv.pop * Math.PI / 2) * (1 + 0.25 * Math.sin(bv.pop * Math.PI)) : 1)
      bv.m.scale.setScalar(s)
      bv.m.position.set(bv.b.x, bv.b.y - 0.8 + Math.sin(race.t * 3 + bv.b.id) * 0.25, bv.b.z)
      bv.m.rotation.y = race.t * 1.6 + bv.b.id
    }
    // puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.age += dt
      p.m.position.addScaledVector(p.v, dt)
      p.v.multiplyScalar(1 - dt * 2)
      const u = p.age / p.life
      p.m.scale.setScalar(p.s * (1 + u * 0.8))
      p.m.traverse((o) => { if (o.isMesh) o.material.opacity = 1 - u })
      if (u >= 1) { this.scene.remove(p.m); this.puffs.splice(i, 1) }
    }
    for (const f of this.baddieFx) {
      const { b, m } = f
      f.show = b.alive ? Math.min(1, f.show + dt * 2) : 0
      m.visible = b.alive
      m.position.set(b.x, b.y, b.z)
      m.rotation.y = b.face
      m.scale.setScalar(b.scale * (0.2 + 0.8 * f.show))
    }
    for (const mx of this.mixers) mx.update(dt)
    if (this.ghosts) this.drawGhosts(race.phase === "count" ? 0 : Math.max(0, race.raceT - (1 - alpha) * DT))
    this.drawPortals(dt)
    this.drawTornados(dt)
    this.syncLoose()
    this.cameraStep(dt)
    this.r.render(this.scene, this.camera)
  }

  ring(color) {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    const t = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.45, 10, 40), mat)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.0, 40), new THREE.MeshBasicMaterial({ color: "#2a0b3d", transparent: true, opacity: 0.75, side: THREE.DoubleSide }))
    g.add(t, disc)
    g.userData = { mat, disc }
    return g
  }

  // a portal is a ring where the kart went in and one where it came out; both open, spin, then shut
  drawPortals(dt) {
    const live = new Set(this.race.portals)
    for (const p of this.race.portals) {
      if (this.portalFx.find((f) => f.p === p)) continue
      const a = this.ring("#ff2e88"), b = this.ring("#c6ff1a")
      a.position.set(p.a.x, p.a.y + 1.6, p.a.z); a.rotation.y = p.a.yaw
      b.position.set(p.b.x, p.b.y + 1.6, p.b.z); b.rotation.y = p.b.yaw
      this.scene.add(a, b)
      this.portalFx.push({ p, a, b, age: 0 })
      this.puff(p.b.x, p.b.y + 1.5, p.b.z, 10, 1.4, "#c6ff1a")
    }
    this.portalFx = this.portalFx.filter((f) => {
      f.age += dt
      const u = f.age / 1.6
      const s = u < 0.15 ? u / 0.15 : u > 0.8 ? Math.max(0.01, (1 - u) / 0.2) : 1
      for (const r of [f.a, f.b]) { r.scale.setScalar(s); r.children[0].rotation.z += dt * 6 }
      if (!live.has(f.p) && u >= 1) { this.scene.remove(f.a, f.b); return false }
      return true
    })
  }

  // a tornado is a spinning funnel of smoke, wide at the top
  drawTornados(dt) {
    const live = new Set()
    for (const tw of this.race.tornados) {
      live.add(tw.id)
      let f = this.twFx.get(tw.id)
      if (!f) {
        const g = new THREE.Group(), puffs = []
        const mats = ["#fff6ea", "#e8dccb", "#c9b79f"].map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }))
        for (let i = 0; i < 70; i++) {
          const m = this.puffModel.clone(true)
          m.traverse((o) => { if (o.isMesh) o.material = mats[i % 3] })
          const h = (i / 70) * 24
          puffs.push({ m, h, a: i * 2.39, r: 0.5 + h * 0.3, s: 2.4 + h * 0.3 })
          g.add(m)
        }
        this.scene.add(g)
        f = { g, puffs, spin: 0 }
        this.twFx.set(tw.id, f)
      }
      f.spin += dt * 7
      f.g.position.set(tw.x, tw.y, tw.z)
      const age = this.race.t - tw.born, grow = Math.min(1, age * 2.5), fade = Math.min(1, (8 - age) * 2)
      for (const p of f.puffs) {
        const a = p.a + f.spin * (1.4 - p.h / 30)
        p.m.position.set(Math.cos(a) * p.r * grow, p.h * grow, Math.sin(a) * p.r * grow)
        p.m.scale.setScalar(p.s * grow * Math.max(0.05, fade) * (1 + 0.15 * Math.sin(f.spin * 2 + p.a)))
      }
      if (Math.random() < 0.5) this.puff(tw.x + (Math.random() - 0.5) * 6, tw.y + 0.3, tw.z + (Math.random() - 0.5) * 6, 1, 1.2, "#b8a48c")
    }
    for (const [id, f] of this.twFx) if (!live.has(id)) { this.scene.remove(f.g); this.twFx.delete(id) }
  }

  stream(x, y, z, f) {
    const m = this.puffModel.clone(true)
    m.position.set(x, y, z)
    const s = 0.6 + Math.random() * 0.5
    m.scale.setScalar(s)
    this.scene.add(m)
    return { m, v: new V3(f.x * 34 + (Math.random() - 0.5) * 6, (Math.random() - 0.3) * 3, f.z * 34 + (Math.random() - 0.5) * 6), life: 0.7, age: 0, s }
  }

  cameraStep(dt) {
    const v = this.karts[this.focus]
    if (!v) return
    let target = v.g.position.clone()
    if (v.k.driver) { const p = v.k.driver.translation(); target.set(p.x, p.y, p.z) }
    const lv = v.k.body.linvel()
    const sp = Math.hypot(lv.x, lv.z)
    // look the way the kart is going (its nose when slow)
    const nose = new V3(0, 0, 1).applyQuaternion(v.g.quaternion); nose.y = 0; nose.normalize()
    const head = sp > 4 ? new V3(lv.x, 0, lv.z).normalize().lerp(nose, 0.5).normalize() : nose
    if (!this.head) this.head = head.clone()
    this.head.lerp(head, 1 - Math.exp(-dt * 4)).normalize()
    let want, look
    if (this.camMode === "orbit") {
      const a = performance.now() / 4000
      want = target.clone().add(new V3(Math.cos(a) * 14, 6 + Math.sin(a * 0.7) * 2, Math.sin(a) * 14))
      look = target.clone().add(new V3(0, 1, 0))
    } else {
      const dist = 8.5 + sp * 0.08
      want = target.clone().addScaledVector(this.head, -dist).add(new V3(0, 3.4 + sp * 0.03, 0))
      look = target.clone().addScaledVector(this.head, 5).add(new V3(0, 1.1, 0))
    }
    if (!this.camInit) { this.camPos.copy(want); this.camLook.copy(look); this.camInit = true }
    this.camPos.lerp(want, 1 - Math.exp(-dt * 7))
    this.camLook.lerp(look, 1 - Math.exp(-dt * 12))
    this.camera.position.copy(this.camPos)
    if (this.shake > 0) { this.camera.position.add(new V3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)); this.shake = Math.max(0, this.shake - dt * 2.5) }
    this.camera.lookAt(this.camLook)
    // a phone held upright sees a narrow slice: open the lens so the road ahead still shows
    const fov = (this.camera.aspect < 1 ? 82 : 66) + Math.min(14, sp * 0.45)
    if (Math.abs(this.camera.fov - fov) > 0.1) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix() }
    this.follow(target.x, target.z)
  }

  // speed-run ghosts: see-through karts with a coloured helmet and a name over them
  async addGhosts(list) {
    this.ghosts = []
    for (const gh of list) {
      const m = await model("car/" + (gh.model || "kart-oobi"))
      m.scale.setScalar(KS)
      m.traverse((o) => {
        if (!o.isMesh) return
        o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.42; o.material.depthWrite = false; o.castShadow = false
      })
      const head = m.getObjectByName("character")
      head?.traverse((o) => { if (o.isMesh) { o.material.color.set(gh.color); o.material.opacity = 0.7 } })
      const g = new THREE.Group(); g.add(m)
      g.add(this.label(gh.label, gh.color))
      this.scene.add(g)
      this.ghosts.push({ gh, g })
    }
  }
  label(text, color) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128
    const x = c.getContext("2d")
    x.font = "700 64px SG, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"
    const w = Math.min(500, x.measureText(text).width + 56)
    x.fillStyle = "#2a0b3d"; x.beginPath(); x.roundRect(256 - w / 2, 14, w, 100, 50); x.fill()
    x.fillStyle = color; x.fillText(text, 256, 66)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
    sp.material.map.colorSpace = THREE.SRGBColorSpace
    sp.scale.set(4, 1, 1); sp.position.y = 3.4; sp.renderOrder = 5
    return sp
  }
  drawGhosts(t) {
    for (const { gh, g } of this.ghosts || []) {
      const s = sample(gh.frames, t)
      if (!s) continue
      g.position.set(s.x, s.y, s.z); g.quaternion.set(s.qx, s.qy, s.qz, s.qw)
    }
  }

  resize(w, h) {
    this.r.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose() })
  }
}
