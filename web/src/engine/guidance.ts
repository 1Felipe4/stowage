import { HIRES, MOD } from './data'
import { capacity, deckCrew, evaluate, massOf, modOf, souls } from './core'
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
  if (k === 'CRY') {
    const v = R.cargo.some((x) => x.aboard && x.kind === 'cold')
    return v && c('CRY') < 1 ? { need: 1, s: 'cold chain spoils without one' } : { need: 0, s: 'cooling, at 3 power' }
  }
  if (k === 'RAD') return { need: 0, s: 'pulls heat from touching bays' }
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

export interface Orders {
  k: 'do' | 'bad' | 'buy' | 'go'
  t: string
  s: string
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
        s: 'Pawn or dump something — you cannot burn with kit loose in the hold.'
      }
    return { k: 'do', t: `Stow the ${m.short.toLowerCase()} in a clear bay.`, s: 'Tap it in the hold, then tap an empty bay.' }
  }
  if (bad.length)
    return { k: 'bad', t: `Deck fails inspection: ${bad[0].lb.toLowerCase()}.`, s: bad[0].dt + ' You cannot burn until it clears.' }
  const avail = R.cargo.filter((c) => !c.taken && !c.done && c.at === R.at)
  const open = avail.filter((c) => !(c.need && !R.specs.includes(c.need)))
  if (open.length && R.grid.includes(null))
    return {
      k: 'do',
      t: `${open[0].short} is on offer here.`,
      s: `${coord(R.nodes[open[0].to])}, pays ${open[0].fee}. ${open[0].rule}`
    }
  const gate = avail.find((c) => c.need && !R.specs.includes(c.need))
  if (gate)
    return {
      k: 'buy',
      t: `${gate.short} needs a ${HIRES[gate.need!].name.toLowerCase()}.`,
      s: n.hires.includes(gate.need!) ? 'One is hiring here.' : 'None hiring here.'
    }
  const gap = R.grid.includes(null) ? n.stock.find((k) => whyMod(k).need && R.credits >= MOD[k].price) : undefined
  if (gap) return { k: 'buy', t: `Buy a ${MOD[gap].short.toLowerCase()} here.`, s: `${whyMod(gap).s}. ${MOD[gap].price} credits.` }
  const carrying = R.cargo.filter((c) => c.aboard)
  if (carrying.length)
    return {
      k: 'go',
      t: `Run ${carrying[0].short} to ${coord(R.nodes[carrying[0].to])}.`,
      s: `${carrying.length} aboard. Profit so far ${R.credits - R.opening}.`
    }
  if (n.warp)
    return { k: 'go', t: 'You are standing on a warp point.', s: `Jump out for ${R.warpCost} fuel, or keep working this sector.` }
  const free = R.cargo.filter((c) => !c.taken && !c.done)
  if (free.length)
    return {
      k: 'go',
      t: `${free[0].short} is waiting at ${coord(R.nodes[free[0].at])}.`,
      s: `Pays ${free[0].fee}. Profit so far ${R.credits - R.opening}.`
    }
  return { k: 'go', t: 'Nothing left worth taking.', s: 'Make for a warp point and jump out.' }
}
