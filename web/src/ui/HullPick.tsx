import { HULLS, MOD } from '../engine/data'
import { pickHull } from '../engine/actions'

export function HullPick() {
  return (
    <>
      <div className="directive do">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dt">Pick a hull.</div>
          <div className="ds">You keep it between stages. It decides what work you can take.</div>
        </div>
      </div>
      <div className="solo">
        <div className="solo-inner wide">
          <div className="hulls">
            {HULLS.map((hl, i) => (
              <div className="hullcard" key={hl.id}>
                <div className="lh">
                  <span className="lc">{hl.name}</span>
                  <span className="lf">{hl.base} BASE CAP</span>
                </div>
                <div className="lb2">{hl.blurb}</div>
                <div className="kit">
                  {hl.mods.map((k) => MOD[k].short.toLowerCase()).join(', ')} · {hl.crew.length} crew
                </div>
                <button className="btn wide pri" onClick={() => pickHull(i)}>
                  TAKE THIS ONE
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
