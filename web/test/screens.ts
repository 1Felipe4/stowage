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
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
