// Screenshot a page and report page errors: bun tools/shot.mjs <path> <out.png> [w] [h] [waitMs] [js]
import { chromium } from "playwright"
const [path = "/", out = "shots/home.png", w = 1440, h = 900, wait = 6000, js = ""] = process.argv.slice(2)
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })
await page.goto("http://localhost:4731" + path)
await page.waitForTimeout(+wait)
if (js) { await page.evaluate(js); await page.waitForTimeout(3000) }
await page.screenshot({ path: out })
console.log(errors.length ? errors.join("\n") : "no page errors")
await browser.close()
