/** Copy keys of the running-turn TPS badge. */
export const zh = {
  /** The badge text; the live rate renders its dash while unknown. */
  display: 'TPS {live}',
  /** Unknown-rate placeholder. */
  dash: '--',
} as const

/** English copy of the badge (the TPS label is a shared tech abbreviation). */
export const en = {
  display: 'TPS {live}',
  dash: '--',
} as const

/** Typed union of the badge dictionary keys. */
export type TpsKey = keyof typeof zh
