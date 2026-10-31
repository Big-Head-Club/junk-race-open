# Junk Race prototype: decisions and open calls

Codename `junk-race`. Built 2026-10-29 from Mack's ask: low poly, sloppy physics racing, snap-to-grid
level editor, wild weapons to set it apart. Everything below marked (pick) was my call; all are Mack's to change.

## Open calls (my pick in brackets)
1. **Name.** (Junk Race, placeholder: the repo is a codename.)
2. **Weapons, first six.** (Junk Cannon: sofa/fridge/bathtub; Harpoon: hook the kart ahead and reel past;
   Gravity Flip: karts near you float then drop; Wrecking Ball on a rope for 9 s; Big Fan: ceiling fan blows
   karts off the road; Golf Ball Storm: giant golf balls drop on the leader.) Back-of-pack rolls favour harpoon and storm.
3. **What "sloppy" means.** (Real Rapier physics: karts flip, drivers fly out on big hits and the kart
   stalls until they land, parts fall off on every hit, pylons and crates are loose bodies, air control lets you spin and flip.)
   Steering itself stays tight; the slop is in the hits.
4. **Art kit.** (Kenney Racing Kit road tiles + Car Kit karts with their helmet drivers + Furniture Kit junk. All owned, CC0.)
   Tile = 8 m, road 6.7 m wide, about four karts abreast.
5. **Editor pieces.** (12 road pieces: start, straights, three corner sizes, lane shift, two jumps, hill, bumps;
   12 props incl. weapon boxes, pylons, crates, kicker ramp, stands.) No bridges or height layers yet.
   Lane shift only steps right (the kit has no mirrored model).
6. **Modes.** (Single race vs 5 bots, Easy/Normal/Hard, 1 to 5 laps.) House rule is daily mission + campaign; not built.
7. **Multiplayer.** (None yet. Cheapest next step is one TV + phones, no prediction.)
8. **Platform.** (Desktop first: keyboard and pad, pad glyphs when a pad is used.) Phone controls not built.
9. **Shared tracks.** (Share button saves to the server and gives a 5-letter code, /?t=CODE.) JSON file store; needs a volume on Railway.
10. **Colour pair.** (Tangerine field, lime buttons, plum ink, sunset sky.)

## Round 2 (2026-10-29, Mack: better controls, a portal weapon, a tornado, levels twice as long)
11. **Controls.** (New handling: the kart turns at the rate the stick asks for, so half a stick is half a turn;
    the tyres hold the line; steering never rolls you over; keys ramp in and spring back; the pad stick has a curve;
    Drift + steer slides the back out and lets go into a boost; in the air the kart rights itself, and flips only while Drift is held.)
    The first build's handling is "Old" in the `?tweaks` panel, with Turn rate and Grip sliders.
12. **Portal.** (Grabs the kart just ahead in the race, or just behind if you lead, and drops it 90 m back down the road
    at the same speed and the same angle to the road. Pink ring where it went in, lime ring where it came out.)
13. **Tornado.** (Runs down the road at 31 m/s for 8 s, weaving. Any kart it touches goes straight up at 44 m/s, about 54 m,
    spinning. Hits each kart once. Lifts loose junk too.)
14. **Twice as long.** (House loop 310 m to 673 m; editor grid 28 to 40 cells a side; twice the weapon boxes.)
    Bots take 150 to 225 s for 3 laps on it. Laps stay at 3; say if long tracks should default to 2.

## Round 3 (2026-10-29, Mack: helmet colour, boxes in the ground, speed runs, bad guys, 3-kart ghost runs, race your ghost)
15. **Your helmet.** (Lime, the button colour. Bots keep the kit's grey. Ghost helmets: World best pink, Your best cream, Next up cyan.)
16. **Boxes in the ground.** (Weapon boxes and loose props now sit on the road's own height, so they no longer sink into hills and ramps.)
17. **Bad guys.** (Two kinds. Zombies and skeletons shuffle across the road: drive through one and it flies and you get a short boost.
    Vampires prowl up and down the road: touch one and your driver is thrown out and the kart is knocked back. Bots steer round vampires.
    House loop: 3 zombie groups, 2 skeleton groups, 3 vampires. They walk in normal races too. All three are in the editor's palette.)
18. **Speed run.** One lap (Mack: yes). Weapons ON (Mack). Bad guys on, and more of them (Mack: "yes and more everywhere").
19. **Ghosts.** Just two (Mack): World best and Your best, no picker. Ghosts don't collide.
20. **Submit.** (Results show the top ten with this run slotted in; type a name and Submit. The server refuses runs under 8 s,
    runs whose frame count does not match the time, and runs with more than 12 teleports. Top 50 kept per track layout;
    editing a track starts a new board.) A hard bot's 40.25 s lap is seeded as "Oobi" on the house loop (`bun tools/seed-ghost.mjs`).
    Runs are not checked by replaying them, so a hacked client can still post a fake time.

## Round 4 (2026-10-29, Mack: weapons on, two ghosts, more bad guys; the big thing is a global daily time trial, easy to share; circuits of four later)
21. **Daily time trial.** (First mode chip and the default: "Daily time trial", then "Race", then "Time trial" on any track.
    Today's track is made from the UTC date, the same for everyone: a four-sided loop of right-hand corners with hills, bumps,
    jumps, lane shifts and some days a wiggle; 450 to 740 m; checked for 60 days that every one closes and a hard bot finishes
    in 25 to 77 s. One global board per day. Home shows today's best and how many have run it.)
22. **Weapons alone.** (With nobody else on the road the box only gives junk, golf ball, fan, rain and tornado; harpoon, flip
    and portal would hit nothing. Rain falls on you, the tornado can catch you, the fan is a boost.)
23. **The board.** (One run per player per day: a faster run replaces yours, a slower one is not sent. Your first run asks for
    a name once; after that a new best goes straight on the board.)
24. **Share.** (Results has Share: native share sheet on phones, copy link on desktop. The text is
    "Junk Race daily 10/29: 0:33.82, 2nd on the board. Race my ghost." plus a link that loads home on the daily with
    your run as the lead ghost, named, in place of the world best. A link to an old daily says so and gives today's.)
25. **More bad guys.** (House loop: 6 zombie groups, 5 skeleton groups, 6 vampires. Dailies: one group about every 55 m.)
    Bots still finish every race; smashing is now the fast way round (about 140 smashes a 6-bot race).
26. **No bot ghost on a new day.** (The first player sets the time. `bun tools/seed-ghost.mjs daily` posts a hard bot's lap
    if a day should open with one to chase.)
27. **Mobile (round 5, Mack: "take a crack at mobile build").** (Touch controls: the gas is on by itself; put your left thumb
    down anywhere on the left half and slide it to steer (58 px is full lock); Drift, Fire (shows your weapon) and Back
    buttons under the right thumb; Reset and Pause top right. Works upright and sideways; upright gets a wider lens.
    Phones draw at 1.5x at most with plain 1024 shadows. The road canvas only ever shrinks to the least height seen at a
    width, so the browser bar sliding never rescales it. Build a track is hidden on phones: the editor is not made for touch.)
    `bun tools/phone-check.mjs` passes every screen at six phone sizes. Not yet measured on a real phone: frame rate,
    and whether thumb steering feels right.

## Not done (house rules for an official game)
Ship-check, Railway + ledger, tally, gameaday shelf, phone-check at six sizes, ?tweaks panel, bot ladder sim
(headless race sim exists: `bun tools/race-sim.mjs`), gallery page. None of it is needed to judge the prototype.

## Numbers
- House loop: 310 m. Bots (normal) finish 3 laps in 82 to 131 s; about 4 respawns per kart per race.
- Kart top speed 27 m/s, about 2.2 g of grip in corners, gravity 18 m/s².
- Sim step 0.2 to 0.7 ms headless; 30 fps in Chrome with six karts and junk flying.
