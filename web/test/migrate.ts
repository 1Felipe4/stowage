/* Old saves must load. Run: npx tsx web/test/migrate.ts */
import { genStage } from '../src/engine/gen'
import { R, setR, ui } from '../src/engine/state'
import { HULLS, STARTER, TILES } from '../src/engine/data'
import { evaluate, fuelCap } from '../src/engine/core'
import { orders } from '../src/engine/guidance'
import { rebuildTransient } from '../src/engine/map'
import { migrate } from '../src/engine/migrate'
import { stuckReason, here } from '../src/engine/actions'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

/** A save as written before shipyards, ambient heat or hull silhouettes. */
function legacySave(hullId: string) {
  genStage('LEGACY', 2, null, STARTER)
  const s: Record<string, unknown> = JSON.parse(JSON.stringify({ ...R, D: undefined, adj: undefined }))
  // strip everything that did not exist back then
  s.nodes = (s.nodes as Record<string, unknown>[]).map((n) => { const c = { ...n }; delete c.ships; return c })
  delete s.ambient
  delete s.delivered
  s.hull = { id: hullId, name: 'Old hull', base: 4, credits: 1, crew: ['HAND'], mods: ['RCT'], blurb: 'old' }
  return s
}

// 1. the exact crash: nodes with no ships array
let s = migrate(legacySave('freighter'))
ck('a pre-shipyard save still loads', !!s)
setR(s!); rebuildTransient()
ck('every node gains a ships array', R.nodes.every((n) => Array.isArray(n.ships)))
ck('rendering-path accessors do not throw', (() => {
  try { here().ships.filter((x) => !!x); orders(); evaluate(R.grid); stuckReason(); return true } catch { return false }
})())
ck('the hull is re-resolved from the live table', R.hull.blocked !== undefined && R.hull.heatCap > 0, R.hull.id)
ck('ambient is filled in from the stage', R.ambient === Math.min(3, Math.floor((R.stage - 1) / 2)), String(R.ambient))
ck('delivered is recovered from the manifest', R.delivered === R.cargo.filter((c) => c.done).length)

// 2. a hull that no longer exists falls back to the starter
s = migrate(legacySave('liner'))
ck('a retired hull id falls back to the starter', s!.hull.id === STARTER.id, s!.hull.id)

// 3. modules stranded in cells the new hull does not have
const raw = legacySave('skiff') as Record<string, unknown>
const grid = new Array(TILES).fill(null)
grid[18] = 'BAT'   // skiff blocks 16-19
grid[0] = 'TNK'    // and blocks its bow corners
grid[5] = 'RCT'
raw.grid = grid
raw.hold = []
s = migrate(raw)!
setR(s); rebuildTransient()
const gone = new Set(R.hull.blocked)
ck('nothing is left in a cell the hull lacks', R.grid.every((k, i) => !(k && gone.has(i))))
ck('stranded modules land in the hold to re-stow', R.hold.includes('BAT') && R.hold.includes('TNK'), R.hold.join(','))
ck('modules in real bays stay put', R.grid[5] === 'RCT')

// 4. fuel is clamped to the tanks actually fitted
const raw2 = legacySave('skiff') as Record<string, unknown>
raw2.grid = new Array(TILES).fill(null)
raw2.fuel = 999
s = migrate(raw2)!
ck('fuel cannot exceed the tanks aboard', s.fuel === 0, String(s.fuel))

// 5. junk is refused rather than half-loaded
ck('null is refused', migrate(null) === null)
ck('a non-object is refused', migrate('nope') === null)
ck('a save with no nodes is refused', migrate({ grid: [], hull: { id: 'skiff' } }) === null)

// 6. a current save round-trips unchanged
genStage('CURRENT', 3, null, STARTER)
const before = JSON.stringify({ grid: R.grid, hold: R.hold, ambient: R.ambient })
const round = migrate(JSON.parse(JSON.stringify({ ...R, D: undefined, adj: undefined })))!
ck('a current save survives migration untouched',
   JSON.stringify({ grid: round.grid, hold: round.hold, ambient: round.ambient }) === before)

void HULLS; void fuelCap; void ui
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
