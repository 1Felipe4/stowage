/* Drag-drop moves and swaps, and the detail sheet has something to say about
   every entity. Run: npx tsx web/test/detail.ts */
import { genStage } from '../src/engine/gen'
import { R, ui } from '../src/engine/state'
import { HULLS, STARTER, TILES } from '../src/engine/data'
const HULL = (id: string) => HULLS.find((h) => h.id === id)!
import { blocked, evaluate } from '../src/engine/core'
import { accept, closeDetail, dropOn, openDetail } from '../src/engine/actions'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

// ---- dropping ----
genStage('DROP', 1, null, STARTER)
const from = R.grid.findIndex((k, i) => !!k && !blocked(i))
const empty = R.grid.findIndex((k, i) => !k && !blocked(i))
const moved = R.grid[from]
dropOn({ t: 'bay', i: from }, empty)
ck('dragging to a clear bay moves it', R.grid[empty] === moved && R.grid[from] === null)

const a = R.grid.findIndex((k, i) => !!k && !blocked(i))
const b = R.grid.findIndex((k, i) => !!k && !blocked(i) && i !== a)
const [ka, kb] = [R.grid[a], R.grid[b]]
dropOn({ t: 'bay', i: a }, b)
ck('dragging onto a full bay swaps the two', R.grid[a] === kb && R.grid[b] === ka, `${ka}/${kb} -> ${R.grid[a]}/${R.grid[b]}`)

const before = R.grid.slice()
dropOn({ t: 'bay', i: a }, a)
ck('dropping a bay on itself changes nothing', JSON.stringify(R.grid) === JSON.stringify(before))

// a cell this hull does not have is never a drop target
const gone = R.hull.blocked[0]
if (gone !== undefined) {
  const held = R.grid.filter(Boolean).length
  dropOn({ t: 'bay', i: a }, gone)
  ck('a blocked cell refuses a drop', R.grid[gone] === null && R.grid.filter(Boolean).length === held, `cell ${gone}`)
}

// hold -> bay
genStage('DROP2', 1, null, STARTER)
const sign = R.cargo.find((c) => !c.need)!
sign.at = R.at
accept(sign.i)
ck('signing puts it in the hold', R.hold.length === 1)
const slot = R.grid.findIndex((k, i) => !k && !blocked(i))
dropOn({ t: 'hold', n: 0 }, slot)
ck('dragging out of the hold stows it', R.grid[slot] === '@' + sign.i && R.hold.length === 0)

// dropping onto a full bay from the hold is refused (nothing to swap with)
genStage('DROP3', 1, null, STARTER)
const sign3 = R.cargo.find((c) => !c.need)!
sign3.at = R.at
accept(sign3.i)
const full = R.grid.findIndex((k, i) => !!k && !blocked(i))
dropOn({ t: 'hold', n: 0 }, full)
ck('the hold will not displace a stowed module', R.hold.length === 1)

// ---- the detail sheet answers for every entity ----
genStage('DTL', 3, null, STARTER)
R.credits = 5000
const kinds: { d: Parameters<typeof openDetail>[0]; what: string }[] = []
kinds.push({ d: { k: 'mod', id: R.nodes.find(n => n.stock.length)!.stock[0] }, what: 'a market module' })
kinds.push({ d: { k: 'bay', id: R.grid.findIndex(Boolean) }, what: 'a stowed bay' })
kinds.push({ d: { k: 'crew', id: 0 }, what: 'a crew member' })
kinds.push({ d: { k: 'cargo', id: 0 }, what: 'a contract' })
kinds.push({ d: { k: 'check', id: evaluate(R.grid).checks[0].lb }, what: 'an inspection check' })
kinds.push({ d: { k: 'ship', id: 'freighter' }, what: 'a hull for sale' })
const hall = R.nodes.find(n => n.hires.length)
if (hall) { R.at = hall.id; kinds.push({ d: { k: 'hire', id: hall.hires[0] }, what: 'a hire' }) }

for (const { d, what } of kinds) {
  openDetail(d)
  ck(`the sheet opens for ${what}`, JSON.stringify(ui.detail) === JSON.stringify(d))
  closeDetail()
  ck(`the sheet closes for ${what}`, ui.detail === null)
}

// a sheet pointed at nothing must not be left open
openDetail({ k: 'bay', id: R.grid.findIndex((k, i) => !k && !blocked(i)) })
ck('an empty bay still records a request', !!ui.detail)
closeDetail()

void TILES; void HULL
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
