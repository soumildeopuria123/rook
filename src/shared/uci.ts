import { Chess } from 'chess.js'

/** The move from a `bestmove` line, or null for none/resignation. */
export function parseBestMove(line: string): string | null {
  const match = /^bestmove\s+(\S+)/.exec(line.trim())
  if (!match || match[1] === '(none)' || match[1] === '0000') return null
  return match[1]
}

export type Info = { multipv: number; cp: number; uci: string }

/**
 * The engine's score for one of its ranked moves. Multi-move analysis prints
 * one of these per candidate before `bestmove`.
 */
export function parseInfo(line: string): Info | null {
  if (!line.startsWith('info')) return null
  const pv = / pv (\S+)/.exec(line)
  if (!pv) return null
  const multipv = Number(/multipv (\d+)/.exec(line)?.[1] ?? 1)
  const centipawns = /score cp (-?\d+)/.exec(line)
  const mate = /score mate (-?\d+)/.exec(line)
  let cp: number
  if (centipawns) cp = Number(centipawns[1])
  else if (mate) {
    const moves = Number(mate[1])
    cp = moves > 0 ? 100000 - moves * 100 : -100000 - moves * 100
  } else return null
  return { multipv, cp, uci: pv[1] }
}

/** Convert a UCI move such as `e2e4` or `a7a8q` into SAN for this position. */
export function uciToSan(pgn: string, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null
  const chess = new Chess()
  if (pgn) chess.loadPgn(pgn)
  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    })
    return move?.san ?? null
  } catch {
    return null
  }
}
