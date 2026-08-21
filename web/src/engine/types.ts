export type ModCode = 'RCT' | 'BAT' | 'RAD' | 'CRY' | 'LSP' | 'BRT' | 'THR' | 'SHD' | 'TNK'
export type KindId = 'volatile' | 'cold' | 'living' | 'unbraced' | 'instrument'
export type HireId = 'HAND' | 'HAZMAT' | 'VET'
export type Spec = 'HAZMAT' | 'VET'

export interface ModDef {
  code: ModCode
  icon: string
  name: string
  short: string
  tok: string[]
  power: number
  heat: number
  spill?: number
  cool?: number
  fuel?: number
  price: number
  blurb: string
}

export interface KindDef {
  id: KindId
  name: string
  pay: number
  weight: number
  crew: number
  support: ModCode | null
  need?: Spec
  rule: string
}

export interface HireDef {
  id: HireId
  name: string
  price: number
  deck?: boolean
  spec?: Spec
  blurb: string
}

export interface Hull {
  id: string
  name: string
  base: number
  credits: number
  crew: HireId[]
  mods: ModCode[]
  blurb: string
}

export interface Cargo {
  i: number
  kind: KindId
  /** the cargo type's label, e.g. "Livestock pen" — rules read `kind`, not this */
  name: string
  /** what it actually holds, e.g. "dairy heifers" (flavour only) */
  goods?: string
  /** who is paying for the run (flavour only) */
  client?: string
  short: string
  rule: string
  need: Spec | null
  support: ModCode | null
  crew: number
  at: number
  to: number
  taken: boolean
  aboard: boolean
  done: boolean
  fee: number
}

export interface NodeT {
  id: number
  r: number
  c: number
  n: number
  fuel: number
  port: boolean
  warp: boolean
  stock: ModCode[]
  hires: HireId[]
  rate?: number
}

export interface Edge {
  a: number
  b: number
  cost: number
}

/** A deck cell holds a module code, a cargo ref ('@<index>'), or nothing. */
export type Cell = string | null

/** What modOf() yields: a module def, or a cargo posing as one. */
export interface ModView {
  code: string
  icon: string
  name: string
  short: string
  tok: string[]
  power: number
  heat: number
  spill?: number
  cool?: number
  fuel?: number
  price?: number
  blurb?: string
  cargo?: Cargo
}

export interface Check {
  lb: string
  ok: boolean
  dt: string
  focus: number[]
  /** true when re-arranging the deck can change this check's outcome */
  pos: boolean
}

export interface EvalResult {
  checks: Check[]
  ok: boolean
  heat: number[]
}

export interface BestPlan {
  profit: number
  set: number[]
  fuel: number
  spend?: number
  revenue?: number
}

export interface Summary {
  wages: number
  penalty: number
  forfeits: string[]
  opening: number
  revenue: number
  spend: number
  profit: number
  best: number
}

export interface GameState {
  seed: string
  stage: number
  cleared: number
  hull: Hull
  nodes: NodeT[]
  edges: Edge[]
  rowCount: number
  cargo: Cargo[]
  grid: Cell[]
  hold: string[]
  crew: HireId[]
  specs: Spec[]
  fuel: number
  credits: number
  at: number
  visited: number[]
  log: string[]
  over: null | 'bust' | 'clear'
  overWhy?: string
  event: { t: string; x: string } | null
  accepted: number[]
  opening: number
  revenue: number
  spend: number
  wage: number
  warpCost: number
  margin: number
  medFuel: number
  /** contracts delivered across the whole run, for the score line */
  delivered: number
  /** background heat every bay carries this deep in — rises with the stage */
  ambient: number
  /** how the run finished, once it has */
  endKind?: 'retired' | 'bust'
  best?: BestPlan
  repairs?: number
  summary?: Summary | null
  paid?: number | null
  salv?: ModCode
  /* transient — rebuilt after load, stripped before save */
  D?: number[][]
  adj?: { to: number; cost: number }[][]
}
