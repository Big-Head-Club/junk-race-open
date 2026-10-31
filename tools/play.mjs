// Drive a race with a bot in the player's seat, fire every weapon, screenshot each: bun tools/play.mjs [w] [h]
import { chromium } from "playwright"
const [w = 1440, h = 900] = process.argv.slice(2)
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })
await page.goto("http://localhost:4731/")
await page.waitForTimeout(5000)
await page.evaluate(() => __game.startRace())
await page.evaluate(() => { const r = __game.race; r.karts[0].who = "bot"; r.karts[0].weapon = null })
await page.waitForTimeout(9000)
await page.screenshot({ path: "shots/play-0-driving.png" })
for (const wpn of (process.argv[4] || "junk,harpoon,flip,ball,fan,rain,portal,tornado").split(",")) {
  await page.evaluate((wpn) => { const r = __game.race; const k = r.karts[0]; k.weapon = wpn; k.think = 0; r.fire(k) }, wpn)
  await page.waitForTimeout(wpn === "rain" || wpn === "tornado" ? 2200 : 900)
  await page.screenshot({ path: `shots/play-${wpn}.png` })
  await page.waitForTimeout(1500)
}
const st = await page.evaluate(() => { const r = __game.race; return { t: r.raceT.toFixed(1), phase: r.phase, laps: r.karts.map((k) => k.lap), loose: r.loose.length } })
console.log(JSON.stringify(st))
console.log(errors.length ? errors.join("\n") : "no page errors")
await browser.close()
