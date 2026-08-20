import { HULLS, MOD } from '../engine/data'
import { pickHull } from '../engine/actions'

export function HullPick() {
  return (
    <>
      <div className="orders do">
        <div className="ot">Pick a hull.</div>
        <div className="os">You keep it between stages. It decides what work you can take.</div>
      </div>
      <div>
        {HULLS.map((hl, i) => (
          <div className="lane" key={hl.id}>
            <div className="lh">
              <span className="lc">{hl.name}</span>
              <span className="lf">{hl.base} base capacity</span>
            </div>
            <div className="lb2">{hl.blurb}</div>
            <div className="lb2" style={{ color: 'var(--dim)' }}>
              {hl.mods.map((k) => MOD[k].short.toLowerCase()).join(', ')} · {hl.crew.length} crew
            </div>
            <button className="wide pri" onClick={() => pickHull(i)}>
              TAKE THIS ONE
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
