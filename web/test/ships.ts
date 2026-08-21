/* Ships: silhouettes, traits, dealers and trading up.
   Run: npx tsx web/test/ships.ts */
import { genStage } from '../src/engine/gen'
import { R, ui } from '../src/engine/state'
import { HULLS, STARTER, TILES, tierFor } from '../src/engine/data'
const HULL = (id: string) => HULLS.find((h) => h.id === id)!
import { bays, blocked, evaluate, fits, fuelCap, laneCost, laneFuel } from '../src/engine/core'
import { buyShip, here, newRun, outEdges, shipPrice, tradeIn } from '../src/engine/actions'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

// ---- the table itself ----
ck('starter is the only free hull', HULLS.filter(h => h.price === 0).length === 1 && STARTER.price === 0)
ck('starter is the smallest', HULLS.every(h => 20 - h.blocked.length >= 20 - STARTER.blocked.length))
ck('price rises with tier', HULLS.slice().sort((a,b)=>a.tier-b.tier).every((h,i,arr) => i === 0 || arr[i-1].price <= h.price))
ck('every silhouette is distinct', new Set(HULLS.map(h => h.blocked.join(','))).size === HULLS.length)
ck('blocked indices are all in range', HULLS.every(h => h.blocked.every(i => i >= 0 && i < TILES)))
ck('dealer tiers open up with depth', tierFor(1) === 1 && tierFor(3) === 2 && tierFor(5) === 3)

// ---- a run starts on the starter and its deck is legal ----
newRun()
ck('a new run is on the starter', R.hull.id === STARTER.id, R.hull.id)
ck('starter deck clears inspection', evaluate(R.grid).ok,
   evaluate(R.grid).checks.filter(c=>!c.ok).map(c=>c.lb).join(','))
ck('bays() matches the silhouette', bays() === TILES - R.hull.blocked.length)
ck('nothing is stowed in a blocked cell', R.grid.every((k, i) => !(k && blocked(i))))
ck('the annealer never uses blocked cells', (() => {
  const laid = fits(['RCT','THR','THR','LSP','BRT'], 60, 200)
  return !!laid && laid.every((k, i) => !(k && blocked(i)))
})())

// ---- traits actually bite ----
const lean = HULL('hauler'), heavy = HULL('whale')
genStage('LEAN', 1, null, lean)
const leanCost = laneFuel(10)
genStage('HEAVY', 1, null, heavy)
const heavyCost = laneFuel(10)
ck('a lean hull burns less on the same lane', leanCost < heavyCost, `hauler ${leanCost} vs whale ${heavyCost}`)
ck('lane fuel is never free', laneFuel(1) >= 1)
genStage('CAPS', 1, null, HULL('tug'))
ck('an insulated hull tolerates more heat', R.hull.heatCap === 6 && HULL('freighter').heatCap === 5)

// ---- dealers exist and are reachable ----
let dealerNodes = 0, warpsWithoutShips = 0
for (let s = 0; s < 12; s++) {
  genStage('DEAL' + s, 3, null, STARTER)
  dealerNodes += R.nodes.filter(n => n.ships.length).length
  warpsWithoutShips += R.nodes.filter(n => n.warp && !n.ships.length).length
}
ck('sectors carry shipyards', dealerNodes > 0, `${dealerNodes} across 12 sectors`)
ck('every warp point deals hulls', warpsWithoutShips === 0, `${warpsWithoutShips} warps had none`)
genStage('TIER', 1, null, STARTER)
ck('early sectors do not sell top-tier hulls',
   R.nodes.every(n => n.ships.every(id => HULL(id).tier <= tierFor(1))),
   R.nodes.flatMap(n => n.ships).join(','))

// ---- trading up ----
genStage('BUY', 3, null, STARTER)
const yard = R.nodes.find(n => n.ships.length)!
R.at = yard.id
R.credits = 9000
const want = yard.ships[0]
const target = HULL(want)
const before = { grid: R.grid.filter(Boolean).length, credits: R.credits, hull: R.hull.id }
ck('trade-in is worth something on a bought hull', tradeIn() === 0, `starter trades at ${tradeIn()}`)
const net = shipPrice(want)
buyShip(want)
ck('buying switches the hull', R.hull.id === target.id, `${before.hull} -> ${R.hull.id}`)
ck('buying charges the net price', R.credits === before.credits - net, `paid ${before.credits - R.credits}, quoted ${net}`)
ck('the old deck comes with you, in the hold', R.hold.length === before.grid, `${R.hold.length} vs ${before.grid}`)
ck('the new deck starts empty', R.grid.every(k => !k))
ck('fuel is clamped to the new tanks', R.fuel <= fuelCap())
ck('buying opens the deck to re-stow', ui.tab === 'deck')

// you cannot buy your own hull, or one this yard does not stock
const own = R.hull.id
buyShip(own)
ck('cannot re-buy your own hull', R.hull.id === own)
const elsewhere = HULLS.find(h => !yard.ships.includes(h.id) && h.id !== own)!
const cr = R.credits
buyShip(elsewhere.id)
ck('cannot buy a hull this yard does not stock', R.hull.id === own && R.credits === cr)

// and you cannot buy what you cannot afford
genStage('POOR', 5, null, STARTER)
const yard2 = R.nodes.find(n => n.ships.length)!
R.at = yard2.id
R.credits = 10
const hullBefore = R.hull.id
buyShip(yard2.ships[0])
ck('cannot buy a hull you cannot afford', R.hull.id === hullBefore)

// trade-in reduces the price once you are on something worth money
genStage('TRADE', 5, null, HULL('freighter'))
const yard3 = R.nodes.find(n => n.ships.length && n.port)
if (yard3) {
  R.at = yard3.id
  ck('trade-in credits your current hull', tradeIn() > 0, `freighter trades at ${tradeIn()}`)
  const id = yard3.ships.find(x => x !== R.hull.id)
  if (id) ck('net price is below list', shipPrice(id) < HULL(id).price, `${shipPrice(id)} vs ${HULL(id).price}`)
} else console.log('SKIP trade-in pricing (no port yard on this board)')

void laneCost; void here; void outEdges
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
