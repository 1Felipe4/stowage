import { LUCIDE } from './lucide'

/* The design draws everything with lucide. We vendor the paths (see
   scripts/gen-lucide.mjs) rather than pulling the Iconify CDN, so the installed
   PWA still has its icons with no network and nothing to allow through the CSP.

   Game codes map onto lucide names here, so component code can keep asking for
   'RCT' or 'CARGO' and get whatever art the design assigns. */
const ALIAS: Record<string, string> = {
  // modules
  RCT: 'atom',
  BAT: 'battery-charging',
  RAD: 'thermometer-snowflake',
  CRY: 'snowflake',
  LSP: 'wind',
  BRT: 'bed-double',
  THR: 'rocket',
  SHD: 'shield',
  TNK: 'fuel',
  // world
  CARGO: 'package',
  CREW: 'user-round',
  FUEL: 'droplet',
  PORT: 'store',
  WARP: 'waypoints',
  MASS: 'weight',
  ROUTE: 'route',
  // chrome
  CHECK: 'check',
  X: 'x',
  ALERT: 'triangle-alert',
  OKRING: 'circle-check',
  GRIDX: 'layout-grid',
  TAGI: 'tag',
  STOWIN: 'arrow-down-to-line',
  PLUS: 'plus',
  MINUS: 'minus',
  COINS: 'coins',
  BAG: 'shopping-bag',
  BAN: 'ban',
  SHARE: 'share-2',
  FLAG: 'flag',
  PLAY: 'play',
  TEACH: 'graduation-cap',
  CUP: 'trophy',
  CHEV: 'chevron-right',
  MENU: 'menu',
  // chip vocabulary from the design
  POWER: 'zap',
  HEAT: 'flame',
  SPILL: 'flame-kindling',
  COLD: 'snowflake',
  SOULS: 'users',
  AIR: 'wind',
  BUNK: 'bed-double',
  OFFER: 'package-plus',
  PAYOUT: 'hand-coins',
  LIFT: 'move-up-right',
  SHIELDOK: 'shield-check',
  MOVE: 'move',
  TRASH: 'trash-2',
  SIGN: 'pen-line',
  CROSS: 'crosshair',
  EMPTY: 'square-dashed',
  LOCK: 'lock',
  DOT: 'dot',
  ORBIT: 'orbit',
  SKIP: 'skip-forward',
  INBOX: 'inbox',
  HIREPLUS: 'user-plus',
  FIRE: 'user-round-minus'
}

export function Icon({ k, cls }: { k: string; cls?: string }) {
  const name = ALIAS[k] ?? k
  const path = LUCIDE[name]
  if (!path) return null
  return (
    <svg
      className={'ic ' + (cls || '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: path }}
    />
  )
}
