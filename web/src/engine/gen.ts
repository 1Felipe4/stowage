import { HIRES, KINDS, MOD, TILES } from './data'
import { fits, fuelCap } from './core'
import { buildAdj, dijkstra } from './map'
import { mulberry32, seedNum } from './rng'
import { CLIENTS, GOODS, pick } from './flavour'
import { floorProfit, solveStage } from './solver'
import { R, setR } from './state'
import type { Cargo, Cell, Edge, GameState, Hull, KindId, ModCode, NodeT, Spec } from './types'

export interface Carry {
  grid: Cell[]
  crew: GameState['crew']
  specs: Spec[]
  fuel: number
  credits: number
  cleared: number
  hull: Hull
  delivered: number
}

export function genStage(seed: string, stage: number, carry: Carry | null, startHull?: Hull, depth = 0): GameState {
  const rng = mulberry32(seedNum(seed))
  // a bloated carry (packed deck, heavy wage bill) can make the profit floor
  // and the arrangement proof unsatisfiable for EVERY map — after enough
  // reseeds, hand out a best-effort stage instead of recursing forever
  const lastResort = depth >= 3
  for (let attempt = 0; attempt < 40; attempt++) {
    const ROWS = 8,
      rows: NodeT[][] = [],
      nodes: NodeT[] = []
    let id = 0
    for (let r = 0; r < ROWS; r++) {
      const c = r === 0 ? 1 : 2 + Math.floor(rng() * 2),
        row: NodeT[] = []
      for (let i = 0; i < c; i++) {
        nodes.push({ id: id++, r, c: i, n: c, fuel: 0, port: false, warp: false, stock: [], hires: [] })
        row.push(nodes[nodes.length - 1])
      }
      rows.push(row)
    }
    const edges: Edge[] = []
    const link = (a: number, b: number, cost: number) => edges.push({ a, b, cost })
    for (let r = 0; r < ROWS - 1; r++) {
      const a = rows[r],
        b = rows[r + 1]
      a.forEach((nd, i) => {
        const t = Math.min(b.length - 1, Math.round((i * (b.length - 1)) / Math.max(1, a.length - 1) || 0))
        const set = new Set([t])
        if (rng() < 0.6) set.add(Math.max(0, Math.min(b.length - 1, t + (rng() < 0.5 ? -1 : 1))))
        set.forEach((j) => link(nd.id, b[j].id, 2 + Math.floor(rng() * 3)))
      })
      b.forEach((nd) => {
        if (!edges.some((e) => e.b === nd.id || e.a === nd.id)) link(a[Math.floor(rng() * a.length)].id, nd.id, 3)
      })
    }
    rows.forEach((row) => {
      if (row.length > 1 && rng() < 0.5) {
        const i = Math.floor(rng() * (row.length - 1))
        link(row[i].id, row[i + 1].id, 2 + Math.floor(rng() * 2))
      }
    })

    nodes.forEach((nd) => {
      if (nd.r === 0) {
        // stage 1 sells cheap fuel at the home port — the opening is forgiving,
        // the clock tightens from stage 2 on
        nd.fuel = stage === 1 ? 3 : 4
        nd.port = true
        nd.rate = 0.5 + rng() * 0.15
        return
      }
      if (rng() < 0.55) nd.fuel = 3 + Math.floor(rng() * 4)
      if (rng() < 0.45) {
        nd.port = true
        nd.rate = 0.45 + rng() * 0.25
      }
    })
    // warp points: one shallow, one deep, sometimes more
    const warpRows = [2 + Math.floor(rng() * 2), 5 + Math.floor(rng() * 2)]
    if (rng() < 0.5) warpRows.push(3 + Math.floor(rng() * 3))
    warpRows.forEach((r) => {
      const row = rows[Math.min(ROWS - 1, r)]
      const nd = row[Math.floor(rng() * row.length)]
      nd.warp = true
      if (!nd.fuel) nd.fuel = 4 + Math.floor(rng() * 3)
    })
    if (!nodes.some((nd) => nd.warp)) rows[ROWS - 1][0].warp = true

    const nC = Math.min(5, 3 + Math.floor((stage - 1) / 2))
    const kinds = Object.keys(KINDS) as KindId[]
    const names = ['CRATE A', 'CRATE B', 'CRATE C', 'CRATE D', 'CRATE E']
    const cargo: Cargo[] = []
    const usedClients = new Set<string>()
    for (let i = 0; i < nC; i++) {
      const k = KINDS[kinds[Math.floor(rng() * kinds.length)]]
      const p = 1 + Math.floor(rng() * (nodes.length - 1))
      let d = 1 + Math.floor(rng() * (nodes.length - 1))
      while (d === p) d = 1 + Math.floor(rng() * (nodes.length - 1))
      // flavour: what it holds and who is paying. Two contracts on one board
      // never share a consignor, so the manifest reads like real trade.
      let client = pick(CLIENTS, rng)
      for (let t = 0; t < 8 && usedClients.has(client); t++) client = pick(CLIENTS, rng)
      usedClients.add(client)
      cargo.push({
        i, kind: k.id, name: k.name, goods: pick(GOODS[k.id], rng), client,
        short: names[i], rule: k.rule, need: k.need || null,
        support: k.support, crew: k.crew, at: p, to: d, taken: false, aboard: false, done: false, fee: 0
      })
    }

    // carried grids never keep cargo cells — undelivered freight was
    // forfeited at the warp, so '@n' refs must not leak into a new stage
    const grid: Cell[] = carry ? carry.grid.map((k) => (k && k[0] === '@' ? null : k)) : new Array(TILES).fill(null)
    const hull = carry ? carry.hull : startHull!

    setR({
      seed, stage, cleared: carry ? carry.cleared : 0, hull, nodes, edges, rowCount: rows.length, cargo, grid, hold: [],
      crew: carry ? carry.crew.slice() : hull.crew.slice(),
      specs: carry ? carry.specs.slice() : (hull.crew.filter((c) => HIRES[c].spec).map((c) => HIRES[c].spec) as Spec[]),
      fuel: 0, credits: carry ? carry.credits : 0, at: 0, visited: [0], log: [], over: null, event: null,
      accepted: [], opening: 0, revenue: 0, spend: 0,
      wage: 16 + 2 * (stage - 1), warpCost: 4 + (stage - 1), margin: 55, medFuel: 5,
      delivered: carry ? carry.delivered : 0,
      // deep space runs hot: every second stage adds a degree to every bay,
      // so a deck that cleared inspection last stage may not clear this one.
      // Capped at 3: beyond that even a well-cooled reactor cannot be placed.
      ambient: Math.min(3, Math.floor((stage - 1) / 2))
    })
    if (!carry) {
      // lay the starting hull out properly. A fresh start this deep needs
      // cooling in the kit or a bare reactor cannot be placed at all.
      R.grid = new Array(TILES).fill(null)
      const kit = hull.mods.slice()
      if (R.ambient > 0) for (let i = 0; i < hull.mods.filter((k) => k === 'RCT').length; i++) kit.push('RAD')
      const laid = fits(kit, 120, 320, rng)
      if (!laid) continue
      R.grid = laid
    }
    R.fuel = Math.min(carry ? carry.fuel : 14, fuelCap())
    buildAdj()
    R.D = R.nodes.map((_, i) => dijkstra(i))
    const fuels = R.nodes
      .filter((nd) => nd.fuel)
      .map((nd) => nd.fuel)
      .sort((a, b) => a - b)
    R.medFuel = fuels.length ? fuels[fuels.length >> 1] : 5
    if (!R.nodes.some((nd) => nd.warp)) continue

    // stock the ports, guaranteeing the parts this stage's work demands
    const musts = new Set<ModCode>(['BRT', 'LSP', 'TNK', 'BAT'])
    cargo.forEach((c) => {
      if (c.support) musts.add(c.support)
    })
    // once ambient heat is on, cooling must be buyable or a hot deck is a
    // soft-lock: a reactor alone reads 3 + ambient and cannot be re-arranged out
    if (R.ambient > 0) musts.add('RAD')
    const ports = R.nodes.filter((nd) => nd.port)
    if (!ports.length) continue
    ports[0].stock = [...musts, 'RCT', 'THR']
    ports[0].hires = ['HAND']
    if (!ports[0].rate) ports[0].rate = 0.55
    cargo.forEach((c) => {
      if (c.need && !ports[0].hires.includes(c.need)) ports[0].hires.push(c.need)
    })
    const keys = Object.keys(MOD) as ModCode[]
    ports.slice(1).forEach((nd) => {
      const st = new Set<ModCode>()
      for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) st.add(keys[Math.floor(rng() * keys.length)])
      nd.stock = [...st]
      nd.hires = rng() < 0.5 ? ['HAND'] : []
      if (rng() < 0.35) {
        const extra = cargo.find((c) => c.need)
        if (extra && extra.need && !nd.hires.includes(extra.need)) nd.hires.push(extra.need)
      }
    })

    // freight pricing, then the repair loop
    const priceAll = () =>
      R.cargo.forEach((c) => {
        c.fee = Math.round((12 * R.D![c.at][c.to] + R.margin + 6 * stage) * KINDS[c.kind].pay)
      })
    priceAll()
    let best = solveStage(),
      repairs = 0
    while (best.profit < floorProfit() && repairs < 10) {
      R.margin += 8
      priceAll()
      best = solveStage()
      repairs++
    }
    if (best.profit < floorProfit() && !lastResort) continue

    // and prove the winning subset can actually be arranged on the deck
    const bag = R.grid.filter(Boolean).slice() as string[]
    best.set.forEach((i) => bag.push('@' + i))
    R.cargo.forEach((c) => (c.aboard = false))
    best.set.forEach((i) => {
      R.cargo[i].aboard = true
    })
    const feasible = bag.length <= TILES && !!fits(bag, 60, 240, rng)
    R.cargo.forEach((c) => (c.aboard = false))
    if (!feasible && !lastResort) continue

    R.opening = R.credits
    R.best = best
    R.repairs = repairs
    return R
  }
  return genStage(seed + 'X', stage, carry, startHull, depth + 1)
}
