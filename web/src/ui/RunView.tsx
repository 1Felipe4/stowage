import { useEffect, useRef, useState } from 'react'
import {
  accept, buyFuel, buyMod, callIt, coord, doWarp, here, hire, jettison, jump, outEdges,
  payOff, scuttle, sellMod, sellRate, sellValue, shipOK, stuckReason, tapBay, tapHold, toggleFocus
} from '../engine/actions'
import { evaluate, fuelCap, modOf, souls, surcharge } from '../engine/core'
import { HIRES, KINDS, MOD, TILES, bayName } from '../engine/data'
import { orders, whyHire, whyMod, type Why } from '../engine/guidance'
import { R, emit, ui, type PortTab, type Tab } from '../engine/state'
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
      <button className={'btn' + (armed ? ' danger' : '')} onClick={() => (armed ? scuttle() : setArmed(true))}>
        {armed ? 'TAP AGAIN — SINK THE RUN' : 'SCUTTLE SHIP'}
      </button>
      <span>{armed ? 'Ends the run as a bust.' : 'If you have truly worked yourself into a corner.'}</span>
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
  const placing = ui.sel?.t === 'hold'
  const selMod = ui.sel ? modOf(ui.sel.t === 'bay' ? R.grid[ui.sel.i] : R.hold[ui.sel.n]) : null

  // the DELIVERED banner survives exactly one paint, like the prototype
  useEffect(() => {
    R.paid = null
  })

  const needStock = n.stock.filter((k) => whyMod(k).need > 0)
  const shelfStock = n.stock.filter((k) => whyMod(k).need === 0)
  const hireNeeds = n.hires.filter((id) => whyHire(id).need > 0).length
  const portBadge = needStock.length + hireNeeds

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

  function directiveCta(): { label: string; act: () => void } {
    if (o.k === 'bad') {
      const f = bad.find((c) => c.focus.some((i) => i >= 0))
      return {
        label: 'Show the bays',
        act: () => {
          if (f) checkTap(f)
          else setTab('deck')
        }
      }
    }
    if (o.k === 'do')
      return {
        label: 'Go to deck',
        act: () => {
          setTab('deck')
          gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    if (o.k === 'buy')
      return {
        label: 'Open the market',
        act: () => {
          setTab('port')
          setPortTab('market')
        }
      }
    return { label: 'Open lanes', act: () => setTab('lanes') }
  }
  const cta = directiveCta()

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
              {c.name} · {c.rule}
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
      <div className={'directive ' + o.k}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dt">{o.t}</div>
          <div className="ds">{o.s}</div>
        </div>
        <button className="btn cta" onClick={cta.act}>
          {cta.label}
        </button>
      </div>

      <div className="panes">
        {/* ---------------- PORT ---------------- */}
        <section className={'pane pane-port' + (ui.tab === 'port' ? ' on' : '')}>
          <div className="seg">
            <button className={ui.portTab === 'market' ? 'on' : ''} onClick={() => setPortTab('market')}>
              Market
            </button>
            <button className={ui.portTab === 'crew' ? 'on' : ''} onClick={() => setPortTab('crew')}>
              Crew
            </button>
            <button className={ui.portTab === 'contracts' ? 'on' : ''} onClick={() => setPortTab('contracts')}>
              Contracts
            </button>
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
        <section className={'pane pane-deck' + (ui.tab === 'deck' ? ' on' : '')}>
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
            <div style={{ flex: 1 }} />
            <div className={'pill ' + (bad.length ? 'bad' : 'ok')}>
              <Icon k={bad.length ? 'ALERT' : 'OKRING'} />
              <span>{bad.length ? `${bad.length} PROBLEM${bad.length > 1 ? 'S' : ''}` : 'CLEARS INSPECTION'}</span>
            </div>
          </div>

          <div className="gridwrap">
            <div className="grid" ref={gridRef}>
              {Array.from({ length: TILES }, (_, i) => {
                const k = R.grid[i],
                  mm = modOf(k),
                  ht = res.heat[i]
                const over = !!k && ht > 5
                const cls = [
                  'cell',
                  k ? '' : placing ? 'place' : 'empty',
                  k && k[0] === '@' ? 'cargo' : '',
                  k === 'RCT' ? 'rct' : '',
                  k === 'RAD' || k === 'CRY' ? 'cold' : '',
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
                    title={mm ? `${mm.name} at ${bayName(i)} — heat ${ht}` : `Bay ${bayName(i)} clear`}
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
                  <div className="nm">{selMod.name}</div>
                  <div className="ds">
                    {selMod.cargo ? selMod.cargo.rule : selMod.blurb}
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
        <section className={'pane pane-nav' + (ui.tab === 'lanes' || ui.tab === 'chart' ? ' on' : '')}>
          <div className={'navsec' + (ui.tab === 'lanes' ? ' on' : '')}>
            <div className="nav-body">
              <div className="sec-h">LANES OUT OF {coord(n)}</div>
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

                {outEdges().map((e) => {
                  const d = R.nodes[e.b]
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
                    <div className={'lane' + (why ? ' blocked' : '')} key={'lane' + e.b}>
                      <div className="lh">
                        <div>
                          <div className="lc">{coord(d)}</div>
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
                      <button className={'btn wide' + (why ? '' : ' pri')} disabled={!!why} onClick={() => jump(e)}>
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
              <div className="chartcard" dangerouslySetInnerHTML={{ __html: chartSvg() }} />
              <div className="legend">
                <span className="pt">+ work on offer</span>
                <span className="en">→ drop, aboard now</span>
                <span className="lt">→ drop, not yet taken</span>
                <span className="wp">lane open now</span>
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
            { id: 'port', label: 'PORT', icon: 'PORT', badge: portBadge ? String(portBadge) : '', red: false },
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
    </>
  )
}
