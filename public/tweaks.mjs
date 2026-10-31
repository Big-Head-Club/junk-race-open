// ?tweaks: an Options panel to flip the handling between versions and nudge it while driving the next race.
const KEY = "junk-race:tweaks"
const DEF = { controls: "v2", turn: 1, grip: 1 }
let vals = { ...DEF }
try { Object.assign(vals, JSON.parse(localStorage.getItem(KEY)) || {}) } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(vals)) } catch {} }

export const tweaks = { values: () => ({ ...vals }) }

if (new URLSearchParams(location.search).has("tweaks")) {
  const el = document.createElement("div")
  el.id = "tweaks"
  el.innerHTML = `<b>Options</b>
    <div class="label">Controls</div>
    <div class="row"><button class="chip" data-c="v2">New</button><button class="chip" data-c="v1">Old</button></div>
    <label>Turn rate <span id="twTurn"></span><input type="range" min="0.6" max="1.5" step="0.05" id="twTurnR"></label>
    <label>Grip <span id="twGrip"></span><input type="range" min="0.4" max="2" step="0.1" id="twGripR"></label>
    <div class="note">Takes effect on the next race.</div>`
  document.body.append(el)
  const paint = () => {
    el.querySelectorAll("[data-c]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.c === vals.controls))
    el.querySelector("#twTurn").textContent = vals.turn.toFixed(2); el.querySelector("#twTurnR").value = vals.turn
    el.querySelector("#twGrip").textContent = vals.grip.toFixed(1); el.querySelector("#twGripR").value = vals.grip
  }
  el.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { vals.controls = b.dataset.c; save(); paint() }))
  el.querySelector("#twTurnR").oninput = (e) => { vals.turn = +e.target.value; save(); paint() }
  el.querySelector("#twGripR").oninput = (e) => { vals.grip = +e.target.value; save(); paint() }
  paint()
}
