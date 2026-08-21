import type { HireDef, HireId, Hull, KindDef, KindId, ModCode, ModDef } from './types'

export const W = 4
export const H = 5
export const TILES = 20

export const NB: number[][] = Array.from({ length: TILES }, (_, i) => {
  const r = (i / W) | 0,
    c = i % W,
    o: number[] = []
  if (r > 0) o.push(i - W)
  if (r < H - 1) o.push(i + W)
  if (c > 0) o.push(i - 1)
  if (c < W - 1) o.push(i + 1)
  return o
})

export function bayName(i: number): string {
  return 'ABCD'[i % W] + (((i / W) | 0) + 1)
}

export const MOD: Record<ModCode, ModDef> = {
  RCT: {
    code: 'RCT', icon: 'RCT', name: 'Reactor', short: 'REACTOR', tok: ['P +6', 'H +3'],
    power: 6, heat: 3, spill: 2, price: 42,
    blurb: '6 power, the most of any bay. Runs at +3 heat and pushes +2 into every touching bay unless shielding blocks it.'
  },
  BAT: {
    code: 'BAT', icon: 'BAT', name: 'Battery', short: 'BATTERY', tok: ['P +2'],
    power: 2, heat: 0, price: 16,
    blurb: '2 power, cold and quiet. A third the output of a reactor for the same bay.'
  },
  RAD: {
    code: 'RAD', icon: 'RAD', name: 'Radiator', short: 'RADIATOR', tok: ['P −1', 'cool 3'],
    power: -1, heat: 0, cool: 3, price: 26,
    blurb: 'Pulls 3 heat from every bay it touches, never its own. Half wasted in a corner, doubled in the middle.'
  },
  CRY: {
    code: 'CRY', icon: 'CRY', name: 'Cryo unit', short: 'CRYO', tok: ['P −3', 'cool 2'],
    power: -3, heat: 0, cool: 2, price: 38,
    blurb: 'Pulls 2 heat from touching bays. The heaviest power draw aboard, and the only thing cold chain will accept.'
  },
  LSP: {
    code: 'LSP', icon: 'LSP', name: 'Life support', short: 'LIFE SUP', tok: ['P −1', 'air 2'],
    power: -1, heat: 1, price: 22,
    blurb: 'Air for 2 souls. Costs 1 power and runs at +1 heat.'
  },
  BRT: {
    code: 'BRT', icon: 'BRT', name: 'Crew bunks', short: 'BUNKS', tok: ['sleeps 2'],
    power: 0, heat: 0, price: 14,
    blurb: 'Sleeping space for 2. Free to run, but it is pure mass.'
  },
  THR: {
    code: 'THR', icon: 'THR', name: 'Thruster', short: 'THRUSTER', tok: ['P −2', '+4 cap'],
    power: -2, heat: 2, spill: 1, price: 32,
    blurb: 'Each engine lifts 4 more bays and weighs nothing itself — thrust cancels its own mass. Runs at +2 heat and pushes +1 into touching bays. Two is the legal minimum.'
  },
  SHD: {
    code: 'SHD', icon: 'SHD', name: 'Shielding', short: 'SHIELD', tok: ['blocks heat'],
    power: 0, heat: 0, price: 19,
    blurb: 'Contains volatile cargo, and stops reactor heat spilling through it. Inert otherwise.'
  },
  TNK: {
    code: 'TNK', icon: 'TNK', name: 'Fuel tank', short: 'FUEL TANK', tok: ['holds 6'],
    power: 0, heat: 0, fuel: 6, price: 24,
    blurb: 'Holds 6 fuel. Weighs the same empty as full, so a spent tank is ballast worth dumping.'
  }
}

export const KINDS: Record<KindId, KindDef> = {
  volatile: {
    id: 'volatile', name: 'Volatile compound', pay: 1.45, weight: 1, crew: 0, support: 'SHD',
    rule: 'Every bay touching it must hold shielding. Empty bays do not contain — the hull wall does.'
  },
  cold: {
    id: 'cold', name: 'Cold chain crate', pay: 1.25, weight: 1, crew: 0, support: 'CRY',
    rule: 'Its bay must read 0 heat or lower, with a cryo unit alongside.'
  },
  living: {
    id: 'living', name: 'Livestock pen', pay: 1.1, weight: 1, crew: 2, support: 'LSP', need: 'VET',
    rule: 'Life support alongside, and tenders to work it.'
  },
  unbraced: {
    id: 'unbraced', name: 'Unbraced mass', pay: 1.1, weight: 2, crew: 0, support: null,
    rule: 'Two touching bays left clear to brace against — the hull wall braces too. Weighs double.'
  },
  instrument: {
    id: 'instrument', name: 'Calibrated instrument', pay: 1.0, weight: 1, crew: 0, support: null,
    rule: 'No reactor or thruster may touch it.'
  }
}

export const HIRES: Record<HireId, HireDef> = {
  HAND: {
    id: 'HAND', name: 'Deckhand', price: 26, deck: true,
    blurb: 'Runs 4 mass of stowage. Needs a bunk, air, and wages.'
  },
  HAZMAT: {
    id: 'HAZMAT', name: 'Hazmat handler', price: 48, spec: 'HAZMAT',
    blurb: 'Every volatile crate may leave one face unshielded. Does not work the deck.'
  },
  VET: {
    id: 'VET', name: 'Stock vet', price: 48, spec: 'VET',
    blurb: 'Livestock needs one tender instead of two. Does not work the deck.'
  }
}

export const HULLS: Hull[] = [
  {
    id: 'freighter', name: 'Standard freighter', base: 4, credits: 1.0, crew: ['HAND', 'HAND'],
    mods: ['RCT', 'THR', 'THR', 'LSP', 'BRT', 'TNK', 'TNK'],
    blurb: 'Balanced and forgiving. Two engines, two tanks, room to grow.'
  },
  {
    id: 'hauler', name: 'Long-hauler', base: 6, credits: 1.0, crew: ['HAND', 'HAND'],
    mods: ['RCT', 'THR', 'LSP', 'BRT', 'TNK', 'TNK', 'TNK'],
    blurb: 'Enormous range on three tanks — but one engine, so it is illegal until you buy a second.'
  },
  {
    id: 'tug', name: 'Tug', base: 2, credits: 1.0, crew: ['HAND', 'HAND'],
    mods: ['RCT', 'RCT', 'THR', 'THR', 'THR', 'LSP', 'BRT'],
    blurb: 'Three engines and power to spare. No tanks at all, so you refuel constantly.'
  },
  {
    id: 'liner', name: 'Liner', base: 4, credits: 0.8, crew: ['HAND', 'HAND', 'HAND', 'VET'],
    mods: ['RCT', 'THR', 'THR', 'LSP', 'LSP', 'BRT', 'BRT', 'TNK'],
    blurb: 'Crewed and bunked from the start, with a vet aboard. Half your bays are gone before you load anything.'
  }
]
