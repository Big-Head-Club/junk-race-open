// A close look at a tornado: bun tools/tornado-shot.mjs
import { chromium } from "playwright"
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []; page.on("pageerror", (e) => errors.push(e.message))
await page.goto("http://localhost:4731/?pump=1")
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.evaluate(() => __game.startRace())
await page.evaluate(() => { const r = __game.race; r.phase = "race"; r.clock = 0; const k = r.karts[0]; k.weapon = "tornado"; r.fire(k); __game.view.camMode = "orbit" })
await page.waitForTimeout(5000)
await page.screenshot({ path: "shots/tornado.png" })
console.log(errors.length ? errors.join("\n") : "no page errors")
await browser.close()
