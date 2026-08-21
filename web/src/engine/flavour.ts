/* Flavour for contracts: what the crate actually holds, and who is paying.
   Purely cosmetic — the engine keys off `kind`, never off these strings — but
   it is what turns "CRATE B" into a story you retell. */

export const GOODS: Record<string, string[]> = {
  instrument: [
    'survey interferometer',
    'gravimetric sled',
    'atomic clock array',
    'spectrograph mirror',
    'seismic sounder',
    'calibration standard',
    'star tracker assembly',
    'inertial platform'
  ],
  cold: [
    'vaccine stock',
    'coral spawn',
    'marrow cultures',
    'seed vault trays',
    'blood plasma',
    'gamete bank',
    'enzyme reagents',
    'tissue grafts'
  ],
  living: [
    'dairy heifers',
    'breeding sows',
    'draught oxen',
    'angora goats',
    'laying hens',
    'alpaca herd',
    'quail stock',
    'honeybee colonies',
    'reef fry',
    'sled dogs'
  ],
  volatile: [
    'mining slurry',
    'oxidiser stock',
    'raw monopropellant',
    'blasting gel',
    'reactor coolant salt',
    'flux compound',
    'catalyst paste',
    'lithium melt'
  ],
  unbraced: [
    'drydock crane arm',
    'reactor pressure vessel',
    'bridge truss section',
    'smelter drum',
    'turbine housing',
    'ore hopper',
    'habitat ring segment',
    'anchor plate'
  ]
}

/** Consignors. A mix of registries, co-ops and single names — the texture of
    people who actually ship freight. */
export const CLIENTS: string[] = [
  'Halberd Mining',
  'Vela Cold Chain',
  'Ostrow & Daughters',
  'Kesselring Yards',
  'the Tannhauser Co-op',
  'Ferrous Reach Holdings',
  'Marisol Freight',
  'the Sisters of Pelagia',
  'Ninefold Salvage',
  'Bright Meridian Lines',
  'Corvid Assay',
  'the Ashgrove Estate',
  'Pallas Agricultural',
  'Whitlock Bonded',
  'the Redwater Concern',
  'Sabik Instruments',
  'Oyelaran Brothers',
  'the Cattermole Trust',
  'Iron Wake Hauling',
  'Nakamura Reclamation'
]

/** Deterministic pick so a seed always tells the same story. */
export function pick<T>(list: T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)]
}
