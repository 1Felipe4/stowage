import { useEffect, useRef, useState } from 'react'
import {
  accept, askJump, buyFuel, buyMod, callIt, cancelJump, confirmJump, coord, doWarp, dropCourse, here, hire, jettison,
  outEdges, payOff, plotCourse, runOrder, scuttle, sellMod, sellRate, sellValue, shipOK, stuckReason, tapBay, tapHold,
  toggleFocus
} from '../engine/actions'
import { coverage, evaluate, fuelCap, massOf, modOf, souls, surcharge } from '../engine/core'
import { courseInfo } from '../engine/course'
import { HIRES, KINDS, MOD, TILES, bayName } from '../engine/data'
import { orders, whyHire, whyMod, type Why } from '../engine/guidance'
import { R, emit, ui, type PortTab, type Tab } from '../engine/state'
import { TUT } from '../engine/teach'
import type { Cargo, Check, ModCode } from '../engine/types'
import { chartSvg } from './Chart'
import { Icon } from './Icon'

function setTab(t: Tab) {
  ui.tab = t
  emit()
}
function setPortTab(t: PortTab) {
  ui.portTab = t
  emit()
}

function NeedTag({ w }: { w: Why }) {
  if (!w.need) return null
  return <i className="tagpill">NEED{w.need > 1 ? ` ×${w.need}` : ''}</i>
}

/* Arm-then-confirm purchase: first tap turns the price into a question,
   second tap within 3.5s commits. Disarms on its own. */
function ConfirmBuy({ price, disabled, blocked, want, onBuy }: {
  price: number
  disabled: boolean
  blocked?: string
  want?: boolean
  onBuy: () => void
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3500)
    return () => window.clearTimeout(t)
  }, [armed])
  if (blocked)
    return (
      <button className="btn" disabled title={blocked}>
        {blocked}
      </button>
    )
  return (
    <button
      className={'btn ' + (armed ? 'pri' : want ? 'want' : '')}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          onBuy()
          setArmed(false)
        } else setArmed(true)
      }}
    >
      {armed ? `PAY ${price}?` : price}
    </button>
  )
}

function ScuttleButton() {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <div className="abandon">
      <button className={'btn' + (armed ? ' armed' : '')} onClick={() => (armed ? scuttle() : setArmed(true))}>
        {armed ? 'TAP AGAIN — END THE RUN' : 'SCUTTLE SHIP · END RUN'}
      </button>
      <span>
        {armed
          ? 'Sinks the ship. The run ends as a bust.'
          : 'Give up and sink the ship — only if you have truly worked yourself into a corner.'}
      </span>
    </div>
  )
}

/* The plotted-burn confirmation: destination, what's there, fuel maths,
   what pays on arrival. Nothing moves until the go button. */
function ConfirmBurn() {
  const c = ui.confirm!
  const d = R.nodes[c.to]
  // a far node cannot be burned to in one hop, but it can be plotted
  const far = !outEdges().some((e) => e.b === c.to)
  const plot = far ? courseInfo(c.to) : null
  const what: string[] = []
  if (d.port) what.push(`Yard, ${d.stock.length} lines`)
  if (d.hires.length) what.push('hiring hall')
  if (d.fuel) what.push(`fuel at ${d.fuel}`)
  if (d.warp) what.push('warp point')

  const flags: { k: string; cls: string; txt: string }[] = []
  R.cargo.forEach((x) => {
    const what = x.goods ? `${x.short} (${x.goods})` : x.short
    if (x.aboard && x.to === c.to)
      flags.push({ k: 'COINS', cls: 'green', txt: `${what} signs over${x.client ? ' to ' + x.client : ''} on arrival. Pays ${x.fee}.` })
    if (!x.taken && !x.done && x.at === c.to) flags.push({ k: 'CARGO', cls: 'amber', txt: `${what} is on offer there for ${x.fee}.` })
  })
  const wantThere = d.stock.filter((k) => whyMod(k).need > 0)
  if (wantThere.length) flags.push({ k: 'BAG', cls: 'amber', txt: `${wantThere.map((k) => MOD[k].name).join(', ')} in stock there.` })
  if (c.why) flags.push({ k: 'BAN', cls: 'red', txt: c.why })

  return (
    <div className="overlay" onClick={cancelJump}>
      <div className="confirmcard" onClick={(e) => e.stopPropagation()}>
        <div className={'kick' + (c.why ? ' bad' : '')}>
          <Icon k={c.why ? 'ALERT' : 'ROUTE'} />
          <span>{c.why ? 'CANNOT BURN' : 'CONFIRM BURN'}</span>
        </div>
        <div className="chd">
          <div className="cc">{coord(d)}</div>
          <div className="cw">{what.length ? what.join(' · ') : 'Bare rock, nothing to buy'}</div>
        </div>
        <div className="cstats">
          <div className="cstat">
            <div className="sl">FUEL BURN</div>
            <div className={'sv ' + (c.lane ? (c.cost > R.fuel ? 'red' : 'blue') : '')}>{c.lane ? c.cost : '—'}</div>
            <div className="ss">
              {c.lane ? (c.sur ? `lane ${c.lane} + ${c.sur} overmass` : `lane ${c.lane}, no overmass`) : 'no lane'}
            </div>
          </div>
          <div className="cstat">
            <div className="sl">FUEL AFTER</div>
            <div className="sv">{c.lane ? Math.max(0, R.fuel - c.cost) : R.fuel}</div>
            <div className="ss">of {fuelCap()} held</div>
          </div>
        </div>
        {flags.length > 0 && (
          <div className="cflags">
            {flags.map((f, i) => (
              <div className={'cflag ' + f.cls} key={i}>
                <Icon k={f.k} />
                <span>{f.txt}</span>
              </div>
            ))}
          </div>
        )}
        <div className="cbtns">
          <button className="btn" onClick={cancelJump}>
            {c.why ? 'Close' : `Stay at ${coord(here())}`}
          </button>
          {!c.why && (
            <button className="btn pri go" onClick={confirmJump}>
              Burn {c.cost} and go
            </button>
          )}
          {c.why && plot && (
            <button className="btn want go" onClick={() => plotCourse(c.to)}>
              Set course · {plot.hops.length} hops, {plot.fuel} fuel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const SUPPORT_TEXT: Record<string, string> = {
  SHD: 'needs shielding on every touching bay',
  CRY: 'needs a cryo unit alongside',
  LSP: 'needs life support alongside'
}

export function RunView() {
  const res = evaluate(R.grid)
  const o = orders()
  const n = here()
  const bad = res.checks.filter((c) => !c.ok)
  const gridRef = useRef<HTMLDivElement>(null)
  const stuckWhy = stuckReason()
  const sur = surcharge()
  const cov = coverage()
  const mass = massOf()
  const overMass = Math.max(0, mass - cov.capM)
  const stowedBays = R.grid.filter(Boolean).length
  const course = courseInfo()
  const crewLine = cov.hands
    ? `${cov.hands} hand${cov.hands > 1 ? 's' : ''} run${cov.hands > 1 ? '' : 's'} ${cov.capM} mass · ` +
      (cov.idle.length ? `${stowedBays - cov.idle.length} bays active, ${cov.idle.length} with no hand` : 'every stowed bay covered')
    : 'Nobody working the deck · every stowed bay idle'
  const placing = ui.sel?.t === 'hold'
  const selMod = ui.sel ? modOf(ui.sel.t === 'bay' ? R.grid[ui.sel.i] : R.hold[ui.sel.n]) : null

  // the DELIVERED banner survives exactly one paint, like the prototype
  useEffect(() => {
    R.paid = null
  })

  /* Guided run: step through TUT as each goal is met, pulling the player to
     the pane the next step is about. Steps already satisfied are skipped. */
  const tutStep = ui.tut && ui.tut.i < TUT.length ? TUT[ui.tut.i] : null
  const tutDone = !!ui.tut && ui.tut.i >= TUT.length
  useEffect(() => {
    if (!ui.tut) return
    let i = ui.tut.i
    while (i < TUT.length && TUT[i].done()) i++
    if (i !== ui.tut.i) {
      ui.tut = { i }
      const step = TUT[i]
      if (step) {
        ui.tab = step.tab
        if (step.portTab) ui.portTab = step.portTab
      }
      emit()
    }
  })

  const needStock = n.stock.filter((k) => whyMod(k).need > 0)
  const shelfStock = n.stock.filter((k) => whyMod(k).need === 0)

  const room = fuelCap() - R.fuel
  const afford = n.fuel ? Math.floor(R.credits / n.fuel) : 0
  const heldTanks = R.hold.filter((k) => k === 'TNK').length
  const fuelNote =
    room <= 0
      ? heldTanks
        ? `Tanks are full. The ${heldTanks} tank${heldTanks > 1 ? 's' : ''} in your hold add nothing until stowed in a bay.`
        : fuelCap() === 0
          ? 'No tanks fitted — fuel has nowhere to go. Buy a fuel tank first.'
          : `Tanks are full at ${fuelCap()}. Fit another tank to carry more.`
      : afford <= 0
        ? `You cannot afford a single unit at ${n.fuel}.`
        : `${R.fuel} aboard, room for ${room} more.`

  const warpWhy = n.warp ? (!shipOK() ? 'DECK FAILS INSPECTION' : R.fuel < R.warpCost ? `NEED ${R.warpCost} FUEL` : null) : null
  const forf = R.cargo.filter((c) => c.taken && !c.done)

  function checkTap(c: Check) {
    const live = c.focus.filter((i) => i >= 0)
    if (!live.length) return
    toggleFocus(live)
    setTab('deck')
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /* Attention per port sub-tab, so the tab bar can say which one to open. */
  const attention = {
    market:
      needStock.length +
      (n.fuel && R.credits >= n.fuel && fuelCap() > R.fuel && R.fuel <= 4 ? 1 : 0),
    crew: n.hires.filter((id) => whyHire(id).need > 0).length,
    contracts: R.cargo.filter(
      (c) => (!c.taken && !c.done && c.at === R.at && R.grid.includes(null)) || (!c.done && c.to === R.at && !c.aboard)
    ).length
  }

  const sortedChecks = res.checks.slice().sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? 1 : -1))

  function stockRow(k: ModCode, hi: boolean) {
    const mm = MOD[k]
    const w = whyMod(k)
    return (
      <div className={'row' + (hi ? ' want' : '')} key={'stock' + k}>
        <div className="l">
          <Icon k={mm.icon} />
          <div style={{ minWidth: 0 }}>
            <div className="nm">
              {mm.name}
              {hi ? <NeedTag w={w} /> : null}
            </div>
            <div className="ds">{w.s}</div>
          </div>
        </div>
        <div className="side">
          <ConfirmBuy
            price={mm.price}
            want={hi}
            disabled={R.credits < mm.price}
            blocked={R.grid.includes(null) ? undefined : 'NO BAY'}
            onBuy={() => buyMod(k)}
          />
        </div>
      </div>
    )
  }

  function contractCard(c: Cargo) {
    const kd = KINDS[c.kind]
    const gate = !!(c.need && !R.specs.includes(c.need))
    const noBay = !R.grid.includes(null)
    const canSign = !c.taken && !c.done && c.at === R.at
    const dropHere = !c.done && c.to === R.at
    const state = c.done
      ? { t: 'PAID', cls: 'green' }
      : c.aboard
        ? dropHere
          ? { t: 'DROP HERE', cls: 'green' }
          : { t: 'ABOARD', cls: 'green' }
        : dropHere
          ? { t: 'DELIVERS HERE', cls: 'green' }
          : canSign
            ? { t: 'ON OFFER HERE', cls: '' }
            : c.taken
              ? { t: 'SET DOWN', cls: 'gray' }
              : { t: 'UNSIGNED', cls: 'gray' }
    const costs: string[] = []
    if (canSign) {
      if (c.support) costs.push(SUPPORT_TEXT[c.support])
      if (c.crew) costs.push(`${R.specs.includes('VET') ? 1 : 2} tenders aboard`)
      costs.push(`weighs ${kd.weight}`)
    }
    return (
      <div className={'ccard' + (c.aboard ? ' aboard' : '')} key={'con' + c.i}>
        <div className="chead">
          <div className="cl">
            <div className="cn">
              <Icon k="CARGO" />
              <b>{c.short}</b>
              <i className={'tagpill ' + state.cls}>{state.t}</i>
            </div>
            <div className="cd">
              {c.goods ? (
                <>
                  <b className="goods">{c.goods}</b>
                  {c.client ? <> for {c.client}</> : null} · {c.name.toLowerCase()}
                </>
              ) : (
                c.name
              )}
              {' · '}
              {c.rule}
              {costs.length ? <b style={{ color: 'var(--red2)' }}> {costs.join(', ')}.</b> : null}
            </div>
          </div>
          <div className="cr">
            <div className="cf">{c.fee}</div>
            <div className="cro">
              {coord(R.nodes[c.at])} → {coord(R.nodes[c.to])}
            </div>
          </div>
        </div>
        {canSign && (
          <button className="btn wide pri" disabled={gate || noBay} onClick={() => accept(c.i)}>
            {gate ? `LOCKED — NEEDS A ${HIRES[c.need!].name.toUpperCase()}` : noBay ? 'NO CLEAR BAY' : 'SIGN AND LOAD'}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className={'directive ' + (tutStep || tutDone ? 'tut' : o.k)}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {tutStep && (
            <div className="kick">
              TUTORIAL · STEP {ui.tut!.i + 1} OF {TUT.length}
            </div>
          )}
          {tutDone && <div className="kick">TUTORIAL · DONE</div>}
          <div className="dt">{tutStep ? tutStep.title : tutDone ? 'That is the whole game.' : o.t}</div>
          <div className="ds">
            {tutStep
              ? tutStep.body
              : tutDone
                ? 'Stow, clear the checks, burn, get paid. The rest is deciding what to leave behind.'
                : o.s}
          </div>
        </div>
        {tutStep || tutDone ? (
          <button
            className="btn cta"
            onClick={() => {
              ui.tut = null
              emit()
            }}
          >
            {tutDone ? 'Free play' : 'Skip tutorial'}
          </button>
        ) : (
          <button className="btn cta" onClick={() => runOrder(o.act)}>
            <span className="ctalabel">{o.cta}</span>
            <Icon k="CHEV" />
          </button>
        )}
      </div>

      <div className="panes">
        {/* ---------------- PORT ---------------- */}
        <section className={'pane pane-port' + (ui.tab === 'port' ? ' on' : '') + (tutStep?.tab === 'port' ? ' lit' : '')}>
          <div className="seg">
            {(['market', 'crew', 'contracts'] as PortTab[]).map((t) => (
              <button className={ui.portTab === t ? 'on' : ''} key={t} onClick={() => setPortTab(t)}>
                {t === 'market' ? 'Market' : t === 'crew' ? 'Crew' : 'Contracts'}
                {attention[t] > 0 && <i className="segdot" />}
              </button>
            ))}
          </div>

          {ui.portTab === 'market' && (
            <div className="port-body">
              {n.fuel ? (
                <div className="row">
                  <div className="l">
                    <Icon k="FUEL" />
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">Fuel · {n.fuel} each</div>
                      <div className="ds">{fuelNote}</div>
                    </div>
                  </div>
                  <div className="side" style={{ display: 'flex', gap: 4 }}>
                    <button className="btn" disabled={room < 1 || afford < 1} onClick={() => buyFuel(1)}>
                      +1
                    </button>
                    <button className="btn" disabled={room < 1 || afford < 1} onClick={() => buyFuel(5)}>
                      +5
                    </button>
                    <button className="btn" disabled={room < 1 || afford < 1} onClick={() => buyFuel(999)}>
                      Fill
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-note">No fuel line. You leave on the {R.fuel} you arrived with.</div>
              )}

              {needStock.length > 0 && (
                <>
                  <div className="sec-amber">NEEDED FOR YOUR DECK</div>
                  {needStock.map((k) => stockRow(k, true))}
                </>
              )}
              {shelfStock.length > 0 && (
                <>
                  <div className="sec-dim">ALSO ON THE SHELF</div>
                  {shelfStock.map((k) => stockRow(k, false))}
                </>
              )}
              {n.port ? (
                <div className="dashcard">
                  <Icon k="TAGI" />
                  <div>
                    This yard buys back at <b>{Math.round(sellRate() * 100)}%</b>. Tap a stowed module to pawn it.
                  </div>
                </div>
              ) : !n.fuel ? (
                <div className="empty-note">Bare rock. Nothing for sale here.</div>
              ) : null}
            </div>
          )}

          {ui.portTab === 'crew' && (
            <div className="port-body">
              <div className="statrow">
                <div className="stat">
                  <div className="sl">SOULS ABOARD</div>
                  <div className="sv">{souls()}</div>
                </div>
                <div className="stat">
                  <div className="sl">WAGE AT WARP</div>
                  <div className="sv amber">{R.crew.length * R.wage}</div>
                </div>
              </div>
              {R.crew.map((id, i) => {
                const locked = !!(HIRES[id].spec && R.cargo.some((c) => c.aboard && c.need === HIRES[id].spec))
                return (
                  <div className="row" key={'crew' + i}>
                    <div className="l">
                      <Icon k="CREW" />
                      <div style={{ minWidth: 0 }}>
                        <div className="nm">{HIRES[id].name}</div>
                        <div className="ds">
                          {HIRES[id].deck ? 'Runs 4 mass' : 'Does not work the deck'} · {R.wage} wages
                          {locked ? ' · tied to cargo aboard' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="side">
                      <button className="btn" disabled={locked} onClick={() => payOff(i)}>
                        Pay off
                      </button>
                    </div>
                  </div>
                )
              })}
              <div className="sec-dim">HIRING HALL</div>
              {n.hires.length ? (
                n.hires.map((id, ix) => {
                  const w = whyHire(id)
                  const hh = HIRES[id]
                  return (
                    <div className={'row' + (w.need ? ' want' : '')} key={'hire' + id + ix}>
                      <div className="l">
                        <Icon k="CREW" />
                        <div style={{ minWidth: 0 }}>
                          <div className="nm">
                            {hh.name}
                            <NeedTag w={w} />
                          </div>
                          <div className="ds">{w.s}</div>
                        </div>
                      </div>
                      <div className="side">
                        <ConfirmBuy price={hh.price} want={w.need > 0} disabled={R.credits < hh.price} onBuy={() => hire(id)} />
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="empty-note">No one is hiring here.</div>
              )}
            </div>
          )}

          {ui.portTab === 'contracts' && (
            <div className="port-body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="sec-h">
                  CONTRACTS · {R.cargo.filter((c) => c.done).length} OF {R.cargo.length} DELIVERED
                </div>
              </div>
              {R.cargo.map((c) => contractCard(c))}
            </div>
          )}
        </section>

        {/* ---------------- DECK ---------------- */}
        <section className={'pane pane-deck' + (ui.tab === 'deck' ? ' on' : '') + (tutStep?.tab === 'deck' ? ' lit' : '')}>
          {R.event && (
            <div className="banner">
              <div style={{ minWidth: 0 }}>
                <div className="bt">EN ROUTE · {R.event.t}</div>
                <div className="bx">{R.event.x}</div>
              </div>
            </div>
          )}
          {R.paid ? (
            <div className="banner ok">
              <div style={{ minWidth: 0 }}>
                <div className="bt">DELIVERED</div>
                <div className="bx">Signed over for {R.paid} credits.</div>
              </div>
            </div>
          ) : null}

          <div className="deck-head">
            <div className="sec-h">DECK · {R.hull.name.toUpperCase()}</div>
            {R.ambient > 0 && (
              <div className="ambient" title={`This deep in, every bay runs ${R.ambient} hotter.`}>
                AMBIENT +{R.ambient}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div className={'pill ' + (bad.length ? 'bad' : 'ok')}>
              <Icon k={bad.length ? 'ALERT' : 'OKRING'} />
              <span>{bad.length ? `${bad.length} PROBLEM${bad.length > 1 ? 'S' : ''}` : 'CLEARS INSPECTION'}</span>
            </div>
          </div>

          <div className="crewstrip">
            <div className="cl">
              <span className="k">DECK CREW</span>
              <span className="t">{crewLine}</span>
              <button
                className={'st' + (!cov.hands ? ' none' : cov.idle.length ? ' over' : '')}
                onClick={() => {
                  if (!cov.hands) {
                    setTab('port')
                    setPortTab('crew')
                  } else if (cov.idle.length) {
                    toggleFocus(cov.idle)
                    setTab('deck')
                  }
                }}
              >
                {!cov.hands
                  ? 'hire a deckhand'
                  : cov.idle.length
                    ? `show the ${cov.idle.length} idle · +${sur} fuel a burn`
                    : 'within the crew'}
              </button>
            </div>
            <div className="csegs">
              {Array.from({ length: Math.max(cov.hands, 1) }, (_, i) => {
                const carried = Math.max(0, Math.min(4, mass - 4 * i))
                return (
                  <div
                    className={'cseg' + (cov.hands ? '' : ' none')}
                    key={'seg' + i}
                    title={cov.hands ? `One hand runs 4 mass. This one is carrying ${carried}.` : 'No hands aboard.'}
                  >
                    <i style={{ width: `${cov.hands ? (carried / 4) * 100 : 0}%` }} />
                  </div>
                )
              })}
              {overMass > 0 && (
                <div
                  className="cseg overf"
                  style={{ flexBasis: Math.min(40, overMass * 12) }}
                  title={`${overMass} mass beyond what the crew can run.`}
                >
                  <i style={{ width: '100%' }} />
                </div>
              )}
            </div>
          </div>

          <div className="gridwrap">
            <div className="grid" ref={gridRef}>
              {Array.from({ length: TILES }, (_, i) => {
                const k = R.grid[i],
                  mm = modOf(k),
                  ht = res.heat[i]
                const over = !!k && ht > 5
                const idle = !!k && cov.active[i] === false
                const cls = [
                  'cell',
                  k ? '' : placing ? 'place' : 'empty',
                  k && k[0] === '@' ? 'cargo' : '',
                  k === 'RCT' ? 'rct' : '',
                  k === 'RAD' || k === 'CRY' ? 'cold' : '',
                  idle ? 'idle' : '',
                  ui.sel && ui.sel.t === 'bay' && ui.sel.i === i ? 'sel' : '',
                  ui.focus.includes(i) ? 'foc' : '',
                  over ? 'over' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
                const htCls = over ? 'over' : ht >= 3 ? 'warm' : ht < 0 ? 'chill' : ''
                return (
                  <div
                    className={cls}
                    key={i}
                    tabIndex={0}
                    title={
                      mm
                        ? `${mm.name} at ${bayName(i)} — heat ${ht}` +
                          (idle ? ' — no hand left to run it' : k === 'THR' ? ' — weighs nothing, runs itself' : ' — run by the crew')
                        : `Bay ${bayName(i)} clear`
                    }
                    onClick={() => tapBay(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        tapBay(i)
                      }
                    }}
                  >
                    <span className="bayn">{bayName(i)}</span>
                    <span className={'ht ' + htCls}>
                      {ht > 0 ? '+' : ''}
                      {ht}
                    </span>
                    {mm ? (
                      <>
                        <Icon k={mm.icon} />
                        <span className="code">{mm.short}</span>
                        {idle ? <span className="nohand">NO HAND</span> : null}
                      </>
                    ) : (
                      <>
                        <Icon k={placing ? 'PLUS' : 'MINUS'} />
                        <span className="code">{placing ? 'STOW' : 'clear'}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="deck-body">
            {R.hold.length > 0 && (
              <div className="holdcard">
                <div className="hh">
                  <Icon k="STOWIN" />
                  <span>IN THE HOLD — TAP ONE, THEN TAP A CLEAR BAY</span>
                </div>
                <div className="chips">
                  {R.hold.map((k, i) => {
                    const mm = modOf(k)!
                    return (
                      <button
                        className={'chip' + (ui.sel && ui.sel.t === 'hold' && ui.sel.n === i ? ' sel' : '')}
                        key={'hold' + i}
                        onClick={() => tapHold(i)}
                      >
                        <Icon k={mm.icon} />
                        <span>{mm.short}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {selMod && (
              <div className="selcard">
                <div style={{ minWidth: 0 }}>
                  <div className="nm">
                    {selMod.cargo?.goods ? `${selMod.cargo.short} · ${selMod.cargo.goods}` : selMod.name}
                  </div>
                  <div className="ds">
                    {selMod.cargo
                      ? (selMod.cargo.client ? `Consigned by ${selMod.cargo.client}. ` : '') + selMod.cargo.rule
                      : selMod.blurb}
                    {!selMod.cargo ? ` Paid ${MOD[selMod.code as ModCode].price} new.` : ''}
                  </div>
                </div>
                <div className="btns">
                  {!selMod.cargo && (
                    <button
                      className="btn"
                      disabled={!sellRate()}
                      onClick={() =>
                        sellMod(
                          selMod.code as ModCode,
                          ui.sel!.t,
                          ui.sel!.t === 'bay' ? ui.sel!.i : (ui.sel! as { t: 'hold'; n: number }).n
                        )
                      }
                    >
                      {sellRate() ? `Pawn ${sellValue(selMod.code as ModCode)}` : 'No buyer'}
                    </button>
                  )}
                  <button className="btn danger" onClick={() => jettison(selMod.code)}>
                    {selMod.cargo ? 'Set down' : 'Dump'}
                  </button>
                </div>
              </div>
            )}

            <div className="checks">
              {sortedChecks.map((c) => {
                const live = c.focus.filter((i) => i >= 0)
                return (
                  <div className={'chk' + (c.ok ? '' : ' no')} key={c.lb + c.dt} onClick={() => !c.ok && checkTap(c)}>
                    <Icon k={c.ok ? 'CHECK' : 'X'} />
                    <div style={{ minWidth: 0 }}>
                      <div className="lb">
                        {c.lb}
                        {!c.ok && live.length ? <i className="tagpill blue">SHOW</i> : null}
                      </div>
                      <div className="dt">{c.dt}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ---------------- NAV ---------------- */}
        <section
          className={
            'pane pane-nav' +
            (ui.tab === 'lanes' || ui.tab === 'chart' ? ' on' : '') +
            (tutStep?.tab === 'lanes' || tutStep?.tab === 'chart' ? ' lit' : '')
          }
        >
          <div className={'navsec' + (ui.tab === 'lanes' ? ' on' : '')}>
            <div className="nav-body">
              <div className="sec-h">LANES OUT OF {coord(n)}</div>
              {course && (
                <div className="coursebar">
                  <Icon k="FLAG" />
                  <div style={{ minWidth: 0 }}>
                    <div className="ct">COURSE SET</div>
                    <div className="cs">
                      Making for <b>{coord(R.nodes[course.target])}</b> — {course.hops.length} hop
                      {course.hops.length > 1 ? 's' : ''}, {course.fuel} fuel.
                      {course.nextHop !== null ? (
                        <>
                          {' '}
                          Next burn: <b>{coord(R.nodes[course.nextHop])}</b>.
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button className="xbtn" onClick={dropCourse} aria-label="Clear course" title="Clear course">
                    <Icon k="X" />
                  </button>
                </div>
              )}
              <div className="lanecards">
                {n.warp && (
                  <div className="lane warp">
                    <div className="lh">
                      <div>
                        <div className="lc">WARP OUT</div>
                        <div className="lw">
                          Jump to stage {R.stage + 1} · {Math.min(5, 3 + Math.floor((R.stage + 1) / 2))} contracts · wages{' '}
                          {R.crew.length * R.wage} due
                        </div>
                      </div>
                      <div className="lr">
                        <div className="lf">{R.warpCost}</div>
                        <div className="lfl">FUEL</div>
                      </div>
                    </div>
                    {forf.length > 0 && (
                      <div className="flags">
                        <span className="flag amber">
                          {forf.map((c) => c.short).join(', ')} undelivered — {forf.reduce((a, c) => a + Math.round(c.fee / 2), 0)}{' '}
                          penalty
                        </span>
                      </div>
                    )}
                    <button className={'btn wide' + (warpWhy ? '' : ' pri')} disabled={!!warpWhy} onClick={doWarp}>
                      {warpWhy || `WARP TO STAGE ${R.stage + 1}`}
                    </button>
                  </div>
                )}

                {/* the next hop of a plotted course sorts first and stays lit */}
                {outEdges()
                  .slice()
                  .sort((a, b) => (a.b === course?.nextHop ? -1 : b.b === course?.nextHop ? 1 : 0))
                  .map((e) => {
                  const d = R.nodes[e.b]
                  const isNext = course?.nextHop === e.b
                  const cost = e.cost + sur
                  const why = !res.ok ? 'DECK FAILS INSPECTION' : R.fuel < cost ? `NEED ${cost} FUEL` : null
                  const what: string[] = []
                  if (d.port) what.push(`Yard, ${d.stock.length} lines`)
                  if (d.hires.length) what.push('hiring hall')
                  if (d.fuel) what.push('fuel line')
                  if (!what.length) what.push('Bare rock')
                  if (sur) what.push(`${e.cost}+${sur} weight`)
                  const flags: { txt: string; cls: string }[] = []
                  R.cargo.forEach((c) => {
                    if (!c.taken && !c.done && c.at === d.id) flags.push({ txt: `${c.short} on offer`, cls: 'amber' })
                    if (c.aboard && c.to === d.id) flags.push({ txt: `Drop ${c.short} for ${c.fee}`, cls: 'green' })
                    if (!c.done && !c.aboard && c.to === d.id) flags.push({ txt: `${c.short} delivers there`, cls: 'purple' })
                  })
                  if (d.warp) flags.push({ txt: 'Warp point', cls: 'purple' })
                  const wanted = d.stock.filter((k) => whyMod(k).need > 0).length + d.hires.filter((id) => whyHire(id).need > 0).length
                  if (wanted) flags.push({ txt: `${wanted} you need`, cls: 'amber' })
                  if (d.fuel) flags.push({ txt: `Fuel ${d.fuel}`, cls: '' })
                  const rows = [
                    ...d.hires.map((id, ix) => {
                      const w = whyHire(id)
                      return (
                        <div className={'pr' + (w.need ? ' want' : '')} key={'ph' + id + ix}>
                          <Icon k="CREW" />
                          <div style={{ minWidth: 0 }}>
                            <div className="nm">
                              {HIRES[id].name.toUpperCase()}
                              <NeedTag w={w} />
                            </div>
                            <div className="ds">{w.s}</div>
                          </div>
                        </div>
                      )
                    }),
                    ...d.stock.map((k) => {
                      const w = whyMod(k)
                      return (
                        <div className={'pr' + (w.need ? ' want' : '')} key={'ps' + k}>
                          <Icon k={MOD[k].icon} />
                          <div style={{ minWidth: 0 }}>
                            <div className="nm">
                              {MOD[k].short}
                              <NeedTag w={w} />
                            </div>
                            <div className="ds">{w.s}</div>
                          </div>
                        </div>
                      )
                    })
                  ]
                  return (
                    <div className={'lane' + (isNext ? ' next' : '') + (why ? ' blocked' : '')} key={'lane' + e.b}>
                      <div className="lh">
                        <div>
                          <div className="lc withtag">
                            {coord(d)}
                            {isNext ? <i className="nexttag">NEXT ON COURSE</i> : null}
                          </div>
                          <div className="lw">{what.join(' · ')}</div>
                        </div>
                        <div className="lr">
                          <div className="lf">{cost}</div>
                          <div className="lfl">FUEL</div>
                        </div>
                      </div>
                      {flags.length > 0 && (
                        <div className="flags">
                          {flags.map((f, i) => (
                            <span className={'flag ' + f.cls} key={i}>
                              {f.txt}
                            </span>
                          ))}
                        </div>
                      )}
                      {rows.length > 0 && (
                        <details className="peek">
                          <summary>WHAT THEY HAVE</summary>
                          <div className="pk">
                            {rows}
                            <div className="pnote">Prices are anyone's guess until you dock.</div>
                          </div>
                        </details>
                      )}
                      <button className={'btn wide' + (why ? '' : ' pri')} disabled={!!why} onClick={() => askJump(e.b)}>
                        {why || `BURN ${cost} AND GO`}
                      </button>
                    </div>
                  )
                  })}
              </div>

              {stuckWhy && (
                <div className="stuckcard">
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">NOTHING LEFT TO BURN</div>
                    <div className="ds">{stuckWhy}</div>
                  </div>
                  <button className="btn danger" onClick={callIt}>
                    CALL IT
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={'navsec' + (ui.tab === 'chart' ? ' on' : '')}>
            <div className="nav-body">
              <div className="chart-head">
                <div className="sec-h">SECTOR CHART</div>
                <div style={{ flex: 1 }} />
                <div className="plan">PLAN {R.seed}</div>
              </div>
              <div
                className="chartcard"
                onClick={(e) => {
                  const g = (e.target as Element).closest?.('[data-nd]')
                  const id = g?.getAttribute('data-nd')
                  if (id !== null && id !== undefined) askJump(+id)
                }}
                dangerouslySetInnerHTML={{ __html: chartSvg() }}
              />
              <div className="legend">
                <span className="pt">+ work on offer</span>
                <span className="en">→ drop, aboard now</span>
                <span className="lt">→ drop, not yet taken</span>
                <span className="wp">lane open now</span>
              </div>
              <div className="chart-hint">
                Tap a neighbouring node to plot a burn, or a far one to set a course — the lane to take next stays lit.
                Nothing moves until you confirm.
              </div>
              <ScuttleButton />
              {R.log.length > 0 && (
                <div className="log">
                  {R.log.slice(0, 4).map((l, i) => (
                    <span key={i}>
                      · {l}
                      <br />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <nav className="tabbar">
        {(
          [
            {
              id: 'port',
              label: 'PORT',
              icon: 'PORT',
              badge: attention.market + attention.crew + attention.contracts
                ? String(attention.market + attention.crew + attention.contracts)
                : '',
              red: false
            },
            { id: 'deck', label: 'DECK', icon: 'GRIDX', badge: bad.length ? String(bad.length) : '', red: true },
            { id: 'lanes', label: 'LANES', icon: 'ROUTE', badge: '', red: false },
            { id: 'chart', label: 'CHART', icon: 'WARP', badge: '', red: false }
          ] as { id: Tab; label: string; icon: string; badge: string; red: boolean }[]
        ).map((t) => (
          <button className={ui.tab === t.id ? 'on' : ''} key={t.id} onClick={() => setTab(t.id)}>
            <Icon k={t.icon} />
            <span>{t.label}</span>
            {t.badge ? <span className={'badge' + (t.red ? ' red' : '')}>{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {ui.confirm && <ConfirmBurn />}
    </>
  )
}
