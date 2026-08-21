import { HIRES, KINDS, MOD, NB, TILES, bayName } from './data'
import { R } from './state'
import type { Cell, Check, EvalResult, ModCode, ModView } from './types'

export function modOf(k: Cell): ModView | null {
  if (!k) return null
  if (k[0] === '@') {
    const c = R.cargo[+k.slice(1)]
    return { code: k, icon: 'CARGO', name: c.name, short: c.short, tok: ['cargo'], power: 0, heat: 0, cargo: c }
  }
  return MOD[k as ModCode]
}

export function cnt(k: string): number {
  return R.grid.filter((v) => v === k).length
}

/** Cells this hull does not have. Nothing may be stowed there. */
export function blocked(i: number): boolean {
  return R.hull.blocked?.includes(i) ?? false
}

/** How many bays this hull actually has. */
export function bays(): number {
  return TILES - (R.hull.blocked?.length ?? 0)
}

/** Fuel for one lane on this hull, before the overmass surcharge. */
export function laneFuel(base: number): number {
  return Math.max(1, Math.round(base * (R.hull.fuelMult ?? 1)))
}

/** Total fuel for one lane, including overmass. */
export function laneCost(base: number): number {
  return laneFuel(base) + surcharge()
}

/** How much a hot module still pushes out after its own shielding. Every
    shielded face boxes the source in a little more, so shielding manages heat
    at the source — where cooling instead pulls heat out of a bay. */
function effectiveSpill(g: Cell[], j: number): number {
  const m = modOf(g[j])
  if (!m?.spill) return 0
  const shielded = NB[j].filter((x) => g[x] === 'SHD').length
  return Math.max(0, m.spill - shielded)
}

export function heatField(g: Cell[]): number[] {
  const h = new Array(TILES).fill(0)
  const ambient = R.ambient || 0
  for (let i = 0; i < TILES; i++) {
    let v = ambient
    const m = modOf(g[i])
    if (m) v += m.heat
    // a shielded bay takes nothing itself, and what other bays receive is
    // already reduced by whatever shielding boxes the source in
    if (g[i] !== 'SHD') for (const j of NB[i]) v += effectiveSpill(g, j)
    for (const j of NB[i]) {
      const n = modOf(g[j])
      if (n && n.cool) v -= n.cool
    }
    h[i] = v
  }
  return h
}

export function fuelCap(g?: Cell[]): number {
  let c = 0
  for (const k of g || R.grid) if (k === 'TNK') c += MOD.TNK.fuel!
  return c
}

export function tenders(): number {
  let n = 0
  R.cargo.forEach((c) => {
    if (c.aboard) n += c.crew ? (R.specs.includes('VET') ? 1 : 2) : 0
  })
  return n
}

export function souls(): number {
  return R.crew.length + tenders()
}

export function deckCrew(): number {
  return R.crew.filter((c) => HIRES[c].deck).length + tenders()
}

/** Weight of one cell/hold item. Thrusters weigh nothing — thrust cancels
    their own mass; each engine is a clean +4 capacity. */
function itemWeight(k: Cell): number {
  if (!k) return 0
  if (k[0] === '@') return KINDS[R.cargo[+k.slice(1)].kind].weight
  if (k === 'THR') return 0
  return 1
}

/** Current ship mass. Counts the deck AND the hold, so the gauge and lane
    surcharges reflect what you actually carry, not just what's stowed. */
export function massOf(): number {
  let m = 0
  for (const k of R.grid) m += itemWeight(k)
  for (const k of R.hold) m += itemWeight(k)
  return m
}

export function capacity(): number {
  return Math.min(R.hull.base + 4 * R.grid.filter((k) => k === 'THR').length, 4 * deckCrew())
}

export function surcharge(): number {
  return Math.ceil(Math.max(0, massOf() - capacity()) / 2)
}

export interface Coverage {
  hands: number
  capM: number
  /** bay index → true when a hand runs it (or it needs none) */
  active: Record<number, boolean>
  idle: number[]
}

/** Which stowed bays the deck crew can actually run. Each hand runs 4 mass;
    coverage fills in bay order from A1, so the tail of the deck goes idle
    first. Zero-mass items (thrusters) always read active — they need no hand.
    Loose hold items are charged first: they are the crew's problem too. */
export function coverage(): Coverage {
  const hands = deckCrew(),
    capM = 4 * hands
  const active: Record<number, boolean> = {}
  const idle: number[] = []
  let acc = R.hold.reduce((a, k) => a + itemWeight(k), 0)
  R.grid.forEach((k, i) => {
    if (!k) return
    const w = itemWeight(k)
    if (!w) {
      active[i] = true
      return
    }
    if (hands && acc + w <= capM) {
      active[i] = true
      acc += w
    } else {
      active[i] = false
      idle.push(i)
    }
  })
  return { hands, capM, active, idle }
}

/** Made vs drawn across the deck — feeds the HUD power meter. */
export function powerBalance(): { prod: number; draw: number } {
  let prod = 0,
    draw = 0
  for (const k of R.grid) {
    const m = modOf(k)
    if (!m) continue
    if (m.power > 0) prod += m.power
    else draw += -m.power
  }
  return { prod, draw }
}

export function evaluate(g: Cell[]): EvalResult {
  const heat = heatField(g),
    chk: Check[] = [],
    HEATCAP = R.hull.heatCap ?? 5
  const at = (k: string) => {
    const o: number[] = []
    for (let i = 0; i < TILES; i++) if (g[i] === k) o.push(i)
    return o
  }
  const push = (lb: string, ok: boolean, dt: string, f?: number[], pos = false) => chk.push({ lb, ok, dt, focus: f || [], pos })

  push(
    'ALL STOWED',
    R.hold.length === 0,
    R.hold.length ? `${R.hold.length} item${R.hold.length > 1 ? 's' : ''} loose in the hold.` : 'Nothing loose in the hold.'
  )

  let prod = 0,
    draw = 0
  for (let i = 0; i < TILES; i++) {
    const m = modOf(g[i])
    if (!m) continue
    if (m.power > 0) prod += m.power
    else draw += -m.power
  }
  push('POWER', prod >= draw, prod >= draw ? `${prod} made, ${draw} drawn.` : `Short ${draw - prod} power.`)

  const hot: number[] = []
  for (let i = 0; i < TILES; i++) if (g[i] && heat[i] > HEATCAP) hot.push(i)
  push(
    'HEAT',
    hot.length === 0,
    hot.length === 0
      ? `No bay above ${HEATCAP}.`
      : hot.map((i) => `${modOf(g[i])!.name} at ${bayName(i)} reads ${heat[i]}`).join('. ') + '.',
    hot,
    true
  )

  const thr = at('THR').length
  push('THRUST', thr >= 2, thr >= 2 ? `${thr} engines fitted.` : `${thr} of 2 engines. You cannot move.`, at('THR'))

  const s = souls()
  const bc = at('BRT').length * 2
  push('BUNKS', bc >= s, bc >= s ? `${bc} bunks for ${s}.` : `${bc} bunks, ${s - bc} with nowhere to sleep.`, at('BRT'))
  const ac = at('LSP').length * 2
  push('LIFE SUPPORT', ac >= s, ac >= s ? `Air for ${ac}, ${s} aboard.` : `Air for ${ac}. ${s - ac} short.`, at('LSP'))

  const fc = fuelCap(g)
  push('FUEL TANKS', fc >= R.fuel, fc >= R.fuel ? `${R.fuel} of ${fc} held.` : `${R.fuel - fc} fuel would be vented.`, at('TNK'))

  R.cargo.forEach((c, n) => {
    if (!c.aboard) return
    const i = g.indexOf('@' + n)
    if (i < 0) {
      push(c.short, false, 'Not in a bay.', [], true)
      return
    }
    const nb = NB[i]
    if (c.kind === 'volatile') {
      // shielding contains, and so does the hull itself — a blocked cell is wall
      const bare = nb.filter((j) => g[j] !== 'SHD' && !blocked(j))
      const allow = R.specs.includes('HAZMAT') ? 1 : 0
      push(
        c.short,
        bare.length <= allow,
        bare.length <= allow
          ? allow && bare.length
            ? `Contained, one face open under your handler.`
            : `Contained on all ${nb.length} faces.`
          : `${bare.length - allow} bay${bare.length - allow > 1 ? 's' : ''} touching it hold no shielding.`,
        [i].concat(bare),
        true
      )
    } else if (c.kind === 'cold') {
      const cry = nb.some((j) => g[j] === 'CRY'),
        ok = cry && heat[i] <= 0
      push(c.short, ok, ok ? `Holding at ${heat[i]}.` : !cry ? 'No cryo unit alongside.' : `Bay reads ${heat[i]}, needs 0 or lower.`, [i].concat(nb), true)
    } else if (c.kind === 'living') {
      const ok = nb.some((j) => g[j] === 'LSP')
      push(c.short, ok, ok ? 'Air reaches the pens.' : 'No life support alongside.', [i].concat(nb), true)
    } else if (c.kind === 'unbraced') {
      const clear = nb.filter((j) => !g[j]).length + (4 - nb.length)
      push(c.short, clear >= 2, clear >= 2 ? `${clear} clear faces bracing it.` : `Only ${clear} clear face. Needs 2.`, [i].concat(nb), true)
    } else {
      const bad = nb.filter((j) => g[j] === 'RCT' || g[j] === 'THR')
      push(
        c.short,
        bad.length === 0,
        bad.length === 0 ? 'Nothing vibrating alongside.' : `${bad.map((j) => modOf(g[j])!.name).join(', ')} touching it.`,
        [i].concat(bad),
        true
      )
    }
  })
  return { checks: chk, ok: chk.every((c) => c.ok), heat }
}

/* ---- can a given set of parts physically be arranged? ---- */
/* Only checks a re-arrangement can fix count against a layout — fleet-wide
   shortfalls (engine count, power, bunks) are the same in every arrangement,
   and counting them locked the annealer into an unreachable zero. */
function scoreLayout(g: Cell[]): number {
  return evaluate(g).checks.filter((c) => c.pos && !c.ok).length
}

export function fits(bag: string[], restarts?: number, steps?: number, rng?: () => number): Cell[] | null {
  const rand = rng || Math.random
  restarts = restarts || 70
  steps = steps || 260
  const open = [...Array(TILES).keys()].filter((i) => !blocked(i))
  if (bag.length > open.length) return null
  const keepHold = R.hold,
    keepGrid = R.grid
  R.hold = []
  const idx = open.slice()
  let out: Cell[] | null = null
  for (let t = 0; t < restarts && !out; t++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    const g: Cell[] = new Array(TILES).fill(null)
    bag.forEach((k, n) => {
      g[idx[n]] = k
    })
    R.grid = g
    let s = scoreLayout(g)
    if (s === 0) {
      out = g.slice()
      break
    }
    for (let q = 0; q < steps; q++) {
      const a = idx[Math.floor(rand() * idx.length)],
        b = idx[Math.floor(rand() * idx.length)]
      if (a === b || (!g[a] && !g[b])) continue
      const tm = g[a]
      g[a] = g[b]
      g[b] = tm
      const ns = scoreLayout(g)
      if (ns <= s) {
        s = ns
        if (s === 0) {
          out = g.slice()
          break
        }
      } else {
        g[b] = g[a]
        g[a] = tm
      }
    }
  }
  R.hold = keepHold
  R.grid = keepGrid
  return out
}
