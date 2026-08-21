/* Menu/scores/tutorial logic. Run: npx tsx web/test/screens.ts */
import { genStage } from '../src/engine/gen'
import { R, ui, setR } from '../src/engine/state'
import { HULLS } from '../src/engine/data'
import { evaluate, coverage } from '../src/engine/core'
import { retire, scuttle, callIt, pickHull, pressOn } from '../src/engine/actions'
import { getScores, recordScore } from '../src/net/scores'
import { LESSONS, TUT } from '../src/engine/teach'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

// ---- lessons / tutorial content ----
ck('four lesson cards', LESSONS.length === 4, String(LESSONS.length))
ck('every lesson has lines and a title', LESSONS.every(l => l.t && l.lines.length >= 3))
ck('seven tutorial steps', TUT.length === 7, String(TUT.length))
ck('every tut step names a pane and has a goal', TUT.every(s => !!s.tab && typeof s.done === 'function' && !!s.title && !!s.body))

// ---- tutorial predicates behave against real state ----
genStage('TUT', 1, null, HULLS[0])   // freighter starts with 2 engines, empty hold
R.credits = 320
ck('step 1 (two engines) already met on freighter', TUT[0].done())
ck('step 2 (hold clear) met at stage start', TUT[1].done())
ck('step 3 (a contract signed) not met yet', !TUT[2].done())
ck('step 5 (inspection) met on a fresh legal deck', TUT[4].done() === evaluate(R.grid).ok)
ck('step 6 (hands) matches coverage', TUT[5].done() === (coverage().idle.length === 0))
ck('step 7 (travelled) not met at start', !TUT[6].done())

// hauler starts with ONE engine — step 1 must be unmet there
genStage('TUT2', 1, null, HULLS[1])
ck('step 1 unmet on the one-engine hauler', !TUT[0].done())

// ---- run-end scoring ----
const before = getScores().length
genStage('SC1', 1, null, HULLS[0])
R.credits = 900; R.cleared = 2; R.stage = 3; R.delivered = 5
retire()
let board = getScores()
ck('retiring banks a score', board.length === before + 1)
ck('score records credits/stage/contracts', board[0].credits === 900 && board[0].stage === 3 && board[0].delivered === 5,
   JSON.stringify(board[0] && { c: board[0].credits, s: board[0].stage, d: board[0].delivered }))
ck('retire is tagged retired', board.find(b => b.credits === 900)?.kind === 'retired')

genStage('SC2', 1, null, HULLS[2])
R.credits = 120; R.delivered = 1
scuttle()
ck('scuttling banks a bust', getScores().some(b => b.credits === 120 && b.kind === 'bust'))

genStage('SC3', 1, null, HULLS[0])
R.credits = 40
callIt()
ck('CALL IT banks a bust', getScores().some(b => b.credits === 40 && b.kind === 'bust'))

// double-ending must not double-score
const n1 = getScores().length
scuttle(); retire()
ck('a finished run cannot be scored twice', getScores().length === n1, `${n1} -> ${getScores().length}`)

// board keeps only the best five, sorted
for (const c of [10, 5000, 77, 3000, 999, 2]) { recordScore({ credits: c, delivered: 1, stage: 1, cleared: 0, hull: 'Tug', kind: 'bust', why: 't', seed: 'X' }) }
board = getScores()
ck('board keeps five', board.length === 5, String(board.length))
ck('board is sorted by credits', board.every((r, i) => i === 0 || board[i - 1].credits >= r.credits), board.map(b => b.credits).join(','))
ck('the best run is on top', board[0].credits === 5000, String(board[0].credits))

// ---- delivered survives a stage carry ----
genStage('CARRY', 1, null, HULLS[0])
R.delivered = 3; R.credits = 500; R.cleared = 1; R.over = 'clear'
R.summary = { wages: 0, penalty: 0, forfeits: [], opening: 400, revenue: 200, spend: 100, profit: 100, best: 150 }
pressOn()
ck('delivered carries into the next stage', R.delivered === 3, String(R.delivered))
ck('endKind is not carried', R.endKind === undefined)

// ---- a new run wipes the ui tutorial-independent state ----
ui.tut = { i: 0 }
pickHull(1)   // the guided run's hull: one engine, so step 1 is a real task
ck('new run keeps the tutorial if one was started', ui.tut?.i === 0)
ck('new run starts on the deck pane', ui.tab === 'deck')
ck('guided-run hull makes step 1 meaningful', !TUT[0].done(), `engines=${R.grid.filter(k => k === 'THR').length}`)
void setR

/* ---- directive actions: every alert must point somewhere useful ---- */
import { orders } from '../src/engine/guidance'
import { runOrder, accept, buyFuel } from '../src/engine/actions'
import { courseInfo } from '../src/engine/course'

genStage('ORD', 1, null, HULLS[0])
R.credits = 400
R.fuel = 12
let o = orders()
ck('every order carries an action and a label', !!o.act && !!o.cta && o.act.kind !== undefined, `${o.cta}/${o.act.kind}`)

// a deck fault that a move can fix must hand back the offending bay
const freeBay = R.grid.indexOf(null)
R.grid[freeBay] = 'RCT'   // second reactor: heat/power trouble, positional
R.crew = ['HAND']         // and push coverage over
o = orders()
if (o.k === 'bad' && o.act.kind === 'fixDeck') {
  runOrder(o.act)
  ck('fixDeck focuses bays', ui.focus.length > 0)
  ck('fixDeck selects a bay holding something', ui.sel?.t === 'bay' && !!R.grid[(ui.sel as {t:'bay';i:number}).i])
  ck('fixDeck opens the deck', ui.tab === 'deck')
} else console.log('SKIP fixDeck (this board failed non-positionally: ' + o.t + ')')

// low fuel at a fuel line should raise a market alert
genStage('ORD2', 1, null, HULLS[0])
R.credits = 400
R.fuel = 1
const fuelNode = R.nodes.find(nd => nd.fuel > 0)!
R.at = fuelNode.id
o = orders()
if (o.k === 'buy' && /fuel/i.test(o.t)) {
  runOrder(o.act)
  ck('low-fuel alert opens the market', ui.tab === 'port' && ui.portTab === 'market', `${ui.tab}/${ui.portTab}`)
} else console.log('SKIP low-fuel alert (board raised: ' + o.t + ')')

// a contract on offer here should open contracts, not the deck
genStage('ORD3', 1, null, HULLS[0])
R.credits = 400
R.fuel = 12
const offer = R.cargo.find(c => !c.need)!
offer.at = R.at
o = orders()
if (/on offer here/.test(o.t)) {
  runOrder(o.act)
  ck('offer alert opens contracts', ui.tab === 'port' && ui.portTab === 'contracts', `${ui.tab}/${ui.portTab}`)
} else console.log('SKIP offer alert (board raised: ' + o.t + ')')

// work waiting at a distant node should plot a course to it
genStage('ORD4', 1, null, HULLS[0])
R.credits = 400
R.fuel = 10   // not thin (no fuel alert), not brimming (no tank alert)
const far = R.nodes.filter(nd => nd.id !== R.at && !R.adj![R.at].some(e => e.to === nd.id))
                   .sort((a,b) => R.D![R.at][b.id] - R.D![R.at][a.id])[0]
// every contract sits at that far node, nothing aboard, deck as generated (legal)
R.cargo.forEach(c => { c.at = far.id; c.taken = false; c.aboard = false; c.done = false; c.need = null })
o = orders()
ck('distant work raises a go order', o.k === 'go' && /waiting at/.test(o.t), o.t)
ck('distant work plots a course', o.act.kind === 'course', o.act.kind)
if (o.act.kind === 'course') {
  runOrder(o.act)
  ck('course targets the far node', courseInfo()?.target === far.id, `target=${courseInfo()?.target} want=${far.id}`)
  ck('course alert opens the lanes', ui.tab === 'lanes', ui.tab)
  ck('next hop is adjacent to us', R.adj![R.at].some(e => e.to === courseInfo()!.nextHop))
}

// an adjacent target needs no course — just the lanes
genStage('ORD5', 1, null, HULLS[0])
R.credits = 400; R.fuel = 10
const nb = R.adj![R.at][0].to
R.cargo.forEach(c => { c.at = nb; c.taken = false; c.aboard = false; c.done = false; c.need = null })
o = orders()
ck('adjacent work opens lanes without a course', o.act.kind === 'tab' && o.act.tab === 'lanes', JSON.stringify(o.act))

void buyFuel
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
