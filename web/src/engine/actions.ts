import { HIRES, MOD, TILES, bayName } from './data'
import { evaluate, fuelCap, surcharge } from './core'
import { genStage } from './gen'
import { makeSeed } from './rng'
import { R, emit, setR, ui } from './state'
import { HULLS } from './data'
import type { Edge, GameState, HireId, ModCode, NodeT } from './types'
import { clearRemoteSave, scheduleSave } from '../net/saves'

export function coord(n: NodeT): string {
  return 'ABCDEFGHIJ'[n.r] + (n.c + 1)
}
export function here(): NodeT {
  return R.nodes[R.at]
}
export function outEdges(): Edge[] {
  return R.adj![R.at].map((e) => ({ a: R.at, b: e.to, cost: e.cost }))
}
export function shipOK(): boolean {
  return evaluate(R.grid).ok
}
function say(t: string) {
  R.log.unshift(t)
  R.log = R.log.slice(0, 6)
}

export function stripped(): Omit<GameState, 'D' | 'adj'> {
  const c = { ...R }
  delete c.D
  delete c.adj
  return c
}

function touch() {
  scheduleSave(stripped())
  emit()
}

/* ---- travel events ---- */
interface Ev {
  id: string
  w: number
  t: string | null
  x: string | null
  go(): void
}
const EVENTS: Ev[] = [
  {
    id: 'shift', w: 3, t: 'The load shifted', x: 'Kit slid loose on the burn. Re-stow it.',
    go() {
      const idx: number[] = []
      for (let i = 0; i < TILES; i++) if (R.grid[i]) idx.push(i)
      for (let n = 0; n < 3 && idx.length > 1; n++) {
        const a = idx[(Math.random() * idx.length) | 0],
          b = idx[(Math.random() * idx.length) | 0]
        const t = R.grid[a]
        R.grid[a] = R.grid[b]
        R.grid[b] = t
      }
    }
  },
  {
    id: 'siphon', w: 2, t: 'Fuel siphoned', x: 'Someone tapped your line. Two units gone.',
    go() {
      R.fuel = Math.max(0, R.fuel - 2)
    }
  },
  {
    id: 'salvage', w: 2, t: 'Salvage claimed', x: 'You stripped a working part off a dead hull.',
    go() {
      const k = (['BAT', 'SHD', 'BRT', 'RAD'] as ModCode[])[(Math.random() * 4) | 0]
      R.hold.push(k)
      R.salv = k
    }
  },
  {
    id: 'levy', w: 2, t: 'Transit levy', x: 'A patrol read your manifest and charged you for it.',
    go() {
      R.credits = Math.max(0, R.credits - 25)
      R.spend += 25
    }
  },
  { id: 'clear', w: 6, t: null, x: null, go() {} }
]

function rollEvent() {
  const pool: Ev[] = []
  EVENTS.forEach((e) => {
    for (let i = 0; i < e.w; i++) pool.push(e)
  })
  const e = pool[(Math.random() * pool.length) | 0]
  e.go()
  R.event = e.t ? { t: e.t, x: e.x + (e.id === 'salvage' ? ` A ${MOD[R.salv!].short.toLowerCase()}.` : '') } : null
}

/* ---- actions ---- */
export function jump(e: Edge) {
  const cost = e.cost + surcharge()
  if (R.fuel < cost || !shipOK()) return
  R.fuel -= cost
  R.at = e.b
  if (!R.visited.includes(e.b)) R.visited.push(e.b)
  ui.sel = null
  ui.focus = []
  ui.tab = 'port' // arriving somewhere new — show what the rock offers
  ui.portTab = 'market'
  ui.confirm = null
  rollEvent()
  say(`Burned ${cost} to ${coord(here())}.`)
  dropOff()
  touch()
}

function dropOff() {
  const n = here()
  let paid = 0
  R.cargo.forEach((c, i) => {
    if (c.done || !c.aboard || c.to !== n.id) return
    const b = R.grid.indexOf('@' + i)
    if (b < 0) return
    R.grid[b] = null
    c.aboard = false
    c.done = true
    paid += c.fee
    say(`${c.short} signed over for ${c.fee}.`)
  })
  if (paid) {
    R.credits += paid
    R.revenue += paid
    R.paid = paid
  }
}

export function accept(i: number) {
  const c = R.cargo[i]
  if (c.taken || c.at !== R.at) return
  if (c.need && !R.specs.includes(c.need)) return
  if (!R.grid.includes(null)) return
  c.taken = true
  c.aboard = true
  R.hold.push('@' + i)
  R.accepted.push(i)
  ui.tab = 'deck' // the crate is in the hold — go stow it
  ui.sel = { t: 'hold', n: R.hold.length - 1 }
  say(`${c.short} signed for, bound for ${coord(R.nodes[c.to])}.`)
  touch()
}

export function buyFuel(n: number) {
  const p = here().fuel
  if (!p) return
  const amt = Math.min(n, fuelCap() - R.fuel, Math.floor(R.credits / p))
  if (amt <= 0) return
  R.credits -= amt * p
  R.spend += amt * p
  R.fuel += amt
  touch()
}

export function buyMod(k: ModCode) {
  if (R.credits < MOD[k].price) return
  // purchases land straight on the deck — no bay clear, no sale
  const i = R.grid.indexOf(null)
  if (i < 0) return
  R.credits -= MOD[k].price
  R.spend += MOD[k].price
  R.grid[i] = k
  say(`Bought ${MOD[k].name}, stowed at ${bayName(i)}.`)
  touch()
}

export function sellRate(): number {
  const n = here()
  return n.port ? n.rate || 0.55 : 0
}
export function sellValue(k: ModCode): number {
  return Math.floor(MOD[k].price * sellRate())
}

export function sellMod(k: ModCode, from: 'bay' | 'hold', idx?: number) {
  if (!sellRate()) return
  if (from === 'bay') {
    if (R.grid[idx!] !== k) return
    R.grid[idx!] = null
  } else {
    const i = R.hold.indexOf(k)
    if (i < 0) return
    R.hold.splice(i, 1)
  }
  const v = sellValue(k)
  R.credits += v
  R.spend -= v
  if (k === 'TNK' && R.fuel > fuelCap()) {
    const lost = R.fuel - fuelCap()
    R.fuel = fuelCap()
    say(`${lost} fuel vented with the tank.`)
  }
  say(`Pawned ${MOD[k].name} for ${v}.`)
  ui.sel = null
  touch()
}

export function hire(id: HireId) {
  const h = HIRES[id]
  if (R.credits < h.price) return
  R.credits -= h.price
  R.spend += h.price
  R.crew.push(id)
  if (h.spec && !R.specs.includes(h.spec)) R.specs.push(h.spec)
  say(`Signed on a ${h.name.toLowerCase()}.`)
  touch()
}

export function payOff(i: number) {
  const id = R.crew[i]
  if (HIRES[id].spec && R.cargo.some((c) => c.aboard && c.need === HIRES[id].spec)) return
  R.crew.splice(i, 1)
  if (HIRES[id].spec && !R.crew.includes(id)) {
    const j = R.specs.indexOf(HIRES[id].spec!)
    if (j >= 0) R.specs.splice(j, 1)
  }
  say(`${HIRES[id].name} paid off.`)
  ui.sel = null
  touch()
}

export function jettison(k: string) {
  const i = R.hold.indexOf(k)
  if (i >= 0) R.hold.splice(i, 1)
  else {
    const j = R.grid.indexOf(k)
    if (j < 0) return
    R.grid[j] = null
  }
  if (k[0] === '@') {
    const c = R.cargo[+k.slice(1)]
    c.aboard = false
    c.taken = false
    c.at = R.at
    say(`${c.short} set down here.`)
  } else {
    if (k === 'TNK') R.fuel = Math.min(R.fuel, fuelCap())
    say(`${MOD[k as ModCode].name} dumped.`)
  }
  ui.sel = null
  touch()
}

export function doWarp() {
  const n = here()
  if (!n.warp || R.fuel < R.warpCost || !shipOK()) return
  R.fuel -= R.warpCost
  const wages = R.crew.length * R.wage
  const forfeits = R.cargo.filter((c) => c.taken && !c.done)
  const penalty = forfeits.reduce((a, c) => a + Math.round(c.fee * 0.5), 0)
  R.credits -= wages + penalty
  R.spend += wages + penalty
  R.summary = {
    wages, penalty, forfeits: forfeits.map((c) => c.short),
    opening: R.opening, revenue: R.revenue, spend: R.spend,
    profit: R.credits - R.opening, best: Math.round(R.best!.profit)
  }
  R.over = R.credits < 0 ? 'bust' : 'clear'
  if (R.over === 'clear') R.cleared++
  else R.overWhy = 'You could not cover the wage bill'
  touch()
}

/** Why this run can no longer move, or null if it still can. Covers the two
    hard locks: fuel starvation, and an engine count no purchase here can fix
    (a deck that fails THRUST never burns, regardless of fuel). */
export function stuckReason(): string | null {
  if (R.over) return null
  const out = outEdges()
  if (!out.length) return 'No lanes lead out of this rock.'
  const n = here()
  // standing on a warp point with warp fuel and a legal deck is never stuck
  if (n.warp && R.fuel >= R.warpCost && shipOK()) return null
  const sellables = [...R.grid, ...R.hold].filter((k): k is string => !!k && k[0] !== '@')
  const canSell = sellRate() > 0 && sellables.length > 0
  const engines = sellables.filter((k) => k === 'THR').length
  if (engines < 2) {
    if (!n.stock.includes('THR')) return `${engines} of 2 engines aboard and no thruster for sale here. This deck will never clear.`
    const raisable = R.credits + (canSell ? sellables.filter((k) => k !== 'THR').reduce((a, k) => a + sellValue(k as ModCode), 0) : 0)
    if (raisable < MOD.THR.price)
      return `A thruster costs ${MOD.THR.price} and everything aboard would only raise ${raisable}. This deck will never clear.`
  }
  const cheapest = Math.min(...out.map((e) => e.cost + surcharge()))
  if (R.fuel >= cheapest) return null
  const canBuy = n.fuel > 0 && R.credits >= n.fuel && fuelCap() > R.fuel
  // pawning only sheds surcharge weight — it can never cover a lane's base
  // cost, so with less fuel than the cheapest empty-ship lane it is no escape
  const minBase = Math.min(...out.map((e) => e.cost))
  if (R.fuel < minBase && !canBuy) return `Every lane out costs ${minBase}+ fuel, you hold ${R.fuel}, and none is for sale here.`
  if (canBuy || canSell) return null
  return 'No lane you can afford, no fuel for sale, nothing to sell.'
}

export function callIt() {
  R.over = 'bust'
  R.overWhy = 'Stranded with nothing left to sell'
  R.summary = null
  touch()
}

/** The always-available escape hatch — no lock state may ever strand a run. */
export function scuttle() {
  R.over = 'bust'
  R.overWhy = `You scuttled the ship at ${coord(here())}`
  R.summary = null
  touch()
}

/* ---- run lifecycle ---- */
export function pickHull(i: number) {
  const hull = HULLS[i]
  genStage(makeSeed(), 1, null, hull)
  R.credits = Math.round(320 * hull.credits)
  R.opening = R.credits
  ui.view = 'run'
  ui.sel = null
  ui.focus = []
  touch()
}

export function pressOn() {
  const carry = { grid: R.grid, crew: R.crew, specs: R.specs, fuel: R.fuel, credits: R.credits, cleared: R.cleared, hull: R.hull }
  genStage(makeSeed(), R.stage + 1, carry)
  ui.sel = null
  ui.focus = []
  touch()
}

export function retire() {
  R.over = 'bust'
  R.overWhy = `You retired on ${R.credits} after ${R.cleared} stages`
  R.summary = null
  touch()
}

export function newRun() {
  ui.view = 'hull'
  setR(null)
  clearRemoteSave()
  emit()
}

/* ---- deck selection ---- */
export function tapBay(i: number) {
  const g = R.grid
  const sel = ui.sel
  if (!sel) {
    if (g[i]) ui.sel = { t: 'bay', i }
    emit()
    return
  }
  if (sel.t === 'hold') {
    if (g[i]) return
    g[i] = R.hold.splice(sel.n, 1)[0]
    ui.sel = null
    // stowing cargo while already at its destination delivers it on the spot —
    // no burning away and back just to trigger the arrival hook
    if (g[i]![0] === '@') dropOff()
  } else {
    if (sel.i === i) {
      ui.sel = null
      emit()
      return
    }
    const t = g[sel.i]
    g[sel.i] = g[i]
    g[i] = t
    ui.sel = null
  }
  ui.focus = []
  touch()
}

export function tapHold(n: number) {
  ui.sel = ui.sel && ui.sel.t === 'hold' && ui.sel.n === n ? null : { t: 'hold', n }
  emit()
}

/* ---- plotted burns: chart taps and lane cards both open a confirmation;
        nothing moves until the player confirms ---- */
export function askJump(to: number) {
  if (to === R.at) return
  const e = outEdges().find((x) => x.b === to)
  const sur = surcharge()
  const lane = e ? e.cost : 0
  const cost = e ? lane + sur : 0
  let why: string | null = null
  if (!e)
    why = `No lane runs from ${coord(here())} to ${coord(R.nodes[to])}. Only nodes joined to yours by a line are one burn away.`
  else {
    const bad = evaluate(R.grid).checks.filter((c) => !c.ok)
    if (bad.length) why = `Deck fails inspection — ${bad.length} to clear, starting with ${bad[0].lb.toLowerCase()}.`
    else if (R.fuel < cost) why = `The burn costs ${cost} fuel and you hold ${R.fuel}.`
  }
  ui.confirm = { to, lane, sur, cost, why }
  emit()
}

export function cancelJump() {
  ui.confirm = null
  emit()
}

export function confirmJump() {
  const c = ui.confirm
  if (!c || c.why) return
  const e = outEdges().find((x) => x.b === c.to)
  ui.confirm = null
  if (e) jump(e) // jump re-guards fuel and inspection itself
  else emit()
}

export function toggleFocus(live: number[]) {
  const on = ui.focus.length === live.length && live.every((i) => ui.focus.includes(i))
  ui.focus = on ? [] : live
  emit()
}
