import type { GameState } from './types'

/* The whole engine shares one mutable game state, exactly like the
   prototype's global R. React reads it through useSyncExternalStore
   keyed on a version counter bumped by emit(). */

export let R: GameState = null as unknown as GameState
export function setR(v: GameState | null) {
  R = v as GameState
}

export type Sel = { t: 'bay'; i: number } | { t: 'hold'; n: number }

export type Tab = 'port' | 'deck' | 'lanes' | 'chart'
export type PortTab = 'market' | 'crew' | 'contracts'

/** A plotted burn awaiting confirmation. Nothing moves until confirmed. */
export interface JumpPlan {
  to: number
  lane: number
  sur: number
  cost: number
  why: string | null
}

export interface UiState {
  view: 'boot' | 'hull' | 'run'
  sel: Sel | null
  focus: number[]
  /** active pane on mobile; desktop shows all three panes regardless */
  tab: Tab
  portTab: PortTab
  confirm: JumpPlan | null
}

export const ui: UiState = { view: 'boot', sel: null, focus: [], tab: 'deck', portTab: 'market', confirm: null }

let version = 0
const subs = new Set<() => void>()

export function emit() {
  version++
  subs.forEach((f) => f())
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function getVersion(): number {
  return version
}
