/* The solver's number is a par, not a ceiling — grading must handle both
   sides of it. Run: npx tsx web/test/rating.ts */
import { stars, starLine, verdict } from '../src/engine/rating'
let fail = 0
const ck = (n: string, ok: boolean, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

ck('beating par earns five', stars(300, 200) === 5, String(stars(300, 200)))
ck('exactly par earns five', stars(200, 200) === 5)
ck('three quarters earns four', stars(150, 200) === 4)
ck('half earns three', stars(100, 200) === 3)
ck('a quarter earns two', stars(50, 200) === 2)
ck('a sliver earns one', stars(10, 200) === 1)
ck('breaking even earns none', stars(0, 200) === 0)
ck('a loss earns none', stars(-40, 200) === 0)
ck('a nonsense par does not divide by zero', stars(120, 0) === 5 && Number.isFinite(stars(120, 0)))
ck('a negative par still grades', stars(120, -50) === 5)
ck('star glyphs are always five wide', [0,1,2,3,4,5].every(n => [...starLine(n)].length === 5),
   [0,1,2,3,4,5].map(n => starLine(n)).join(' '))
ck('five stars is all filled', starLine(5) === '★★★★★')
ck('zero stars is all hollow', starLine(0) === '☆☆☆☆☆')
ck('above par is called out', /above par/i.test(verdict(300, 200)), verdict(300, 200))
ck('a loss is named plainly', /down on the books/i.test(verdict(-10, 200)), verdict(-10, 200))
ck('every band has a line', [300,200,150,100,50,10,0,-5].every(p => verdict(p, 200).length > 0))
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
process.exit(fail ? 1 : 0)
