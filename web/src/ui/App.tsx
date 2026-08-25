import { useEffect, useSyncExternalStore } from 'react'
import { capacity, fuelCap, massOf, powerBalance } from '../engine/core'
import { coord, here } from '../engine/actions'
import { rebuildTransient } from '../engine/map'
import { R, emit, getVersion, setR, subscribe, ui } from '../engine/state'
import { loadSave } from '../net/saves'
import { EndView } from './EndView'
import { Icon } from './Icon'
import { RunView } from './RunView'
import { LessonsScreen, MenuScreen, ScoresScreen } from './Screens'
import { loadScores } from '../net/scores'
import { migrate } from '../engine/migrate'

let booted = false

function Meter({ label, val, pct, color, danger, deskOnly }: {
  label: string
  val: string
  pct: number
  color: string
  danger?: boolean
  deskOnly?: boolean
}) {
  return (
    <div className={'meter' + (deskOnly ? ' m-desk' : '')}>
      <div className="mv">
        <b style={{ color: danger ? 'var(--red)' : color }}>{val}</b>
        <span>{label}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: danger ? 'var(--red)' : color }} />
      </div>
    </div>
  )
}

function Meters() {
  const m = massOf(),
    cap = capacity(),
    fcap = fuelCap()
  const { prod, draw } = powerBalance()
  const net = prod - draw
  return (
    <div className="meters">
      <Meter label="CRED" val={String(R.credits)} pct={Math.min(100, R.credits / 6)} color="var(--amber)" />
      <Meter label="FUEL" val={`${R.fuel}/${fcap}`} pct={fcap ? (R.fuel / fcap) * 100 : 0} color="var(--blue)" danger={R.fuel <= 3} />
      <Meter label="MASS" val={`${m}/${cap}`} pct={cap ? (m / cap) * 100 : 100} color="var(--ink)" danger={m > cap} />
      <Meter label="POWER" val={net >= 0 ? `+${net}` : String(net)} pct={prod ? (draw / prod) * 100 : draw ? 100 : 0} color="var(--green)" danger={draw > prod} deskOnly />
      <Meter label="STAGE" val={String(R.stage)} pct={Math.min(100, R.stage * 20)} color="var(--mut)" deskOnly />
    </div>
  )
}

function NodeChip() {
  const n = here()
  const kind = n.port ? 'TRADING PORT' : n.warp ? 'WARP POINT' : n.fuel ? 'FUEL STOP' : 'BARE ROCK'
  return (
    <div className="nodechip">
      <Icon k={n.warp ? 'WARP' : 'PORT'} />
      <span>
        {coord(n)}
        <span className="chip-long"> · {kind}</span>
      </span>
    </div>
  )
}

export default function App() {
  useSyncExternalStore(subscribe, getVersion)

  useEffect(() => {
    if (booted) return
    booted = true
    void loadSave().then((saved) => {
      // every save goes through migrate(): schemas have moved on since some
      // runs were written, and a stale shape used to crash the bridge
      const s = migrate(saved)
      if (s) {
        setR(s)
        rebuildTransient()
        ui.view = 'run'
      } else {
        ui.view = 'boot'
      }
      // the menu is the front door; a live save shows up as Continue run
      ui.screen = 'menu'
      emit()
      void loadScores()
    })
  }, [])

  const inRun = ui.view === 'run' && R && !R.over
  const onBridge = ui.screen === 'bridge'

  if (ui.view === 'boot') {
    return (
      <div className="shell">
        <div className="boot">RAISING THE MANIFEST…</div>
      </div>
    )
  }

  // no run yet (or none loaded): the menu is the only sensible place to be
  if (onBridge && !R) {
    ui.screen = 'menu'
  }

  if (!onBridge || !R) {
    return (
      <div className="shell">
        {ui.screen === 'menu' && <MenuScreen />}
        {ui.screen === 'scores' && <ScoresScreen />}
        {ui.screen === 'lessons' && <LessonsScreen />}
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="hud">
        <div className="brand">
          STOW<em>AGE</em>
        </div>
        {inRun ? <NodeChip /> : null}
        <div className="sp" />
        {inRun ? <Meters /> : null}
        <button
          className="menubtn"
          title="Main menu"
          aria-label="Main menu"
          onClick={() => {
            ui.screen = 'menu'
            ui.confirm = null
            emit()
          }}
        >
          <Icon k="MENU" />
        </button>
      </header>
      {ui.view === 'run' && R && (R.over ? <EndView /> : <RunView />)}
    </div>
  )
}
