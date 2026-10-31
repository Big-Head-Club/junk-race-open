// Refresh the public copy people can clone: Big-Head-Club/junk-race-open.   bun tools/open-copy.mjs
// It is this repo's committed HEAD minus what may not be shared: the Sonniss sound effects (their licence forbids
// passing the files on), cart.json (the arcade reads any repo's cart.json, and the copy is not a second game) and
// ship-check.json. docs/OPEN-README.md becomes its README. One commit per refresh, named after the source commit.
import { execSync } from "node:child_process"
import { mkdtempSync, rmSync, readdirSync, renameSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const REPO = "Big-Head-Club/junk-race-open"
const DROP = ["cart.json", "ship-check.json"]
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString().trim()

const src = join(import.meta.dir, "..")
const sha = sh("git rev-parse --short HEAD", src)
const dir = mkdtempSync(join(tmpdir(), "junk-race-open-"))
try {
  sh(`gh repo clone ${REPO} ${dir} -- --quiet`)
  for (const f of readdirSync(dir)) if (f !== ".git") rmSync(join(dir, f), { recursive: true, force: true })
  sh(`git archive HEAD | tar -x -C ${dir}`, src)
  for (const f of DROP) rmSync(join(dir, f), { force: true })
  for (const f of readdirSync(join(dir, "public/sfx"))) if (f.endsWith(".mp3")) rmSync(join(dir, "public/sfx", f))
  renameSync(join(dir, "docs/OPEN-README.md"), join(dir, "README.md"))
  if (existsSync(join(dir, "public/sfx")) && readdirSync(join(dir, "public/sfx")).some((f) => f.endsWith(".mp3"))) throw new Error("an mp3 is still in public/sfx")
  sh("git add -A", dir)
  if (!sh("git status --porcelain", dir)) { console.log(`${REPO} already matches ${sha}`); process.exit(0) }
  sh(`git commit -q -m "Snapshot of junk-race ${sha}"`, dir)
  sh("git push -q origin HEAD:main", dir)
  console.log(`${REPO} now matches ${sha}: https://github.com/${REPO}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
