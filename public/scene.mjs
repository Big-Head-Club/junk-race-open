// Drawing kit shared by the race, the home screen and the editor: model cache, sky, light, ground,
// and the static track (road pieces and props). The race view adds karts and weapons on top.
import * as THREE from "three"
import { GLTFLoader } from "/vendor/three/loaders/GLTFLoader.js"
import { T, ROADS, PROPS, toWorld, GRID } from "./pieces.mjs"

export { THREE }
const loader = new GLTFLoader()
const cache = new Map()
const clips = new Map()
export const animsOf = (path) => clips.get(path) || []

export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, new Promise((ok, no) => loader.load(`/models/${path}.glb`, (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace } })
    // Racing Kit tiles: undo the kit's node offset so the model sits at 0..W, -D..0
    if (path.startsWith("track/")) g.scene.children.forEach((c) => c.position.set(0, 0, 0))
    clips.set(path, g.animations)
    ok(g.scene)
  }, undefined, no)))
  return cache.get(path)
}
export const model = async (path) => (await loadModel(path)).clone(true)
export const preload = (paths) => Promise.all(paths.map(loadModel))

// a phone: touch first, a smaller GPU. It draws at 1.5x at most and with plain shadows
export const PHONE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches

export function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
  r.setPixelRatio(Math.min(PHONE ? 1.5 : 2, devicePixelRatio))
  r.shadowMap.enabled = true
  r.shadowMap.type = PHONE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 0.95
  return r
}

// a hot sunset dome: the game's own sky
function skyDome() {
  const g = new THREE.SphereGeometry(900, 32, 16)
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color("#ff3d6e") }, mid: { value: new THREE.Color("#ff8a2a") }, low: { value: new THREE.Color("#ffd36b") } },
    vertexShader: "varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 top, mid, low; varying vec3 v; void main(){ float h = v.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.12, h)); gl_FragColor = vec4(c, 1.); }",
  })
  return new THREE.Mesh(g, m)
}

export function makeWorld() {
  const scene = new THREE.Scene()
  scene.add(skyDome())
  scene.fog = new THREE.Fog("#ffb066", 160, 520)
  const hemi = new THREE.HemisphereLight("#ffe6c8", "#5aa04a", 0.9)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight("#fff0d8", 2.0)
  sun.position.set(-60, 90, 40)
  sun.castShadow = true
  sun.shadow.mapSize.set(PHONE ? 1024 : 2048, PHONE ? 1024 : 2048)
  const sc = sun.shadow.camera
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300
  sun.shadow.bias = -0.0005
  scene.add(sun, sun.target)
  // the grass runs to the horizon
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: "#6cc24a", roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(T * GRID / 2, -0.02, T * GRID / 2)
  ground.receiveShadow = true
  scene.add(ground)
  // follow a point with the shadow camera
  const follow = (x, z) => { sun.position.set(x - 60, 90, z + 40); sun.target.position.set(x, 0, z) }
  return { scene, sun, ground, follow }
}

// one road piece or prop as a group placed on the grid
export async function pieceMesh(pc) {
  const g = new THREE.Group()
  const th = pc.r * Math.PI / 2
  g.position.set((pc.i + 0.5) * T, 0, (pc.j + 0.5) * T)
  g.rotation.y = th
  if (ROADS[pc.p]) {
    const m = await model("track/" + pc.p)
    m.scale.setScalar(T)
    m.position.set(-0.5 * T, 0, 0.5 * T)
    g.add(m)
    return g
  }
  const def = PROPS[pc.p]
  if (!def) return g
  if (def.box || def.dyn || def.baddie) return g // the race view draws these (they move)
  const m = await model(def.model)
  const s = def.tile ? T : def.scale || T
  m.scale.setScalar(s)
  m.position.set(-0.5 * T, 0, 0.5 * T)
  g.add(m)
  return g
}

export async function trackGroup(track) {
  const g = new THREE.Group()
  const all = [...track.pieces, ...(track.props || [])]
  const meshes = await Promise.all(all.map(pieceMesh))
  meshes.forEach((m) => g.add(m))
  return g
}

export const ALL_MODELS = [
  ...Object.keys(ROADS).map((n) => "track/" + n),
  ...Object.values(PROPS).map((p) => p.model),
]
