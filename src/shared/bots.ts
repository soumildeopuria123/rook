import { personaOf, type PersonaKey } from './players'

export type Bot = {
  /** Advertised strength. A difficulty label for this opponent, not a measured rating. */
  elo: number
  name: string
  /** Chance the bot plays any legal move rather than one of its best. */
  blunder: number
  /** How many of its best moves it picks between. */
  slack: number
  /** How many centipawns worse than its best move it will still consider. */
  margin: number
  /** Plies searched. Levels above two also use alpha-beta and capture search. */
  depth: number
  /** Search budget, in milliseconds. */
  budgetMs: number
  /** Chance of playing a book move when the position is known. */
  book: number
  /** Where the move comes from: the built-in search or Stockfish. */
  engine: 'local' | 'stockfish'
  /** A named player, whose own games supply the book and whose taste shapes the move. */
  persona?: PersonaKey
}

const local = (
  elo: number,
  name: string,
  blunder: number,
  slack: number,
  margin: number,
  depth: number,
  budgetMs: number,
  book: number,
): Bot => ({
  elo,
  name,
  blunder,
  slack,
  margin,
  depth,
  budgetMs,
  book,
  engine: 'local',
})

const player = (key: PersonaKey): Bot => {
  const persona = personaOf(key)
  return {
    elo: persona.elo,
    name: persona.name,
    blunder: 0,
    slack: 1,
    margin: 0,
    depth: 4,
    budgetMs: 1500,
    // The opening is the player's own repertoire: always their move when the
    // position is known, so two players never drift into the same lines
    // because the engine happened to take over. The engine takes over once the
    // game leaves the book, and then their habits still shape the choice.
    book: 1,
    engine: 'stockfish',
    persona: key,
  }
}

export const BOTS: readonly Bot[] = [
  local(600, 'Pip', 0.5, 8, 500, 2, 250, 0),
  local(900, 'Nell', 0.32, 5, 350, 2, 250, 0),
  local(1200, 'Bruno', 0.18, 3, 250, 2, 250, 0.15),
  local(1500, 'Mara', 0.1, 2, 150, 2, 250, 0.5),
  local(1800, 'Viktor', 0.03, 2, 40, 3, 900, 0.85),
  local(2100, 'Sable', 0, 1, 0, 4, 1600, 1),
  // Stockfish with UCI_LimitStrength: a calibrated cap, not a human-taught model.
  { elo: 2500, name: 'Titan', blunder: 0, slack: 1, margin: 0, depth: 4, budgetMs: 900, book: 0, engine: 'stockfish' },
  { elo: 2800, name: 'Oracle', blunder: 0, slack: 1, margin: 0, depth: 4, budgetMs: 1400, book: 0, engine: 'stockfish' },
  player('sindarov'),
  player('tal'),
  player('gukesh'),
  player('karpov'),
  player('fischer'),
  player('anand'),
  player('nakamura'),
  player('carlsen'),
  player('kasparov'),
]
