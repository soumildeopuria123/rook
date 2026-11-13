import { Chess } from 'chess.js'
import { BOTS } from '../shared/bots'
import { chooseMove } from '../shared/engine'
import { playerBookMove } from '../shared/player-books'
import { personaOf } from '../shared/players'
import { chooseStyled } from '../shared/style'
import { uciToSan } from '../shared/uci'
import { stockfishMoves } from './stockfish'

self.onmessage = async (
  event: MessageEvent<{ pgn: string; revision: number; level: number }>,
) => {
  const { pgn, revision, level } = event.data
  const bot = BOTS[level] ?? BOTS[2]
  const chess = new Chess()
  if (pgn) chess.loadPgn(pgn)
  const persona = bot.persona ? personaOf(bot.persona) : null
  let move: string | null = null
  let source: 'book' | 'stockfish' | 'local' = 'local'

  // A named player opens with their own repertoire before the engine takes over.
  if (persona && Math.random() < bot.book) {
    const book = playerBookMove(persona.key, chess.fen())
    if (book) {
      move = book
      source = 'book'
    }
  }
  if (!move && bot.engine === 'stockfish') {
    // Choosing between several good moves is what gives a persona its style,
    // but it dilutes strength. In an endgame there is usually one conversion,
    // so the full search goes to a single line and gets longer to convert it.
    const men = chess.board().flat().filter(Boolean).length
    const endgame = men <= 12
    // Eight lines give the persona a real choice of plans; their habits then
    // separate the ones the engine rates equally.
    const candidates = await stockfishMoves(
      pgn,
      bot,
      persona && !endgame ? 8 : 1,
      endgame ? bot.budgetMs + 900 : bot.budgetMs,
    ).catch(() => null)
    if (candidates?.length) {
      const uci = persona
        ? chooseStyled(candidates, chess, persona)
        : candidates[0].uci
      move = uci ? uciToSan(pgn, uci) : null
      if (move) source = 'stockfish'
    }
  }
  // A missing or blocked engine quietly degrades to the built-in search.
  if (!move) move = chooseMove({ pgn }, level)
  self.postMessage({ move, revision, source })
}
