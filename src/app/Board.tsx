import { useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square, type PieceSymbol } from 'chess.js'
import { Piece } from './Piece'

const names = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}
type Drag = {
  from: Square
  x: number
  y: number
  moving: boolean
  startX: number
  startY: number
}
export function Board({
  fen,
  pgn,
  orientation,
  turn,
  enabled,
  onMove,
}: {
  fen: string
  pgn: string
  orientation: Color
  turn: Color
  enabled: boolean
  onMove: (from: Square, to: Square, promotion?: string) => void
}) {
  const [selection, setSelection] = useState<Square | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [promotion, setPromotion] = useState<{
    from: Square
    to: Square
  } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const chess = useMemo(() => new Chess(fen), [fen])
  const positions = useMemo(() => {
    // Give pieces stable identities across moves, captures, castling and promotion
    // so CSS interpolates positions instead of replacing the board's DOM.
    const replay = new Chess(),
      ids = new Map<Square, string>()
    replay
      .board()
      .flat()
      .forEach((p) => {
        if (p) ids.set(p.square, p.square)
      })
    if (pgn) {
      const history = new Chess()
      history.loadPgn(pgn)
      for (const move of history.history({ verbose: true })) {
        const id = ids.get(move.from) ?? move.from
        ids.delete(move.from)
        ids.set(move.to, id)
        if (move.flags.includes('e'))
          ids.delete(`${move.to[0]}${move.from[1]}` as Square)
        if (move.flags.includes('k') || move.flags.includes('q')) {
          const rank = move.from[1],
            from = `${move.flags.includes('k') ? 'h' : 'a'}${rank}` as Square,
            to = `${move.flags.includes('k') ? 'f' : 'd'}${rank}` as Square
          ids.set(to, ids.get(from) ?? from)
          ids.delete(from)
        }
      }
    }
    return chess
      .board()
      .flat()
      .filter((p) => p !== null)
      .map((p) => ({ ...p, id: ids.get(p.square) ?? p.square }))
  }, [chess, pgn])
  const history = useMemo(() => {
    const game = new Chess()
    if (pgn) game.loadPgn(pgn)
    return game.history({ verbose: true }).at(-1)
  }, [pgn])
  const squares = Array.from(
    { length: 64 },
    (_, i) =>
      `${'abcdefgh'[orientation === 'w' ? i % 8 : 7 - (i % 8)]}${orientation === 'w' ? 8 - Math.floor(i / 8) : 1 + Math.floor(i / 8)}` as Square,
  )
  const selected =
    selection && chess.get(selection)?.color === turn && enabled
      ? selection
      : null
  const legal = selected
    ? chess.moves({ square: selected, verbose: true }).map((m) => m.to)
    : []
  const coordinate = (square: Square) => {
    const file = square.charCodeAt(0) - 97,
      rank = Number(square[1]) - 1
    return {
      x: orientation === 'w' ? file : 7 - file,
      y: orientation === 'w' ? 7 - rank : rank,
    }
  }
  const submit = (from: Square, to: Square) => {
    if (!enabled) return
    const moves = chess
      .moves({ square: from, verbose: true })
      .filter((m) => m.to === to)
    if (!moves.length) return
    setSelection(null)
    if (moves.some((m) => m.promotion)) setPromotion({ from, to })
    else onMove(from, to)
  }
  const select = (square: Square) => {
    if (selected && legal.includes(square)) {
      submit(selected, square)
      return
    }
    setSelection(chess.get(square)?.color === turn && enabled ? square : null)
  }
