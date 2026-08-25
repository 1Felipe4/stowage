import { genStage } from '../src/engine/gen'
import { R, ui } from '../src/engine/state'
import { HULLS } from '../src/engine/data'
const HULL = (id: string) => HULLS.find((h) => h.id === id)!
import { shareFacts, shareText } from '../src/ui/shareCard'
import { scuttle, retire } from '../src/engine/actions'

let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

// stage-clear card
genStage('SHARE', 1, null, HULL('freighter'))
R.credits = 500; R.opening = 320; R.revenue = 400; R.spend = 220
R.over = 'clear'; R.cleared = 1
R.summary = { wages: 32, penalty: 0, capex: 60, forfeits: [], opening: 320, revenue: 400, spend: 220, profit: 180, best: 260 }
let f = shareFacts()
ck('clear card headline', f.headline === 'PROFIT 180', f.headline)
ck('clear card verdict', f.verdict === 'profit')
ck('starting ship present', f.hull === HULL('freighter').name, f.hull)
ck('seed present', f.seed === R.seed && !!f.seed)
ck('ledger has closing line', f.lines[f.lines.length - 1].label === 'CLOSED WITH' && f.lines[f.lines.length-1].val === '500')
// 180 profit against a par of 260 is 69% — three stars, not five
ck('a below-par stage grades honestly', f.stars === 3, `${f.stars} stars for 180 vs par 260`)
R.summary = { ...R.summary!, profit: 300 }
ck('beating par shows five stars', shareFacts().stars === 5, String(shareFacts().stars))
ck('the text summary carries the rating', /against par/.test(shareText(shareFacts())), shareText(shareFacts()).split('\n')[2])
R.summary = { ...R.summary!, profit: 180 }
ck('best carried', f.best === 260)
ck('text summary mentions all key facts',
   /PROFIT 180/.test(shareText(f)) && shareText(f).includes(HULL('freighter').name) && /Plan /.test(shareText(f)), shareText(f).replace(/\n/g,' | '))

// loss variant
R.summary = { ...R.summary!, profit: -40 }
f = shareFacts()
ck('loss card headline', f.headline === 'LOSS 40' && f.verdict === 'loss', f.headline)

// pawn-heavy stage: net ship spend negative must not read as "−-13"
R.summary = { wages: 32, penalty: 0, capex: 0, forfeits: [], opening: 320, revenue: 100, spend: 19, profit: 81, best: 90 }
f = shareFacts()
const shipLine = f.lines.find(l => l.label === 'FUEL BURNED')!
ck('negative net fuel spend renders as a gain', shipLine.val === '+13' && shipLine.kind === 'up', shipLine.val)
ck('kit kept is split from fuel burned', !!f.lines.find(l => /KIT & CREW/.test(l.label)))
ck('a cleared stage carries a star rating', typeof f.stars === 'number' && !!f.starRow, `${f.stars} ${f.starRow}`)

// scuttle card
genStage('SHARE2', 1, null, HULL('tug'))
R.credits = 88; R.cleared = 2; R.stage = 3
scuttle()
f = shareFacts()
ck('scuttle card is a bust', f.headline === 'BUST' && f.verdict === 'bust')
ck('scuttle reason carried as sub', /scuttled/i.test(f.sub), f.sub)
ck('scuttle card keeps ship + stage', f.hull === HULL('tug').name && f.stage === 3 && f.cleared === 2, `${f.hull}/${f.stage}/${f.cleared}`)
ck('bust card has no ledger', f.lines.length === 0)

// retire card
genStage('SHARE3', 1, null, HULL('whale'))
R.credits = 1240; R.cleared = 4
retire()
f = shareFacts()
ck('retire card reads bust-style with credits', f.verdict === 'bust' && /retired/i.test(f.sub) && f.credits === 1240, f.sub)

void ui
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
