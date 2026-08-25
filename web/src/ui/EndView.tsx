import { useState } from 'react'
import { newRun, pressOn, retire } from '../engine/actions'
import { R } from '../engine/state'
import { Icon } from './Icon'
import { ShareSheet } from './ShareSheet'
import { starLine, stars, verdict } from '../engine/rating'

export function EndView() {
  const s = R.summary,
    clear = R.over === 'clear'
  const [sharing, setSharing] = useState(false)
  return (
    <>
      <div className={'directive ' + (clear ? 'go' : 'bad')}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dt">{clear ? `Stage ${R.stage} cleared.` : 'The run is over.'}</div>
        </div>
      </div>
      <div className="solo">
        <div className="solo-inner">
          {s ? (
            <div className={'stamp ' + (s.profit >= 0 ? '' : 'bad')}>
              <h3>{s.profit >= 0 ? 'PROFIT ' + s.profit : 'LOSS ' + Math.abs(s.profit)}</h3>
              <div className="pl">
                <div>
                  <dt>OPENED WITH</dt>
                  <dd>{s.opening}</dd>
                </div>
                <div>
                  <dt>REVENUE</dt>
                  <dd className="up">+{s.revenue}</dd>
                </div>
                {(() => {
                  const capex = s.capex ?? 0
                  const fuel = s.spend - s.wages - s.penalty - capex
                  return (
                    <>
                      <div>
                        <dt>FUEL BURNED</dt>
                        <dd className={fuel > 0 ? 'dn' : 'up'}>{fuel > 0 ? `−${fuel}` : `+${-fuel}`}</dd>
                      </div>
                      <div>
                        <dt>KIT &amp; CREW · YOURS TO KEEP</dt>
                        <dd className={capex > 0 ? 'dn' : 'up'}>{capex > 0 ? `−${capex}` : `+${-capex}`}</dd>
                      </div>
                    </>
                  )
                })()}
                <div>
                  <dt>WAGES</dt>
                  <dd className="dn">−{s.wages}</dd>
                </div>
                {s.penalty ? (
                  <div>
                    <dt>FORFEITS</dt>
                    <dd className="dn">−{s.penalty}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>CLOSED WITH</dt>
                  <dd>{R.credits}</dd>
                </div>
              </div>
              {(() => {
                const n = stars(s.profit, s.best)
                return (
                  <div className="rating">
                    <div className={'starrow s' + n}>{starLine(n)}</div>
                    <div className="ratesub">{verdict(s.profit, s.best)}</div>
                    <div className="ratepar">
                      PAR FOR THIS PLAN WAS {s.best} — an estimate, and a beatable one
                    </div>
                  </div>
                )
              })()}
              <div className="sub">
                {R.hull.name.toUpperCase()} · {R.cleared} STAGE{R.cleared === 1 ? '' : 'S'} CLEARED
              </div>
            </div>
          ) : (
            <div className="stamp bad">
              <h3>BUST</h3>
              <p>{R.overWhy}.</p>
              <div className="sub">
                {R.hull.name.toUpperCase()} · {R.cleared} STAGE{R.cleared === 1 ? '' : 'S'} CLEARED · {R.credits} CREDITS LEFT
              </div>
            </div>
          )}
          <button className="btn wide sharebtn" style={{ marginTop: 12 }} onClick={() => setSharing(true)}>
            <Icon k="SHARE" />
            SHARE THIS RUN
          </button>

          {clear ? (
            <>
              <button className="btn wide pri" style={{ marginTop: 8 }} onClick={pressOn}>
                PRESS ON TO STAGE {R.stage + 1}
              </button>
              <button className="btn wide" style={{ marginTop: 8 }} onClick={retire}>
                RETIRE ON {R.credits}
              </button>
            </>
          ) : (
            <button className="btn wide pri" style={{ marginTop: 8 }} onClick={newRun}>
              NEW HAULER
            </button>
          )}
        </div>
      </div>
      {sharing && <ShareSheet onClose={() => setSharing(false)} />}
    </>
  )
}
