// The house screen rule as a check (copied from tanks/public/house.mjs): no two pieces of the page overlap, nothing runs
// off the side. Passed to page.evaluate, so it uses nothing from outside its body.
export function audit(win) {
  const w = win || window, doc = w.document
  const vw = w.innerWidth
  const seen = []
  const visible = (e) => {
    const s = w.getComputedStyle(e)
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) return false
    const r = e.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const name = (e) => (e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "")) + (e.textContent ? ' "' + e.textContent.trim().slice(0, 24) + '"' : "")
  // the part of the screen a piece can show in: its scrolling ancestors clip it
  const clipOf = (e) => {
    let c = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }
    for (let p = e.parentElement; p && p !== doc.body; p = p.parentElement) {
      const o = w.getComputedStyle(p)
      if (o.overflowX === "visible" && o.overflowY === "visible") continue
      const r = p.getBoundingClientRect()
      c = { left: Math.max(c.left, r.left), top: Math.max(c.top, r.top), right: Math.min(c.right, r.right), bottom: Math.min(c.bottom, r.bottom) }
    }
    return c
  }
  const all = (root, sel) => Array.prototype.slice.call(root.querySelectorAll(sel))
  // an open sheet is the page for overlaps
  // (the level's card and result sit on .lvover, a full-screen modal: the page under it is not content)
  const sheet = all(doc, ".sheet, .lvover").filter((x) => !x.hidden && w.getComputedStyle(x).display !== "none")[0]
  // spills are looked for on the whole page (a modal does not fix a bar running off the side);
  // overlaps only inside the open sheet, when there is one
  const spillers = []
  for (const e of all(doc.body, "*")) {
    if (e.closest("[data-gameaday-shelf]") && !e.matches("[data-gameaday-shelf]")) continue
    if (e.closest("[aria-hidden=true], .sr-only, #toast")) continue
    const leaf = e.matches("button, input, canvas, img, svg, [data-gameaday-shelf], kbd") ||
      Array.prototype.some.call(e.childNodes, (n) => n.nodeType === 3 && n.textContent.trim())
    if (!leaf || e.closest("button, svg") && e.closest("button, svg") !== e) continue
    if (!visible(e)) continue
    { const r = e.getBoundingClientRect(), c = clipOf(e); if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) continue }
    // a backdrop canvas (the home's bot round, the TV's arena, the level's map), the campaign's path
    // lines under its nodes, or the stick's zone is not content
    if (e.closest(".herobg, .stickzone, .lvcanvas, canvas.stage, svg.bpath, #stage")) continue
    spillers.push(e)
    if (!sheet || sheet.contains(e)) seen.push(e)
  }
  const out = []
  if (sheet) {
    const r = sheet.getBoundingClientRect()
    if (r.top < -1 || r.bottom > w.innerHeight + 1) out.push("sheet runs off screen " + Math.round(r.top) + ".." + Math.round(r.bottom) + " of " + w.innerHeight)
  }
  for (const e of spillers) {
    const r = e.getBoundingClientRect()
    if (r.right > vw + 1 || r.left < -1) out.push("spill " + name(e) + " " + Math.round(r.left) + ".." + Math.round(r.right) + " of " + vw)
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i], b = seen[j]
    if (a.contains(b) || b.contains(a)) continue
    // per line box, so wrapped inline text is measured where it actually is
    let hit = null
    const ar = a.getClientRects(), br = b.getClientRects(), ac = clipOf(a), bc = clipOf(b)
    for (let pi = 0; pi < ar.length; pi++) for (let qi = 0; qi < br.length; qi++) {
      const p = ar[pi], q = br[qi]
      const ow = Math.min(p.right, q.right, ac.right, bc.right) - Math.max(p.left, q.left, ac.left, bc.left)
      const oh = Math.min(p.bottom, q.bottom, ac.bottom, bc.bottom) - Math.max(p.top, q.top, ac.top, bc.top)
      if (ow > 2 && oh > 2) hit = Math.round(ow) + "x" + Math.round(oh)
    }
    if (hit) out.push("overlap " + name(a) + " × " + name(b) + " (" + hit + ")")
  }
  return out
}
