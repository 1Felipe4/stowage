import { useEffect, useRef } from 'react'
import { dropOn, openDetail } from '../engine/actions'
import type { Detail } from '../engine/state'

/* Pointer dragging for the deck. A short press-and-hold opens the detail
   sheet; moving past a few pixels instead starts a drag with a ghost that
   follows the finger. Dropping on a clear bay stows, dropping on a full one
   swaps. Listeners live on window so a drag survives leaving the tile. */

export type DragSrc = { t: 'bay'; i: number } | { t: 'hold'; n: number }

const HOLD_MS = 480
const SLOP = 7

interface Live {
  src: DragSrc
  x0: number
  y0: number
  on: boolean
  ghost?: HTMLDivElement
  hot?: HTMLElement | null
}

export function useDrag(iconFor: (src: DragSrc) => string) {
  const live = useRef<Live | null>(null)
  const holdTimer = useRef<number | null>(null)

  useEffect(() => {
    function clearHold() {
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current)
        holdTimer.current = null
      }
    }

    function paintTargets(on: boolean) {
      document.querySelectorAll<HTMLElement>('[data-bay]').forEach((el) => {
        if (!on) {
          el.style.outline = ''
          el.style.outlineOffset = ''
          el.style.boxShadow = ''
          return
        }
        const free = el.getAttribute('data-empty') === '1'
        el.style.outline = free ? '2px dashed rgba(59,130,246,.75)' : '1px dashed rgba(148,163,184,.35)'
        el.style.outlineOffset = '2px'
      })
    }

    function bayUnder(x: number, y: number): HTMLElement | null {
      const el = document.elementFromPoint(x, y)
      return el instanceof Element ? el.closest<HTMLElement>('[data-bay]') : null
    }

    function move(e: PointerEvent) {
      const d = live.current
      if (!d) return
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < SLOP) return
        d.on = true
        clearHold()
        const g = document.createElement('div')
        g.className = 'dragghost'
        g.innerHTML = iconFor(d.src)
        document.body.appendChild(g)
        d.ghost = g
        paintTargets(true)
      }
      e.preventDefault()
      if (d.ghost) d.ghost.style.transform = `translate(${e.clientX - 29}px,${e.clientY - 29}px)`
      const t = bayUnder(e.clientX, e.clientY)
      if (d.hot && d.hot !== t) d.hot.style.boxShadow = ''
      if (t) t.style.boxShadow = '0 0 0 3px rgba(59,130,246,.4)'
      d.hot = t
    }

    function end(e: PointerEvent | null) {
      const d = live.current
      clearHold()
      if (!d) return
      live.current = null
      d.ghost?.remove()
      paintTargets(false)
      if (!d.on || !e) return
      const t = bayUnder(e.clientX, e.clientY)
      if (!t) return
      const i = Number(t.getAttribute('data-bay'))
      if (Number.isFinite(i)) dropOn(d.src, i)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', () => end(null))
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      clearHold()
    }
  }, [iconFor])

  /** Attach to a bay tile or hold chip. `detail` is what a long press opens. */
  return function start(e: React.PointerEvent, src: DragSrc | null, detail: Detail) {
    if (!src || e.button) return
    live.current = { src, x0: e.clientX, y0: e.clientY, on: false }
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      // held still: they want to know what this is, not move it
      if (!live.current || live.current.on) return
      live.current = null
      openDetail(detail)
    }, HOLD_MS)
  }
}

/** Was the last gesture a drag? Tiles use this to swallow the click. */
export function draggedRecently(): boolean {
  return Date.now() - lastDrag < 250
}
let lastDrag = 0
export function markDragged() {
  lastDrag = Date.now()
}
