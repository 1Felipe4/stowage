import { HIRES, KINDS, MOD } from './data'
import { bays, modOf } from './core'
import { R } from './state'
import type { BestPlan } from './types'

/* ================= the solver =================
   One Held-Karp pass over every pickup/drop point covers all contract
   subsets at once. For each subset it returns the cheapest precedence-
   respecting route that ends at a warp point, and the profit that yields. */
export function solveStage(): BestPlan {
  const C = R.cargo,
    n = C.length
  const pts: { t: 'p' | 'd'; node: number; c: number }[] = []
  C.forEach((c, i) => {
    pts.push({ t: 'p', node: c.at, c: i })
    pts.push({ t: 'd', node: c.to, c: i })
  })
  const m = pts.length,
    FULL = 1 << m
  const D = R.D!
  const INF = 1e9
  const dp = new Float64Array(FULL * m).fill(INF)
  for (let i = 0; i < m; i++) if (pts[i].t === 'p') dp[(1 << i) * m + i] = D[R.at][pts[i].node]
  for (let mask = 1; mask < FULL; mask++) {
    for (let last = 0; last < m; last++) {
      const cur = dp[mask * m + last]
      if (cur >= INF) continue
      for (let nx = 0; nx < m; nx++) {
        if ((mask >> nx) & 1) continue
        if (pts[nx].t === 'd' && !((mask >> (2 * pts[nx].c)) & 1)) continue // pickup first
        const nm = mask | (1 << nx),
          v = cur + D[pts[last].node][pts[nx].node]
        if (v < dp[nm * m + nx]) dp[nm * m + nx] = v
      }
    }
  }
  const warps = R.nodes.filter((x) => x.warp).map((x) => x.id)
  const toWarp = (node: number) => Math.min(...warps.map((w) => D[node][w]))
  let best: BestPlan = { profit: -1e9, set: [], fuel: 0 }
  for (let mask = 0; mask < FULL; mask++) {
    // a subset is valid only when each contract is wholly in or wholly out
    let ok = true
    const set: number[] = []
    for (let i = 0; i < n; i++) {
      const p = (mask >> (2 * i)) & 1,
        d = (mask >> (2 * i + 1)) & 1
      if (p !== d) {
        ok = false
        break
      }
      if (p) set.push(i)
    }
    if (!ok) continue
    let route: number
    if (mask === 0) route = toWarp(R.at)
    else {
      route = INF
      for (let last = 0; last < m; last++) {
        const v = dp[mask * m + last]
        if (v < INF) route = Math.min(route, v + toWarp(pts[last].node))
      }
    }
    if (route >= INF) continue
    const p = planCost(set, route)
    // a plan that cannot physically fit this hull is not a plan. Small hulls
    // therefore get offered smaller runs rather than impossible ones.
    if (p.bays > bays()) continue
    if (p.profit > best.profit) best = { profit: p.profit, set, fuel: p.fuel, spend: p.spend, revenue: p.revenue }
  }
  return best
}

export function planCost(set: number[], route: number) {
  const picked = set.map((i) => R.cargo[i])
  let bays = R.grid.filter(Boolean).length,
    crew = R.crew.length,
    extraPower = 0,
    buy = 0
  const have: Record<string, number> = {}
  R.grid.forEach((k) => {
    if (k) have[k] = (have[k] || 0) + 1
  })
  let shields = 0,
    cryo = 0
  const missingSpecs = new Set<string>()
  picked.forEach((c) => {
    bays += KINDS[c.kind].weight
    if (c.kind === 'volatile') shields += Math.max(0, 2 - (R.specs.includes('HAZMAT') ? 1 : 0))
    if (c.kind === 'cold') {
      cryo = Math.max(cryo, 1)
      extraPower += 3
    }
    if (c.kind === 'living') crew += R.specs.includes('VET') ? 1 : 2
    if (c.need && !R.specs.includes(c.need)) missingSpecs.add(c.need)
  })
  // specialists this plan still has to sign: their fee, their wages, and the
  // detour to the home-port hiring hall when we are not already there
  missingSpecs.forEach((sp) => {
    buy += HIRES[sp as 'VET' | 'HAZMAT'].price
    crew += 1
  })
  const detour = missingSpecs.size && R.at !== 0 ? R.D![R.at][0] : 0
  const needSh = Math.max(0, shields - (have.SHD || 0)),
    needCr = Math.max(0, cryo - (have.CRY || 0))
  buy += needSh * MOD.SHD.price + needCr * MOD.CRY.price
  bays += needSh + needCr
  // hires to work the deck, then bunks and air for everyone
  const hands = R.crew.filter((c) => HIRES[c].deck).length
  const needHands = Math.max(0, Math.ceil(bays / 4) - hands)
  buy += needHands * HIRES.HAND.price
  crew += needHands
  const pairs = Math.ceil(crew / 2)
  const needB = Math.max(0, pairs - (have.BRT || 0)),
    needL = Math.max(0, pairs - (have.LSP || 0))
  buy += needB * MOD.BRT.price + needL * MOD.LSP.price
  bays += needB + needL
  extraPower += needL
  // power to cover the new draw
  let prod = 0,
    draw = 0
  R.grid.forEach((k) => {
    const mm = modOf(k)
    if (!mm) return
    if (mm.power > 0) prod += mm.power
    else draw += -mm.power
  })
  const shortfall = Math.max(0, draw + extraPower - prod)
  const batts = Math.ceil(shortfall / 2)
  buy += batts * MOD.BAT.price
  bays += batts
  // fuel, including the overweight tax on every lane
  // (thrusters occupy bays but weigh nothing, so mass = bays minus engines)
  const cap = Math.min(R.hull.base + 4 * (have.THR || 0), 4 * (hands + needHands))
  const mass = bays - (have.THR || 0)
  const over = Math.ceil(Math.max(0, mass - cap) / 2)
  const lanes = Math.max(1, Math.round(route / 3))
  const fuel = route + detour + over * lanes + R.warpCost
  const price = R.medFuel
  const revenue = picked.reduce((a, c) => a + c.fee, 0)
  const wages = crew * R.wage
  const spend = fuel * price + buy + wages
  return { profit: revenue - spend, fuel, spend, revenue, bays, crew }
}

export function floorProfit(): number {
  // stage 1 guarantees real slack for a new hauler's mistakes;
  // later stages keep the original tight margin
  const stage = R ? R.stage : 1
  return stage === 1 ? 80 : 40 + 6 * stage
}
