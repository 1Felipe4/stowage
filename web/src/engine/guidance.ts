import { HIRES, MOD } from './data'
import { capacity, deckCrew, evaluate, fuelCap, heatField, massOf, modOf, souls, surcharge } from './core'
import { coord, here } from './actions'
import { R } from './state'
import type { HireId, ModCode } from './types'

export interface Why {
  need: number
  s: string
}

export function whyMod(k: ModCode): Why {
  const owned = [...(R.grid.filter(Boolean) as string[]), ...R.hold],
    c = (x: string) => owned.filter((v) => v === x).length,
    s = souls()
  if (k === 'BRT') {
    const d = Math.ceil((s - c('BRT') * 2) / 2)
    return d > 0 ? { need: d, s: `${s - c('BRT') * 2} with nowhere to sleep` } : { need: 0, s: 'spare bunks' }
  }
  if (k === 'LSP') {
    const d = Math.ceil((s - c('LSP') * 2) / 2)
    return d > 0 ? { need: d, s: `${s - c('LSP') * 2} without air` } : { need: 0, s: 'spare air' }
  }
  if (k === 'THR') {
    const d = 2 - c('THR')
    if (d > 0) return { need: d, s: 'you cannot move without two' }
    const over = massOf() - capacity()
    return over > 0 ? { need: 1, s: `overweight by ${over} — an engine lifts 4 more` } : { need: 0, s: 'spare capacity' }
  }
  if (k === 'TNK') {
    const held = c('TNK') * MOD.TNK.fuel!
    return { need: R.fuel >= held ? 1 : 0, s: `+6 range, and a bay of mass (you hold ${held})` }
  }
  if (k === 'SHD') {
    const v = R.cargo.filter((x) => x.aboard && x.kind === 'volatile').length
    return v ? { need: Math.max(0, 2 * v - c('SHD')), s: 'volatile cargo must be walled in' } : { need: 0, s: 'blocks reactor heat spill' }
  }
  if (k === 'CRY' && R.cargo.some((x) => x.aboard && x.kind === 'cold') && c('CRY') < 1)
    return { need: 1, s: 'cold chain spoils without one' }
  if (k === 'RAD' || k === 'CRY') {
    // cooling counts as needed while any bay is over the line, or sitting on it
    // with ambient heat still to come
    const heat = heatField(R.grid)
    const hot = R.grid.filter((v, i) => !!v && heat[i] > 5).length
    const atCap = R.grid.filter((v, i) => !!v && heat[i] === 5).length
    if (hot) return { need: Math.max(1, Math.ceil(hot / 2)), s: `${hot} bay${hot > 1 ? 's' : ''} over the heat line` }
    if (atCap && k === 'RAD') return { need: 1, s: `${atCap} bay${atCap > 1 ? 's' : ''} sitting on the heat line` }
    return { need: 0, s: k === 'RAD' ? 'pulls 3 heat from touching bays' : 'cooling, at 3 power' }
  }
  let prod = 0,
    draw = 0
  owned.forEach((v) => {
    const m = modOf(v)
    if (!m) return
    if (m.power > 0) prod += m.power
    else draw += -m.power
  })
  return prod < draw ? { need: Math.ceil((draw - prod) / 2), s: `${draw - prod} power short` } : { need: 0, s: `${prod - draw} power spare` }
}

/** Warn when signing one more soul would outrun the bunks or air aboard —
    hiring into that state fails inspection on the spot. */
function hireStrain(): string {
  const owned = [...(R.grid.filter(Boolean) as string[]), ...R.hold]
  const c = (x: string) => owned.filter((v) => v === x).length
  const s = souls() + 1
  const short: string[] = []
  if (c('BRT') * 2 < s) short.push('bunks')
  if (c('LSP') * 2 < s) short.push('air')
  return short.length ? ` — no spare ${short.join(' or ')}: the deck fails until you fit more` : ''
}

export function whyHire(id: HireId): Why {
  if (id === 'HAND') {
    const gap = Math.ceil(massOf() / 4) - deckCrew()
    return gap > 0
      ? { need: gap, s: `the deck needs ${Math.ceil(massOf() / 4)} hands to run, you have ${deckCrew()}${hireStrain()}` }
      : { need: 0, s: `another body, another bunk${hireStrain()}` }
  }
  const c = R.cargo.find((x) => x.need === HIRES[id].spec && !x.done)
  if (!c) return { need: 0, s: 'no work here needs one' }
  if (R.specs.includes(HIRES[id].spec!)) return { need: 0, s: 'already aboard' }
  return { need: 1, s: `${c.short} at ${coord(R.nodes[c.at])} will not load without one${hireStrain()}` }
}

/* What tapping the directive should do. Plain data so the UI (and actions.ts)
   can run it without guidance importing either — no import cycles. */
export type OrderAct =
  | { kind: 'tab'; tab: 'deck' | 'lanes' | 'chart' }
  | { kind: 'port'; portTab: 'market' | 'crew' | 'contracts' }
  | { kind: 'course'; to: number }
  | { kind: 'fixDeck'; bays: number[]; bay: number | null }
  | { kind: 'none' }

export interface Orders {
  k: 'do' | 'bad' | 'buy' | 'go'
  t: string
  s: string
  act: OrderAct
  /** short label for the directive's button */
  cta: string
}

/** The nearest node with a warp point, or null when the sector has none. */
function nearestWarp(): number | null {
  const warps = R.nodes.filter((x) => x.warp).map((x) => x.id)
  if (!warps.length) return null
  return warps.sort((a, b) => R.D![R.at][a] - R.D![R.at][b])[0]
}

/** Send the player at a distant node: plot the course if it is more than one
    hop, otherwise just open the lanes where the burn already sits. */
function goTo(to: number): { act: OrderAct; cta: string } {
  if (to === R.at) return { act: { kind: 'tab', tab: 'lanes' }, cta: 'Show the lanes' }
  const adjacent = R.adj![R.at].some((e) => e.to === to)
  if (adjacent) return { act: { kind: 'tab', tab: 'lanes' }, cta: 'Show the lanes' }
  return { act: { kind: 'course', to }, cta: 'Set course' }
}

export function orders(): Orders {
  const n = here(),
    res = evaluate(R.grid),
    bad = res.checks.filter((c) => !c.ok)

  if (R.hold.length) {
    const m = modOf(R.hold[0])!
    if (!R.grid.includes(null))
      return {
        k: 'bad',
        t: 'The hold is full and no bay is clear.',
        s: 'Pawn or dump something — you cannot burn with kit loose in the hold.',
        act: { kind: 'tab', tab: 'deck' },
        cta: 'Open the deck'
      }
    return {
      k: 'do',
      t: `Stow the ${m.short.toLowerCase()} in a clear bay.`,
      s: 'Tap it in the hold, then tap an empty bay.',
      act: { kind: 'tab', tab: 'deck' },
      cta: 'Stow it'
    }
  }

  if (bad.length) {
    const f = bad[0]
    const live = f.focus.filter((i) => i >= 0)
    // a positional failure is fixed by moving something, so hand the player the
    // offending bay already selected; anything else is fixed at the market
    if (f.pos && live.length)
      return {
        k: 'bad',
        t: `Deck fails inspection: ${f.lb.toLowerCase()}.`,
        s: f.dt + ' You cannot burn until it clears.',
        act: { kind: 'fixDeck', bays: live, bay: live[0] },
        cta: 'Fix the bay'
      }
    return {
      k: 'bad',
      t: `Deck fails inspection: ${f.lb.toLowerCase()}.`,
      s: f.dt + ' You cannot burn until it clears.',
      act: n.stock.length ? { kind: 'port', portTab: 'market' } : { kind: 'tab', tab: 'deck' },
      cta: n.stock.length ? 'Open the market' : 'Show the bays'
    }
  }

  // fuel is the clock: if this rock sells it and the tanks are low, say so
  const cheapest = R.adj![R.at].length ? Math.min(...R.adj![R.at].map((e) => e.cost)) + surcharge() : 0
  const thin = R.fuel < cheapest * 2 || R.fuel <= 4
  if (n.fuel && thin && R.credits >= n.fuel && fuelCap() > R.fuel)
    return {
      k: 'buy',
      t: `Fuel is low and this rock sells it.`,
      s: `${R.fuel} of ${fuelCap()} aboard at ${n.fuel} a unit. The cheapest lane out costs ${cheapest}.`,
      act: { kind: 'port', portTab: 'market' },
      cta: 'Buy fuel'
    }

  const avail = R.cargo.filter((c) => !c.taken && !c.done && c.at === R.at)
  const open = avail.filter((c) => !(c.need && !R.specs.includes(c.need)))
  if (open.length && R.grid.includes(null))
    return {
      k: 'do',
      t: `${open[0].short} is on offer here.`,
      s: `${coord(R.nodes[open[0].to])}, pays ${open[0].fee}. ${open[0].rule}`,
      act: { kind: 'port', portTab: 'contracts' },
      cta: 'Open contracts'
    }

  const gate = avail.find((c) => c.need && !R.specs.includes(c.need))
  if (gate)
    return {
      k: 'buy',
      t: `${gate.short} needs a ${HIRES[gate.need!].name.toLowerCase()}.`,
      s: n.hires.includes(gate.need!) ? 'One is hiring here.' : 'None hiring here.',
      act: n.hires.includes(gate.need!) ? { kind: 'port', portTab: 'crew' } : { kind: 'tab', tab: 'chart' },
      cta: n.hires.includes(gate.need!) ? 'Open the hall' : 'Show the chart'
    }

  const gap = R.grid.includes(null) ? n.stock.find((k) => whyMod(k).need && R.credits >= MOD[k].price) : undefined
  if (gap)
    return {
      k: 'buy',
      t: `Buy a ${MOD[gap].short.toLowerCase()} here.`,
      s: `${whyMod(gap).s}. ${MOD[gap].price} credits.`,
      act: { kind: 'port', portTab: 'market' },
      cta: 'Open the market'
    }

  const carrying = R.cargo.filter((c) => c.aboard)
  if (carrying.length) {
    const c = carrying.slice().sort((a, b) => R.D![R.at][a.to] - R.D![R.at][b.to])[0]
    const g = goTo(c.to)
    return {
      k: 'go',
      t: `Run ${c.short} to ${coord(R.nodes[c.to])}.`,
      s: `${carrying.length} aboard, ${R.D![R.at][c.to]} fuel of lanes away. Profit so far ${R.credits - R.opening}.`,
      ...g
    }
  }

  if (n.warp)
    return {
      k: 'go',
      t: 'You are standing on a warp point.',
      s: `Jump out for ${R.warpCost} fuel, or keep working this sector.`,
      act: { kind: 'tab', tab: 'lanes' },
      cta: 'Warp out'
    }

  const free = R.cargo.filter((c) => !c.taken && !c.done)
  if (free.length) {
    const c = free.slice().sort((a, b) => R.D![R.at][a.at] - R.D![R.at][b.at])[0]
    const g = goTo(c.at)
    return {
      k: 'go',
      t: `${c.short} is waiting at ${coord(R.nodes[c.at])}.`,
      s: `Pays ${c.fee}, ${R.D![R.at][c.at]} fuel of lanes away. Profit so far ${R.credits - R.opening}.`,
      ...g
    }
  }

  const w = nearestWarp()
  return {
    k: 'go',
    t: 'Nothing left worth taking.',
    s: 'Make for a warp point and jump out.',
    ...(w === null ? { act: { kind: 'tab' as const, tab: 'chart' as const }, cta: 'Show the chart' } : goTo(w))
  }
}
