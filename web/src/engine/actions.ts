import { HIRES, MOD, TILES, bayName } from './data'
import { evaluate, fuelCap, laneCost, laneFuel, surcharge } from './core'
import { genStage } from './gen'
import { makeSeed } from './rng'
import { R, emit, ui } from './state'
import { HULLS, STARTER } from './data'
import type { Edge, GameState, HireId, ModCode, NodeT } from './types'
import type { OrderAct } from './guidance'
import { clearRemoteSave, scheduleSave } from '../net/saves'
import { recordScore } from '../net/scores'
import { clearCourse, courseArrived, setCourse } from './course'

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
  const cost = laneCost(e.cost)
  if (R.fuel < cost || !shipOK()) return
  R.fuel -= cost
  R.at = e.b
  if (!R.visited.includes(e.b)) R.visited.push(e.b)
  ui.sel = null
  ui.focus = []
  ui.confirm = null
  // stay on whatever pane the player was reading — the directive and the tab
  // badges say what changed, so we never yank the view out from under them
  courseArrived()
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
    R.delivered++
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
  // pre-select it so the next bay tap stows it, but leave the player where
  // they are — the DECK badge and the directive both flag the loose crate
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
  else {
    R.overWhy = 'You could not cover the wage bill'
    finishRun('bust')
  }
  touch()
}

/** One place where a run is declared over, so every ending is scored. */
function finishRun(kind: 'retired' | 'bust') {
  if (R.endKind) return
  R.endKind = kind
  recordScore({
    credits: R.credits,
    delivered: R.delivered,
    stage: R.stage,
    cleared: R.cleared,
    hull: R.hull.name,
    kind,
    why: R.overWhy || '',
    seed: R.seed
  })
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
  const cheapest = Math.min(...out.map((e) => laneCost(e.cost)))
  if (R.fuel >= cheapest) return null
  const canBuy = n.fuel > 0 && R.credits >= n.fuel && fuelCap() > R.fuel
  // pawning only sheds surcharge weight — it can never cover a lane's base
  // cost, so with less fuel than the cheapest empty-ship lane it is no escape
  const minBase = Math.min(...out.map((e) => laneFuel(e.cost)))
  if (R.fuel < minBase && !canBuy) return `Every lane out costs ${minBase}+ fuel, you hold ${R.fuel}, and none is for sale here.`
  if (canBuy || canSell) return null
  return 'No lane you can afford, no fuel for sale, nothing to sell.'
}

export function callIt() {
  R.over = 'bust'
  R.overWhy = 'Stranded with nothing left to sell'
  R.summary = null
  finishRun('bust')
  touch()
}

/** The always-available escape hatch — no lock state may ever strand a run. */
export function scuttle() {
  R.over = 'bust'
  R.overWhy = `You scuttled the ship at ${coord(here())}`
  R.summary = null
  finishRun('bust')
  touch()
}

/** What this yard will give you for the hull you are standing on. */
export function tradeIn(): number {
  return Math.floor(R.hull.price * (sellRate() || 0.4))
}

/** Net cost of a hull here, after trade-in. */
export function shipPrice(id: string): number {
  const h = HULLS.find((x) => x.id === id)
  if (!h) return Infinity
  return Math.max(0, h.price - tradeIn())
}

/** Buy a hull from the yard you are standing in. Your modules and cargo come
    off the old deck into the hold — the new silhouette is yours to re-solve. */
export function buyShip(id: string) {
  const n = here()
  if (!n.ships.includes(id)) return
  const h = HULLS.find((x) => x.id === id)
  if (!h || h.id === R.hull.id) return
  const net = shipPrice(id)
  if (R.credits < net) return
  R.credits -= net
  R.spend += net
  // everything stowed comes with you, loose in the hold
  const carried = R.grid.filter(Boolean) as string[]
  R.hull = h
  R.grid = new Array(TILES).fill(null)
  R.hold = R.hold.concat(carried)
  R.fuel = Math.min(R.fuel, fuelCap())
  ui.sel = null
  ui.focus = []
  ui.tab = 'deck' // the whole point is the deck changed shape
  say(`Traded up to the ${h.name.toLowerCase()} for ${net}. Re-stow her.`)
  touch()
}

/* ---- run lifecycle ---- */
export function pickHull(i: number) {
  const hull = HULLS[i] ?? STARTER
  genStage(makeSeed(), 1, null, hull)
  R.credits = Math.round(320 * hull.credits)
  R.opening = R.credits
  ui.view = 'run'
  ui.sel = null
  ui.focus = []
  ui.tab = 'deck'
  clearCourse() // node ids belong to the old sector
  touch()
}

export function pressOn() {
  const carry = {
    grid: R.grid, crew: R.crew, specs: R.specs, fuel: R.fuel,
    credits: R.credits, cleared: R.cleared, hull: R.hull, delivered: R.delivered
  }
  genStage(makeSeed(), R.stage + 1, carry)
  ui.sel = null
  ui.focus = []
  ui.tab = 'deck'
  ui.confirm = null
  clearCourse() // a new sector — the old course means nothing
  touch()
}

export function retire() {
  R.over = 'bust'
  R.overWhy = `You retired on ${R.credits} after ${R.cleared} stages`
  R.summary = null
  finishRun('retired')
  touch()
}

/** Every run begins on the starter hull — you buy your way up from there. */
export function newRun() {
  ui.confirm = null
  ui.sel = null
  ui.focus = []
  ui.tab = 'deck'
  clearCourse()
  clearRemoteSave()
  genStage(makeSeed(), 1, null, STARTER)
  R.credits = 320
  R.opening = R.credits
  ui.view = 'run'
  touch()
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
  const lane = e ? laneFuel(e.cost) : 0
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

/** Plot a multi-hop course to a far node and close the confirmation. */
export function plotCourse(to: number) {
  setCourse(to)
  ui.confirm = null
  ui.tab = 'lanes' // the next hop is what you act on now
  emit()
}

export function dropCourse() {
  clearCourse()
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

/** Run whatever the directive is pointing at. */
export function runOrder(act: OrderAct) {
  switch (act.kind) {
    case 'tab':
      ui.tab = act.tab
      break
    case 'port':
      ui.tab = 'port'
      ui.portTab = act.portTab
      break
    case 'course':
      plotCourse(act.to)
      return // plotCourse emits
    case 'fixDeck':
      ui.tab = 'deck'
      ui.focus = act.bays
      // hand them the offending module already picked up, so one more tap moves it
      ui.sel = act.bay !== null && R.grid[act.bay] ? { t: 'bay', i: act.bay } : null
      break
    case 'none':
      break
  }
  emit()
}

export function toggleFocus(live: number[]) {
  const on = ui.focus.length === live.length && live.every((i) => ui.focus.includes(i))
  ui.focus = on ? [] : live
  emit()
}
