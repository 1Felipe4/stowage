import { R } from '../engine/state'
import { starLine, stars } from '../engine/rating'

/* Draws the end-of-run card to a canvas and hands back a PNG blob. Everything
   is painted by hand — no html2canvas, no network — so it works offline in the
   installed PWA and can never leak an external request. */

const W = 1080
const H = 1350

const C = {
  bg: '#05080F',
  grid: 'rgba(96,165,250,.05)',
  card: '#0B1320',
  card2: '#0A111C',
  line: '#1E293B',
  line2: '#16202F',
  ink: '#E2E8F0',
  ink2: '#F1F5F9',
  mut: '#94A3B8',
  mut2: '#7C8CA3',
  mut3: '#64748B',
  mut4: '#475569',
  blue: '#60A5FA',
  amber: '#F59E0B',
  green: '#34D399',
  red: '#F87171'
}

const SANS = "'Inter',system-ui,-apple-system,sans-serif"
const MONO = "'JetBrains Mono',ui-monospace,Menlo,monospace"

type ctx2d = CanvasRenderingContext2D

function rrect(ctx: ctx2d, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

function fillPanel(ctx: ctx2d, x: number, y: number, w: number, h: number, bg: string, border: string, r = 22) {
  rrect(ctx, x, y, w, h, r)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = border
  ctx.lineWidth = 2
  ctx.stroke()
}

function mono(ctx: ctx2d, size: number, weight = 500) {
  ctx.font = `${weight} ${size}px ${MONO}`
}
function sans(ctx: ctx2d, size: number, weight = 600) {
  ctx.font = `${weight} ${size}px ${SANS}`
}

/** Wrap text to a width, returning the y after the last line. */
function wrap(ctx: ctx2d, text: string, x: number, y: number, maxW: number, lh: number): number {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy)
      yy += lh
      line = w
    } else line = test
  }
  if (line) {
    ctx.fillText(line, x, yy)
    yy += lh
  }
  return yy
}

export interface ShareFacts {
  headline: string
  verdict: 'profit' | 'loss' | 'bust'
  sub: string
  hull: string
  stage: number
  cleared: number
  credits: number
  seed: string
  best?: number
  /** 0-5 against par, and the glyph row for it */
  stars?: number
  starRow?: string
  /** the last thing delivered, named — the bit people actually retell */
  lastRun?: string
  lines: { label: string; val: string; kind: 'up' | 'dn' | '' }[]
}

/** Everything the card shows, also reused for the text summary. */
export function shareFacts(): ShareFacts {
  const s = R.summary
  const cleared = R.over === 'clear'
  const paid = R.cargo.filter((c) => c.done)
  const last = paid[paid.length - 1]
  const lastRun = last?.goods ? `Last run: ${last.goods}${last.client ? ' for ' + last.client : ''}` : undefined
  if (s && cleared) {
    const capex = s.capex ?? 0
    const fuelSpend = s.spend - s.wages - s.penalty - capex
    return {
      headline: s.profit >= 0 ? `PROFIT ${s.profit}` : `LOSS ${Math.abs(s.profit)}`,
      verdict: s.profit >= 0 ? 'profit' : 'loss',
      sub: `Stage ${R.stage} cleared`,
      hull: R.hull.name,
      stage: R.stage,
      cleared: R.cleared,
      credits: R.credits,
      seed: R.seed,
      best: s.best,
      stars: stars(s.profit, s.best),
      starRow: starLine(stars(s.profit, s.best)),
      lastRun,
      lines: [
        { label: 'OPENED WITH', val: String(s.opening), kind: '' },
        { label: 'REVENUE', val: `+${s.revenue}`, kind: 'up' },
        { label: 'FUEL BURNED', val: fuelSpend > 0 ? `−${fuelSpend}` : `+${-fuelSpend}`, kind: fuelSpend > 0 ? 'dn' : 'up' },
        { label: 'KIT & CREW (KEPT)', val: capex > 0 ? `−${capex}` : `+${-capex}`, kind: capex > 0 ? 'dn' : 'up' },
        { label: 'WAGES', val: `−${s.wages}`, kind: 'dn' },
        ...(s.penalty ? [{ label: 'FORFEITS', val: `−${s.penalty}`, kind: 'dn' as const }] : []),
        { label: 'CLOSED WITH', val: String(R.credits), kind: '' }
      ]
    }
  }
  return {
    headline: 'BUST',
    verdict: 'bust',
    sub: R.overWhy || 'The run is over',
    hull: R.hull.name,
    stage: R.stage,
    cleared: R.cleared,
    credits: R.credits,
    seed: R.seed,
    lastRun,
    lines: []
  }
}

/** A one-tap-pasteable text version, for chats that strip images. */
export function shareText(f: ShareFacts): string {
  const bits = [
    `STOWAGE — ${f.headline}`,
    `${f.hull} · stage ${f.stage} · ${f.cleared} cleared · ${f.credits} credits`,
    ...(f.starRow ? [`${f.starRow}  ${f.stars}/5 against par ${f.best}`] : []),
    ...(f.lastRun ? [f.lastRun] : []),
    `Plan ${f.seed}`
  ]
  return bits.join('\n')
}

export async function drawShareCard(): Promise<{ blob: Blob; url: string; facts: ShareFacts }> {
  const f = shareFacts()
  // make sure the webfonts are rasterisable before we paint with them
  if (document.fonts?.load) {
    try {
      await Promise.all([
        document.fonts.load('800 96px Inter'),
        document.fonts.load('600 30px Inter'),
        document.fonts.load('500 26px "JetBrains Mono"'),
        document.fonts.ready
      ])
    } catch {
      /* fall back to whatever is available */
    }
  }

  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!

  // ground + faint deck grid
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = C.grid
  ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  const PAD = 72
  const accent = f.verdict === 'profit' ? C.green : f.verdict === 'loss' ? C.amber : C.red

  // wordmark
  ctx.textBaseline = 'alphabetic'
  sans(ctx, 44, 800)
  ctx.fillStyle = C.ink2
  ctx.fillText('STOW', PAD, PAD + 34)
  const wmW = ctx.measureText('STOW').width
  ctx.fillStyle = C.blue
  ctx.fillText('AGE', PAD + wmW, PAD + 34)
  mono(ctx, 22, 500)
  ctx.fillStyle = C.mut3
  ctx.textAlign = 'right'
  ctx.fillText(`PLAN ${f.seed}`, W - PAD, PAD + 32)
  ctx.textAlign = 'left'

  // headline block
  let y = PAD + 120
  fillPanel(ctx, PAD, y, W - PAD * 2, 236, C.card, C.line, 26)
  // accent edge
  rrect(ctx, PAD, y, 10, 236, 6)
  ctx.fillStyle = accent
  ctx.fill()

  mono(ctx, 22, 600)
  ctx.fillStyle = accent
  ctx.fillText(f.verdict === 'bust' ? 'RUN ENDED' : 'STAGE CLEARED', PAD + 44, y + 56)

  sans(ctx, 104, 800)
  ctx.fillStyle = accent
  ctx.fillText(f.headline, PAD + 40, y + 158)

  sans(ctx, 27, 500)
  ctx.fillStyle = C.mut
  const subEnd = wrap(ctx, f.sub, PAD + 44, y + 202, W - PAD * 2 - 88, 34)
  if (f.lastRun) {
    mono(ctx, 20, 500)
    ctx.fillStyle = C.mut3
    ctx.fillText(f.lastRun.toUpperCase(), PAD + 44, Math.min(subEnd + 4, y + 224))
  }

  // stat tiles
  y += 236 + 26
  const tiles: { l: string; v: string; c: string }[] = [
    { l: 'STARTING SHIP', v: f.hull.toUpperCase(), c: C.ink },
    { l: 'STAGE REACHED', v: String(f.stage), c: C.blue },
    { l: 'STAGES CLEARED', v: String(f.cleared), c: C.green },
    { l: 'CREDITS', v: String(f.credits), c: C.amber }
  ]
  const tw = (W - PAD * 2 - 22) / 2
  const th = 150
  tiles.forEach((t, i) => {
    const tx = PAD + (i % 2) * (tw + 22)
    const ty = y + Math.floor(i / 2) * (th + 22)
    fillPanel(ctx, tx, ty, tw, th, C.card2, C.line2, 22)
    mono(ctx, 20, 500)
    ctx.fillStyle = C.mut3
    ctx.fillText(t.l, tx + 26, ty + 46)
    // ship name is long — shrink it to fit rather than clipping
    let size = 46
    sans(ctx, size, 700)
    while (ctx.measureText(t.v).width > tw - 52 && size > 22) {
      size -= 2
      sans(ctx, size, 700)
    }
    ctx.fillStyle = t.c
    ctx.fillText(t.v, tx + 26, ty + 112)
  })
  y += th * 2 + 22 + 26

  // ledger, when the stage actually closed a book
  if (f.lines.length) {
    const lh = 62
    const boxH = 34 + f.lines.length * lh + 18
    fillPanel(ctx, PAD, y, W - PAD * 2, boxH, C.card, C.line, 22)
    let ly = y + 62
    f.lines.forEach((l, i) => {
      const last = i === f.lines.length - 1
      mono(ctx, 21, 500)
      ctx.fillStyle = C.mut3
      ctx.fillText(l.label, PAD + 30, ly)
      mono(ctx, last ? 30 : 27, last ? 600 : 500)
      ctx.fillStyle = l.kind === 'up' ? C.green : l.kind === 'dn' ? C.red : C.ink2
      ctx.textAlign = 'right'
      ctx.fillText(l.val, W - PAD - 30, ly)
      ctx.textAlign = 'left'
      if (!last) {
        ctx.strokeStyle = 'rgba(30,41,59,.7)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(PAD + 30, ly + 20)
        ctx.lineTo(W - PAD - 30, ly + 20)
        ctx.stroke()
      }
      ly += lh
    })
    y += boxH + 26
  }

  if (f.starRow) {
    sans(ctx, 40, 700)
    ctx.fillStyle = f.stars! >= 5 ? C.amber : f.stars! >= 4 ? C.green : f.stars! >= 3 ? C.blue : C.mut2
    ctx.fillText(f.starRow, PAD, y + 34)
    const starW = ctx.measureText(f.starRow).width
    mono(ctx, 20, 500)
    ctx.fillStyle = C.mut4
    ctx.fillText(`${f.stars}/5 AGAINST A PAR OF ${f.best}`, PAD + starW + 24, y + 30)
    y += 66
  }

  // footer
  mono(ctx, 23, 500)
  ctx.fillStyle = C.mut3
  ctx.fillText('PACK THE DECK · WORK THE LANES · JUMP OUT AHEAD', PAD, H - PAD - 34)
  ctx.fillStyle = C.blue
  ctx.fillText(location.host || 'stowage', PAD, H - PAD + 4)

  const blob = await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error('canvas is empty'))), 'image/png')
  )
  return { blob, url: URL.createObjectURL(blob), facts: f }
}
