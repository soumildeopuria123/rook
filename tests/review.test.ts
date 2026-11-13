import { describe, expect, test } from 'bun:test'
import {
  judge,
  MARKS,
  reviewGame,
  sacrificesMaterial,
  winPercent,
  type PlyInput,
} from '../src/shared/review'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
// A white knight on f3 can jump to e5, where the d6 pawn can take it.
const SACRIFICE = 'rnbqkbnr/ppp2ppp/3p4/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1'

const ply = (over: Partial<PlyInput> = {}): PlyInput => ({
  san: 'e4',
  fenBefore: START,
  fenAfter: AFTER_E4,
  played: 'e2e4',
  before: [{ uci: 'e2e4', cp: 20 }],
  after: [{ uci: 'e7e5', cp: -20 }],
  ...over,
})

/** A move that gives up `loss` centipawns against the engine's first choice. */
const losing = (loss: number): PlyInput =>
  ply({ played: 'd2d4', after: [{ uci: 'e7e5', cp: loss - 20 }] })

describe('judge', () => {
  test('the engine move with nothing given up is best', () => {
    expect(judge(ply()).verdict).toBe('best')
    expect(judge(ply()).loss).toBe(0)
  })

  test('a move that is far ahead of the alternatives is great', () => {
    const verdict = judge(
      ply({
        before: [
          { uci: 'e2e4', cp: 20 },
          { uci: 'd2d4', cp: -110 },
        ],
      }),
    )
    expect(verdict.verdict).toBe('great')
  })

  test('centipawn losses map onto the usual labels', () => {
    expect(judge(losing(15)).verdict).toBe('excellent')
    expect(judge(losing(50)).verdict).toBe('good')
    expect(judge(losing(80)).verdict).toBe('inaccuracy')
    expect(judge(losing(180)).verdict).toBe('mistake')
    expect(judge(losing(420)).verdict).toBe('blunder')
  })

  test('a losing move reports what the engine wanted instead', () => {
    const result = judge({
      ...losing(420),
      played: 'e2e3',
      before: [{ uci: 'e2e4', cp: 20 }],
    })
    expect(result.best).toBe('e4')
  })

  test('a sound sacrifice is brilliant rather than merely best', () => {
    const result = judge(
      ply({
        san: 'Ne5',
        fenBefore: SACRIFICE,
        fenAfter: 'rnbqkbnr/ppp2ppp/3p4/4N3/8/8/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
        played: 'f3e5',
        before: [{ uci: 'f3e5', cp: 200 }],
        after: [{ uci: 'd6e5', cp: -180 }],
      }),
    )
    expect(result.verdict).toBe('brilliant')
  })

  test('delivering checkmate is the best move, not a blunder', () => {
    // The terminal score belongs to the side to move, which is the mated side
    // after the move; reading it without flipping the sign graded every mating
    // move as the worst move of the game.
    const result = judge(
      ply({
        san: 'Ra8#',
        fenBefore: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        fenAfter: 'R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1',
        played: 'a1a8',
        before: [{ uci: 'a1a8', cp: 30 }],
        after: [],
      }),
    )
    expect(result.verdict).toBe('best')
    expect(result.loss).toBe(0)
  })

  test('an equally good alternative is still best and costs nothing', () => {
    const result = judge(
      ply({
        played: 'd2d4',
        before: [
          { uci: 'e2e4', cp: 20 },
          { uci: 'd2d4', cp: 14 },
        ],
        after: [{ uci: 'e7e5', cp: -14 }],
      }),
    )
    expect(result.verdict).toBe('best')
    expect(result.loss).toBe(0)
  })

  test('the played move is graded on its own score, not the next position', () => {
    const result = judge(
      ply({
        played: 'd2d4',
        playedScore: 18,
        before: [{ uci: 'e2e4', cp: 20 }],
        // A separate search of the next position claims White is lost; the
        // move's own score says the game is level.
        after: [{ uci: 'e7e5', cp: 900 }],
      }),
    )
    expect(result.verdict).toBe('best')
    expect(result.loss).toBe(0)
  })

  test('a couple of centipawns from a deep search is still best', () => {
    // Deeper searches drift by a handful of centipawns; that is the search, not
    // the player, so a move this close to the engine's own choice stays best.
    const result = judge(
      ply({
        played: 'd2d4',
        playedScore: 17,
        before: [{ uci: 'e2e4', cp: 20 }],
      }),
    )
    expect(result.verdict).toBe('best')
    expect(result.loss).toBe(0)
  })

  test('a longer forced mate is the same win as a shorter one', () => {
    const result = judge(
      ply({
        played: 'a1a7',
        playedScore: 99700,
        before: [{ uci: 'a1a8', cp: 99300 }],
      }),
    )
    expect(result.verdict).toBe('best')
    expect(result.loss).toBe(0)
  })

  test('throwing away a forced mate is a blunder', () => {
    const result = judge(
      ply({
        played: 'a1a7',
        before: [{ uci: 'a1a8', cp: 99700 }],
        after: [{ uci: 'g8f7', cp: 50 }],
      }),
    )
    expect(result.verdict).toBe('blunder')
  })

  test('an unscored move is left unjudged instead of guessed', () => {
    const result = judge(ply({ before: [] }))
    expect(result.verdict).toBe('good')
    expect(result.loss).toBe(0)
  })
})

describe('sacrificesMaterial', () => {
  test('a knight offered to a pawn counts', () => {
    expect(sacrificesMaterial(SACRIFICE, 'f3e5')).toBe(true)
  })

  test('a quiet pawn move does not', () => {
    expect(sacrificesMaterial(START, 'e2e4')).toBe(false)
  })

  test('garbage input is not a sacrifice', () => {
    expect(sacrificesMaterial(START, 'zzzz')).toBe(false)
  })
})

describe('winPercent', () => {
  test('an equal position is fifty per cent and a big lead is nearly all of it', () => {
    expect(winPercent(0)).toBe(50)
    expect(winPercent(1000)).toBeGreaterThan(90)
    expect(winPercent(-1000)).toBeLessThan(10)
  })
})

describe('reviewGame', () => {
  test('every move is graded and both sides are summarised', () => {
    const game = reviewGame([
      ply(),
      ply({
        san: 'd4',
        fenBefore: AFTER_E4,
        fenAfter: START,
        played: 'd7d6',
        before: [{ uci: 'd7d5', cp: 10 }],
        after: [{ uci: 'd2d4', cp: 510 }],
      }),
    ])
    expect(game.moves.map((m) => m.color)).toEqual(['w', 'b'])
    expect(game.white.counts.best).toBe(1)
    expect(game.black.counts.blunder).toBe(1)
    expect(game.black.errors).toBe(1)
    expect(game.white.accuracy).toBeGreaterThan(95)
  })

  test('the marks match the labels', () => {
    expect(MARKS.blunder).toBe('??')
    expect(MARKS.brilliant).toBe('!!')
  })
})
