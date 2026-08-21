/* E2E winnability test: a competent scripted pilot follows the stage plan the
   generator's solver proved profitable — sign those contracts, keep fuel
   topped, buy what inspection demands, deliver, warp out.
   Run from repo root:  npx tsx web/test/pilot.ts [runs] [stages] [seed]     */
import { genStage } from '../src/engine/gen'
import { R } from '../src/engine/state'
import { HULLS, MOD, STARTER } from '../src/engine/data'
const HULL = (id: string) => HULLS.find((h) => h.id === id)!
import { evaluate, fits, fuelCap, souls, surcharge } from '../src/engine/core'
import {
  accept, buyFuel, buyMod, doWarp, here, hire, jettison, jump, outEdges, payOff, pressOn, sellMod, sellRate, shipOK, tapBay, tapHold
} from '../src/engine/actions'
import type { ModCode } from '../src/engine/types'
import { whyHire, whyMod } from '../src/engine/guidance'
import { mulberry32, seedNum } from '../src/engine/rng'

const RUNS = Number(process.argv[2]) || 15
const STAGES = Number(process.argv[3]) || 3
const SEED = process.argv[4] || 'PILOT'
const rng = mulberry32(seedNum(SEED))

function stowAll(): boolean {
  while (R.hold.length) {
    const empty = R.grid.indexOf(null)
    if (empty >= 0) {
      tapHold(0)
      tapBay(empty)
      continue
    }
    // no bay for it: pawn hold modules at a port, dump them anywhere else —
    // cargo stays; the caller sheds cargo through recover() if needed
    const mod = R.hold.find((k) => k[0] !== '@')
    if (!mod) return false
    if (sellRate() > 0) sellMod(mod as ModCode, 'hold')
    else jettison(mod)
  }
  return true
}

function fixDeck(): boolean {
  if (shipOK()) return true
  const bag = R.grid.filter(Boolean) as string[]
  for (let t = 0; t < 3; t++) {
    const laid = fits(bag, 60, 200, rng)
    if (laid) {
      R.grid = laid
      if (shipOK()) return true
    }
  }
  return shipOK()
}

function shopAndCrew() {
  const n = here()
  // never spend down to nothing: keep enough back to fuel a way out
  const reserve = R.medFuel * 8
  const cntOf = (x: string) => ([...R.grid, ...R.hold].filter(Boolean) as string[]).filter((v) => v === x).length
  n.hires.forEach((id) => {
    const w = whyHire(id)
    if (!w.need || R.credits < 26 + 48 + reserve) return
    // house the new soul first — hiring past bunks/air fails inspection
    while (cntOf('BRT') * 2 < souls() + 1 && n.stock.includes('BRT') && R.credits >= MOD.BRT.price + 80 + reserve && R.grid.includes(null))
      buyMod('BRT')
    while (cntOf('LSP') * 2 < souls() + 1 && n.stock.includes('LSP') && R.credits >= MOD.LSP.price + 80 + reserve && R.grid.includes(null))
      buyMod('LSP')
    if (cntOf('BRT') * 2 >= souls() + 1 && cntOf('LSP') * 2 >= souls() + 1) hire(id)
  })
  const headroom = () => {
    let p = 0
    R.grid.forEach((k) => {
      if (k && k[0] !== '@') p += MOD[k as ModCode].power
    })
    return p
  }
  for (const k of n.stock) {
    let guard = 0
    while (whyMod(k).need > 0 && R.credits >= MOD[k].price + 30 + reserve && R.grid.includes(null) && guard++ < 4) {
      // never buy a power drawer this port cannot also power
      if (MOD[k].power < 0 && headroom() + MOD[k].power < 0 && !(n.stock.includes('BAT') && R.credits >= MOD[k].price + MOD.BAT.price + 30))
        break
      buyMod(k)
    }
  }
  // a tankless hull (tug) must buy range before anything else
  while (fuelCap() < 12 && n.stock.includes('TNK') && R.credits >= MOD.TNK.price + 40 + reserve && R.grid.includes(null)) buyMod('TNK')
}

/** Shed whatever cannot be sustained: batteries for power, surplus crew for
    bunks/air, surplus drawing modules, then cargo — a real player's ladder. */
function recover(plan: Set<number>): boolean {
  if (fixDeck()) return true
  const failing = () => evaluate(R.grid).checks.filter((c) => !c.ok).map((c) => c.lb)
  const n = here()
  // heat: buy cooling if this yard sells it, else shed a hot module
  let guardH = 0
  while (failing().includes('HEAT') && guardH++ < 4) {
    const cool = (['RAD', 'CRY'] as ModCode[]).find(
      (k) => n.stock.includes(k) && R.credits >= MOD[k].price && R.grid.includes(null)
    )
    if (cool) {
      buyMod(cool)
      if (fixDeck()) return true
      continue
    }
    // no cooling for sale: drop a spare reactor, then anything hot
    const rct = R.grid.filter((k) => k === 'RCT').length
    const idx = R.grid.findIndex((k) => (k === 'RCT' && rct > 1) || k === 'LSP')
    if (idx < 0) break
    if (sellRate() > 0) sellMod(R.grid[idx] as ModCode, 'bay', idx)
    else jettison(R.grid[idx]!)
    if (fixDeck()) return true
  }
  while (failing().includes('POWER') && n.stock.includes('BAT') && R.credits >= MOD.BAT.price && R.grid.includes(null)) {
    buyMod('BAT')
    if (fixDeck()) return true
  }
  while (failing().includes('POWER')) {
    // shed a surplus power drawer: third+ engine, cryo, radiator, spare LSP
    const thr = R.grid.filter((k) => k === 'THR').length
    const lsp = R.grid.filter((k) => k === 'LSP').length
    const idx = R.grid.findIndex(
      (k) => (k === 'THR' && thr > 2) || k === 'CRY' || k === 'RAD' || (k === 'LSP' && souls() <= (lsp - 1) * 2)
    )
    if (idx < 0) break
    if (sellRate() > 0) sellMod(R.grid[idx] as ModCode, 'bay', idx)
    else jettison(R.grid[idx]!)
    if (fixDeck()) return true
  }
  let bad = failing()
  while ((bad.includes('BUNKS') || bad.includes('LIFE SUPPORT')) && R.crew.length > 1) {
    const before = R.crew.length
    payOff(R.crew.length - 1)
    if (R.crew.length === before) break // locked to cargo aboard
    if (fixDeck()) return true
    bad = failing()
  }
  const carried = R.grid.find((k) => k && k[0] === '@')
  if (carried) {
    jettison(carried)
    plan.delete(+carried.slice(1))
    return fixDeck()
  }
  return false
}

let clears = 0, attempts = 0
const failures: string[] = []
const perHull: Record<string, { a: number; c: number }> = {}
const perStage: Record<number, { a: number; c: number }> = {}

for (let run = 0; run < RUNS; run++) {
  // every real run starts on the starter hull; testing fresh starts on hulls
  // you can only ever *buy* was measuring a scenario the game does not have
  const hull = STARTER
  genStage(`${SEED}-${run}`, 1, null, hull)
  R.credits = Math.round(320 * hull.credits)
  R.opening = R.credits

  for (let stage = 1; stage <= STAGES && !R.over; stage++) {
    attempts++
    perHull[hull.id] = perHull[hull.id] || { a: 0, c: 0 }
    perHull[hull.id].a++
    perStage[R.stage] = perStage[R.stage] || { a: 0, c: 0 }
    perStage[R.stage].a++
    const stageNow = R.stage
    // fly the full contract set the generator's solver proved profitable
    const plan = new Set(R.best!.set)
    // shed specialists no planned cargo needs — pure wage drag otherwise
    for (let i = R.crew.length - 1; i >= 0; i--) {
      const spec = R.crew[i] !== 'HAND' ? R.crew[i] : null
      if (spec && ![...plan].some((p) => R.cargo[p].need === spec)) payOff(i)
    }
    let done = false
    const DBG = process.env.PILOT_DEBUG !== undefined && Number(process.env.PILOT_DEBUG) === run
    for (let step = 0; step < 300 && !done; step++) {
      const n = here()
      if (DBG)
        console.log(
          `step ${step}: at=${R.at} fuel=${R.fuel}/${fuelCap()} cr=${R.credits} hold=${R.hold.length} aboard=${R.cargo.filter((c) => c.aboard).length} ok=${shipOK()}`
        )
      shopAndCrew()
      // sign planned contracts waiting here
      R.cargo.forEach((c, i) => {
        if (plan.has(i) && !c.taken && !c.done && c.at === R.at && R.grid.includes(null)) {
          accept(i)
          if (!stowAll()) jettison('@' + i)
          fixDeck()
        }
      })
      if (!stowAll() || !recover(plan)) {
        failures.push(`run ${run} stage ${R.stage}: deck unfixable — ${evaluate(R.grid).checks.filter((c) => !c.ok).map((c) => c.lb).join(',')}`)
        break
      }
      // pick a destination: the nearest planned point of work — a pickup we
      // have room for, or the drop of something aboard — then warp
      const pickups = R.cargo.filter((c, i) => plan.has(i) && !c.taken && !c.done)
      const aboard = R.cargo.filter((c) => c.aboard)
      const points: number[] = []
      if (R.grid.includes(null)) points.push(...pickups.map((c) => c.at))
      points.push(...aboard.map((c) => c.to))
      const pickup = pickups.length ? pickups.sort((a, b) => R.D![R.at][a.at] - R.D![R.at][b.at])[0] : undefined
      // fuel logistics AFTER shopping/hiring, so fresh tanks can be filled:
      // buy range toward the planned journey, then fuel to demand
      if (n.fuel) {
        const legs =
          (pickup ? R.D![R.at][pickup.at] + R.D![pickup.at][pickup.to] : aboard.length ? R.D![R.at][aboard[0].to] : 0) +
          R.warpCost + 8
        while (fuelCap() < Math.min(legs, 24) && n.stock.includes('TNK') && R.credits >= MOD.TNK.price + 40 + R.medFuel * 6 && R.grid.includes(null))
          buyMod('TNK')
        if (R.fuel < Math.min(legs, fuelCap())) buyFuel(legs - R.fuel)
      }
      const warpIds = R.nodes.filter((x) => x.warp).map((x) => x.id)
      let target = points.length
        ? points.sort((a, b) => R.D![R.at][a] - R.D![R.at][b])[0]
        : warpIds.sort((a, b) => R.D![R.at][a] - R.D![R.at][b])[0]
      if (R.fuel < 8 && !n.fuel && R.credits >= 10) {
        const pump = R.nodes.filter((x) => x.fuel > 0 && x.id !== R.at).sort((a, b) => R.D![R.at][a.id] - R.D![R.at][b.id])[0]
        if (pump && R.D![R.at][pump.id] <= R.fuel) target = pump.id
      }

      if (n.warp && target === undefined) {
        doWarp()
        done = true
        break
      }
      if (n.warp && !pickup && !aboard.length) {
        doWarp()
        done = true
        break
      }
      if (target === R.at) continue // arrival hooks already ran
      const affordable = outEdges().filter((e) => R.fuel >= e.cost + surcharge())
      if (!affordable.length) {
        failures.push(`run ${run} stage ${R.stage}: stranded, fuel ${R.fuel}, credits ${R.credits}`)
        break
      }
      // never jump beyond fuel range: the landing node must sell fuel, or
      // leave enough in the tank to reach some pump from there
      const pumps = R.nodes.filter((x) => x.fuel > 0)
      const safe = affordable.filter((e) => {
        if (R.nodes[e.b].fuel > 0) return true
        const left = R.fuel - (e.cost + surcharge())
        return pumps.some((x) => R.D![e.b][x.id] <= left)
      })
      // no safe hop: never out-jump the tanks — retreat toward fuel instead
      const pool = safe.length ? safe : affordable
      const best = safe.length
        ? pool.reduce((p, e) => (R.D![e.b][target] < R.D![p.b][target] ? e : p))
        : pool.reduce((p, e) => {
            const margin = (x: typeof e) =>
              R.fuel - (x.cost + surcharge()) - Math.min(...pumps.map((pp) => R.D![x.b][pp.id]))
            return margin(e) > margin(p) ? e : p
          })
      // if heading somewhere is pointless (no fuel to ever warp), bail to warp
      jump(best)
    }
    if (R.over === 'clear') {
      clears++
      perHull[hull.id].c++
      perStage[stageNow].c++
      if (stage < STAGES) pressOn()
    } else if (!R.over) {
      break
    }
  }
}

console.log(`pilot: ${clears}/${attempts} stage attempts cleared (${RUNS} runs × up to ${STAGES} stages)`)
Object.entries(perHull).forEach(([id, v]) =>
  console.log(`  hull ${id.padEnd(10)} ${v.c}/${v.a} (${Math.round((v.c / v.a) * 100)}%)`))
Object.entries(perStage).forEach(([st, v]) =>
  console.log(`  stage ${st}      ${v.c}/${v.a} (${Math.round((v.c / v.a) * 100)}%)`))
failures.slice(0, 8).forEach((f) => console.log('  ' + f))
if (clears / attempts < 0.7) {
  console.log('WINNABILITY BELOW THRESHOLD')
  process.exit(1)
}
console.log('WINNABLE BY COMPETENT PLAY')
