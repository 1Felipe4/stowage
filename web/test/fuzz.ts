/* E2E fuzz harness: plays whole runs through the real engine actions with a
   random-but-legal policy, asserting invariants after every action.
   Run from repo root:  npx tsx web/test/fuzz.ts [runs] [seed]              */
import { genStage } from '../src/engine/gen'
import { R, setR } from '../src/engine/state'
import { HULLS, KINDS, MOD, TILES } from '../src/engine/data'
import { capacity, evaluate, fits, fuelCap, massOf, surcharge } from '../src/engine/core'
import {
  accept, buyFuel, buyMod, callIt, doWarp, here, hire, jettison, jump, outEdges,
  payOff, pressOn, sellMod, sellRate, shipOK, stuckReason, tapBay, tapHold
} from '../src/engine/actions'
import { orders, whyHire, whyMod } from '../src/engine/guidance'
import { rebuildTransient } from '../src/engine/map'
import { mulberry32, seedNum } from '../src/engine/rng'
import type { GameState, HireId, ModCode } from '../src/engine/types'

const RUNS = Number(process.argv[2]) || 30
const SEED = process.argv[3] || 'FUZZ'
const rng = mulberry32(seedNum(SEED))
const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)]

let steps = 0
function fail(msg: string, ctx = ''): never {
  console.error(`\nINVARIANT VIOLATION after ${steps} steps: ${msg}`)
  if (ctx) console.error(ctx)
  console.error('grid:', JSON.stringify(R.grid))
  console.error('hold:', JSON.stringify(R.hold), 'fuel:', R.fuel, 'credits:', R.credits, 'at:', R.at, 'stage:', R.stage)
  process.exit(1)
}

function invariants(label: string) {
  if (!Number.isFinite(R.credits)) fail(`${label}: credits not finite`)
  if (R.credits < 0 && R.over !== 'bust') fail(`${label}: negative credits without bust (${R.credits})`)
  if (!Number.isFinite(R.fuel) || R.fuel < 0) fail(`${label}: bad fuel ${R.fuel}`)
  if (R.fuel > fuelCap()) fail(`${label}: fuel ${R.fuel} above cap ${fuelCap()}`)
  if (R.grid.length !== TILES) fail(`${label}: grid size ${R.grid.length}`)
  const refs = new Map<string, number>()
  for (const k of [...R.grid, ...R.hold]) {
    if (!k) continue
    if (k[0] === '@') {
      const i = +k.slice(1)
      if (!(i >= 0 && i < R.cargo.length)) fail(`${label}: dangling cargo ref ${k}`)
      refs.set(k, (refs.get(k) || 0) + 1)
      if (refs.get(k)! > 1) fail(`${label}: duplicate cargo ref ${k}`)
      if (!R.cargo[i].aboard) fail(`${label}: ref ${k} but cargo not aboard`)
    } else if (!MOD[k as ModCode]) fail(`${label}: unknown module ${k}`)
  }
  R.cargo.forEach((c, i) => {
    if (c.done && c.aboard) fail(`${label}: cargo ${i} done+aboard`)
    if (c.aboard && !c.taken) fail(`${label}: cargo ${i} aboard but not taken`)
    if (c.aboard && !refs.has('@' + i)) fail(`${label}: cargo ${i} aboard with no ref`)
  })
  const m = massOf(), cap = capacity(), sur = surcharge()
  if (!Number.isFinite(m) || m < 0) fail(`${label}: mass ${m}`)
  if (!Number.isFinite(cap) || cap < 0) fail(`${label}: capacity ${cap}`)
  if (sur < 0) fail(`${label}: surcharge ${sur}`)
  const ev = evaluate(R.grid)
  if (ev.heat.some((h) => !Number.isFinite(h))) fail(`${label}: non-finite heat`)
  const o = orders()
  if (typeof o.t !== 'string' || !o.t.length || typeof o.s !== 'string') fail(`${label}: bad orders`)
  stuckReason() // must not throw
  here().stock.forEach((k) => whyMod(k))
  here().hires.forEach((h) => whyHire(h))
}

function saveRoundtrip() {
  const c: Partial<GameState> = { ...R }
  delete c.D
  delete c.adj
  const okBefore = evaluate(R.grid).ok
  const back = JSON.parse(JSON.stringify(c)) as GameState
  const keep = R
  // hydrate the clone the way App boot does
  setR(back)
  rebuildTransient()
  const okAfter = evaluate(R.grid).ok
  if (okBefore !== okAfter) fail('save roundtrip changed inspection result')
  setR(keep)
}

function policyStep() {
  const n = here()
  const acts: Array<() => void> = []

  if (R.hold.length) {
    const empty: number[] = []
    R.grid.forEach((k, i) => {
      if (!k) empty.push(i)
    })
    if (empty.length) {
      const hi = Math.floor(rng() * R.hold.length)
      acts.push(() => {
        tapHold(hi)
        tapBay(pick(empty))
      })
      acts.push(acts[acts.length - 1]) // stowing weighted double
    }
    acts.push(() => jettison(pick(R.hold)))
  }

  R.cargo.forEach((c, i) => {
    if (!c.taken && !c.done && c.at === R.at && !(c.need && !R.specs.includes(c.need)) && R.grid.includes(null) && rng() < 0.7)
      acts.push(() => accept(i))
  })
  if (n.fuel && R.credits >= n.fuel && R.fuel < fuelCap()) {
    const b = () => buyFuel(1 + Math.floor(rng() * 6))
    acts.push(b, b)
    if (R.fuel < fuelCap() / 2) acts.push(b, b) // top up when running dry
  }
  n.stock.forEach((k) => {
    // buy mostly what the ship actually needs, like a sane player
    const p = whyMod(k).need ? 0.7 : 0.08
    if (R.credits >= MOD[k].price && rng() < p) acts.push(() => buyMod(k))
  })
  n.hires.forEach((id) => {
    if (R.credits >= 26 && rng() < 0.25) acts.push(() => hire(id as HireId))
  })
  if (R.crew.length > 1 && rng() < 0.1) acts.push(() => payOff(Math.floor(rng() * R.crew.length)))
  if (sellRate() > 0 && rng() < 0.15) {
    const thrCount = R.grid.filter((k) => k === 'THR').length
    const bays: number[] = []
    R.grid.forEach((k, i) => {
      // a sane player never pawns below two engines
      if (k && k[0] !== '@' && !(k === 'THR' && thrCount <= 2)) bays.push(i)
    })
    if (bays.length)
      acts.push(() => {
        const i = pick(bays)
        sellMod(R.grid[i] as ModCode, 'bay', i)
      })
  }
  // random swap, and occasionally a smart re-arrangement like a real player
  acts.push(() => {
    const a = Math.floor(rng() * TILES), b = Math.floor(rng() * TILES)
    tapBay(a)
    tapBay(b)
  })
  const deckOK = shipOK()
  if (!R.hold.length && (rng() < 0.25 || !deckOK)) {
    const arrange = () => {
      const bag = R.grid.filter(Boolean) as string[]
      const laid = fits(bag, 30, 120, rng)
      if (laid) R.grid = laid
    }
    acts.push(arrange)
    if (!deckOK) acts.push(arrange, arrange) // failing inspection → try hard to fix
  }
  if (!deckOK) {
    // last resort a real player has: set problem cargo back down
    R.grid.forEach((k) => {
      if (k && k[0] === '@' && rng() < 0.3) acts.push(() => jettison(k))
    })
  }

  if (shipOK()) {
    const affordable = outEdges().filter((e) => R.fuel >= e.cost + surcharge())
    affordable.forEach((e) => acts.push(() => jump(e)))
    // goal-directed travel: head for cargo aboard's drop, else a signable
    // pickup, else the nearest warp — weighted heavily over random walking
    const aboard = R.cargo.find((c) => c.aboard)
    const pickup = R.cargo.find((c) => !c.taken && !c.done && !(c.need && !R.specs.includes(c.need)) && R.grid.includes(null))
    const warpsHere = R.nodes.filter((x) => x.warp).map((x) => x.id)
    const target = aboard ? aboard.to : pickup ? pickup.at : warpsHere.sort((a, b) => R.D![R.at][a] - R.D![R.at][b])[0]
    if (target !== undefined && affordable.length) {
      const best = affordable.reduce((p, e) => (R.D![e.b][target] < R.D![p.b][target] ? e : p))
      const go = () => jump(best)
      acts.push(go, go, go, go)
    }
    if (n.warp && R.fuel >= R.warpCost && rng() < (R.cargo.some((c) => c.aboard) ? 0.15 : 0.7)) acts.push(() => doWarp())
  }

  if (!acts.length) return false
  pick(acts)()
  return true
}

let cleared = 0, busted = 0, called = 0, warps = 0
const stuckWhys: string[] = []
for (let run = 0; run < RUNS; run++) {
  const hull = HULLS[Math.floor(rng() * HULLS.length)]
  genStage(`${SEED}-${run}`, 1, null, hull)
  R.credits = Math.round(320 * hull.credits)
  R.opening = R.credits
  invariants('gen')

  let stage = 1
  outer: while (stage <= 6) {
    let idle = 0
    for (let s = 0; s < 500; s++) {
      steps++
      const acted = policyStep()
      invariants('step')
      if (steps % 97 === 0) saveRoundtrip()
      if (R.over) break
      const why = stuckReason()
      if (!acted || why) {
        idle++
        if (idle > 6) {
          if (why) {
            // a declared lock must be semantically true before we honor it
            const engines = [...R.grid, ...R.hold].filter((k) => k === 'THR').length
            if (why.includes('never clear') && engines >= 2) fail(`false engine lock: ${why}`)
            if (why.includes('No lane you can afford')) {
              const cheapest = Math.min(...outEdges().map((e) => e.cost + surcharge()))
              if (R.fuel >= cheapest) fail(`false fuel lock: ${why}`)
              const nn = here()
              if (nn.fuel > 0 && R.credits >= nn.fuel && fuelCap() > R.fuel) fail(`false fuel lock, fuel buyable: ${why}`)
            }
            stuckWhys.push(why.slice(0, 40))
            callIt()
            called++
          }
          break
        }
      } else idle = 0
    }
    if (R.over === 'clear') {
      warps++
      if (stage < 6 && rng() < 0.8) {
        pressOn()
        invariants('pressOn')
        stage = R.stage
        continue outer
      }
      cleared++
      break
    }
    if (R.over === 'bust') {
      busted++
      break
    }
    break // stalled without a detected lock — run abandoned, still legal
  }
}

console.log(`\n${RUNS} runs, ${steps} actions fuzzed`)
console.log(`stage-clears (warp-outs): ${warps} · retired clean: ${cleared} · busted: ${busted} · CALL IT: ${called}`)
if (stuckWhys.length) {
  const tally = new Map<string, number>()
  stuckWhys.forEach((w) => tally.set(w, (tally.get(w) || 0) + 1))
  ;[...tally].forEach(([w, c]) => console.log(`  stuck: ${c}× ${w}…`))
}
console.log('ALL INVARIANTS HELD')
