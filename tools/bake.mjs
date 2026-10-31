// Copies the Kenney models the game uses into public/models and bakes public/geo.json:
// collision triangles for every track piece (tile units, mesh-local) and the box size of every loose prop.
//   bun tools/bake.mjs
import { NodeIO } from "@gltf-transform/core"
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const K = join(process.env.HOME, "assets/kenney/all-in-1-3.7.0/3D assets")
const OUT = join(import.meta.dir, "../public/models")
const SETS = {
  track: [`${K}/Racing Kit/Models/GLTF format`, ["roadStraight", "roadStraightLong", "roadStraightArrow", "roadStartPositions", "roadCornerSmall", "roadCornerLarge", "roadCornerLarger", "roadStraightSkew", "roadRamp", "roadRampLong", "roadStraightLongBump", "roadBump", "barrierRed", "barrierWhite", "barrierWall", "pylon", "treeLarge", "treeSmall", "flagCheckers", "flagRed", "flagGreen", "grandStand", "grandStandCovered", "overheadLights", "tent", "billboard", "ramp", "lightPostLarge"]],
  car: [`${K}/Car Kit/Models/GLB format`, ["kart-oobi", "kart-oodi", "kart-ooli", "kart-oopi", "kart-oozi", "debris-bumper", "debris-door", "debris-tire", "debris-spoiler-a", "debris-spoiler-b", "debris-plate-small-a", "debris-bolt", "cone", "box"]],
  toy: [`${K}/Toy Car Kit/Models/GLB format`, ["item-box", "gate-finish", "smoke"]],
  junk: [`${K}/Furniture Kit/Models/GLTF format`, ["loungeSofa", "kitchenFridge", "toilet", "bathtub", "washer", "bear", "ceilingFan"]],
  wpn: [`${K}/Weapon Pack/Models/GLTF format`, ["knife_sharp"]],
  grave: [`${K}/Graveyard Kit/Models/GLB format`, ["character-zombie", "character-skeleton", "character-vampire", "character-keeper", "character-ghost"]],
  golf: [`${K}/Minigolf Kit/Models/GLB format`, ["ball-red", "ball-blue", "ball-green"]],
}
const io = new NodeIO()
const geo = { pieces: {}, boxes: {} }
for (const [set, [dir, names]] of Object.entries(SETS)) {
  mkdirSync(join(OUT, set), { recursive: true })
  if (existsSync(join(dir, "Textures"))) { mkdirSync(join(OUT, set, "Textures"), { recursive: true }); copyFileSync(join(dir, "Textures/colormap.png"), join(OUT, set, "Textures/colormap.png")) }
  for (const n of names) {
    copyFileSync(join(dir, n + ".glb"), join(OUT, set, n + ".glb"))
    const doc = await io.read(join(dir, n + ".glb"))
    const pos = [], idx = []
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue
      // track pieces are one mesh under one node: use mesh-local coords (0..W, -D..0). Props: world coords.
      const m = set === "track" ? [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] : node.getWorldMatrix()
      for (const p of mesh.listPrimitives()) {
        const a = p.getAttribute("POSITION"), v = [0, 0, 0], base = pos.length / 3
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, v)
          const w = [0, 1, 2].map((k) => m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k])
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]) }
          pos.push(...w.map((x) => Math.round(x * 1000) / 1000))
        }
        const ind = p.getIndices()
        if (ind) for (let i = 0; i < ind.getCount(); i++) idx.push(base + ind.getScalar(i))
        else for (let i = 0; i < a.getCount(); i++) idx.push(base + i)
      }
    }
    geo.boxes[`${set}/${n}`] = { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) }
    if (set === "track") geo.pieces[n] = { pos, idx }
  }
}
writeFileSync(join(import.meta.dir, "../public/geo.json"), JSON.stringify(geo))
console.log("baked", Object.keys(geo.boxes).length, "models,", Object.keys(geo.pieces).length, "piece meshes")
