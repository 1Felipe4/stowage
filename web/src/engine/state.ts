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
export type PortTab = 'market' | 'crew' | 'contracts' | 'ships'

/** What the detail sheet is showing. `id` is a bay/hold/crew index, a module
    or hull code, a cargo index, or a check label. */
export type Detail =
  | { k: 'mod'; id: string }
  | { k: 'bay'; id: number }
  | { k: 'hold'; id: number }
  | { k: 'crew'; id: number }
  | { k: 'hire'; id: string }
  | { k: 'cargo'; id: number }
  | { k: 'check'; id: string }
  | { k: 'ship'; id: string }

/** A plotted burn awaiting confirmation. Nothing moves until confirmed. */
export interface JumpPlan {
  to: number
  lane: number
  sur: number
  cost: number
  why: string | null
}

export type Screen = 'menu' | 'scores' | 'lessons' | 'bridge'

export interface UiState {
  view: 'boot' | 'hull' | 'run'
  /** which top-level screen is showing; 'bridge' is the game itself */
  screen: Screen
  /** index into LESSONS while the lessons screen is open */
  lesson: number
  /** guided-run progress, or null in free play */
  tut: { i: number } | null
  sel: Sel | null
  focus: number[]
  /** active pane on mobile; desktop shows all three panes regardless */
  tab: Tab
  portTab: PortTab
  confirm: JumpPlan | null
  /** plotted destination node id — advisory course, see engine/course.ts */
  course: number | null
  /** the open detail sheet, or null */
  detail: Detail | null
}

export const ui: UiState = {
  view: 'boot',
  screen: 'menu',
  lesson: 0,
  tut: null,
  sel: null,
  focus: [],
  tab: 'deck',
  portTab: 'market',
  confirm: null,
  course: null,
  detail: null
}

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
