// The page: home over a live bot race, the race with its HUD, pause, results. A screen stack decides
// which screen gets the pad. The sim steps at 60 Hz; the view draws between steps.
import { Race, initPhysics, DT, EV, WEAPON_NAME, WEAPON_RULE, SKILLS, HANDLING } from "./sim.mjs"
import { RaceView } from "./view.mjs"
import { makeRenderer, preload, ALL_MODELS, PHONE } from "./scene.mjs"
import { DEFAULT_TRACK, HOUSE } from "./tracks.mjs"
import { read, padPresses, glyph, onDevice, device, STEER, touch } from "./input.mjs"
import { tweaks } from "./tweaks.mjs"
import { weaponIcons } from "./icons.mjs"
import { sfx, playMusic, engineNote } from "./audio.mjs"
import { trackKey } from "./pieces.mjs"
import { dailyTrack, today } from "./daily.mjs"
import { Recorder, progress, progAt, fmt } from "./ghost.mjs"

const $ = (id) => document.getElementById(id)
const NAMES = ["Oobi", "Oodi", "Ooli", "Oopi", "Oozi", "Oobo"]
const SKILL_NAME = { easy: "Easy", normal: "Normal", hard: "Hard" }
// gameaday.js loads async; calls queue until it is there
const gad = (f) => { if (window.GameADay) { try { f(window.GameADay) } catch {} } else (window.__gadQ ||= []).push(() => f(window.GameADay)) }
gad((g) => g.start({ gameId: "junk-race" }))
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} } }

await initPhysics()
const geo = await (await fetch("/geo.json")).json()
const renderer = makeRenderer($("stage"))
await preload([...ALL_MODELS, "toy/item-box", "toy/smoke", "junk/ceilingFan", "wpn/knife_sharp", "car/kart-oobi"])
const icons = await weaponIcons()

// --- tracks on offer: the house loop, a shared code, the one being built, my saved ones -----------
const params = new URLSearchParams(location.search)
const choices = [{ key: "house", name: DEFAULT_TRACK.name, track: DEFAULT_TRACK }]
if (params.get("t")) {
  const r = await fetch("/api/tracks/" + params.get("t")).then((x) => x.json()).catch(() => null)
  if (r && r.pieces) choices.unshift({ key: "code:" + r.code, name: r.name || "Shared track", track: r })
}
const mine = store.get("junk-race:mine", [])
for (const t of mine) choices.push({ key: "mine:" + t.code, name: t.name, track: t })
const test = params.get("test") ? store.get("junk-race:test", null) : null
if (test) choices.unshift({ key: "test", name: test.name || "Test drive", track: test })
let pick = choices[0].key
let skill = store.get("junk-race:skill", "normal")
let play = store.get("junk-race:mode", "daily") // daily | race | speed
// time trials: you, the world best (or the friend whose link you opened), and your own best
const DAILY = { key: "daily", name: "Daily", track: dailyTrack() }
DAILY.code = trackKey(DAILY.track)
const pid = store.get("junk-race:pid", null) || Math.random().toString(36).slice(2, 12)
store.set("junk-race:pid", pid)
let friend = params.get("g") && params.get("k") ? { id: params.get("g"), key: params.get("k") } : null
let hint = null // said once the next run starts
if (friend) {
  const c = choices.find((x) => trackKey(x.track) === friend.key)
  if (friend.key === DAILY.code) play = "daily"
  else if (c) { play = "speed"; pick = c.key }
  else { hint = "That run was on an older daily. Here is today's."; friend = null; play = "daily" }
}
const trialTrack = () => (play === "daily" ? DAILY : choices.find((x) => x.key === pick))

// --- screen stack -----------------------------------------------------------------------------------
const stack = []
function show(id) { for (const s of document.querySelectorAll(".screen")) s.classList.toggle("on", stack.includes(s.id) || s.id === id); document.body.classList.toggle("racing", top() === "hud") }
function push(id) { stack.push(id); show(); focusFirst() }
function pop() { const id = stack.pop(); show(); focusFirst(); return id }
function replace(id) { stack.length = 0; push(id) }
const top = () => stack[stack.length - 1]
function focusables() { return [...$(top())?.querySelectorAll("button") || []].filter((b) => b.offsetParent) }
function focusFirst() { const f = focusables(); if (f.length && device() === "pad") f.find((b) => b.classList.contains("btn"))?.focus() || f[0].focus() }
function padNav(presses) {
  const f = focusables()
  if (!f.length) return
  for (const p of presses) {
    const cur = document.activeElement && f.includes(document.activeElement) ? document.activeElement : null
    if (!cur) { f[0].focus(); continue }
    if (p === "ok") { cur.click(); continue }
    if (p === "back" && top() !== "home" && top() !== "hud") { (top() === "pause" ? $("resume") : top() === "credits" ? $("creditsOk") : $("ok")).click(); continue }
    const a = cur.getBoundingClientRect(), ax = a.x + a.width / 2, ay = a.y + a.height / 2
    let best = null, bd = Infinity
    for (const b of f) {
      if (b === cur) continue
      const r = b.getBoundingClientRect(), dx = r.x + r.width / 2 - ax, dy = r.y + r.height / 2 - ay
      const ok = p === "up" ? dy < -5 : p === "down" ? dy > 5 : p === "left" ? dx < -5 : dx > 5
      if (!ok) continue
      const d = p === "up" || p === "down" ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2
      if (d < bd) { bd = d; best = b }
    }
    if (best) best.focus()
  }
}
onDevice(() => { renderPrompts(); setTouchUI(); if (device() === "pad") focusFirst() })

// --- touch controls ------------------------------------------------------------------------------------
// the left half: put a thumb down anywhere and slide it; the stick appears under it. Buttons are held, not tapped.
function setTouchUI() { const on = device() === "touch" || (PHONE && device() !== "pad"); document.body.classList.toggle("touch-ui", on); touch.on = on }
setTouchUI()
{
  const zone = $("stickZone"), stick = $("stick"), knob = $("knob"), REACH = 58
  let id = null, x0 = 0
  zone.addEventListener("pointerdown", (e) => {
    if (id !== null) return
    id = e.pointerId; x0 = e.clientX
    try { zone.setPointerCapture(id) } catch {}
    const r = zone.getBoundingClientRect()
    stick.style.left = e.clientX - r.left + "px"; stick.style.top = e.clientY - r.top + "px"
    stick.classList.add("on"); knob.style.transform = ""; touch.steer = 0
  })
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return
    const dx = Math.max(-REACH, Math.min(REACH, e.clientX - x0))
    touch.steer = dx / REACH; knob.style.transform = `translateX(${dx}px)`
  })
  const up = (e) => { if (e.pointerId !== id) return; id = null; touch.steer = 0; stick.classList.remove("on") }
  zone.addEventListener("pointerup", up); zone.addEventListener("pointercancel", up)
  const hold = (el, key) => {
    const on = (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId) } catch {} touch[key] = true; el.classList.add("held") }
    const off = () => { touch[key] = false; el.classList.remove("held") }
    el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off)
    el.addEventListener("contextmenu", (e) => e.preventDefault())
  }
  hold($("tDrift"), "drift"); hold($("tFire"), "fire"); hold($("tBack"), "back"); hold($("tReset"), "respawn")
  $("tPause").onclick = () => togglePause()
}

// --- home --------------------------------------------------------------------------------------------
function renderHome() {
  const tc = $("trackChips"); tc.innerHTML = ""
  for (const c of choices) {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = c.name
    b.setAttribute("aria-pressed", c.key === pick); b.onclick = () => { pick = c.key; renderHome(); startAttract() }
    tc.append(b)
  }
  const mc = $("modeChips"); mc.innerHTML = ""
  for (const [m, label] of [["daily", "Daily time trial"], ["race", "Race"], ["speed", "Time trial"]]) {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = label
    b.setAttribute("aria-pressed", m === play)
    b.onclick = () => { const was = play; play = m; store.set("junk-race:mode", m); renderHome(); if ((was === "daily") !== (m === "daily")) startAttract() }
    mc.append(b)
  }
  for (const id of ["skillLabel", "skillChips"]) $(id).style.display = play === "race" ? "" : "none"
  for (const id of ["trackLabel", "trackChips"]) $(id).style.display = play === "daily" ? "none" : ""
  renderDailyInfo()
  const sc = $("skillChips"); sc.innerHTML = ""
  for (const s of SKILLS) {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = SKILL_NAME[s]
    b.setAttribute("aria-pressed", s === skill); b.onclick = () => { skill = s; store.set("junk-race:skill", s); renderHome() }
    sc.append(b)
  }
}
$("goRace").onclick = () => (play === "race" ? startRace() : startSpeed())
gad((g) => g.shelf({ container: $("shelf") }))
// under the mode chips on the daily: who leads today and how many have run it
let dailyBoard = null
async function renderDailyInfo() {
  const el = $("dailyInfo")
  if (play !== "daily") { el.textContent = ""; return }
  if (!dailyBoard) dailyBoard = (await getJSON("/api/runs/" + DAILY.code)) || { top: [], count: 0 }
  const b = dailyBoard.top[0], mine = store.get("junk-race:best:" + DAILY.code, null)
  el.textContent = (b ? `Today's best: ${b.name} ${fmt(b.time)} · ${dailyBoard.count} ${dailyBoard.count === 1 ? "driver" : "drivers"}` : "Nobody has run today's track yet") + (mine ? ` · yours ${fmt(mine.time)}` : "")
}
$("goBuild").onclick = () => { const c = choices.find((x) => x.key === pick); store.set("junk-race:edit", c.key === "house" ? null : c.track); location.href = "/build" }
$("goCredits").onclick = () => push("credits")
$("creditsOk").onclick = () => pop()

// --- the race -------------------------------------------------------------------------------------
let race = null, view = null, mode = "attract", acc = 0, paused = false, me = 0
let hudState = {}, attractFocusT = 0, wrongT = 0
let touchHinted = false
let run = null // the speed run going on: { key, rec, ghosts: [{ ..., prog }], best }

let loading = 0
async function begin(track, opts) {
  // load the new race fully before the loop sees it; the old one keeps drawing meanwhile.
  // A later begin() wins: a Race tapped while the home race loads must not be swapped back.
  const ticket = ++loading
  const r = new Race(track, geo, opts), v = new RaceView(renderer)
  await v.load(r)
  if (ticket !== loading) { v.dispose(); return false }
  if (view) view.dispose()
  race = r; view = v
  view.resize(...stageSize())
  acc = 0
  hudState = {}
  return true
}

async function startAttract() {
  mode = "attract"
  run = null
  const c = play === "daily" ? DAILY : choices.find((x) => x.key === pick)
  if (!(await begin(c.track, { racers: 6, human: -1, skill: "normal", seed: (Math.random() * 1e9) | 0 }))) return
  view.camMode = "orbit"
  view.focus = 0
  replace("home")
  renderHome()
  playMusic("home-music")
}

async function startRace() {
  if (window.__early === "goRace") window.__early = null // the door already counted this start
  else { tally("start", { play: "race" }); window.tally.flush?.() } // sent now, not after the 800 ms batch
  mode = "race"
  run = null
  const c = choices.find((x) => x.key === pick)
  me = 0
  const tw = tweaks.values()
  STEER.smooth = tw.controls !== "v1"
  const tune = tw.controls === "v1" ? null : { yawHi: HANDLING.v2.yawHi * tw.turn, yawLo: HANDLING.v2.yawLo * tw.turn, grip: HANDLING.v2.grip * tw.grip }
  if (!(await begin(c.track, { racers: 6, human: me, skill, seed: (Math.random() * 1e9) | 0, handling: tw.controls, tune }))) return
  view.camMode = "chase"
  view.focus = me
  $("hud").classList.remove("speed")
  replace("hud")
  renderPrompts()
  playMusic("race-music")
}

// a time trial: one lap, weapons on, no bots, two ghosts. Your run is recorded from GO.
const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
async function startSpeed() {
  mode = "race"
  const c = trialTrack()
  if (window.__early === "goRace") window.__early = null // the door already counted this start
  else { tally("start", { play: c.key === "daily" ? "daily" : "speed" }); window.tally.flush?.() } // sent now, not after the 800 ms batch
  me = 0
  const key = trackKey(c.track)
  const best = store.get("junk-race:best:" + key, null)
  const board = (await getJSON("/api/runs/" + key)) || { top: [], count: 0 }
  const ghosts = [], say = []
  // the first ghost: the friend whose link brought you here, or the world best
  const lead = friend && friend.key === key ? friend.id : board.top[0]?.id
  const r = lead && lead !== store.get("junk-race:sent:" + key, {}).id ? await getJSON(`/api/runs/${key}/${lead}`) : null
  if (r) ghosts.push({ ...r, label: `${r.name} ${fmt(r.time)}`, color: "#ff2e88" })
  else if (board.top[0]) say.push("You hold the world best. Race your own ghost.")
  else say.push(c.key === "daily" ? "Nobody has run today's track yet. Set the time." : "No world best on this track yet. Set one.")
  if (r && friend && lead === friend.id) say.push(`Racing ${r.name}'s ghost`)
  if (best) ghosts.push({ ...best, label: "Your best " + fmt(best.time), color: "#fff4e2" })
  else say.push("This run sets your own ghost.")
  const tw = tweaks.values()
  STEER.smooth = tw.controls !== "v1"
  const tune = tw.controls === "v1" ? null : { yawHi: HANDLING.v2.yawHi * tw.turn, yawLo: HANDLING.v2.yawLo * tw.turn, grip: HANDLING.v2.grip * tw.grip }
  if (!(await begin(c.track, { racers: 1, human: me, skill, seed: 1, laps: 1, handling: tw.controls, tune }))) return
  const k = race.karts[me]
  for (const g of ghosts) g.prog = progress(g.frames, race.circuit, k.idx, k.prog)
  await view.addGhosts(ghosts)
  run = { key, rec: new Recorder(), ghosts, best, board, track: c }
  view.camMode = "chase"
  view.focus = me
  $("hud").classList.add("speed")
  replace("hud")
  renderPrompts()
  playMusic("race-music")
  if (hint) { say.unshift(hint); hint = null }
  say.forEach((t, i) => setTimeout(() => news(t), i * 900))
}

function renderPrompts() {
  if (mode !== "race") return
  const g = (a) => `<span class="k">${glyph(a)}</span>`
  const pad = device() === "pad"
  $("prompts").innerHTML = pad
    ? `<span>${g("gas")}Gas</span><span>${g("brake")}Brake</span><span>${g("fire")}Fire</span><span>${g("drift")}Drift · in the air: flip</span><span>${g("respawn")}Reset</span><span>${g("pause")}Pause</span>`
    : `<span><span class="k">W A S D</span>Drive</span><span>${g("fire")}Fire</span><span>${g("drift")}Drift · in the air: flip</span><span>${g("respawn")}Reset</span><span>${g("pause")}Pause</span>`
  hudState.weapon = undefined
}

function news(text, bad) {
  const d = document.createElement("div"); d.textContent = text; if (bad) d.className = "bad"
  $("news").append(d); setTimeout(() => d.remove(), 2700)
  while ($("news").children.length > 3) $("news").firstChild.remove()
}

const ordinal = (n) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th")
const nameOf = (id) => (race.karts[id].who === "human" ? "You" : NAMES[id])

function speedHud(k) {
  const set = (key, val, fn) => { if (hudState[key] !== val) { hudState[key] = val; fn(val) } }
  const t = race.phase === "count" ? 0 : k.done ? k.finishT : race.raceT
  const place = 1 + run.ghosts.filter((g) => progAt(g.prog, t) > k.prog).length
  set("place", place, (v) => { $("place").innerHTML = `${ordinal(v)}<small> of ${run.ghosts.length + 1}</small>` })
  set("lap", fmt(t), (v) => { $("lap").innerHTML = `${v}${run.best ? `<span class="best">BEST ${fmt(run.best.time)}</span>` : ""}` })
}

function hud() {
  const k = race.karts[me]
  if (run) return speedHud(k)
  const set = (key, val, fn) => { if (hudState[key] !== val) { hudState[key] = val; fn(val) } }
  set("place", k.place, (v) => { $("place").innerHTML = `${ordinal(v)}<small> of ${race.karts.length}</small>` })
  set("lap", Math.max(1, k.lap), (v) => { $("lap").textContent = `LAP ${v}/${race.laps}` })
  set("weapon", k.weapon || "", (w) => {
    const box = $("slotBox")
    box.innerHTML = w ? `<img alt="" src="${icons[w]}">` : ""
    box.classList.toggle("empty", !w)
    box.classList.remove("pop"); void box.offsetWidth; if (w) box.classList.add("pop")
    $("slotName").innerHTML = w ? `${WEAPON_NAME[w]}<br><span class="key">${glyph("fire")}</span>` : ""
    $("tFireIcon").style.backgroundImage = w ? `url(${icons[w]})` : ""
    $("tFire").classList.toggle("empty", !w)
  })
}

function onEvents(evs) {
  for (const e of evs) {
    const mine = e.k === me && mode === "race"
    if (e.t === EV.count && mode === "race") { count(String(e.n)); sfx("tick", 0.8); if (touch.on && !touchHinted) { touchHinted = true; news("The gas is on. Slide your left thumb to steer.") } }
    if (e.t === EV.go && mode === "race") { count("GO!", true); sfx("go", 0.7) }
    if (mode !== "race") continue
    if (e.t === EV.bonk && Math.random() < (mine ? 1 : 0.35)) sfx(e.pow > 11 ? "thud" : "bonk", mine ? 0.9 : 0.35)
    if (e.t === EV.eject) { sfx("clang", 0.6); if (mine) news("You fell out!", true); else news(`${nameOf(e.k)} fell out!`) }
    if (e.t === EV.pickup && mine) { sfx("pickup", 0.8); if (touch.on) news(WEAPON_NAME[e.w]) } // the slot is hidden on a phone
    if (e.t === EV.fire) {
      sfx("whoosh", mine ? 0.9 : 0.3)
      if (e.w === "rain") { const t = race.rainOn?.k; news(t === me ? "Golf balls are falling on you!" : `Golf balls fall on ${nameOf(t)}`, t === me) }
      if (e.w === "flip" && !mine) { const p = race.karts[me].body.translation(); if (Math.hypot(p.x - e.x, p.z - e.z) < 38) news(`${nameOf(e.k)} turned off your gravity!`, true) }
      if (!mine && e.w === "fan") news(`${nameOf(e.k)} switched on a Big Fan`)
    }
    if (e.t === EV.portal) { sfx("whoosh", 0.9, 0.6); news(e.target === me ? `${nameOf(e.k)} sent you back through a portal!` : `${nameOf(e.k)} sent ${nameOf(e.target)} back through a portal`, e.target === me) }
    if (e.t === EV.toss) { sfx("whoosh", e.target === me ? 1 : 0.4, 1.3); news(e.target === me ? "A tornado threw you into the sky!" : `${nameOf(e.target)} is in the sky`, e.target === me) }
    if (e.t === EV.boost && mine) { sfx("go", e.big ? 0.5 : 0.3, e.big ? 1.2 : 1.5); news(e.big ? "Big boost!" : "Boost!") }
    if (e.t === EV.fire && e.w === "tornado") news(mine ? "Tornado away!" : `${nameOf(e.k)} let loose a tornado`)
    if (e.t === EV.hook) news(e.target === me ? `${nameOf(e.k)} harpooned you!` : mine ? `You hooked ${nameOf(e.target)}` : `${nameOf(e.k)} hooked ${nameOf(e.target)}`, e.target === me)
    if (e.t === EV.smash && mine) { sfx("thud", 0.7, 1.3); news("Smash! Boost!") }
    if (e.t === EV.bite) { sfx("clang", mine ? 0.9 : 0.3, 0.7); if (mine) news("A vampire bit you!", true) }
    if (e.t === EV.go && mode === "race" && race.baddies.some((b) => b.kind === "smash")) news("Smash zombies for a boost. Dodge vampires.")
    if (e.t === EV.lap && mine) { news(e.lap === race.laps ? "Last lap!" : `Lap ${e.lap}`); sfx("tick", 0.9, 1.4) }
    if (e.t === EV.finish && mine) finish()
  }
}

function count(text, go) {
  const c = $("count"); c.textContent = text; c.classList.toggle("go", !!go)
  c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit")
}

function finish() {
  const k = race.karts[me]
  tally("finish", { play: run ? (run.track.key === "daily" ? "daily" : "speed") : "race", place: k.place, time: Math.round(k.finishT * 100) / 100 })
  if (run) return speedFinish(k)
  sfx(k.place <= 3 ? "win" : "lose", 0.8)
  setTimeout(() => {
    $("resultTitle").textContent = k.place === 1 ? "1ST!" : `${ordinal(k.place).toUpperCase()}`
    const rows = race.order.map((o) => {
      const t = o.done ? fmt(o.finishT) : "racing"
      return `<div class="r${o.id === me ? " me" : ""}"><b>${ordinal(o.place)}</b><span>${nameOf(o.id)}</span><span>${t}</span></div>`
    })
    $("standings").innerHTML = rows.join("")
    $("resultFlag").textContent = ""; $("runMsg").textContent = ""; $("submitRow").style.display = "none"; $("share").style.display = "none"
    push("results")
    showEnd()
  }, 1200)
}

function speedFinish(k) {
  const time = k.finishT, frames = run.rec.f
  const fresh = !run.best || time < run.best.time
  const mine = { time, frames, model: k.model, name: "You" }
  if (fresh) store.set("junk-race:best:" + run.key, mine)
  sfx(fresh ? "win" : "lose", 0.8)
  run.result = mine; run.sent = !fresh // a slower run has nothing to send: your best is the one on the board
  setTimeout(() => {
    $("resultTitle").textContent = fmt(time)
    $("resultFlag").textContent = fresh ? (run.best ? `New best! ${(run.best.time - time).toFixed(2)}s faster` : run.track.key === "daily" ? "Your first run today" : "Your first time on this track") : `${(time - run.best.time).toFixed(2)}s off your best`
    $("runName").value = store.get("junk-race:name", "")
    $("runMsg").textContent = ""; $("runMsg").className = "msg"
    $("submitRow").style.display = fresh && !store.get("junk-race:name", "") ? "" : "none"
    $("submitRun").disabled = false
    $("share").style.display = ""
    renderBoard(run.board.top, fresh ? null : store.get("junk-race:sent:" + run.key, {}).id)
    push("results")
    showEnd()
    // you have a name already: a new best goes straight on the board
    if (fresh && store.get("junk-race:name", "")) send(store.get("junk-race:name", ""))
  }, 1200)
}
// the top ten, with this run slotted in where it would go until it is sent
function renderBoard(top, sentId) {
  const rows = top.slice(0, 10).map((r) => ({ ...r, me: r.id === sentId }))
  if (!sentId && !run.sent) { rows.push({ name: "This run", time: run.result.time, me: true }); rows.sort((a, b) => a.time - b.time) }
  $("standings").innerHTML = rows.slice(0, 11).map((r, i) => `<div class="r${r.me ? " me" : ""}"><b>${ordinal(i + 1)}</b><span>${esc(r.name)}</span><span>${fmt(r.time)}</span></div>`).join("")
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const say = (t, bad) => { $("runMsg").textContent = t; $("runMsg").className = bad ? "msg bad" : "msg" }
async function send(name) {
  if (run.sent) return true
  store.set("junk-race:name", name)
  $("submitRun").disabled = true
  say("Sending...")
  const r = await fetch("/api/runs/" + run.key, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, pid, time: run.result.time, frames: run.result.frames, model: run.result.model }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server. Try again." }))
  if (r.error) { say(r.error, true); $("submitRun").disabled = false; $("submitRow").style.display = ""; return false }
  run.sent = true
  store.set("junk-race:sent:" + run.key, { id: r.id, rank: r.rank, time: run.result.time })
  const board = (await getJSON("/api/runs/" + run.key)) || run.board
  if (run.track.key === "daily") dailyBoard = board
  say(r.rank ? `On the board: ${ordinal(r.rank)} of ${board.count}.` : "On the board.")
  renderBoard(board.top, r.id)
  $("submitRow").style.display = "none"
  return true
}
$("submitRun").onclick = () => {
  const name = $("runName").value.trim()
  if (!name) { say("Type a name first.", true); $("runName").focus(); return }
  send(name)
}
$("runName").addEventListener("keydown", (e) => { if (e.code === "Enter") $("submitRun").click(); e.stopPropagation() })
// share: a link that puts your best run in your friend's race as the first ghost
$("share").onclick = async () => {
  const name = store.get("junk-race:name", "") || $("runName").value.trim()
  if (!name) { $("submitRow").style.display = ""; say("Type a name first, so your friends know whose ghost it is.", true); $("runName").focus(); return }
  if (!(await send(name))) return
  const sent = store.get("junk-race:sent:" + run.key, null)
  if (!sent) { say("Your run is not on the board yet, so there is nothing to share.", true); return }
  const url = `${location.origin}/?g=${sent.id}&k=${run.key}`
  const what = run.track.key === "daily" ? `Junk Race daily ${today().slice(5).replace("-", "/")}` : `Junk Race, ${run.track.name}`
  const text = `${what}: ${fmt(sent.time)}${sent.rank ? `, ${ordinal(sent.rank)} on the board` : ""}. Race my ghost.`
  tally("share", { via: navigator.share ? "sheet" : "copy" })
  try {
    if (navigator.share) { await navigator.share({ text, url }); return }
    await navigator.clipboard.writeText(`${text} ${url}`)
    say("Link copied. Paste it to your friends.")
  } catch (e) { if (e.name !== "AbortError") say("Could not copy the link here. It is: " + url, true) }
}

// every finished run ends on our other games, under the result
function showEnd() { const el = $("endpanel"); el.innerHTML = ""; gad((g) => g.end({ gameId: "junk-race", container: el })) }
$("ok").onclick = () => startAttract()
$("again").onclick = () => (run ? startSpeed() : startRace())
$("resume").onclick = () => { paused = false; pop() }
$("restart").onclick = () => { paused = false; run ? startSpeed() : startRace() }
$("quit").onclick = () => { paused = false; startAttract() }
function togglePause() {
  if (mode !== "race" || top() === "results") return
  if (top() === "pause") { paused = false; pop() } else { paused = true; push("pause") }
}
addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") togglePause()
  if (e.code === "Enter" && top() === "home") $("goRace").click()
})

// --- loop -----------------------------------------------------------------------------------------
let last = performance.now()
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const presses = padPresses()
  if (presses.includes("start")) togglePause()
  if (top() !== "hud") padNav(presses)
  if (race && !paused) {
    acc += dt
    let steps = 0
    while (acc >= DT && steps < 5) {
      view.syncPrev()
      const inputs = mode === "race" && top() === "hud" ? { [me]: read(DT) } : {}
      race.step(inputs)
      if (run && mode === "race") run.rec.step(race, race.karts[me])
      view.syncCur()
      onEvents(race.events)
      view.events(race.events)
      acc -= DT; steps++
    }
    if (steps === 5) acc = 0
    if (mode === "race") {
      hud()
      const k = race.karts[me]
      engineNote(k.v.currentVehicleSpeed(), race.phase !== "count" || true)
      // wrong way: driving against the road for a second
      const f = race.forward(k), q = race.circuit.samples[k.idx]
      wrongT = f.x * q.tx + f.z * q.tz < -0.4 && k.v.currentVehicleSpeed() > 3 ? wrongT + dt : 0
      $("wrong").style.display = wrongT > 1 ? "block" : "none"
    } else {
      engineNote(0, false)
      // the home camera hops between karts in the thick of it
      attractFocusT -= dt
      if (attractFocusT <= 0) { attractFocusT = 6; view.focus = race.order[Math.floor(Math.random() * 3)].id; view.camMode = Math.random() < 0.5 ? "orbit" : "chase" }
      $("watching").textContent = `${NAMES[view.focus]} ${ordinal(race.karts[view.focus].place)}`
      if (race.phase === "done" || race.raceT > 150) startAttract()
    }
  }
  if (view) view.frame(paused ? 1 : acc / DT, paused ? 0 : dt)
  if (!PUMP) requestAnimationFrame(loop)
}
// ?pump=1: drive frames from a message loop, which a hidden tab does not freeze (for automated runs)
const PUMP = params.has("pump")
if (PUMP) {
  const ch = new MessageChannel()
  let next = 0
  ch.port1.onmessage = () => { const n = performance.now(); if (n >= next) { next = n + 16; try { loop(n) } catch (e) { console.error(e) } } ch.port2.postMessage(0) }
  addEventListener("load", () => {})
  setTimeout(() => ch.port2.postMessage(0), 0)
}
// the canvas is sized by the small viewport (100svh), so the browser bar sliding never rescales the road
// and the height only ever ratchets down, to the least the window has been at this width (a turn of the phone resets it)
let least = { w: 0, h: Infinity }
function stageSize() {
  const c = $("stage")
  if (innerWidth !== least.w) least = { w: innerWidth, h: innerHeight }
  else least.h = Math.min(least.h, innerHeight)
  c.style.height = least.h + "px"
  return [c.clientWidth, c.clientHeight]
}
addEventListener("resize", () => view && view.resize(...stageSize()))

if (params.get("test") && test) { pick = "test"; await startRace() } else {
  const early = window.__early // a tap on the door before the game had loaded
  if (early === "goRace") $(early).click()
  else { await startAttract(); if (early) $(early).click() }
}
if (!PUMP) requestAnimationFrame(loop)
window.__game = { get race() { return race }, get view() { return view }, get run() { return run }, touch, readInput: () => read(0), startRace, startSpeed, startAttract }
