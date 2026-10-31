// Keyboard, gamepad and touch into one input: { steer, gas, drift, fire, respawn }, plus menu presses.
// Tracks which device was used last so prompts show its own glyphs.
const keys = new Set()
let last = "keys"
const listeners = new Set()
export const onDevice = (fn) => listeners.add(fn)
const setLast = (d) => { if (d !== last) { last = d; listeners.forEach((f) => f(d)) } }
export const device = () => last

addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return
  keys.add(e.code); setLast("keys")
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault()
})
addEventListener("keyup", (e) => keys.delete(e.code))
addEventListener("blur", () => keys.clear())
addEventListener("mousemove", (e) => { if (!e.sourceCapabilities || !e.sourceCapabilities.firesTouchEvents) setLast("keys") })
addEventListener("touchstart", () => setLast("touch"), { passive: true, capture: true })

// the touch controls (game.mjs wires the on-screen pieces to this): the gas is on by itself,
// steer is -1..1 from the left thumb, the buttons are held
export const touch = { on: false, steer: 0, drift: false, fire: false, back: false, respawn: false }

function pad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []
  return pads.find((p) => p.connected && p.mapping === "standard") || null
}
// PlayStation pads say so in their id (Sony vendor 054c)
export const padKind = () => { const p = pad(); return p && /054c|dualsense|dualshock|playstation/i.test(p.id) ? "ps" : "xbox" }

// keys are on/off, so the steer they give ramps in and springs back; a tap is a nudge, a hold is a full lock
let smooth = 0
export const STEER = { in: 4.2, out: 9, smooth: true }
export function read(dt = 1 / 60) {
  const k = (...c) => c.some((x) => keys.has(x))
  let steer = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0)
  let gas = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0)
  let drift = k("ShiftLeft", "ShiftRight")
  let fire = k("Space", "KeyE")
  let respawn = k("KeyR")
  if (STEER.smooth) {
    const target = steer
    const rate = target === 0 || Math.sign(target) !== Math.sign(smooth) ? STEER.out : STEER.in
    smooth += Math.max(-rate * dt, Math.min(rate * dt, target - smooth))
    steer = smooth
  }
  if (touch.on && last === "touch") {
    steer = touch.steer; gas = touch.back ? -1 : 1; drift = touch.drift; fire = touch.fire; respawn = touch.respawn
    smooth = steer
  }
  const p = pad()
  if (p) {
    const ax = p.axes[0] || 0, rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0
    const used = Math.abs(ax) > 0.25 || rt > 0.1 || lt > 0.1 || p.buttons.some((b) => b.pressed)
    if (used) setLast("pad")
    // a curve on the stick: fine control near the middle, full lock at the edge
    if (Math.abs(ax) > 0.12) { const u = (Math.abs(ax) - 0.12) / 0.88; steer = Math.sign(ax) * u ** 1.6; smooth = steer }
    if (rt > 0.05 || lt > 0.05) gas = rt - lt
    if (p.buttons[1]?.pressed || p.buttons[5]?.pressed) drift = true
    if (p.buttons[0]?.pressed || p.buttons[2]?.pressed) fire = true
    if (p.buttons[3]?.pressed) respawn = true
  }
  return { steer, gas, drift, fire, respawn }
}

// menu presses from the pad, edge-triggered: "up" "down" "left" "right" "ok" "back" "start"
let prev = {}
export function padPresses() {
  const p = pad()
  if (!p) return []
  const now = {
    up: p.buttons[12]?.pressed || p.axes[1] < -0.6, down: p.buttons[13]?.pressed || p.axes[1] > 0.6,
    left: p.buttons[14]?.pressed || p.axes[0] < -0.6, right: p.buttons[15]?.pressed || p.axes[0] > 0.6,
    ok: p.buttons[0]?.pressed, back: p.buttons[1]?.pressed, start: p.buttons[9]?.pressed,
  }
  const out = Object.keys(now).filter((n) => now[n] && !prev[n])
  prev = now
  if (out.length) setLast("pad")
  return out
}

// the prompt glyph for an action on the current device
export function glyph(action) {
  if (last === "pad" && pad()) {
    const ps = padKind() === "ps"
    return { fire: ps ? "✕" : "A", drift: ps ? "○" : "B", respawn: ps ? "△" : "Y", gas: ps ? "R2" : "RT", brake: ps ? "L2" : "LT", pause: ps ? "OPTIONS" : "MENU", ok: ps ? "✕" : "A" }[action]
  }
  return { fire: "Space", drift: "Shift", respawn: "R", gas: "W", brake: "S", pause: "Esc", ok: "Enter" }[action]
}
