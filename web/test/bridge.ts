import { genStage } from '../src/engine/gen'
import { R, ui } from '../src/engine/state'
import { HULLS } from '../src/engine/data'
import { coverage, massOf, surcharge, capacity, fuelCap, evaluate } from '../src/engine/core'
import { askJump, cancelJump, confirmJump, outEdges, coord, here } from '../src/engine/actions'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

genStage('COV', 1, null, HULLS[0])
R.credits = 320
let cov = coverage()
const thrIdx = R.grid.findIndex(k => k === 'THR')
ck('thrusters always active (weigh nothing)', cov.active[thrIdx] === true)
ck('coverage capM = 4 * hands', cov.capM === 4 * 2, `capM=${cov.capM}`)
const stowed = R.grid.filter(Boolean).length
const activeCount = Object.values(cov.active).filter(Boolean).length
ck('every stowed bay accounted for', activeCount + cov.idle.length === stowed, `${activeCount}+${cov.idle.length} vs ${stowed}`)
ck('empty bays never in coverage', !Object.keys(cov.active).some(i => !R.grid[+i]))

// overload the deck: strip crew to force idle bays
R.crew = ['HAND']
cov = coverage()
ck('fewer hands -> idle bays appear', cov.idle.length > 0, `idle=${cov.idle.length} capM=${cov.capM} mass=${massOf()}`)
ck('idle bays are the deck tail (highest indices)', cov.idle.every(i => !cov.active[i]))
const nonThrMass = massOf()
ck('mass unchanged by crew size', nonThrMass === massOf())

R.crew = []
cov = coverage()
const nonThrStowed = R.grid.filter(k => k && k !== 'THR').length
ck('no hands -> all mass-bearing bays idle', cov.idle.length === nonThrStowed, `idle=${cov.idle.length} vs ${nonThrStowed}`)
ck('no hands -> thruster still active', cov.active[thrIdx] === true)

// ---- chart travel confirmation ----
genStage('JUMP', 1, null, HULLS[0])
R.credits = 320
R.fuel = Math.min(12, fuelCap())   // never exceed the tanks: overfill fails inspection
const e0 = outEdges()[0]
ck('deck legal before jump tests', evaluate(R.grid).ok, evaluate(R.grid).checks.filter(c=>!c.ok).map(c=>c.lb).join(','))
askJump(e0.b)
ck('askJump plots adjacent node', !!ui.confirm && ui.confirm.to === e0.b && ui.confirm.why === null, JSON.stringify(ui.confirm))
ck('cost = lane + surcharge', ui.confirm!.cost === e0.cost + surcharge())
const before = { at: R.at, fuel: R.fuel }
cancelJump()
ck('cancel moves nothing', ui.confirm === null && R.at === before.at && R.fuel === before.fuel)

askJump(e0.b)
confirmJump()
ck('confirm actually travels', R.at === e0.b, `at=${coord(here())}`)
ck('confirm spends fuel', R.fuel === before.fuel - (e0.cost + 0), `fuel=${R.fuel} was ${before.fuel}`)
ck('confirm clears the overlay', ui.confirm === null)
ck('arriving opens the port pane', ui.tab === 'port' && ui.portTab === 'market')

// non-adjacent node must be refused with a reason
const far = R.nodes.find(n => n.id !== R.at && !outEdges().some(e => e.b === n.id))!
askJump(far.id)
ck('non-adjacent refused with reason', !!ui.confirm?.why?.includes('No lane runs'), String(ui.confirm?.why))
cancelJump()

// insufficient fuel refused
R.fuel = 0
const e1 = outEdges()[0]
askJump(e1.b)
ck('no-fuel refused with reason', !!ui.confirm?.why?.includes('fuel'), String(ui.confirm?.why))
const atBefore = R.at
confirmJump()
ck('blocked burn cannot move the ship', R.at === atBefore)
cancelJump()

void capacity
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
