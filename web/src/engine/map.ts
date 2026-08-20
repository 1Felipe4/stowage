import { R } from './state'

export function dijkstra(src: number): number[] {
  const n = R.nodes.length,
    dist = new Array(n).fill(1e9)
  dist[src] = 0
  const seen = new Array(n).fill(false)
  for (let k = 0; k < n; k++) {
    let u = -1,
      b = 1e9
    for (let i = 0; i < n; i++)
      if (!seen[i] && dist[i] < b) {
        b = dist[i]
        u = i
      }
    if (u < 0) break
    seen[u] = true
    for (const e of R.adj![u]) if (dist[u] + e.cost < dist[e.to]) dist[e.to] = dist[u] + e.cost
  }
  return dist
}

export function buildAdj() {
  R.adj = R.nodes.map(() => [])
  R.edges.forEach((e) => {
    R.adj![e.a].push({ to: e.b, cost: e.cost })
    R.adj![e.b].push({ to: e.a, cost: e.cost })
  })
}

export function rebuildTransient() {
  buildAdj()
  R.D = R.nodes.map((_, i) => dijkstra(i))
}
