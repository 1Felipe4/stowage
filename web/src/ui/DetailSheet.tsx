import {
  accept, buyMod, buyShip, closeDetail, coord, here, hire, jettison, payOff, sellMod, sellRate, sellValue, shipPrice,
  toggleFocus
} from '../engine/actions'
import { coverage, evaluate, modOf } from '../engine/core'
import { HIRES, HULLS, KINDS, MOD, bayName } from '../engine/data'
import { whyHire, whyMod } from '../engine/guidance'
import { R, emit, ui } from '../engine/state'
import type { ModCode } from '../engine/types'
import { Icon } from './Icon'

/* One sheet for everything you can point at: a market line, a stowed bay, a
   loose item, a crew member, a hire, a contract, an inspection check, a hull.
   Each answers the same three questions — what is it, what does it mean for
   this deck, and what can I do about it. */

interface Chip {
  icon: string
  text: string
  cls: string
  title: string
}
interface Line {
  icon: string
  text: string
  cls: string
}
interface Act {
  icon: string
  label: string
  kind: 'pri' | 'sec' | 'bad' | 'off'
  run: () => void
}
interface Sheet {
  icon: string
  cls: string
  kicker: string
  title: string
  chips: Chip[]
  lines: Line[]
  actions: Act[]
}

const chip = (icon: string, text: string, cls: string, title: string): Chip => ({ icon, text, cls, title })
const line = (icon: string, text: string, cls = 'blue'): Line => ({ icon, text, cls })
const act = (label: string, icon: string, kind: Act['kind'], run: () => void): Act => ({ label, icon, kind, run })

function modChips(k: ModCode): Chip[] {
  const m = MOD[k]
  const out: Chip[] = []
  if (m.power > 0) out.push(chip('BAT', `+${m.power} power`, 'green', 'makes power'))
  if (m.power < 0) out.push(chip('BAT', `${m.power} power`, 'red', 'draws power'))
  if (m.heat) out.push(chip('ALERT', `+${m.heat} heat`, 'amber', 'runs this hot in its own bay'))
  if (m.spill) out.push(chip('RCT', `spills ${m.spill}`, 'amber', 'pushes this into each touching bay'))
  if (m.cool) out.push(chip('CRY', `cools ${m.cool}`, 'blue', 'pulls this out of each touching bay'))
  if (m.fuel) out.push(chip('TNK', `holds ${m.fuel}`, 'blue', 'fuel capacity'))
  if (k === 'THR') out.push(chip('MASS', 'no mass, +4 cap', 'green', 'thrust cancels its own weight'))
  return out
}

function kindChips(kind: keyof typeof KINDS): Chip[] {
  const kd = KINDS[kind]
  const out: Chip[] = [chip('MASS', `weighs ${kd.weight}`, kd.weight > 1 ? 'amber' : '', 'mass on the deck')]
  if (kd.support) out.push(chip(kd.support, `needs ${MOD[kd.support].short.toLowerCase()}`, 'amber', 'support module required'))
  if (kd.crew) out.push(chip('CREW', `${kd.crew} tenders`, 'amber', 'souls needed to work it'))
  out.push(chip('COINS', `pays ×${kd.pay}`, 'green', 'fee multiplier for this kind'))
  return out
}

function build(): Sheet | null {
  const d = ui.detail
  if (!d) return null
  const res = evaluate(R.grid)
  const cov = coverage()
  const rate = sellRate()

  if (d.k === 'mod') {
    const k = d.id as ModCode
    const m = MOD[k]
    const w = whyMod(k)
    const stocked = here().stock.includes(k)
    const afford = R.credits >= m.price
    const noBay = !R.grid.includes(null)
    return {
      icon: m.icon,
      cls: w.need ? 'amber' : 'blue',
      kicker: w.need ? 'YOUR DECK NEEDS THIS' : 'MODULE',
      title: m.name,
      chips: modChips(k),
      lines: [
        line(m.icon, m.blurb),
        line('COINS', `${m.price} credits here${rate ? `, and this yard buys them back at ${Math.floor(m.price * rate)}` : ''}.`, 'amber'),
        ...(w.need ? [line('ALERT', w.s, 'amber')] : [])
      ],
      actions: stocked
        ? [
            act(
              noBay ? 'No clear bay' : afford ? `Buy for ${m.price}` : 'Not enough credits',
              'BAG',
              noBay || !afford ? 'off' : 'pri',
              () => {
                if (afford && !noBay) buyMod(k)
                closeDetail()
              }
            )
          ]
        : []
    }
  }

  if (d.k === 'bay') {
    const k = R.grid[d.id]
    const m = modOf(k)
    if (!m) return null
    const hv = res.heat[d.id]
    const idle = cov.active[d.id] === false
    const cap = R.hull.heatCap
    return {
      icon: m.icon,
      cls: m.cargo ? 'amber' : 'blue',
      kicker: `BAY ${bayName(d.id)}`,
      title: m.cargo?.goods ? `${m.cargo.short} · ${m.cargo.goods}` : m.name,
      chips: [
        ...(m.cargo ? kindChips(m.cargo.kind) : modChips(k as ModCode)),
        chip('ALERT', `${hv > 0 ? '+' : ''}${hv}`, hv > cap ? 'red' : hv > 0 ? 'amber' : 'blue', `this bay reads ${hv} of ${cap}`)
      ],
      lines: [
        line(m.icon, m.cargo ? m.cargo.rule : m.blurb ?? ''),
        ...(hv > cap
          ? [line('ALERT', `Running ${hv - cap} over the cap of ${cap}. Put cooling alongside, shield the source, or move it away.`, 'red')]
          : []),
        ...(idle ? [line('CREW', 'No hand left to run this bay. Hire another deckhand or carry less.', 'amber')] : []),
        line('STOWIN', 'Drag it to another bay to move it, or onto a stowed module to swap the two.', 'mut')
      ],
      actions: [
        ...(!m.cargo && rate
          ? [
              act(`Pawn for ${sellValue(k as ModCode)}`, 'COINS', 'sec', () => {
                sellMod(k as ModCode, 'bay', d.id)
                closeDetail()
              })
            ]
          : []),
        act(m.cargo ? 'Set down' : 'Dump', 'BAN', 'bad', () => {
          jettison(k as string)
          closeDetail()
        })
      ]
    }
  }

  if (d.k === 'hold') {
    const k = R.hold[d.id]
    const m = modOf(k)
    if (!m) return null
    return {
      icon: m.icon,
      cls: 'amber',
      kicker: 'LOOSE IN THE HOLD',
      title: m.cargo?.goods ? `${m.cargo.short} · ${m.cargo.goods}` : m.name,
      chips: m.cargo ? kindChips(m.cargo.kind) : modChips(k as ModCode),
      lines: [
        line(m.icon, m.cargo ? m.cargo.rule : m.blurb ?? '', 'amber'),
        line('STOWIN', 'Drag it into a clear bay, or tap it and then tap the bay. Nothing loose passes inspection.', 'mut')
      ],
      actions:
        !m.cargo && rate
          ? [
              act(`Pawn for ${sellValue(k as ModCode)}`, 'COINS', 'sec', () => {
                sellMod(k as ModCode, 'hold')
                closeDetail()
              })
            ]
          : []
    }
  }

  if (d.k === 'crew') {
    const id = R.crew[d.id]
    const h = HIRES[id]
    if (!h) return null
    const locked = !!(h.spec && R.cargo.some((c) => c.aboard && c.need === h.spec))
    return {
      icon: 'CREW',
      cls: 'blue',
      kicker: 'ABOARD',
      title: h.name,
      chips: [
        chip('MASS', h.deck ? 'runs 4 mass' : 'no deck work', h.deck ? 'green' : '', 'deck capacity this soul provides'),
        chip('COINS', `${R.wage} wages`, 'amber', 'paid at every warp')
      ],
      lines: [
        line('CREW', h.blurb, 'blue'),
        line('COINS', `${R.wage} comes out of your credits at every warp.`, 'amber'),
        ...(locked ? [line('BAN', 'Tied to cargo aboard — deliver it before paying them off.', 'red')] : [])
      ],
      actions: [
        act(locked ? 'Tied to cargo aboard' : `Pay off — stops ${R.wage} wages`, 'BAN', locked ? 'off' : 'bad', () => {
          if (!locked) payOff(d.id)
          closeDetail()
        })
      ]
    }
  }

  if (d.k === 'hire') {
    const h = HIRES[d.id as keyof typeof HIRES]
    if (!h) return null
    const w = whyHire(h.id)
    const afford = R.credits >= h.price
    return {
      icon: 'CREW',
      cls: w.need ? 'amber' : 'blue',
      kicker: 'HIRING HALL',
      title: h.name,
      chips: [
        chip('COINS', `${h.price} to sign`, 'amber', 'one-off fee'),
        chip('COINS', `${R.wage} a warp`, 'amber', 'recurring wages'),
        ...(h.deck ? [chip('MASS', 'runs 4 mass', 'green', 'deck capacity')] : [])
      ],
      lines: [
        line('CREW', h.blurb, 'blue'),
        line('COINS', `${h.price} to sign, then ${R.wage} wages at every warp.`, 'amber'),
        line('BRT', 'Every soul aboard needs a bunk and air. Fit them before you sign.', 'blue'),
        ...(w.need ? [line('ALERT', w.s, 'amber')] : [])
      ],
      actions: [
        act(afford ? `Hire for ${h.price}` : 'Not enough credits', 'CREW', afford ? 'pri' : 'off', () => {
          if (afford) hire(h.id)
          closeDetail()
        })
      ]
    }
  }

  if (d.k === 'cargo') {
    const c = R.cargo[d.id]
    if (!c) return null
    const gate = !!(c.need && !R.specs.includes(c.need))
    const noBay = !R.grid.includes(null)
    const canSign = !c.taken && !c.done && c.at === R.at
    return {
      icon: 'CARGO',
      cls: c.aboard ? 'green' : 'amber',
      kicker: c.done ? 'PAID' : c.aboard ? 'ABOARD' : c.taken ? 'SET DOWN' : 'UNSIGNED',
      title: c.goods ? `${c.short} · ${c.goods}` : c.short,
      chips: [
        ...kindChips(c.kind),
        chip('COINS', `+${c.fee}`, 'green', 'fee on delivery'),
        chip('ROUTE', `${coord(R.nodes[c.at])}→${coord(R.nodes[c.to])}`, 'blue', 'pickup and destination')
      ],
      lines: [
        line('CARGO', `${c.name}. ${c.rule}`, 'amber'),
        line('ROUTE', `Loads at ${coord(R.nodes[c.at])} and pays ${c.fee} when it signs over at ${coord(R.nodes[c.to])}.`, 'green'),
        ...(c.client ? [line('COINS', `Consigned by ${c.client}.`, 'mut')] : []),
        ...(gate ? [line('BAN', `You need a ${HIRES[c.need!].name.toLowerCase()} aboard before this will load.`, 'red')] : [])
      ],
      actions: canSign
        ? [
            act(gate ? `Needs a ${HIRES[c.need!].name.toLowerCase()}` : noBay ? 'No clear bay' : 'Sign and load', 'CARGO',
              gate || noBay ? 'off' : 'pri', () => {
                if (!gate && !noBay) accept(c.i)
                closeDetail()
              })
          ]
        : []
    }
  }

  if (d.k === 'check') {
    const c = res.checks.find((x) => x.lb === d.id)
    if (!c) return null
    const live = c.focus.filter((i) => i >= 0)
    return {
      icon: c.ok ? 'OKRING' : 'ALERT',
      cls: c.ok ? 'green' : 'red',
      kicker: c.ok ? 'CLEARS' : 'FAILS INSPECTION',
      title: c.lb.charAt(0) + c.lb.slice(1).toLowerCase(),
      chips: [],
      lines: [line(c.ok ? 'CHECK' : 'X', c.dt, c.ok ? 'green' : 'red')],
      actions: live.length
        ? [
            act('Show the bays', 'GRIDX', 'pri', () => {
              toggleFocus(live)
              ui.tab = 'deck'
              closeDetail()
            })
          ]
        : []
    }
  }

  if (d.k === 'ship') {
    const h = HULLS.find((x) => x.id === d.id)
    if (!h) return null
    const net = shipPrice(h.id)
    const mine = h.id === R.hull.id
    const afford = R.credits >= net
    return {
      icon: 'THR',
      cls: 'blue',
      kicker: mine ? 'YOUR HULL' : 'FOR SALE HERE',
      title: h.name,
      chips: [
        chip('GRIDX', `${20 - h.blocked.length} bays`, 'blue', 'usable bays on this hull'),
        chip('MASS', `base ${h.base}`, 'blue', 'capacity before engines'),
        chip('ALERT', `heat cap ${h.heatCap}`, h.heatCap > 5 ? 'green' : '', 'the hottest a bay may read'),
        chip('TNK', `fuel ×${h.fuelMult}`, h.fuelMult < 1 ? 'green' : h.fuelMult > 1 ? 'amber' : '', 'lane fuel multiplier')
      ],
      lines: [
        line('THR', h.blurb),
        ...(mine
          ? [line('CHECK', 'This is the hull you are flying.', 'green')]
          : [
              line('COINS', `${h.price} list, ${net} after trading in your ${R.hull.name.toLowerCase()}.`, 'amber'),
              line('STOWIN', 'Trading up moves every module into the hold — the new deck is a different shape to re-solve.', 'mut')
            ])
      ],
      actions: mine
        ? []
        : [
            act(afford ? `Trade up for ${net}` : 'Not enough credits', 'BAG', afford ? 'pri' : 'off', () => {
              if (afford) buyShip(h.id)
              closeDetail()
            })
          ]
    }
  }
  return null
}

export function DetailSheet() {
  const sheet = build()
  if (!sheet) return null
  return (
    <div className="overlay" onClick={closeDetail}>
      <div className="detailcard" onClick={(e) => e.stopPropagation()}>
        <div className="dhead">
          <span className={'dicon ' + sheet.cls}>
            <Icon k={sheet.icon} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {sheet.kicker && <div className={'dkick ' + sheet.cls}>{sheet.kicker}</div>}
            <div className="dtitle">{sheet.title}</div>
          </div>
          <button className="xbtn" onClick={closeDetail} aria-label="Close">
            <Icon k="X" />
          </button>
        </div>
        {sheet.chips.length > 0 && (
          <div className="dchips">
            {sheet.chips.map((c, i) => (
              <span className={'dchip ' + c.cls} key={i} title={c.title}>
                <Icon k={c.icon} />
                {c.text}
              </span>
            ))}
          </div>
        )}
        <div className="dlines">
          {sheet.lines.map((l, i) => (
            <div className="dline" key={i}>
              <Icon k={l.icon} cls={l.cls} />
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        {sheet.actions.length > 0 && (
          <div className="dacts">
            {sheet.actions.map((a, i) => (
              <button
                className={'dact ' + a.kind}
                key={i}
                disabled={a.kind === 'off'}
                onClick={() => {
                  a.run()
                  emit()
                }}
              >
                <Icon k={a.icon} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
