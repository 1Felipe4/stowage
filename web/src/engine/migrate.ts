import { HULLS, STARTER, TILES } from './data'
import type { Cell, GameState, NodeT } from './types'

/* Saves outlive schemas. A run started before shipyards existed has nodes with
   no `ships` array; one started before ambient heat has no `ambient`; one
   started before hulls had silhouettes may hold modules in cells its hull no
   longer has. Everything loaded from disk or server comes through here first,
   so the rest of the engine can assume today's shape. */

export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as GameState
  if (!Array.isArray(s.nodes) || !Array.isArray(s.grid) || !s.hull) return null

  // hull: always re-resolve from the live table, so balance changes reach old
  // runs and a hull that no longer exists falls back to the starter
  s.hull = HULLS.find((h) => h.id === (s.hull as { id?: string })?.id) ?? STARTER

  // nodes gained `ships` when shipyards landed
  s.nodes = s.nodes.map(
    (n): NodeT => ({
      ...n,
      stock: Array.isArray(n.stock) ? n.stock : [],
      hires: Array.isArray(n.hires) ? n.hires : [],
      ships: Array.isArray(n.ships) ? n.ships : []
    })
  )

  // the grid is always TILES long, whatever the hull
  const grid: Cell[] = new Array(TILES).fill(null)
  for (let i = 0; i < TILES; i++) grid[i] = (s.grid[i] as Cell) ?? null
  s.grid = grid
  s.hold = Array.isArray(s.hold) ? s.hold : []
  s.cargo = Array.isArray(s.cargo) ? s.cargo : []
  s.crew = Array.isArray(s.crew) ? s.crew : []
  s.specs = Array.isArray(s.specs) ? s.specs : []
  s.visited = Array.isArray(s.visited) ? s.visited : [s.at ?? 0]
  s.log = Array.isArray(s.log) ? s.log : []

  // fields added after older saves were written
  if (typeof s.stage !== 'number') s.stage = 1
  if (typeof s.ambient !== 'number') s.ambient = Math.min(3, Math.floor((s.stage - 1) / 2))
  if (typeof s.delivered !== 'number') s.delivered = s.cargo.filter((c) => c.done).length

  // anything stowed in a cell this hull does not have goes back to the hold to
  // be re-stowed, rather than sitting in a bay that no longer exists
  const gone = new Set(s.hull.blocked ?? [])
  for (let i = 0; i < TILES; i++) {
    if (gone.has(i) && s.grid[i]) {
      s.hold.push(s.grid[i] as string)
      s.grid[i] = null
    }
  }

  // fuel cannot exceed the tanks actually fitted
  const cap = s.grid.filter((k) => k === 'TNK').length * 6
  if (typeof s.fuel !== 'number' || s.fuel < 0) s.fuel = 0
  s.fuel = Math.min(s.fuel, cap)

  return s
}
