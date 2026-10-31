// The track editor: pick a piece, it snaps to the grid under the mouse, click to place.
// The loop check runs after every change and says where the road breaks.
import { THREE, makeRenderer, makeWorld, pieceMesh, preload, ALL_MODELS, model } from "./scene.mjs"
import { T, GRID, ROADS, PROPS, footprint, overlaps, buildCircuit } from "./pieces.mjs"
import { DEFAULT_TRACK } from "./tracks.mjs"
import { thumbs } from "./icons.mjs"

const $ = (id) => document.getElementById(id)
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const clone = (t) => JSON.parse(JSON.stringify(t))
const BLANK = () => ({ v: 1, name: "My track", laps: 3, pieces: [{ p: "roadStartPositions", i: 18, j: 22, r: 0 }], props: [] })

let track = store.get("junk-race:edit", null) || store.get("junk-race:draft", null) || clone({ ...DEFAULT_TRACK, name: "My Junkyard" })
track.props ||= []
store.set("junk-race:edit", null)
const history = []
let tool = { kind: "road", p: "roadStraight" }, rot = 0

const renderer = makeRenderer($("stage"))
const world = makeWorld()
const { scene } = world
world.follow(T * GRID / 2, T * GRID / 2)
world.sun.shadow.camera.left = world.sun.shadow.camera.bottom = -T * GRID * 0.6
world.sun.shadow.camera.right = world.sun.shadow.camera.top = T * GRID * 0.6
world.sun.shadow.camera.far = 600
world.sun.shadow.camera.updateProjectionMatrix()
const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000)
const cam = { x: T * 20, z: T * 22, dist: 300 }
function placeCamera() {
  camera.position.set(cam.x, cam.dist, cam.z + cam.dist * 0.62)
  camera.lookAt(cam.x, 0, cam.z)
}

// the grid lines
const lines = []
for (let k = 0; k <= GRID; k++) { lines.push(k * T, 0.06, 0, k * T, 0.06, GRID * T, 0, 0.06, k * T, GRID * T, 0.06, k * T) }
const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3))
scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35 })))

await preload([...ALL_MODELS, "toy/item-box", "car/cone", "car/box"])
const pics = await thumbs([...Object.keys(ROADS).map((n) => "track/" + n), ...Object.values(PROPS).map((p) => p.model)])

// --- palette ------------------------------------------------------------------------------------------
function tile(label, img, on, pick, glyph) {
  const b = document.createElement("button")
  b.className = "tile"
  b.innerHTML = (img ? `<img alt="" src="${img}">` : `<span class="glyph">${glyph}</span>`) + `<span>${label}</span>`
  b.setAttribute("aria-pressed", on)
  b.onclick = pick
  return b
}
function renderPalette() {
  const r = $("roads"); r.innerHTML = ""
  for (const [n, d] of Object.entries(ROADS)) r.append(tile(d.name, pics["track/" + n], tool.kind === "road" && tool.p === n, () => { tool = { kind: "road", p: n }; renderPalette(); ghostRebuild() }))
  const p = $("props"); p.innerHTML = ""
  for (const [n, d] of Object.entries(PROPS)) p.append(tile(d.name, pics[d.model], tool.kind === "prop" && tool.p === n, () => { tool = { kind: "prop", p: n }; renderPalette(); ghostRebuild() }))
  const t = $("tools"); t.innerHTML = ""
  t.append(tile("Erase", null, tool.kind === "erase", () => { tool = { kind: "erase" }; renderPalette(); ghostRebuild() }, "✕"))
  t.append(tile("Turn", null, false, () => { rot = (rot + 1) % 4; ghostRebuild() }, "↻"))
}
renderPalette()

const laps = $("laps")
function renderLaps() {
  laps.innerHTML = ""
  for (let n = 1; n <= 5; n++) { const b = document.createElement("button"); b.className = "chip"; b.textContent = n; b.setAttribute("aria-pressed", track.laps === n); b.onclick = () => { change(() => (track.laps = n)) }; laps.append(b) }
}
$("name").value = track.name || ""
$("name").oninput = () => { track.name = $("name").value.trim() || "My track"; save() }

// --- the scene ----------------------------------------------------------------------------------------
let built = new THREE.Group(); scene.add(built)
const extras = new THREE.Group(); scene.add(extras) // drawn stand-ins for props the race view animates
const marker = new THREE.Group(); scene.add(marker)
let circuit = null

async function rebuild() {
  const g = new THREE.Group()
  const all = [...track.pieces, ...track.props]
  const meshes = await Promise.all(all.map(async (pc) => {
    const def = PROPS[pc.p]
    if (def && (def.box || def.dyn || def.baddie)) {
      const grp = new THREE.Group()
      grp.position.set((pc.i + 0.5) * T, 0, (pc.j + 0.5) * T); grp.rotation.y = pc.r * Math.PI / 2
      const n = def.box ? 3 : def.count || 1
      for (let k = 0; k < n; k++) {
        const m = await model(def.model)
        m.scale.setScalar(def.box ? 4.2 : def.scale)
        m.position.set(n > 1 ? (k / (n - 1) - 0.5) * T * (def.box ? 0.56 : 0.55) : 0, def.box ? 0.4 : 0, 0)
        grp.add(m)
      }
      return grp
    }
    return pieceMesh(pc)
  }))
  meshes.forEach((m) => g.add(m))
  scene.remove(built); built = g; scene.add(built)
  check()
}

function check() {
  circuit = buildCircuit(track)
  const s = $("status")
  marker.clear()
  if (circuit.ok) {
    s.classList.remove("bad")
    s.textContent = `Loop closed · ${Math.round(circuit.length)} m` + (circuit.unused ? ` · ${circuit.unused} piece${circuit.unused > 1 ? "s" : ""} off the loop` : "")
    // arrows along the loop show which way the race goes
    const S = circuit.samples
    for (let k = 0; k < S.length; k += 9) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 3), new THREE.MeshBasicMaterial({ color: k === 0 ? "#ffffff" : "#c6ff1a" }))
      a.position.set(S[k].x, S[k].y * 1 + 1.4, S[k].z)
      a.rotation.set(Math.PI / 2, 0, 0); a.rotation.z = -Math.atan2(S[k].tx, S[k].tz) + Math.PI
      a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(S[k].tx, 0, S[k].tz))
      marker.add(a)
    }
  } else {
    s.classList.add("bad")
    s.textContent = circuit.why
    if (circuit.at) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.4, 24), new THREE.MeshBasicMaterial({ color: "#ff2e88" }))
      m.position.set(circuit.at[0], 0.4, circuit.at[2])
      const pin = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 16), m.material)
      pin.position.set(circuit.at[0], 4, circuit.at[2]); pin.rotation.x = Math.PI
      marker.add(m, pin)
      marker.userData.pin = pin
    }
  }
  $("test").disabled = !circuit.ok
  $("share").disabled = !circuit.ok
  renderLaps()
}

function save() { store.set("junk-race:draft", track) }
function change(fn) {
  history.push(clone(track)); if (history.length > 100) history.shift()
  fn(); save(); rebuild()
}

// --- the ghost under the mouse -------------------------------------------------------------------------
let ghost = new THREE.Group(); scene.add(ghost)
let hover = null
const okMat = new THREE.MeshBasicMaterial({ color: "#c6ff1a", transparent: true, opacity: 0.55, depthWrite: false })
const badMat = new THREE.MeshBasicMaterial({ color: "#ff2e88", transparent: true, opacity: 0.55, depthWrite: false })
let ghostKey = ""
async function ghostRebuild() {
  if (!hover) { ghost.visible = false; return }
  const pc = { p: tool.p, i: hover[0], j: hover[1], r: rot }
  const key = tool.kind + pc.p + pc.r
  if (key !== ghostKey) {
    ghostKey = key
    const g = new THREE.Group()
    if (tool.kind === "erase") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(T, 0.6, T), badMat); m.position.y = 0.3; g.add(m)
    } else if (tool.kind === "road") {
      const fp = footprint({ ...pc, i: 0, j: 0 })
      for (const [i, j] of fp) { const m = new THREE.Mesh(new THREE.BoxGeometry(T * 0.96, 0.5, T * 0.96), okMat); m.position.set((i + 0.5) * T, 0.25, (j + 0.5) * T); g.add(m) }
      const real = await pieceMesh({ ...pc, i: 0, j: 0 }); real.position.y += 0.3; g.add(real)
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(T * 0.96, 0.5, T * 0.96), okMat); m.position.set(0.5 * T, 0.25, 0.5 * T); g.add(m)
      const real = await pieceMesh({ ...pc, i: 0, j: 0 }); g.add(real)
    }
    scene.remove(ghost); ghost = g; scene.add(ghost)
  }
  ghost.visible = true
  ghost.position.set(pc.i * T, 0, pc.j * T)
  const bad = tool.kind === "road" && overlaps(track, pc)
  ghost.traverse((o) => { if (o.isMesh && (o.material === okMat || o.material === badMat)) o.material = bad ? badMat : okMat })
}

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
function cellAt(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(mouse, camera)
  const p = new THREE.Vector3()
  if (!ray.ray.intersectPlane(plane, p)) return null
  const i = Math.floor(p.x / T), j = Math.floor(p.z / T)
  return i >= 0 && j >= 0 && i < GRID && j < GRID ? [i, j] : null
}

function erase(i, j) {
  const pk = track.props.findIndex((p) => p.i === i && p.j === j)
  if (pk >= 0) { change(() => track.props.splice(pk, 1)); return true }
  const rk = track.pieces.findIndex((p) => footprint(p).some(([a, b]) => a === i && b === j))
  if (rk >= 0) {
    if (ROADS[track.pieces[rk].p].start && track.pieces.filter((p) => ROADS[p.p].start).length === 1) { toast("Every track needs its Start. Move it instead: place a new Start, then erase this one."); return false }
    change(() => track.pieces.splice(rk, 1)); return true
  }
  return false
}

function place(i, j) {
  if (tool.kind === "erase") { erase(i, j); return }
  const pc = { p: tool.p, i, j, r: rot }
  if (tool.kind === "road") {
    if (overlaps(track, pc)) { toast("That spot is taken. Erase the piece there first."); return }
    change(() => {
      // only one start: a new one replaces the old
      if (ROADS[pc.p].start) track.pieces = track.pieces.filter((p) => !ROADS[p.p].start)
      track.pieces.push(pc)
    })
  } else {
    change(() => { track.props = track.props.filter((p) => !(p.i === i && p.j === j)); track.props.push(pc) })
  }
}

let drag = null
const canvas = $("stage")
canvas.addEventListener("contextmenu", (e) => e.preventDefault())
canvas.addEventListener("pointerdown", (e) => {
  const c = cellAt(e)
  if (e.button === 1 || (e.button === 0 && e.altKey)) { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cz: cam.z }; return }
  if (!c) return
  if (e.button === 2) erase(c[0], c[1])
  else if (e.button === 0) place(c[0], c[1])
})
addEventListener("pointerup", () => (drag = null))
canvas.addEventListener("pointermove", (e) => {
  if (drag) { const k = cam.dist / innerHeight * 1.2; cam.x = drag.cx - (e.clientX - drag.x) * k; cam.z = drag.cz - (e.clientY - drag.y) * k; placeCamera(); return }
  hover = cellAt(e); ghostRebuild()
})
canvas.addEventListener("pointerleave", () => { hover = null; ghostRebuild() })
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist = Math.max(50, Math.min(520, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); placeCamera() }, { passive: false })
const held = new Set()
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return
  held.add(e.code)
  if (e.code === "KeyR" || e.code === "KeyE") { rot = (rot + 1) % 4; ghostRebuild() }
  if (e.code === "KeyQ") { rot = (rot + 3) % 4; ghostRebuild() }
  if (e.code === "KeyX" || e.code === "Delete" || e.code === "Backspace") { tool = { kind: "erase" }; renderPalette(); ghostRebuild() }
  if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") { e.preventDefault(); undo() }
})
addEventListener("keyup", (e) => held.delete(e.code))

function undo() {
  if (!history.length) { toast("Nothing to undo."); return }
  track = history.pop(); save(); $("name").value = track.name; rebuild()
}
$("undo").onclick = undo
$("clear").onclick = () => change(() => { const n = BLANK(); track.pieces = n.pieces; track.props = []; track.name = "My track"; $("name").value = track.name })
$("back").onclick = () => (location.href = "/")
$("test").onclick = () => {
  if (!circuit.ok) { toast(circuit.why); return }
  store.set("junk-race:test", track)
  location.href = "/?test=1"
}
$("share").onclick = async () => {
  if (!circuit.ok) { toast(circuit.why); return }
  const r = await fetch("/api/tracks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(track) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server. Try again." }))
  if (!r.code) { toast(r.error || "That did not save."); return }
  const mine = store.get("junk-race:mine", []).filter((t) => t.name !== track.name)
  mine.unshift({ ...track, code: r.code }); store.set("junk-race:mine", mine.slice(0, 12))
  const url = `${location.origin}/?t=${r.code}`
  toast(`Saved. Code ${r.code}<br><input readonly value="${url}" onclick="this.select()">`, 8000)
  navigator.clipboard?.writeText(url).catch(() => {})
}

let toastT = 0
function toast(html, ms = 2600) {
  const t = $("toast"); t.innerHTML = html; t.classList.add("on")
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms)
}

$("help").innerHTML = ["<span><span class='k'>Click</span>Place</span>", "<span><span class='k'>Right click</span>Erase</span>", "<span><span class='k'>R</span>Turn</span>", "<span><span class='k'>W A S D</span>Move</span>", "<span><span class='k'>Wheel</span>Zoom</span>", "<span><span class='k'>Ctrl Z</span>Undo</span>"].join("")

function resize() { document.documentElement.style.setProperty("--bar", $("bar").offsetHeight + "px"); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }
addEventListener("resize", resize)
new ResizeObserver(() => document.documentElement.style.setProperty("--bar", $("bar").offsetHeight + "px")).observe($("bar"))
resize(); placeCamera()
await rebuild()

let last = performance.now()
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  const sp = cam.dist * 0.9 * dt
  if (held.has("KeyW") || held.has("ArrowUp")) cam.z -= sp
  if (held.has("KeyS") || held.has("ArrowDown")) cam.z += sp
  if (held.has("KeyA") || held.has("ArrowLeft")) cam.x -= sp
  if (held.has("KeyD") || held.has("ArrowRight")) cam.x += sp
  if (held.size) placeCamera()
  if (marker.userData.pin) marker.userData.pin.position.y = 4 + Math.sin(now / 200) * 1.2
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
window.__ed = { get track() { return track }, place, erase, get circuit() { return circuit }, setTool: (t, r) => { tool = t; rot = r ?? rot; renderPalette() } }
