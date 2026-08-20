import { W } from '../engine/data'
import { coord, outEdges } from '../engine/actions'
import { R } from '../engine/state'

/* The sector chart, kept as the prototype's string builder — every value
   in it is engine-generated, no user input ever reaches this markup. */
export function chartSvg(): string {
  const RW = 58,
    colW = 88,
    padX = 22,
    wide = W * colW
  const pos = (n: { r: number; c: number; n: number }) => ({
    x: padX + (n.n === 1 ? wide / 2 : (n.c + 0.5) * (wide / n.n)),
    y: 28 + n.r * RW
  })
  const open = outEdges().map((e) => e.b)
  let s = `<svg class="map" viewBox="0 0 ${wide + padX * 2} ${28 + (R.rowCount - 1) * RW + 28}">`
  R.edges.forEach((e) => {
    const a = pos(R.nodes[e.a]),
      b = pos(R.nodes[e.b])
    const seen = R.visited.includes(e.a) && R.visited.includes(e.b)
    s += `<line class="ln ${e.a === R.at || e.b === R.at ? 'open' : seen ? 'done' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`
  })
  R.nodes.forEach((n) => {
    const p = pos(n),
      me = n.id === R.at
    const off = R.cargo.filter((c) => !c.taken && !c.done && c.at === n.id) // work on offer here
    const carry = R.cargo.filter((c) => c.aboard && c.to === n.id) // drop for cargo aboard
    const later = R.cargo.filter((c) => !c.done && !c.aboard && c.to === n.id) // drop for work not yet taken
    if (n.warp) s += `<circle class="nd warpring" cx="${p.x}" cy="${p.y}" r="15"/>`
    if (carry.length || later.length) s += `<circle class="nd drop ${carry.length ? 'live' : ''}" cx="${p.x}" cy="${p.y}" r="13"/>`
    s += `<circle class="nd ${me ? 'here' : ''} ${open.includes(n.id) ? 'open' : ''} ${R.visited.includes(n.id) ? 'done' : ''} ${off.length ? 'part' : ''}" cx="${p.x}" cy="${p.y}" r="10"/>`
    s += `<text class="co" x="${p.x}" y="${p.y - 14}" text-anchor="middle">${coord(n)}</text>`
    const marks: string[] = []
    if (off.length) marks.push(`<tspan class="pt">+${off.map((c) => c.short.slice(-1)).join('')}</tspan>`)
    if (carry.length) marks.push(`<tspan class="en">→${carry.map((c) => c.short.slice(-1)).join('')}</tspan>`)
    if (later.length) marks.push(`<tspan class="lt">→${later.map((c) => c.short.slice(-1)).join('')}</tspan>`)
    if (marks.length) s += `<text x="${p.x}" y="${p.y + 19}" text-anchor="middle">${marks.join(' ')}</text>`
    const kind = n.warp ? 'WARP' : n.port ? 'PORT' : n.fuel ? 'fuel' : ''
    if (kind) s += `<text class="${n.warp ? 'wp' : ''}" x="${p.x}" y="${p.y + (marks.length ? 28 : 19)}" text-anchor="middle">${kind}</text>`
  })
  return s + `</svg>`
}
