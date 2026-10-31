// Every screen at six phone sizes, as a touch phone: fails if two pieces of the page overlap, anything runs off
// the side, the road canvas changes size when the browser bar slides, or the page throws.
//   bun tools/phone-check.mjs [url]      shots land in shots/phone-check/
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { audit } from "./house-audit.mjs"
const BASE = process.argv[2] || "http://localhost:4731"
const OUT = "shots/phone-check"
mkdirSync(OUT, { recursive: true })
const SIZES = [["se", 375, 667], ["safari", 390, 664], ["small-android", 360, 640], ["android", 360, 740], ["max", 430, 932], ["landscape", 844, 390]]
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
let failures = 0
const fail = (label, why) => { failures++; console.log("FAIL " + label + "\n  " + why) }
async function check(page, label) {
  await page.waitForTimeout(400)
  const bad = await page.evaluate(audit)
  await page.screenshot({ path: `${OUT}/${label.replace(/\W+/g, "-")}.png`, timeout: 60000 })
  if (bad.length) fail(label, bad.join("\n  "))
  else console.log("ok   " + label)
}
const canvasBox = (page) => page.evaluate(() => { const c = document.getElementById("stage"); return c.clientWidth + "x" + c.clientHeight + " buf " + c.width + "x" + c.height })
for (const [tag, w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  const errs = []
  page.on("pageerror", (e) => errs.push(e.message))
  await page.goto(BASE + "/")
  await page.waitForFunction(() => window.__game?.race, null, { timeout: 90000 })
  await page.waitForTimeout(1500)
  await check(page, tag + " home")
  // the touch UI must be on, and the build button off (the editor is not made for phones)
  const ui = await page.evaluate(() => ({ touch: document.body.classList.contains("touch-ui"), build: getComputedStyle(document.getElementById("goBuild")).display }))
  if (!ui.touch || ui.build !== "none") fail(tag + " home", "touch UI " + JSON.stringify(ui))
  await page.tap("#goRace")
  await page.waitForFunction(() => __game.race?.phase === "race" && __game.run, null, { timeout: 90000 })
  await page.waitForTimeout(600)
  await check(page, tag + " race")
  // drive with the touch controls: thumb down on the left, slide right, hold drift
  const zone = await page.$("#stickZone"), zb = await zone.boundingBox()
  const a = await canvasBox(page)
  await page.evaluate(() => { const z = document.getElementById("stickZone"), r = z.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
    const ev = (t, cx) => z.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: cx, clientY: y, bubbles: true, pointerType: "touch" }))
    ev("pointerdown", x); ev("pointermove", x + 40) })
  await page.waitForTimeout(400)
  const steer = await page.evaluate(() => __game.readInput())
  if (!(steer.steer > 0.3) || steer.gas !== 1) fail(tag + " steer", "touch did not steer: " + JSON.stringify(steer))
  // the browser bar slides away: the canvas must not change
  await page.setViewportSize({ width: w, height: h + 80 })
  await page.waitForTimeout(500)
  const b = await canvasBox(page)
  await page.setViewportSize({ width: w, height: h })
  console.log("     canvas " + a + "  after bar slides: " + b)
  await page.tap("#tPause")
  await check(page, tag + " pause")
  await page.tap("#resume")
  await page.evaluate(() => { const r = __game.race; r.karts[0].prog = r.circuit.length + 1 })
  await page.waitForSelector("#results.on", { timeout: 30000 })
  await page.waitForTimeout(400)
  await check(page, tag + " results")
  await page.tap("#ok")
  await page.waitForTimeout(1500)
  await page.tap("#goCredits")
  await check(page, tag + " credits")
  if (errs.length) fail(tag + " errors", errs.join("\n  "))
  await ctx.close()
}
await browser.close()
console.log(failures ? `${failures} failing` : "all screens pass at six phone sizes")
process.exit(failures ? 1 : 0)
