import { LUCIDE } from '../src/ui/lucide'
import { MOD } from '../src/engine/data'
import { LESSONS } from '../src/engine/teach'
import { readFileSync } from 'node:fs'

const icon = readFileSync(new URL('../src/ui/Icon.tsx', import.meta.url), 'utf8')
const ALIAS = Object.fromEntries([...icon.matchAll(/^\s+([A-Z0-9]+): '([a-z0-9-]+)',?$/gm)].map(m => [m[1], m[2]]))
const resolves = (n: string) => !!(LUCIDE[ALIAS[n] ?? n])

let bad: string[] = []
// 1. every module's icon
Object.values(MOD).forEach(m => { if (!resolves(m.icon)) bad.push(`MOD ${m.code} -> ${m.icon}`) })
// 2. every lesson line icon
LESSONS.forEach(l => l.lines.forEach(ln => { if (!resolves(ln.icon)) bad.push(`lesson ${ln.icon}`) }))
// 3. every literal name in the components (quoted args to Icon/chip/line/act)
const files = ['RunView','DetailSheet','Screens','EndView','App','ChartView','ShareSheet']
for (const f of files) {
  let src = ''
  try { src = readFileSync(new URL(`../src/ui/${f}.tsx`, import.meta.url), 'utf8') } catch { continue }
  const lits = new Set<string>()
  for (const m of src.matchAll(/Icon k="([A-Za-z0-9_]+)"/g)) lits.add(m[1])
  for (const m of src.matchAll(/(?:chip|line|act)\((?:'|")([A-Z0-9_]+)(?:'|")/g)) lits.add(m[1])
  for (const m of src.matchAll(/icon: '([A-Z0-9_]+)'/g)) lits.add(m[1])
  for (const n of lits) if (!resolves(n)) bad.push(`${f}: ${n}`)
}
console.log(bad.length ? 'MISSING ART:\n  ' + bad.join('\n  ') : 'every icon referenced anywhere resolves to vendored lucide art')
process.exit(bad.length ? 1 : 0)
