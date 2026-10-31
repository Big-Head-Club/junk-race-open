// Put the player's kart behind each kind of bad guy and screenshot it: bun tools/baddie-shot.mjs
import { chromium } from "playwright"
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })
await page.goto("http://localhost:4731/")
await page.waitForTimeout(5000)
await page.evaluate(() => __game.startRace())
await page.waitForTimeout(6000)
for (const kind of ["smash", "dodge"]) {
  await page.evaluate((kind) => {
    const r = __game.race, k = r.karts[0], b = r.baddies.find((b) => b.kind === kind)
    const S = r.circuit.samples, s = S[(b.si - 14 + S.length) % S.length]
    k.who = "bot"
    k.body.setTranslation({ x: s.x, y: s.y + 1, z: s.z }, true)
    k.body.setRotation({ x: 0, y: Math.sin(Math.atan2(s.tx, s.tz) / 2), z: 0, w: Math.cos(Math.atan2(s.tx, s.tz) / 2) }, true)
    k.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }, kind)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `shots/baddie-${kind}.png` })
}
const st = await page.evaluate(() => { const r = __game.race; return { phase: r.phase, baddies: r.baddies.length, alive: r.baddies.filter((b) => b.alive).length } })
console.log(JSON.stringify(st))
console.log(errors.length ? errors.join("\n") : "no page errors")
await browser.close()
