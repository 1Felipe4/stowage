import { useEffect, useSyncExternalStore } from 'react'
import { capacity, fuelCap, massOf } from '../engine/core'
import { rebuildTransient } from '../engine/map'
import { R, emit, getVersion, setR, subscribe, ui } from '../engine/state'
import type { GameState } from '../engine/types'
import { loadSave } from '../net/saves'
import { EndView } from './EndView'
import { HullPick } from './HullPick'
import { RunView } from './RunView'

let booted = false

function Gauges() {
  const m = massOf(),
    cap = capacity(),
    over = m > cap
  return (
    <>
      <div className="g cr">
        <b>{R.credits}</b>
        <span>CRED</span>
      </div>
      <div className={'g fu ' + (R.fuel <= 3 ? 'low' : '')}>
        <b>
          {R.fuel}/{fuelCap()}
        </b>
        <span>FUEL</span>
      </div>
      <div className={'g ms ' + (over ? 'low' : '')}>
        <b>
          {m}/{cap}
        </b>
        <span>MASS</span>
      </div>
      <div className="g st">
        <b>{R.stage}</b>
        <span>STG</span>
      </div>
    </>
  )
}

export default function App() {
  useSyncExternalStore(subscribe, getVersion)

  useEffect(() => {
    if (booted) return
    booted = true
    void loadSave().then((saved) => {
      const s = saved as GameState | null
      if (s && s.nodes && s.grid && s.hull) {
        setR(s)
        rebuildTransient()
        ui.view = 'run'
      } else {
        ui.view = 'hull'
      }
      emit()
    })
  }, [])

  const showGauges = ui.view === 'run' && R && !R.over

  return (
    <div className="wrap">
      <div className="hud">
        <div className="brand">
          STOW<em>AGE</em>
        </div>
        <div className="gauges">{showGauges ? <Gauges /> : null}</div>
      </div>
      {ui.view === 'boot' && <div className="boot">RAISING THE MANIFEST…</div>}
      {ui.view === 'hull' && <HullPick />}
      {ui.view === 'run' && R && (R.over ? <EndView /> : <RunView />)}
    </div>
  )
}
