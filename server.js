// Prototype server: the static game, three.js and Rapier from node_modules, and a small track store
// so a built track gets a share code, and a speed-run board per track.   bun server.js -> http://localhost:4731
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { join, extname, normalize } from "node:path"

const ROOT = import.meta.dir
const PORT = Number(process.env.PORT || 4731)
const DATA = process.env.DATA_DIR || join(ROOT, "data")
const MIME = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2",
}
const VENDOR = {
  "/vendor/rapier.mjs": "node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs",
  "/vendor/three.module.js": "node_modules/three/build/three.module.min.js",
}
mkdirSync(DATA, { recursive: true })
const STORE = join(DATA, "tracks.json")
const tracks = existsSync(STORE) ? JSON.parse(readFileSync(STORE, "utf8")) : {}
const save = () => writeFileSync(STORE, JSON.stringify(tracks))
const ALPHA = "BCDFGHJKLMNPQRSTVWXZ"
const code = () => { let c; do { c = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("") } while (tracks[c]); return c }

// speed runs: per track layout, best first. A run is { id, name, time, model, frames } where frames
// are 20 a second from GO. The list leaves the frames out; one run's frames come by id.
const RUNS = join(DATA, "runs.json")
const runs = existsSync(RUNS) ? JSON.parse(readFileSync(RUNS, "utf8")) : {}
const saveRuns = () => writeFileSync(RUNS, JSON.stringify(runs))
const board = (key) => (runs[key] || []).map(({ frames, pid, ...r }, i) => ({ ...r, rank: i + 1 }))
const fmtT = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`
function addRun(key, body) {
  const name = String(body?.name || "").replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().slice(0, 14)
  const time = Number(body?.time), f = body?.frames
  if (!name) return "Type a name first."
  if (!(time > 8 && time < 900) || !Array.isArray(f) || f.length % 7) return "That run did not look right, so it was not saved."
  const n = f.length / 7
  if (Math.abs(n - time * 20) > 4 || !f.every(Number.isInteger)) return "That run did not look right, so it was not saved."
  // no kart moves faster than 70 m/s between two frames, apart from a reset back onto the road
  let jumps = 0
  for (let i = 7; i < f.length; i += 7) if (Math.hypot(f[i] - f[i - 7], f[i + 2] - f[i - 5]) / 100 > 3.5) jumps++
  if (jumps > 12) return "That run did not look right, so it was not saved."
  // the "shipcheck" board only proves a write reaches the disk (ship-check.json roundtrip): it keeps the last run
  if (key === "shipcheck") runs[key] = []
  const list = (runs[key] ||= [])
  // one run per player on a board: a faster one replaces it, a slower one is turned away
  const pid = String(body.pid || "").replace(/[^a-z0-9]/g, "").slice(0, 16)
  const had = pid && list.find((r) => r.pid === pid)
  if (had && had.time <= time) return `Your ${fmtT(had.time)} is already on the board. Beat it to replace it.`
  if (had) list.splice(list.indexOf(had), 1)
  const id = Math.random().toString(36).slice(2, 10)
  list.push({ id, pid, name, time: Math.round(time * 1000) / 1000, model: String(body.model || "kart-oobi").slice(0, 20), at: Date.now(), frames: f })
  list.sort((a, b) => a.time - b.time)
  list.length = Math.min(list.length, 200)
  saveRuns()
  const rank = list.findIndex((r) => r.id === id) + 1
  return { id, rank: rank || null }
}

function file(path, type) {
  if (!existsSync(path) || !statSync(path).isFile()) return new Response("not found", { status: 404 })
  return new Response(Bun.file(path), { headers: { "content-type": type || MIME[extname(path)] || "application/octet-stream", "cache-control": "no-cache" } })
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const p = url.pathname
    if (p === "/health") return new Response("ok")
    // one name: the Railway host sends players on to the domain
    const canon = process.env.CANONICAL_HOST
    if (canon && url.hostname !== canon && url.hostname !== "localhost" && !url.hostname.startsWith("127.")) {
      return new Response(null, { status: 301, headers: { location: `https://${canon}${p}${url.search}` } })
    }
    if (VENDOR[p]) return file(join(ROOT, VENDOR[p]), MIME[".mjs"])
    if (p.startsWith("/vendor/three/")) return file(join(ROOT, "node_modules/three/examples/jsm", normalize(p.slice(14)).replace(/^(\.\.[/\\])+/, "")), MIME[".mjs"])
    if (p === "/api/tracks" && req.method === "POST") {
      const body = await req.json().catch(() => null)
      if (!body || !Array.isArray(body.pieces) || JSON.stringify(body).length > 60000) return Response.json({ error: "That track did not save. It is too big or broken." }, { status: 400 })
      const c = code()
      tracks[c] = { ...body, code: c, at: Date.now() }
      save()
      return Response.json({ code: c })
    }
    if (p.startsWith("/api/tracks/")) {
      const t = tracks[p.slice(12).toUpperCase()]
      return t ? Response.json(t) : Response.json({ error: "No track has that code." }, { status: 404 })
    }
    if (p === "/api/tracks") return Response.json(Object.values(tracks).sort((a, b) => b.at - a.at).slice(0, 40).map((t) => ({ code: t.code, name: t.name, pieces: t.pieces.length })))
    const rm = p.match(/^\/api\/runs\/([a-z0-9]{4,20})(?:\/([a-z0-9]{4,12}))?$/)
    if (rm && req.method === "POST" && !rm[2]) {
      const body = await req.json().catch(() => null)
      if (JSON.stringify(body || {}).length > 400000) return Response.json({ error: "That run is too long to save." }, { status: 400 })
      const r = addRun(rm[1], body)
      return typeof r === "string" ? Response.json({ error: r }, { status: 400 }) : Response.json(r)
    }
    if (rm && rm[2]) {
      const r = (runs[rm[1]] || []).find((x) => x.id === rm[2])
      return r ? Response.json({ ...r, pid: undefined }) : Response.json({ error: "That ghost is gone." }, { status: 404 })
    }
    if (rm) { const b = board(rm[1]); return Response.json({ top: b.slice(0, 10), count: b.length }) }
    const rel = p === "/" ? "index.html" : p === "/build" ? "editor.html" : normalize(p).replace(/^(\.\.[/\\])+/, "").slice(1)
    return file(join(ROOT, "public", rel))
  },
})
console.log(`junk-race on http://localhost:${PORT}`)
