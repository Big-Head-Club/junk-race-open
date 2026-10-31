// Weapon slot pictures, rendered once from the real models into images.
import { THREE, model } from "./scene.mjs"

const SPEC = {
  junk: [["junk/loungeSofa", 1, [0, 0, 0], [0, 0.6, 0]]],
  harpoon: [["wpn/knife_sharp", 1, [0, 0, 0], [0.4, 0.7, -0.9]]],
  flip: [["car/kart-oopi", 1, [0, 0.6, 0], [Math.PI, 0.6, 0.2]]],
  ball: [["golf/ball-red", 12, [0, 0, 0], [0, 0, 0]]],
  fan: [["junk/ceilingFan", 1, [0, 0, 0], [0.5, 0, 0]]],
  rain: [["golf/ball-red", 10, [-0.25, 0.2, 0], [0, 0, 0]], ["golf/ball-blue", 10, [0.25, 0.25, 0], [0, 0, 0]], ["golf/ball-green", 10, [0, -0.2, 0.1], [0, 0, 0]]],
  portal: [["car/kart-oodi", 1, [0, -0.05, 0], [0, -0.9, 0]], ["@ring", 1, [0, 0, -0.05], [0, -0.9, 0]]],
  tornado: [["@funnel", 1, [0, 0, 0], [0, 0, 0]]],
}
// shapes the icons need that are not models: the portal ring, the funnel of smoke
async function special(name) {
  if (name === "@ring") {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 10, 40), new THREE.MeshBasicMaterial({ color: "#ff2e88" })))
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.66, 40), new THREE.MeshBasicMaterial({ color: "#2a0b3d", side: THREE.DoubleSide })))
    return g
  }
  const g = new THREE.Group()
  for (let i = 0; i < 26; i++) {
    const m = await model("toy/smoke"), h = i / 26
    m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(i % 4 === 0 ? "#8f7a66" : "#e3d6c4") } })
    m.scale.setScalar(0.5 + h * 0.9); m.position.set(Math.cos(i * 2.4) * (0.05 + h * 0.3), h * 1.6, Math.sin(i * 2.4) * (0.05 + h * 0.3))
    g.add(m)
  }
  return g
}

export async function weaponIcons() {
  const canvas = document.createElement("canvas")
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  r.setSize(256, 256, false)
  r.outputColorSpace = THREE.SRGBColorSpace
  const out = {}
  for (const [w, parts] of Object.entries(SPEC)) {
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight("#fff", "#c96", 2.2))
    const sun = new THREE.DirectionalLight("#fff", 2); sun.position.set(2, 3, 4); scene.add(sun)
    const g = new THREE.Group()
    for (const [path, s, at, rot] of parts) {
      const m = path.startsWith("@") ? await special(path) : await model(path)
      m.scale.setScalar(s); m.rotation.set(...rot)
      const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length()
      m.position.sub(c).multiplyScalar(1 / size)
      const holder = new THREE.Group(); holder.add(m); holder.scale.setScalar(1 / size); holder.position.set(...at)
      g.add(holder)
    }
    scene.add(g)
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10)
    cam.position.set(1.1, 1.0, 1.9); cam.lookAt(0, 0, 0)
    r.render(scene, cam)
    out[w] = canvas.toDataURL("image/png")
  }
  r.dispose()
  return out
}

// palette thumbnails: each model seen from above at an angle, framed to fit
export async function thumbs(paths, size = 160) {
  const canvas = document.createElement("canvas")
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  r.setSize(size, size, false)
  r.outputColorSpace = THREE.SRGBColorSpace
  const out = {}
  for (const path of paths) {
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight("#fff", "#9c6", 2.0))
    const sun = new THREE.DirectionalLight("#fff", 1.6); sun.position.set(-2, 4, 3); scene.add(sun)
    const m = await model(path)
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length()
    m.position.sub(c)
    const holder = new THREE.Group(); holder.add(m); holder.scale.setScalar(1 / s)
    scene.add(holder)
    const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 10)
    cam.position.set(0.55, 1.45, 0.95); cam.lookAt(0, 0, 0)
    r.render(scene, cam)
    out[path] = canvas.toDataURL("image/png")
  }
  r.dispose()
  return out
}
