/**
 * Player personalities. Each one opens from a book built out of that player's
 * own tournament games (see scripts/build-player-books.ts) and then hands the
 * position to the engine, which is allowed to pick among its top moves by the
 * persona's taste. This imitates a player; it is not a model trained on them.
 */
export type PersonaKey =
  | 'carlsen'
  | 'nakamura'
  | 'gukesh'
  | 'sindarov'
  | 'tal'
  | 'kasparov'
  | 'anand'
  | 'fischer'
  | 'karpov'

export type Persona = {
  key: PersonaKey
  name: string
  /** The short name used on the picker card. */
  short: string
  country: string
  /** Advertised strength, close to the player's published rating. */
  elo: number
  tagline: string
  /** 0 quiet and positional, 1 forcing and sacrificial. */
  aggression: number
  /** 0 trades into simple positions, 1 keeps the tension and the pieces on. */
  complexity: number
}

export const PERSONAS: readonly Persona[] = [
  {
    key: 'carlsen',
    name: 'Magnus Carlsen',
    short: 'Magnus',
    country: 'Norway',
    elo: 2830,
    tagline: 'Squeezes every endgame',
    aggression: 0.35,
    complexity: 0.3,
  },
  {
    key: 'nakamura',
    name: 'Hikaru Nakamura',
    short: 'Hikaru',
    country: 'United States',
    elo: 2790,
    tagline: 'Sharp, fast and tactical',
    aggression: 0.75,
    complexity: 0.85,
  },
  {
    key: 'gukesh',
    name: 'Gukesh D',
    short: 'Gukesh',
    country: 'India',
    elo: 2760,
    tagline: 'Cold calculation, deep prep',
    aggression: 0.5,
    complexity: 0.6,
  },
  {
    key: 'sindarov',
    name: 'Javokhir Sindarov',
    short: 'Javokhir',
    country: 'Uzbekistan',
    elo: 2680,
    tagline: 'Unorthodox and inventive',
    aggression: 0.85,
    complexity: 0.75,
  },
  // Peak ratings, from eras when openings and tempo differed; their books come
  // from their own games rather than today's theory.
  {
    key: 'tal',
    name: 'Mikhail Tal',
    short: 'Tal',
    country: 'Latvia',
    elo: 2700,
    tagline: 'Sacrifices first, calculates later',
    aggression: 0.95,
    complexity: 0.9,
  },
  {
    key: 'karpov',
    name: 'Anatoly Karpov',
    short: 'Karpov',
    country: 'Russia',
    elo: 2775,
    tagline: 'Squeezes a position dry',
    aggression: 0.2,
    complexity: 0.15,
  },
  {
    key: 'fischer',
    name: 'Robert Fischer',
    short: 'Fischer',
    country: 'United States',
    elo: 2785,
    tagline: 'Confident, precise, ruthless',
    aggression: 0.55,
    complexity: 0.5,
  },
  {
    key: 'anand',
    name: 'Viswanathan Anand',
    short: 'Anand',
    country: 'India',
    elo: 2790,
    tagline: 'Lightning calculation',
    aggression: 0.6,
    complexity: 0.55,
  },
  {
    key: 'kasparov',
    name: 'Garry Kasparov',
    short: 'Kasparov',
    country: 'Russia',
    elo: 2850,
    tagline: 'Dynamic pressure, no mercy',
    aggression: 0.75,
    complexity: 0.8,
  },
]

export const personaOf = (key: PersonaKey): Persona =>
  PERSONAS.find((persona) => persona.key === key) ?? PERSONAS[0]
