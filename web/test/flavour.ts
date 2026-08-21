import { genStage } from '../src/engine/gen'
import { R } from '../src/engine/state'
import { HULLS, KINDS } from '../src/engine/data'
import { GOODS } from '../src/engine/flavour'
let fail = 0
const ck = (n: string, ok: boolean, d='') => { if(!ok) fail++; console.log(`${ok?'PASS':'FAIL'} ${n}${d?' — '+d:''}`) }

genStage('FLAV', 3, null, HULLS[0])
console.log('sample manifest:')
R.cargo.forEach(c => console.log(`  ${c.short}: ${c.goods} for ${c.client} (${c.name}, pays ${c.fee})`))
ck('every contract has goods', R.cargo.every(c => !!c.goods))
ck('every contract has a client', R.cargo.every(c => !!c.client))
ck('goods match the cargo kind', R.cargo.every(c => GOODS[c.kind].includes(c.goods!)))
ck('clients are unique on a board', new Set(R.cargo.map(c => c.client)).size === R.cargo.length,
   R.cargo.map(c=>c.client).join(' / '))
// determinism: same seed, same story
const first = R.cargo.map(c => `${c.goods}|${c.client}`).join(',')
genStage('FLAV', 3, null, HULLS[0])
ck('same seed tells the same story', R.cargo.map(c => `${c.goods}|${c.client}`).join(',') === first)
// rules still keyed off kind, not flavour
ck('rules still come from the kind', R.cargo.every(c => c.rule === KINDS[c.kind].rule))
ck('support still comes from the kind', R.cargo.every(c => c.support === KINDS[c.kind].support))
// variety across seeds
const seen = new Set<string>()
for (let i = 0; i < 25; i++) { genStage('V'+i, 5, null, HULLS[0]); R.cargo.forEach(c => seen.add(c.goods!)) }
ck('goods vary across seeds', seen.size >= 15, `${seen.size} distinct goods seen`)
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail?1:0)
