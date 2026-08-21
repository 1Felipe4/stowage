import { coverage, evaluate } from './core'
import { R } from './state'

/* Lesson cards (read before a run) and the guided-run tutorial. The tutorial's
   `done` predicates are written against live state, not the design's fixed
   demo board, so they hold on any generated sector. */

export interface LessonLine {
  icon: string
  text: string
}
export interface Lesson {
  t: string
  lines: LessonLine[]
}

export const LESSONS: Lesson[] = [
  {
    t: 'The deck',
    lines: [
      { icon: 'GRIDX', text: 'Twenty bays, four across. Everything you own sits in one of them, and anything loose in the hold fails inspection.' },
      { icon: 'MASS', text: 'Every module weighs 1. An engine weighs nothing and lifts 4 more bays, so two engines is both the legal minimum and free capacity.' },
      { icon: 'CREW', text: 'One deckhand runs 4 mass. Past that a bay reads NO HAND and every burn carries a fuel surcharge.' }
    ]
  },
  {
    t: 'Heat',
    lines: [
      { icon: 'RCT', text: 'A reactor makes 6 power, runs at +3 heat and pushes +2 into every bay it touches. Engines run hot too, spilling +1.' },
      { icon: 'RAD', text: 'A radiator pulls 3 heat out of each neighbour, a cryo unit 2, and shielding stops reactor spill dead.' },
      { icon: 'ALERT', text: 'No occupied bay may read above +5. The number in the corner of each bay is what it reads now.' },
      { icon: 'WARP', text: 'Deeper stages add ambient heat to every bay, so a deck that passed last stage can fail the next. Cooling is an investment, not a one-off.' }
    ]
  },
  {
    t: 'Crew and air',
    lines: [
      { icon: 'BRT', text: 'Bunks sleep 2, life support breathes for 2. Everyone aboard needs both.' },
      { icon: 'COINS', text: 'Hands draw wages at every warp, so an idle hand is a hole in the ledger.' },
      { icon: 'CARGO', text: 'Livestock needs two tenders unless you carry a stock vet, and tenders count as souls too.' }
    ]
  },
  {
    t: 'Lanes and freight',
    lines: [
      { icon: 'ROUTE', text: 'Each lane costs fuel. Overmass adds a surcharge on top, so a bloated deck bleeds fuel every burn.' },
      { icon: 'TNK', text: 'A tank holds 6 and weighs the same empty as full. Fuel you cannot hold is vented.' },
      { icon: 'OKRING', text: 'Freight pays when you arrive at its destination with it still stowed. Sign only what you can carry.' }
    ]
  }
]

export interface TutStep {
  tab: 'port' | 'deck' | 'lanes' | 'chart'
  portTab?: 'market' | 'crew' | 'contracts'
  title: string
  body: string
  done: () => boolean
}

const engines = () => R.grid.filter((k) => k === 'THR').length + R.hold.filter((k) => k === 'THR').length

export const TUT: TutStep[] = [
  {
    tab: 'port',
    portTab: 'market',
    title: 'Fit a second engine.',
    body: 'Two is the legal minimum, and each one lifts 4 more bays for no mass of its own. Buy one from the yard list.',
    done: () => engines() >= 2
  },
  {
    tab: 'deck',
    title: 'Clear the hold.',
    body: 'Anything loose in the hold fails inspection. Tap an item, then tap a clear bay to stow it.',
    done: () => R.hold.length === 0
  },
  {
    tab: 'port',
    portTab: 'contracts',
    title: 'Sign for a contract.',
    body: 'Open Contracts and sign whatever is on offer here. Read its rule first — it decides where the crate can sit.',
    done: () => R.cargo.some((c) => c.taken)
  },
  {
    tab: 'deck',
    title: 'Stow the crate where its rule allows.',
    body: 'Instruments hate reactors and engines, cold chain needs cryo, volatiles need shielding all round. The checks below the deck tell you when it sits right.',
    done: () => R.hold.length === 0 && R.grid.some((k) => !!k && k[0] === '@')
  },
  {
    tab: 'deck',
    title: 'Clear the inspection.',
    body: 'Every check has to read green before the ship will burn. Tap a red one to light up the bays it means.',
    done: () => evaluate(R.grid).ok
  },
  {
    tab: 'port',
    portTab: 'crew',
    title: 'Mind the hands.',
    body: 'One hand runs 4 mass. If the deck strip shows bays with no hand, hire another — or accept the fuel surcharge on every burn.',
    done: () => coverage().idle.length === 0
  },
  {
    tab: 'chart',
    title: 'Plot your first burn.',
    body: 'Tap a node joined to yours by a line. You confirm the fuel before the ship moves — tap a far node instead to set a course.',
    done: () => R.visited.length > 1
  }
]
