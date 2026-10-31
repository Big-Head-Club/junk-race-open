// Samples on a little bus: sfx, music, and the player's engine (a synth note that climbs with speed).
let ctx = null, sfxBus, musicBus, engine = null
const buffers = new Map()
const NAMES = ["bonk", "thud", "clang", "pickup", "whoosh", "win", "lose", "tick", "go"]
let music = null, musicName = ""

export function unlock() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return }
  ctx = new AudioContext()
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(ctx.destination)
  musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(ctx.destination)
  for (const n of NAMES) fetch(`/sfx/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => buffers.set(n, buf)).catch(() => {})
  if (musicName) playMusic(musicName)
}
addEventListener("pointerdown", unlock)
addEventListener("keydown", unlock)

export function sfx(name, vol = 1, rate = 1) {
  if (!ctx || !buffers.has(name)) return
  const s = ctx.createBufferSource()
  s.buffer = buffers.get(name)
  s.playbackRate.value = rate * (0.94 + Math.random() * 0.12)
  const g = ctx.createGain(); g.gain.value = vol
  s.connect(g).connect(sfxBus)
  s.start()
}

export function playMusic(name) {
  musicName = name
  if (!ctx) return
  if (music && music.name === name) return
  if (music) { music.el.pause(); music = null }
  const el = new Audio(`/sfx/${name}.ogg`)
  el.loop = true
  const src = ctx.createMediaElementSource(el)
  src.connect(musicBus)
  el.play().catch(() => {})
  music = { name, el }
}

export function engineNote(speed, on) {
  if (!ctx) return
  if (!engine) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    o.type = "sawtooth"; o2.type = "square"; f.type = "lowpass"; f.frequency.value = 900; g.gain.value = 0
    o.connect(f); o2.connect(f); f.connect(g).connect(sfxBus)
    o.start(); o2.start()
    engine = { o, o2, f, g }
  }
  const t = ctx.currentTime
  const hz = 48 + Math.abs(speed) * 5.5
  engine.o.frequency.setTargetAtTime(hz, t, 0.05)
  engine.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.05)
  engine.f.frequency.setTargetAtTime(500 + Math.abs(speed) * 60, t, 0.1)
  engine.g.gain.setTargetAtTime(on ? 0.06 : 0, t, 0.1)
}
