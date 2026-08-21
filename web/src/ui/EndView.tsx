import { newRun, pressOn, retire } from '../engine/actions'
import { R } from '../engine/state'

export function EndView() {
  const s = R.summary,
    clear = R.over === 'clear'
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
                <div>
                  <dt>SHIP &amp; FUEL</dt>
                  {(() => {
                    const net = s.spend - s.wages - s.penalty
                    return <dd className={net > 0 ? 'dn' : 'up'}>{net > 0 ? `−${net}` : `+${-net}`}</dd>
                  })()}
                </div>
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
              <div className="sub">
                BEST POSSIBLE HERE WAS {s.best} · {R.cleared} STAGE{R.cleared === 1 ? '' : 'S'} CLEARED
              </div>
            </div>
          ) : (
            <div className="stamp bad">
              <h3>BUST</h3>
              <p>{R.overWhy}.</p>
              <div className="sub">
                {R.cleared} STAGE{R.cleared === 1 ? '' : 'S'} CLEARED · {R.credits} CREDITS LEFT
              </div>
            </div>
          )}
          {clear ? (
            <>
              <button className="btn wide pri" style={{ marginTop: 12 }} onClick={pressOn}>
                PRESS ON TO STAGE {R.stage + 1}
              </button>
              <button className="btn wide" style={{ marginTop: 8 }} onClick={retire}>
                RETIRE ON {R.credits}
              </button>
            </>
          ) : (
            <button className="btn wide pri" style={{ marginTop: 12 }} onClick={newRun}>
              NEW HAULER
            </button>
          )}
        </div>
      </div>
    </>
  )
}
