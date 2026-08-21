import { useEffect, useRef, useState } from 'react'
import {
  accept, buyFuel, buyMod, callIt, coord, doWarp, here, hire, jettison, jump, outEdges,
  payOff, scuttle, sellMod, sellRate, sellValue, shipOK, stuckReason, tapBay, tapHold, toggleFocus
} from '../engine/actions'
import { capacity, evaluate, fuelCap, massOf, modOf, souls, deckCrew, surcharge } from '../engine/core'
import { HIRES, KINDS, MOD, TILES, bayName } from '../engine/data'
import { orders, whyHire, whyMod, type Why } from '../engine/guidance'
import { R, ui } from '../engine/state'
import type { Check, ModCode } from '../engine/types'
import { chartSvg } from './Chart'
import { Icon } from './Icon'

function NeedTag({ w }: { w: Why }) {
  if (!w.need) return null
  return <i className="tagneed">NEED{w.need > 1 ? ` ×${w.need}` : ''}</i>
}

/* Arm-then-confirm purchase button: first tap shows the price as a question,
   second tap within 3.5s commits. Disarms on its own. */
function ConfirmBuy({ price, disabled, blocked, onBuy }: { price: number; disabled: boolean; blocked?: string; onBuy: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3500)
    return () => window.clearTimeout(t)
  }, [armed])
  if (blocked)
    return (
      <button disabled title={blocked}>
        {blocked}
      </button>
    )
  return (
    <button
      className={armed ? 'pri' : ''}
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

/* Two-tap scuttle: no lock state may ever strand a run, so this is always
   reachable — but never one accidental tap away. */
function ScuttleButton() {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <div className="abandon">
      <button className={armed ? 'warn' : ''} onClick={() => (armed ? scuttle() : setArmed(true))}>
        {armed ? 'TAP AGAIN — SINK THE RUN' : 'SCUTTLE SHIP'}
      </button>
      <span>{armed ? 'Ends the run as a bust.' : 'If you have truly worked yourself into a corner.'}</span>
    </div>
  )
}

export function RunView() {
  const res = evaluate(R.grid)
  const o = orders()
  const n = here()
  const m = massOf(),
    cap = capacity(),
    over = Math.max(0, m - cap)
  const bad = res.checks.filter((c) => !c.ok)
  const gridRef = useRef<HTMLDivElement>(null)

  // the DELIVERED banner survives exactly one paint, like the prototype
  useEffect(() => {
    R.paid = null
  })

  const dropHere = R.cargo.filter((c) => !c.done && c.to === R.at)
  const stuckWhy = stuckReason()

  const warpWhy = n.warp ? (!shipOK() ? 'DECK FAILS INSPECTION' : R.fuel < R.warpCost ? `NEED ${R.warpCost} FUEL` : null) : null
  const forf = R.cargo.filter((c) => c.taken && !c.done)

  const selMod = ui.sel ? modOf(ui.sel.t === 'bay' ? R.grid[ui.sel.i] : R.hold[ui.sel.n]) : null

  function checkTap(c: Check) {
    const live = c.focus.filter((i) => i >= 0)
    if (!live.length) return
    toggleFocus(live)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

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

  return (
    <>
      <div className={'orders ' + o.k}>
        <div className="ot">{o.t}</div>
        <div className="os">{o.s}</div>
      </div>
      <div className="cols">
        <div className="col">
        <section className="o1">
        {R.event && (
          <div className="ev">
            <div className="et">EN ROUTE · {R.event.t}</div>
            <div className="ex">{R.event.x}</div>
          </div>
        )}
        {R.paid ? (
          <div className="ev ok">
            <div className="et">DELIVERED</div>
            <div className="ex">Signed over for {R.paid} credits.</div>
          </div>
        ) : null}

        <h2 className="sec">
          {coord(n)}
          {n.port ? ' · TRADING PORT' : ''}
          {n.warp ? ' · WARP POINT' : ''}
          {dropHere.length ? (
            <>
              {' · '}
              <em className="okt">DROP-OFF FOR {dropHere.map((c) => c.short).join(', ')}</em>
            </>
          ) : null}
        </h2>
        <div className="card">
          {dropHere
            .filter((c) => !c.aboard)
            .map((c) => (
              <div className="row" key={'drop' + c.i}>
                <div className="l">
                  <Icon k="CARGO" />
                  <div>
                    <div className="nm" style={{ color: 'var(--pass)' }}>
                      {c.short} DELIVERS HERE
                    </div>
                    <div className="ds">
                      Collect it at {coord(R.nodes[c.at])} and bring it back for {c.fee}.
                    </div>
                  </div>
                </div>
                <div className="at">—</div>
              </div>
            ))}

          {n.warp && (
            <div className="row warp">
              <div className="l">
                <Icon k="WARP" />
                <div>
                  <div className="nm">JUMP TO STAGE {R.stage + 1}</div>
                  <div className="ds">
                    {R.stage + 1 >= 4 ? 'deep run' : 'short hop'}, {Math.min(5, 3 + Math.floor((R.stage + 1) / 2))} contracts. Costs{' '}
                    {R.warpCost} fuel and {R.crew.length * R.wage} in wages.
                    {forf.length ? (
                      <>
                        {' '}
                        <b className="warnt">
                          {forf.map((c) => c.short).join(', ')} undelivered — {forf.reduce((a, c) => a + Math.round(c.fee / 2), 0)}{' '}
                          penalty.
                        </b>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <button disabled={!!warpWhy} className={warpWhy ? '' : 'pri'} onClick={doWarp}>
                {warpWhy || 'WARP OUT'}
              </button>
            </div>
          )}

          {R.cargo.map((c, i) => {
            if (c.done || c.taken || c.at !== R.at) return null
            const gate = !!(c.need && !R.specs.includes(c.need)),
              noBay = !R.grid.includes(null)
            const cost: string[] = []
            if (c.support)
              cost.push(
                `needs ${c.support === 'SHD' ? 'shielding on every touching bay' : c.support === 'CRY' ? 'a cryo unit alongside' : 'life support alongside'}`
              )
            if (c.crew) cost.push(`${R.specs.includes('VET') ? 1 : 2} tenders aboard`)
            cost.push(`weighs ${KINDS[c.kind].weight}`)
            return (
              <div className="row hot" key={'offer' + i}>
                <div className="l">
                  <Icon k="CARGO" />
                  <div>
                    <div className="nm">
                      {c.short} · {c.name}
                    </div>
                    <div className="ds">
                      To {coord(R.nodes[c.to])}, {R.D![R.at][c.to]} fuel away. Pays <b className="gold">{c.fee}</b>. {c.rule}{' '}
                      <b className="warnt">{cost.join(', ')}.</b>
                    </div>
                  </div>
                </div>
                <button disabled={gate || noBay} className={gate || noBay ? '' : 'pri'} onClick={() => accept(i)}>
                  {gate ? 'LOCKED' : noBay ? 'NO BAY' : 'SIGN'}
                </button>
              </div>
            )
          })}

          {n.fuel ? (
            <div className="row">
              <div className="l">
                <Icon k="FUEL" />
                <div>
                  <div className="nm">FUEL · {n.fuel} each</div>
                  <div className="ds">{fuelNote}</div>
                </div>
              </div>
              <div className="btns">
                <button disabled={room < 1 || afford < 1} onClick={() => buyFuel(1)}>
                  +1
                </button>
                <button disabled={room < 1 || afford < 1} onClick={() => buyFuel(5)}>
                  +5
                </button>
                <button disabled={room < 1 || afford < 1} onClick={() => buyFuel(999)}>
                  FILL
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <div className="l">
                <Icon k="FUEL" />
                <div>
                  <div className="nm">NO FUEL LINE</div>
                  <div className="ds">You leave on the {R.fuel} you arrived with.</div>
                </div>
              </div>
              <div className="at">—</div>
            </div>
          )}

          {n.hires.map((id, ix) => {
            const w = whyHire(id),
              hh = HIRES[id]
            return (
              <div className={'row ' + (w.need ? 'want' : '')} key={'hire' + id + ix}>
                <div className="l">
                  <Icon k="CREW" />
                  <div>
                    <div className="nm">
                      {hh.name.toUpperCase()}
                      <NeedTag w={w} />
                    </div>
                    <div className="ds">{w.s}</div>
                  </div>
                </div>
                <ConfirmBuy price={hh.price} disabled={R.credits < hh.price} onBuy={() => hire(id)} />
              </div>
            )
          })}

          {n.stock.map((k) => {
            const w = whyMod(k),
              mm = MOD[k]
            return (
              <div className={'row ' + (w.need ? 'want' : '')} key={'stock' + k}>
                <div className="l">
                  <Icon k={mm.icon} />
                  <div>
                    <div className="nm">
                      {mm.short}
                      <NeedTag w={w} />
                    </div>
                    <div className="ds">{w.s}</div>
                  </div>
                </div>
                <ConfirmBuy
                  price={mm.price}
                  disabled={R.credits < mm.price}
                  blocked={R.grid.includes(null) ? undefined : 'NO BAY'}
                  onBuy={() => buyMod(k)}
                />
              </div>
            )
          })}

          {[...new Set(R.hold.filter((k) => k[0] !== '@'))].map((k) => (
            <div className="row" key={'holdsale' + k}>
              <div className="l">
                <Icon k={MOD[k as ModCode].icon} />
                <div>
                  <div className="nm">{MOD[k as ModCode].short}</div>
                  <div className="ds">in the hold</div>
                </div>
              </div>
              <button onClick={() => sellMod(k as ModCode, 'hold')} disabled={!sellRate()}>
                {sellRate() ? `PAWN ${sellValue(k as ModCode)}` : 'NO BUYER'}
              </button>
            </div>
          ))}

          {!n.port && !n.fuel && !n.warp && !R.cargo.some((c) => !c.taken && !c.done && c.at === R.at) && (
            <div className="none">Bare rock.</div>
          )}
        </div>

        {n.port && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="row">
              <div className="l">
                <Icon k="PORT" />
                <div>
                  <div className="nm">THIS YARD BUYS AT {Math.round(sellRate() * 100)}%</div>
                  <div className="ds">Tap any module on the deck to pawn it here. Rates differ port to port.</div>
                </div>
              </div>
              <div className="at">—</div>
            </div>
          </div>
        )}

        </section>
        <section className="o2">
        <h2 className="sec">
          CREW · {souls()} SOULS · {deckCrew()} WORKING THE DECK
        </h2>
        <div className="card">
          {R.crew.map((id, i) => {
            const locked = !!(HIRES[id].spec && R.cargo.some((c) => c.aboard && c.need === HIRES[id].spec))
            return (
              <div className="row" key={'crew' + i}>
                <div className="l">
                  <Icon k="CREW" />
                  <div>
                    <div className="nm">{HIRES[id].name.toUpperCase()}</div>
                    <div className="ds">
                      {HIRES[id].deck ? 'runs 4 mass' : 'does not work the deck'} · {R.wage} wages
                      {locked ? ' · tied to cargo aboard' : ''}
                    </div>
                  </div>
                </div>
                <button onClick={() => payOff(i)} disabled={locked}>
                  PAY OFF
                </button>
              </div>
            )
          })}
        </div>
        </section>
        <section className="o5">
        <h2 className="sec">
          CONTRACTS · {R.cargo.filter((c) => c.done).length} OF {R.cargo.length} DELIVERED
        </h2>
        <div className="card">
          {R.cargo.map((c) => {
            const st = c.done
              ? 'PAID'
              : c.aboard
                ? `ABOARD → ${coord(R.nodes[c.to])}`
                : c.taken
                  ? 'SET DOWN'
                  : `${coord(R.nodes[c.at])} → ${coord(R.nodes[c.to])}`
            return (
              <div className={'row ' + (c.done ? 'got' : '')} key={'con' + c.i}>
                <div className="l">
                  <Icon k="CARGO" />
                  <div>
                    <div className="nm">
                      {c.short} · {c.name}
                    </div>
                    <div className="ds">
                      {c.rule} Pays {c.fee}.
                    </div>
                  </div>
                </div>
                <div className="at">{st}</div>
              </div>
            )
          })}
        </div>
        </section>
        </div>

        <div className="col">
        <section className="o3">
        <h2 className="sec">
          DECK ·{' '}
          {bad.length ? (
            <em className="warnt">
              {bad.length} PROBLEM{bad.length > 1 ? 'S' : ''}
            </em>
          ) : (
            <em className="okt">CLEARS INSPECTION</em>
          )}
          {over ? <em className="warnt"> · OVERWEIGHT +{Math.ceil(over / 2)} FUEL A LANE</em> : null}
        </h2>
        <div className="grid" ref={gridRef}>
          {Array.from({ length: TILES }, (_, i) => {
            const k = R.grid[i],
              mm = modOf(k),
              ht = res.heat[i]
            const cls = [
              'cell',
              k ? '' : 'empty',
              k && k[0] === '@' ? 'cargo' : '',
              k === 'RCT' ? 'rct' : '',
              k === 'RAD' || k === 'CRY' ? 'cold' : '',
              k === 'SHD' ? 'shd' : '',
              ui.sel && ui.sel.t === 'bay' && ui.sel.i === i ? 'sel' : '',
              ui.focus.includes(i) ? 'foc' : '',
              k && ht > 5 ? 'over' : ht >= 3 ? 'warm' : ht < 0 ? 'chill' : ''
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div
                className={cls}
                key={i}
                tabIndex={0}
                onClick={() => tapBay(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    tapBay(i)
                  }
                }}
              >
                <span className="brt">{bayName(i)}</span>
                <span className="ht">
                  {ht > 0 ? '+' : ''}
                  {ht}
                </span>
                {mm ? (
                  <>
                    <Icon k={mm.icon} />
                    <span className="code">{mm.short}</span>
                  </>
                ) : (
                  <span className="tag">clear</span>
                )}
              </div>
            )
          })}
        </div>

        {R.hold.length > 0 && (
          <div className="hold">
            <div className="hint">IN THE HOLD — tap one, then tap a clear bay</div>
            <div className="chips">
              {R.hold.map((k, i) => {
                const mm = modOf(k)!
                return (
                  <button
                    className={
                      'chip ' + (k[0] === '@' ? 'cargo' : '') + ' ' + (ui.sel && ui.sel.t === 'hold' && ui.sel.n === i ? 'sel' : '')
                    }
                    key={'hold' + i}
                    onClick={() => tapHold(i)}
                  >
                    <Icon k={mm.icon} />
                    {mm.short}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {selMod && (
          <div className="card">
            <div className="row">
              <div className="l">
                <Icon k={selMod.icon} />
                <div>
                  <div className="nm">{selMod.name.toUpperCase()}</div>
                  <div className="ds">
                    {selMod.cargo ? selMod.cargo.rule : selMod.blurb}
                    {!selMod.cargo ? ` Paid ${MOD[selMod.code as ModCode].price} new.` : ''}
                  </div>
                </div>
              </div>
              <div className="btns">
                {!selMod.cargo && (
                  <button
                    disabled={!sellRate()}
                    onClick={() =>
                      sellMod(
                        selMod.code as ModCode,
                        ui.sel!.t,
                        ui.sel!.t === 'bay' ? ui.sel!.i : (ui.sel! as { t: 'hold'; n: number }).n
                      )
                    }
                  >
                    {sellRate() ? `PAWN ${sellValue(selMod.code as ModCode)}` : 'NO BUYER'}
                  </button>
                )}
                <button className="warn" onClick={() => jettison(selMod.code)}>
                  {selMod.cargo ? 'SET DOWN' : 'DUMP'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="checks">
          {bad.length ? (
            <>
              {bad.map((c) => (
                <div className="chk no tap" key={c.lb + c.dt} onClick={() => checkTap(c)}>
                  <div className="mk">✕</div>
                  <div>
                    <div className="lb">
                      {c.lb}
                      <span className="pin">SHOW</span>
                    </div>
                    <div className="dt">{c.dt}</div>
                  </div>
                </div>
              ))}
              <div className="chk ok">
                <div className="mk">✓</div>
                <div>
                  <div className="lb">{res.checks.length - bad.length} OTHERS CLEAR</div>
                </div>
              </div>
            </>
          ) : (
            <div className="chk ok">
              <div className="mk">✓</div>
              <div>
                <div className="lb">ALL {res.checks.length} CLEAR</div>
                <div className="dt">Cleared to burn.</div>
              </div>
            </div>
          )}
        </div>

        </section>
        </div>

        <div className="col">
        <section className="o4">
        <h2 className="sec">LANES OUT OF {coord(n)}</h2>
        {outEdges().map((e) => {
          const d = R.nodes[e.b],
            cost = e.cost + surcharge()
          const why = !res.ok ? 'DECK FAILS INSPECTION' : R.fuel < cost ? `NEED ${cost} FUEL` : null
          const flags: React.ReactNode[] = []
          R.cargo.forEach((c, ci) => {
            if (!c.taken && !c.done && c.at === d.id)
              flags.push(
                <b className="hotb" key={'f1' + ci}>
                  {c.short} on offer
                </b>
              )
            if (c.aboard && c.to === d.id)
              flags.push(
                <b className="okb" key={'f2' + ci}>
                  drop {c.short} for {c.fee}
                </b>
              )
            if (!c.done && !c.aboard && c.to === d.id)
              flags.push(
                <b className="ltb" key={'f3' + ci}>
                  {c.short} delivers there
                </b>
              )
          })
          if (d.warp)
            flags.push(
              <b className="warpb" key="fw">
                warp point
              </b>
            )
          if (d.port) flags.push(<span key="fp">yard, {d.stock.length} lines</span>)
          if (d.hires.length) flags.push(<span key="fh">hiring hall</span>)
          if (d.fuel) flags.push(<span key="ff">fuel line</span>)
          if (!flags.length) flags.push(<span key="fb">bare rock</span>)

          let wanted = 0
          const rows: React.ReactNode[] = []
          d.hires.forEach((id, ix) => {
            const w = whyHire(id)
            if (w.need) wanted++
            rows.push(
              <div className={'pr ' + (w.need ? 'want' : '')} key={'ph' + id + ix}>
                <div className="l">
                  <Icon k="CREW" />
                  <div>
                    <div className="nm">
                      {HIRES[id].name.toUpperCase()}
                      <NeedTag w={w} />
                    </div>
                    <div className="ds">{w.s}</div>
                  </div>
                </div>
              </div>
            )
          })
          d.stock.forEach((k) => {
            const w = whyMod(k)
            if (w.need) wanted++
            rows.push(
              <div className={'pr ' + (w.need ? 'want' : '')} key={'ps' + k}>
                <div className="l">
                  <Icon k={MOD[k].icon} />
                  <div>
                    <div className="nm">
                      {MOD[k].short}
                      <NeedTag w={w} />
                    </div>
                    <div className="ds">{w.s}</div>
                  </div>
                </div>
              </div>
            )
          })

          return (
            <div className="lane" key={'lane' + e.b}>
              <div className="lh">
                <span className="lc">{coord(d)}</span>
                <span className="lf">
                  {cost} fuel{surcharge() ? ` (${e.cost}+${surcharge()} weight)` : ''}
                </span>
              </div>
              <div className="lb2">
                {flags.map((f, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    {f}
                  </span>
                ))}
                {wanted ? <b className="wantb"> · {wanted} you need</b> : null}
              </div>
              {rows.length > 0 && (
                <details className="peek">
                  <summary>WHAT THEY HAVE</summary>
                  <div className="pk">
                    {rows}
                    <div className="pnote">Prices are anyone's guess until you dock.</div>
                  </div>
                </details>
              )}
              <button className={'wide ' + (why ? '' : 'pri')} disabled={!!why} onClick={() => jump(e)}>
                {why || `BURN ${cost} AND GO`}
              </button>
            </div>
          )
        })}

        {stuckWhy && (
          <div className="card" style={{ borderColor: 'var(--fail)', marginTop: 12 }}>
            <div className="row">
              <div className="l">
                <div>
                  <div className="nm" style={{ color: 'var(--fail)' }}>
                    NOTHING LEFT TO BURN
                  </div>
                  <div className="ds">{stuckWhy}</div>
                </div>
              </div>
              <button className="warn" onClick={callIt}>
                CALL IT
              </button>
            </div>
          </div>
        )}
        </section>
        <section className="o6">
        <details className="ref" open>
          <summary>SECTOR CHART · PLAN {R.seed}</summary>
          <div className="mapbox" dangerouslySetInnerHTML={{ __html: chartSvg() }} />
          <div className="legend">
            <span className="lg pt">+A work on offer</span>
            <span className="lg en">→A drop, aboard now</span>
            <span className="lg lt">→A drop, not yet taken</span>
            <span className="lg wp">WARP jump out</span>
          </div>
        </details>

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
        </section>
        </div>
      </div>
    </>
  )
}
