import { R, ui } from './state'
import { surcharge } from './core'

/* A plotted course: the player picks a far node on the chart and the bridge
   keeps showing which lane to burn next, so a multi-hop trip can't get lost.
   Purely advisory — it never moves the ship or changes costs. */

export interface Course {
  target: number
  /** node ids to pass through, in order, ending at the target */
  hops: number[]
  nextHop: number | null
  /** total fuel including the per-lane overmass surcharge */
  fuel: number
  /** edge keys on the route, for chart highlighting */
  edges: Set<string>
}

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

/** Greedy walk down the all-pairs distance table — always exact, since each
    step takes the neighbour that minimises (lane cost + remaining distance).
    Pass a target to preview a course without plotting it. */
export function courseInfo(target?: number): Course | null {
  const t = target ?? ui.course
  if (t === null || t === undefined || t === R.at || !R.D || !R.adj) return null
  if (!R.nodes[t]) return null
  const hops: number[] = []
  const edges = new Set<string>()
  let cur = R.at
  let lanes = 0
  const seen = new Set<number>([cur])
  while (cur !== t && hops.length <= R.nodes.length) {
    let best: { to: number; cost: number } | null = null
    let bestVal = Infinity
    for (const e of R.adj[cur]) {
      const v = e.cost + R.D[e.to][t]
      if (v < bestVal) {
        bestVal = v
        best = e
      }
    }
    if (!best || seen.has(best.to)) break
    seen.add(best.to)
    edges.add(edgeKey(cur, best.to))
    hops.push(best.to)
    lanes += best.cost
    cur = best.to
  }
  if (cur !== t) return null
  return { target: t, hops, nextHop: hops[0] ?? null, fuel: lanes + surcharge() * hops.length, edges }
}

export function setCourse(to: number) {
  ui.course = to === R.at ? null : to
}

export function clearCourse() {
  ui.course = null
}

/** Drop the course once we have arrived (called from jump). */
export function courseArrived() {
  if (ui.course === R.at) ui.course = null
}
