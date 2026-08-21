/* Heat has to bite: placement must matter, and depth must invalidate a static
   deck — without ever making a stage unwinnable. Run: npx tsx web/test/heat.ts */
import { genStage } from '../src/engine/gen'
import { R } from '../src/engine/state'
import { HULLS, MOD, NB } from '../src/engine/data'
const HULL = (id: string) => HULLS.find((h) => h.id === id)!
import { evaluate, heatField, fits } from '../src/engine/core'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

// ---- ambient scales with depth ----
const amb: number[] = []
for (let st = 1; st <= 8; st++) {
  genStage(`AMB${st}`, st, null, HULL('freighter'))
  amb.push(R.ambient)
}
ck('ambient rises every second stage', JSON.stringify(amb) === JSON.stringify([0,0,1,1,2,2,3,3]), JSON.stringify(amb))

// ---- placement matters now: a tight power cluster must be illegal ----
genStage('CLUSTER', 1, null, HULL('freighter'))
// a corner 2x2 power block sits exactly ON the line: legal, but with no slack
R.grid = new Array(20).fill(null)
R.grid[0] = 'RCT'; R.grid[1] = 'THR'; R.grid[4] = 'THR'
let h = heatField(R.grid)
ck('reactor flanked by two engines reads at the cap', h[0] === MOD.RCT.heat + 2 * (MOD.THR.spill||0), `reads ${h[0]}`)
R.grid[5] = 'THR'
h = heatField(R.grid)
ck('a corner block is at the cap but still legal', Math.max(...R.grid.map((k,i)=>k?h[i]:-99)) === R.hull.heatCap,
   `heats=${R.grid.map((k,i)=>k?h[i]:'').filter(x=>x!=='').join(',')}`)

// a reactor with all four faces used is over the line — placement now matters
R.grid = new Array(20).fill(null)
R.grid[5] = 'RCT'; R.grid[1] = 'THR'; R.grid[4] = 'THR'; R.grid[6] = 'THR'; R.grid[9] = 'THR'
h = heatField(R.grid)
ck('a reactor boxed in by four engines breaks the cap', R.grid.some((k, i) => k && h[i] > 5),
   `reactor bay reads ${h[5]}`)

// spacing the same parts out must fix it — the puzzle has a solution
R.grid = new Array(20).fill(null)
R.grid[0] = 'RCT'; R.grid[3] = 'THR'; R.grid[12] = 'THR'; R.grid[15] = 'THR'
h = heatField(R.grid)
ck('spreading the same parts clears the cap', !R.grid.some((k, i) => k && h[i] > R.hull.heatCap))

// shielding must still block spill
R.grid = new Array(20).fill(null)
R.grid[0] = 'RCT'; R.grid[1] = 'SHD'
h = heatField(R.grid)
ck('shielding takes no spill', h[1] === 0, `shield bay reads ${h[1]}`)

// ---- depth invalidates a deck that used to pass ----
genStage('DEPTH', 1, null, HULL('freighter'))
const deck = R.grid.slice()
const atCap = Math.max(...deck.map((k, i) => (k ? heatField(deck)[i] : -99)))
R.ambient = 0
const okShallow = evaluate(deck).checks.find(c => c.lb === 'HEAT')!.ok
R.ambient = 3
const okDeep = evaluate(deck).checks.find(c => c.lb === 'HEAT')!.ok
ck('a deck legal at ambient 0 can fail at ambient 3', okShallow && (!okDeep || atCap + 3 <= R.hull.heatCap),
   `shallow=${okShallow} deep=${okDeep} peak=${atCap}`)

// ---- but every depth must stay winnable: generation succeeds and cooling sells ----
for (const hull of HULLS) {
  for (const st of [1, 3, 5, 7]) {
    genStage(`DEEP${st}${hull.id}`, st, null, hull)
    const ev = evaluate(R.grid)
    const heatOK = ev.checks.find(c => c.lb === 'HEAT')!.ok
    ck(`stage ${st} ${hull.id}: generated deck clears heat`, heatOK,
       ev.checks.filter(c=>!c.ok).map(c=>c.lb).join(',') || 'clean')
    if (R.ambient > 0) {
      const coolSold = R.nodes.some(n => n.port && (n.stock.includes('RAD') || n.stock.includes('CRY')))
      ck(`stage ${st} ${hull.id}: cooling is buyable somewhere`, coolSold)
    }
  }
}

// ---- cold chain must remain satisfiable under ambient ----
genStage('COLD', 5, null, HULL('freighter'))   // ambient 2
R.grid = new Array(20).fill(null)
R.grid[5] = '@0'; R.grid[1] = 'CRY'; R.grid[4] = 'RAD'; R.grid[6] = 'RAD'
h = heatField(R.grid)
ck('cryo + radiators still reach 0 or lower at ambient 2', h[5] <= 0, `bay reads ${h[5]} at ambient ${R.ambient}`)

// ---- the annealer can still lay out a hot bag at depth ----
genStage('LAYOUT', 7, null, HULL('tug'))  // tug: 2 reactors, 3 engines, ambient 3
const bag = ['RCT','RCT','THR','THR','THR','LSP','BRT','RAD','RAD']
const laid = fits(bag, 200, 400)
ck('a hot bag can still be arranged legally at ambient 3', !!laid,
   laid ? '' : 'annealer found no legal layout')
if (laid) {
  const hh = heatField(laid)
  // the cap is per-hull now: the tug tolerates 6
  ck('that layout really is under the cap', !laid.some((k, i) => k && hh[i] > R.hull.heatCap),
     `cap ${R.hull.heatCap}, peak ${Math.max(...laid.map((k, i) => (k ? hh[i] : -99)))}`)
}
void NB
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
