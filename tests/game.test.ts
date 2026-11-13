import { describe, expect, test } from 'bun:test'
import { Chess } from 'chess.js'
import {
  actorFor,
  newGame,
  joinGame,
  moveGame,
  settleClock,
  publicGame,
  type Game,
} from '../src/shared/game'

const white = { id: 'white', name: 'White', sub: 'private-white-sub' }
const black = { id: 'black', name: 'Black', sub: null }
function playing() {
  return joinGame(
    newGame(
      white,
      { minutes: 3, increment: 2, public: false, color: 'w' },
      1000,
    ),
    black,
    2000,
  )
}
function moves(game: Game, sequence: string[]) {
  let now = game.tickAt
  for (const san of sequence) {
    const chess = new Chess()
    if (game.pgn) chess.loadPgn(game.pgn)
    const actor = chess.turn() === 'w' ? white.id : black.id
    const move = chess.move(san)
    game = moveGame(
      game,
      actor,
      move.from,
      move.to,
      move.promotion,
      (now += 100),
    )
