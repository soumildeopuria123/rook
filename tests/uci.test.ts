import { describe, expect, test } from 'bun:test'
import { Chess } from 'chess.js'
import { BOTS } from '../src/shared/bots'
import { parseBestMove, parseInfo, uciToSan } from '../src/shared/uci'
import { PERSONAS } from '../src/shared/players'

describe('external engine protocol', () => {
  test('reads the move from a bestmove line', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove a7a8q')).toBe('a7a8q')
    expect(parseBestMove('bestmove (none)')).toBeNull()
    expect(parseBestMove('info depth 12 score cp 30')).toBeNull()
  })
  test('converts engine moves into the notation the game stores', () => {
    expect(uciToSan('', 'e2e4')).toBe('e4')
    expect(uciToSan('', 'g1f3')).toBe('Nf3')
    expect(uciToSan('1. e4 e5', 'g1f3')).toBe('Nf3')
    expect(uciToSan('1. f3 e5 2. g4', 'd8h4')).toBe('Qh4#')
    expect(uciToSan('', 'e2e5')).toBeNull()
    expect(uciToSan('', 'nonsense')).toBeNull()
  })
  test('promotion is preserved', () => {
    const fen = '8/P6k/8/8/8/8/8/4K3 w - - 0 1'
    const chess = new Chess(fen)
    expect(uciToSan(chess.pgn(), 'a7a8q')).toBe('a8=Q')
    expect(uciToSan(chess.pgn(), 'a7a8n')).toBe('a8=N')
  })
  test('reads a ranked move out of an info line', () => {
    const line =
      'info depth 12 seldepth 18 multipv 2 score cp 34 nodes 1200 pv g1f3 b8c6'
    expect(parseInfo(line)).toEqual({ multipv: 2, cp: 34, uci: 'g1f3' })
    const mate = 'info depth 5 multipv 1 score mate 3 pv d1h5 g8f6'
    expect(parseInfo(mate)!.cp).toBeGreaterThan(99000)
    expect(parseInfo('info string NNUE evaluation using nn-abc.nnue')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
  test('the roster tops out with two Stockfish levels then the players', () => {
    const powered = BOTS.filter((bot) => bot.engine === 'stockfish')
    expect(powered.slice(0, 2).map((bot) => bot.elo)).toEqual([2500, 2800])
    expect(powered.slice(2).map((bot) => bot.persona).sort()).toEqual(
      PERSONAS.map((persona) => persona.key).sort(),
    )
    expect(powered.every((bot) => bot.elo === Math.round(bot.elo))).toBe(true)
    expect(BOTS[0].engine).toBe('local')
  })
})
