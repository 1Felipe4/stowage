import { useEffect, useState } from 'react'
import { newRun, pickHull } from '../engine/actions'
import { LESSONS } from '../engine/teach'
import { R, emit, ui } from '../engine/state'
import { getScores, loadScores, subscribeScores, type Score } from '../net/scores'
import { Icon } from './Icon'

function go(screen: typeof ui.screen) {
  ui.screen = screen
  ui.confirm = null
  emit()
}

/* ---------------- main menu ---------------- */
export function MenuScreen() {
  const live = !!R && !R.over
  const items = [
    ...(live
      ? [
          {
            icon: 'PLAY',
            label: 'Continue run',
            sub: `Stage ${R.stage} · ${R.credits} credits`,
            pri: true,
            act: () => go('bridge')
          }
        ]
      : []),
    {
      icon: 'THR',
      label: 'New run',
      sub: live ? 'Abandons the run in progress' : 'Pick a hull, fresh sector',
      pri: !live,
      act: () => {
        newRun()
        go('bridge')
      }
    },
    {
      icon: 'TEACH',
      label: 'Learn to play',
      sub: 'Four cards, then a guided first run',
      pri: false,
      act: () => {
        ui.lesson = 0
        go('lessons')
      }
    },
    { icon: 'CUP', label: 'Highscores', sub: 'Five best runs on this ship', pri: false, act: () => go('scores') }
  ]
  return (
    <div className="screen">
      <div className="menuwrap">
        <div className="eyebrow">A CARGO PUZZLE IN DEEP SPACE</div>
        <div className="wordmark">
          STOW<span>AGE</span>
        </div>
        <p className="tagline">
          Twenty bays, a hold full of freight and a sector of lanes. Stow it so the deck clears inspection, then burn.
        </p>
        <div className="menuitems">
          {items.map((i) => (
            <button className={'menuitem' + (i.pri ? ' pri' : '')} key={i.label} onClick={i.act}>
              <Icon k={i.icon} />
              <span className="ml">
                <span className="mlab">{i.label}</span>
                <span className="msub">{i.sub}</span>
              </span>
              <Icon k="CHEV" />
            </button>
          ))}
        </div>
      </div>
      <div className="screenfoot">Pack the deck · work the lanes · jump out ahead</div>
    </div>
  )
}

/* ---------------- highscores ---------------- */
export function ScoresScreen() {
  const [, bump] = useState(0)
  useEffect(() => {
    const un = subscribeScores(() => bump((n) => n + 1))
    void loadScores().then(() => bump((n) => n + 1))
    return un
  }, [])
  const rows: Score[] = getScores()
  return (
    <div className="screen">
      <div className="sheet">
        <div className="sheethead">
          <div className="sec-h">HIGHSCORES</div>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => go('menu')}>
            Menu
          </button>
        </div>
        <div className="scorelist">
          {rows.length === 0 && <div className="empty-note">No runs banked yet. Finish one and it lands here.</div>}
          {rows.map((r, n) => (
            <div className={'scorerow' + (n ? '' : ' top')} key={r.at}>
              <span className="rank">{n + 1}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="cr">{r.credits.toLocaleString()} cr</div>
                <div className="det">
                  {r.delivered} contract{r.delivered === 1 ? '' : 's'} · stage {r.stage} · {r.why || r.hull}
                </div>
              </div>
              <i className={'tagpill ' + (r.kind === 'bust' ? 'red' : 'green')}>{r.kind === 'bust' ? 'BUST' : 'RETIRED'}</i>
            </div>
          ))}
        </div>
        <div className="sheetnote">Scores are what you banked when the run ended. A bust keeps nothing.</div>
      </div>
    </div>
  )
}

/* ---------------- lessons ---------------- */
export function LessonsScreen() {
  const i = Math.max(0, Math.min(LESSONS.length - 1, ui.lesson))
  const l = LESSONS[i]
  const last = i === LESSONS.length - 1
  function next() {
    if (!last) {
      ui.lesson = i + 1
      emit()
      return
    }
    // The guided run starts on the Long-hauler: it ships with one engine, so
    // the first lesson ("fit a second") is a real task rather than a no-op.
    ui.tut = { i: 0 }
    pickHull(1)
    go('bridge')
  }
  return (
    <div className="screen">
      <div className="sheet">
        <div className="sheethead">
          <div className="sec-h">
            LEARN TO PLAY · {i + 1} OF {LESSONS.length}
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => go('menu')}>
            Menu
          </button>
        </div>
        <div className="lessontitle">{l.t}</div>
        <div className="lessonlines">
          {l.lines.map((ln, n) => (
            <div className="lline" key={n}>
              <Icon k={ln.icon} />
              <span>{ln.text}</span>
            </div>
          ))}
        </div>
        <div className="lessonfoot">
          <div className="dots">
            {LESSONS.map((_, n) => (
              <span className={'dot' + (n === i ? ' on' : '')} key={n} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="btn"
            disabled={i === 0}
            onClick={() => {
              ui.lesson = i - 1
              emit()
            }}
          >
            Back
          </button>
          <button className="btn pri" onClick={next}>
            {last ? 'Start guided run' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
