import { describe, expect, test } from 'bun:test'
import { Chess } from 'chess.js'
import { BOTS } from '../src/shared/bots'
import { OPENING_LINES, bookMoves } from '../src/shared/book'
import { chooseMove } from '../src/shared/engine'

const SABLE = BOTS.findIndex((bot) => bot.elo === 2100)
const VIKTOR = BOTS.findIndex((bot) => bot.elo === 1800)
const PIP = BOTS.findIndex((bot) => bot.elo === 600)

function legal(pgn: string, san: string | null) {
  if (!san) return false
  const chess = new Chess()
  if (pgn) chess.loadPgn(pgn)
  return chess.moves().includes(san)
}
function replay(moves: string[]) {
  const chess = new Chess()
  for (const san of moves) chess.move(san)
  return chess
}

describe('opening book', () => {
  test('every line is legal', () => {
    for (const line of OPENING_LINES) {
      const chess = new Chess()
      for (const uci of line.split(' ')) {
        chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.slice(4) || undefined,
        })
      }
    }
  })
  test('answers 1.e4 with several different black defences', () => {
    const after = replay(['e4'])
    const replies = bookMoves(after.fen())
    expect(replies.length).toBeGreaterThanOrEqual(3)
    for (const san of replies) expect(after.moves()).toContain(san)
  })
  test('answers 1.d4 with several different black defences', () => {
    const after = replay(['d4'])
    expect(bookMoves(after.fen()).length).toBeGreaterThanOrEqual(3)
  })
  test('knows main lines as white after 1.e4 e5', () => {
    expect(bookMoves(replay(['e4', 'e5']).fen())).toContain('Nf3')
  })
  test('follows the book into a real line but leaves it when the position is new', () => {
    const mainline = replay(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
    expect(bookMoves(mainline.fen())).toContain('a6')
    const sideline = replay(['e4', 'e5', 'Nf3', 'Nc6', 'h3'])
    expect(bookMoves(sideline.fen())).toEqual([])
  })
  test('the 2100 bot opens from the book', () => {
    const after = replay(['e4'])
    expect(bookMoves(after.fen())).toContain(chooseMove({ pgn: '1. e4' }, SABLE))
  })
})

describe('practice engine', () => {
  test('the 2100 bot finds mate in one', () => {
    const pgn = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6'
    expect(replay(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6']).moves()).toContain(
      'Qxf7#',
    )
    expect(chooseMove({ pgn }, SABLE)).toBe('Qxf7#')
  })
  test('the top bot takes a free queen', () => {
    const fen = 'k3q3/8/8/8/8/8/8/4R1K1 w - - 0 1'
    expect(chooseMove({ fen }, SABLE)).toBe('Rxe8+')
  })
  test('the top bot promotes a passed pawn', () => {
    const fen = '8/P6k/8/8/8/8/8/4K3 w - - 0 1'
    expect(chooseMove({ fen }, SABLE)).toBe('a8=Q')
  })
  test('the top bot mates with king and rook', () => {
    const fen = '7k/8/6K1/8/8/8/8/7R w - - 0 1'
    // Two mates exist here; either conversion is correct.
    expect(['Rh7#', 'Kf7#']).toContain(chooseMove({ fen }, SABLE))
  })
  test('every level returns a legal move', () => {
    BOTS.forEach((bot, level) => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4'
      expect(legal(pgn, chooseMove({ pgn }, level))).toBe(true)
      expect(bot.elo).toBeGreaterThan(0)
    })
  })
  test('a finished game has no move to play', () => {
    expect(chooseMove({ pgn: '1. f3 e5 2. g4 Qh4#' }, SABLE)).toBeNull()
  })
  test('the deep levels stay inside their time budget', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5'
    for (const level of [VIKTOR, SABLE]) {
      const started = Date.now()
      const move = chooseMove({ pgn }, level)
      const elapsed = Date.now() - started
      expect(legal(pgn, move)).toBe(true)
      expect(elapsed).toBeLessThan(BOTS[level].budgetMs + 3000)
    }
  })
  test('the weakest bot still answers quickly', () => {
    const started = Date.now()
    expect(legal('', chooseMove({ pgn: '' }, PIP))).toBe(true)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
