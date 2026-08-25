import { useEffect, useRef } from 'react'
import { askJump } from '../engine/actions'
import { chartSvg } from './Chart'
import { Icon } from './Icon'

/* The chart is small and dense on a phone, so it pinches, wheels and drags.
   Zoom lives in a ref rather than state: it must not re-render the SVG on
   every pointer move. */

const MIN = 1
const MAX = 4

export function ChartView() {
  const view = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const z = useRef({ s: 1, x: 0, y: 0 })

  useEffect(() => {
    const el = view.current
    if (!el) return

    const apply = () => {
      if (inner.current) inner.current.style.transform = `translate(${z.current.x}px,${z.current.y}px) scale(${z.current.s})`
      el.style.touchAction = z.current.s > 1.01 ? 'none' : 'pan-y'
    }
    const clamp = () => {
      const c = z.current
      c.s = Math.max(MIN, Math.min(MAX, c.s))
      const w = el.clientWidth || 340
      const h = el.clientHeight || 400
      const mx = Math.max(0, (w * c.s - w) / 2)
      const my = Math.max(0, (h * c.s - h) / 2)
      c.x = Math.max(-mx, Math.min(mx, c.x))
      c.y = Math.max(-my, Math.min(my, c.y))
    }

    const pts = new Map<number, { x: number; y: number }>()
    let base: { d?: number; s?: number; m?: { x: number; y: number }; p?: { x: number; y: number }; x: number; y: number } | null = null
    const dist = () => {
      const [a, b] = [...pts.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const mid = () => {
      const [a, b] = [...pts.values()]
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return
      e.preventDefault()
      z.current.s *= Math.exp(-e.deltaY * 0.002)
      if (z.current.s <= 1.01) z.current = { s: z.current.s, x: 0, y: 0 }
      clamp()
      apply()
    }
    const onDown = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) base = { d: dist(), s: z.current.s, m: mid(), x: z.current.x, y: z.current.y }
      else if (pts.size === 1 && z.current.s > 1.01) {
        base = { p: { x: e.clientX, y: e.clientY }, x: z.current.x, y: z.current.y }
        el.setPointerCapture(e.pointerId)
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && base?.d) {
        e.preventDefault()
        z.current.s = base.s! * (dist() / base.d)
        const m = mid()
        z.current.x = base.x + (m.x - base.m!.x)
        z.current.y = base.y + (m.y - base.m!.y)
      } else if (pts.size === 1 && base?.p) {
        e.preventDefault()
        z.current.x = base.x + (e.clientX - base.p.x)
        z.current.y = base.y + (e.clientY - base.p.y)
      } else return
      clamp()
      apply()
    }
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      if (pts.size < 2) base = null
    }
    const onDbl = (e: MouseEvent) => {
      e.preventDefault()
      z.current = { s: z.current.s > 1.01 ? 1 : 2, x: 0, y: 0 }
      apply()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('dblclick', onDbl)
    apply()
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('dblclick', onDbl)
    }
  }, [])

  function zoomBy(k: number) {
    const c = z.current
    c.s = Math.max(MIN, Math.min(MAX, c.s * k))
    if (c.s <= 1.01) {
      c.x = 0
      c.y = 0
    }
    if (inner.current) inner.current.style.transform = `translate(${c.x}px,${c.y}px) scale(${c.s})`
  }

  return (
    <div className="chartcard">
      <div className="chartview" ref={view}>
        <div
          className="chartinner"
          ref={inner}
          dangerouslySetInnerHTML={{ __html: chartSvg() }}
          onClick={(e) => {
            const g = (e.target as Element).closest?.('[data-nd]')
            if (!g) return
            const id = Number(g.getAttribute('data-nd'))
            if (Number.isFinite(id)) askJump(id)
          }}
        />
      </div>
      <div className="zoombar">
        <button className="zbtn" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          <Icon k="MINUS" />
        </button>
        <button className="zbtn" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          <Icon k="PLUS" />
        </button>
        <span>pinch, scroll or double-tap to zoom</span>
      </div>
    </div>
  )
}
