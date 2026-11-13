import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Flag,
  History,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  Shuffle,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Board } from './Board'
import { Piece } from './Piece'
import {
  CONTROLS,
  finish,
  moveGame,
  newGame,
  publicGame,
  remaining,
  settleClock,
  type Game,
  type PublicGame,
} from '../shared/game'
import { connectRealtime } from '../../freebuff-realtime/browser.js'
import { BOTS } from '../shared/bots'
import { personaOf } from '../shared/players'
import { MARKS, reviewGame, type Review } from '../shared/review'
import { analyseMove, analysePosition } from './stockfish'
import { AuthPage } from './AuthPage'
import { Dashboard } from './Dashboard'
import { isAuthPath, isDashboardPath } from '../shared/links'
import { signOut, type Session } from './session'
import {
  DEFAULT_THEME,
  THEMES,
  isThemeId,
  themeOf,
  themeProperties,
  type ThemeId,
} from '../shared/themes'

async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    data === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  )
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok)
    throw new Error(body.error || 'Connection interrupted. Try again.')
  return body as T
}
function time(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [])
  return now
}
function PlayerBar({
  name,
  color,
  ms,
  active,
  you,
  waiting,
  connected,
}: {
  name: string
  color: Color
  ms: number
  active: boolean
  you: boolean
  waiting?: boolean
  connected?: boolean
}) {
  return (
    <div className={`player-bar ${active ? 'active' : ''}`}>
      <div className={`player-avatar ${color}`}>
        <Piece type="k" color={color} />
      </div>
      <div className="player-identity">
        <strong>{name}</strong>
        <span>
          {waiting
            ? 'Open seat'
            : you
              ? 'You'
              : color === 'w'
                ? 'White pieces'
                : 'Black pieces'}
          {connected && <i className="presence-dot" title="Connected" />}
        </span>
      </div>
      <div
        className={`clock ${active ? 'ticking' : ''} ${ms < 30000 && active ? 'low' : ''}`}
      >
        <Clock3 size={17} />
        <span>{time(ms)}</span>
      </div>
    </div>
  )
}
const blank = new Chess()
/** Side of the square crop stage, in CSS pixels. */
const CROP_STAGE = 210
const AVATAR_SIZE = 128
/** The last theme this browser chose, so the board paints in it on first render. */
function rememberTheme(id: ThemeId) {
  try {
    localStorage.setItem('rook:theme', id)
  } catch {
    /* Private modes refuse storage; the theme still applies to this page. */
  }
}
export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [game, setGame] = useState<PublicGame | null>(null)
  const [practice, setPractice] = useState<Game | null>(null)
  const [lobby, setLobby] = useState<PublicGame[]>([])
  const [games, setGames] = useState<PublicGame[]>([])
  const [stats, setStats] = useState<{
    played: number
    wins: number
    draws: number
  } | null>(null)
  const [panel, setPanel] = useState<'play' | 'history'>('play')
  const [control, setControl] = useState(2)
  const [color, setColor] = useState<'w' | 'b' | 'random'>('random')
  const [bot, setBot] = useState(2)
  const [flipped, setFlipped] = useState(false)
  const chooseColor = (next: 'w' | 'b' | 'random') => {
    setColor(next)
    setFlipped(false)
  }
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem('rook:sound') !== '0'
    } catch {
      return true
    }
  })
  // What the settings dialog is editing, until it is saved.
  const [draft, setDraft] = useState<{ name: string; avatar: string | null }>({
    name: '',
    avatar: null,
  })
  const avatarInput = useRef<HTMLInputElement>(null)
  const [crop, setCrop] = useState<{
    image: HTMLImageElement
    width: number
    height: number
  } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const cropDrag = useRef<{
    x: number
    y: number
    ox: number
    oy: number
  } | null>(null)
  const cropScale = crop
    ? (CROP_STAGE / Math.min(crop.width, crop.height)) * zoom
    : 1
  const cropSize = crop
    ? { width: crop.width * cropScale, height: crop.height * cropScale }
    : { width: 0, height: 0 }
  const reach = {
    x: Math.max(0, (cropSize.width - CROP_STAGE) / 2),
    y: Math.max(0, (cropSize.height - CROP_STAGE) / 2),
  }
  const hold = (x: number, y: number) => ({
    x: Math.min(reach.x, Math.max(-reach.x, x)),
    y: Math.min(reach.y, Math.max(-reach.y, y)),
  })
  const zoomTo = (next: number) => {
    const value = Math.min(3, Math.max(1, next))
    setZoom(value)
    if (!crop) return
    const scale = (CROP_STAGE / Math.min(crop.width, crop.height)) * value
    const x = Math.max(0, (crop.width * scale - CROP_STAGE) / 2)
    const y = Math.max(0, (crop.height * scale - CROP_STAGE) / 2)
    setCropOffset((current) => ({
      x: Math.min(x, Math.max(-x, current.x)),
      y: Math.min(y, Math.max(-y, current.y)),
    }))
  }
  /** Bake the visible square, at the chosen framing, into the stored avatar. */
  const applyCrop = () => {
    if (!crop) return
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!context) return
    const k = AVATAR_SIZE / CROP_STAGE
    const width = cropSize.width * k,
      height = cropSize.height * k
    context.drawImage(
      crop.image,
      (AVATAR_SIZE - width) / 2 + cropOffset.x * k,
      (AVATAR_SIZE - height) / 2 + cropOffset.y * k,
      width,
      height,
    )
    setDraft((current) => ({
      ...current,
      avatar: canvas.toDataURL('image/jpeg', 0.86),
    }))
    setCrop(null)
  }
  const changeSound = (next: boolean) => {
    setSound(next)
    try {
      localStorage.setItem('rook:sound', next ? '1' : '0')
    } catch {
      /* Private modes refuse storage; the choice still holds on this page. */
    }
    if (session?.signedIn) void api('/profile', { sound: next }).catch(() => {})
  }
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('rook:theme')
      if (isThemeId(saved)) return saved
    } catch {
      /* Nothing saved yet. */
    }
    return DEFAULT_THEME
  })
  const [themeOpen, setThemeOpen] = useState(false)
  const themePicker = useRef<HTMLDivElement>(null)
  const chooseTheme = (id: ThemeId) => {
    setThemeId(id)
    setThemeOpen(false)
    rememberTheme(id)
    if (session?.signedIn) void api('/preferences', { theme: id }).catch(() => {})
  }
  const [review, setReview] = useState<number | null>(null)
  const [analysis, setAnalysis] = useState<Review | null>(null)
  const [analysing, setAnalysing] = useState<{
    done: number
    total: number
  } | null>(null)
  const analysisToken = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [confirm, setConfirm] = useState<
    'resign' | 'help' | 'settings' | null
  >(null)
  const [copied, setCopied] = useState(false)
  const [connection, setConnection] = useState('connecting')
  const [peers, setPeers] = useState(0)
  const [ready, setReady] = useState(false)
  const moveList = useRef<HTMLDivElement>(null)
  const computer = useRef<Worker | null>(null)
  const dialog = useRef<HTMLElement>(null)
  const now = useNow()
  const offset = useRef(0),
    lastRevision = useRef(-1),
    gameId = useRef<string | null>(null),
    audio = useRef<AudioContext | null>(null)
  const current = practice ? publicGame(practice, 'practice-you', now) : game
  const active = current?.status === 'playing',
    waiting = current?.status === 'waiting'
  // Before a game exists, the board follows the side you have chosen.
  const picked = current?.seat ?? (color === 'random' ? null : color)
  const orientation: Color = (picked === 'b') !== flipped ? 'b' : 'w'
  const turn = (current?.fen.split(' ')[1] || 'w') as Color
  const practiceBotSide: Color =
    practice?.white?.id === 'practice-computer' ? 'w' : 'b'
  const visible = useMemo(() => {
    const chess = new Chess()
    if (current?.pgn) chess.loadPgn(current.pgn)
    if (review !== null) {
      while (chess.history().length > review) chess.undo()
    }
    return { fen: chess.fen(), pgn: chess.pgn(), check: chess.inCheck() }
  }, [current?.pgn, review])
  const accept = useCallback((next: PublicGame) => {
    if (gameId.current !== next.id) {
      gameId.current = next.id
      lastRevision.current = -1
      setReview(null)
      setFlipped(false)
      analysisToken.current += 1
      setAnalysis(null)
      setAnalysing(null)
    }
    if (next.revision < lastRevision.current) return
    lastRevision.current = next.revision
    offset.current = next.serverNow - Date.now()
    setGame(next)
  }, [])
  const refresh = useCallback(
    async (id: string) => {
      const next = await api<PublicGame>(`/games/${id}`)
      if (gameId.current === id) accept(next)
    },
    [accept],
  )
  useEffect(() => {
    let live = true
    api<Session>('/session', {})
      .then(async (s) => {
        if (!live) return
        setSession(s)
        if (s.signedIn) setSound(s.sound)
        // Arriving from the account page's profile link opens the dialog.
        if (new URL(location.href).searchParams.has('settings')) {
          setDraft({ name: s.name, avatar: s.avatar })
          setConfirm('settings')
          const clean = new URL(location.href)
          clean.searchParams.delete('settings')
          history.replaceState({}, '', `${clean.pathname}${clean.search}`)
        }
        // The account's choice wins over the browser's last one.
        if (isThemeId(s.theme)) {
          setThemeId(s.theme)
          rememberTheme(s.theme)
        }
        setReady(true)
        const id = new URL(location.href).searchParams.get('game')
        if (id) {
          const next = await api<PublicGame>(`/games/${encodeURIComponent(id)}`)
          if (live) accept(next)
        }
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [accept])
  useEffect(() => {
    if (!themeOpen) return
    const dismiss = (event: PointerEvent) => {
      if (!themePicker.current?.contains(event.target as Node))
        setThemeOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setThemeOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [themeOpen])
  useEffect(() => {
    if (!ready) return
    let live = true
    const load = () =>
      api<PublicGame[]>('/games')
        .then((result) => {
          if (live) setLobby(result)
        })
        .catch(() => {})
    void load()
    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, 8000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [ready, game?.id])
  useEffect(() => {
    if (!ready || panel !== 'history') return
    api<{ games: PublicGame[]; stats: typeof stats }>('/history')
      .then((result) => {
        setGames(result.games)
        setStats(result.stats)
      })
      .catch((e) => setError(e.message))
  }, [ready, panel])
  useEffect(() => {
    if (
      !game ||
      practice ||
      game.status === 'cancelled' ||
      game.status === 'finished'
    )
      return
    const id = game.id
    const sync = () => {
      if (!document.hidden)
        void refresh(id).catch(() => {
          /* The next snapshot repairs transient HTTP failures. */
        })
    }
    const timer = setInterval(sync, 4000)
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', sync)
    const socket =
      session?.realtime && game.seat
        ? connectRealtime({
            room: `game:${id}`,
            onStatus: (status: string) => setConnection(status),
            onMessage: (message: {
              type: string
              members?: unknown[]
              userId?: string | null
            }) => {
              if (
                message.type === 'ready' ||
                (message.type === 'broadcast' && message.userId === null)
              )
                sync()
              if (message.type === 'presence')
                setPeers(message.members?.length || 0)
            },
          })
        : null
    return () => {
      clearInterval(timer)
      socket?.close()
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
      setPeers(0)
    }
  }, [
    game?.id,
    game?.seat,
    game?.status,
    practice !== null,
    ready,
    session?.realtime,
    refresh,
  ])
  useEffect(() => {
    if (!practice || practice.status !== 'playing' || turn !== practiceBotSide)
      return
    // One engine worker for the session. Rebuilding it for every move would
    // recompile the 1.8 MB engine and spend the thinking budget on start-up.
    computer.current ??= new Worker(new URL('./computer.ts', import.meta.url), {
      type: 'module',
    })
    const worker = computer.current
    const snapshot = practice
    worker.onmessage = ({
      data,
    }: MessageEvent<{ move: string | null; revision: number }>) => {
      const chess = new Chess()
      if (snapshot.pgn) chess.loadPgn(snapshot.pgn)
      if (!data.move) return
      const move = chess.move(data.move)
      if (move)
        setPractice((previous) =>
          previous?.revision === data.revision
            ? {
                ...moveGame(
                  previous,
                  'practice-computer',
                  move.from,
                  move.to,
                  move.promotion,
                  Date.now(),
                ),
                revision: previous.revision + 1,
              }
            : previous,
        )
    }
    const timer = setTimeout(
      () =>
        worker.postMessage({
          pgn: snapshot.pgn,
          revision: snapshot.revision,
          level: bot,
        }),
      120,
    )
    return () => clearTimeout(timer)
  }, [practice?.revision, practice?.status, turn, bot, practiceBotSide])
  useEffect(
    () => () => {
      computer.current?.terminate()
      computer.current = null
    },
    [],
  )
  useEffect(() => {
    if (!current?.moves.length || !sound) return
    try {
      audio.current ??= new AudioContext()
      const ctx = audio.current,
        oscillator = ctx.createOscillator(),
        gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(500, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(
        180,
        ctx.currentTime + 0.055,
      )
      gain.gain.setValueAtTime(0.07, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.09)
    } catch {
      /* Audio is optional, including browsers that require a gesture. */
    }
  }, [current?.moves.length, sound])
  useEffect(() => {
    if (practice?.status !== 'playing') return
    const settled = settleClock(practice, now)
    if (settled !== practice) setPractice(settled)
  }, [now, practice])
  useEffect(() => {
    if (current?.status === 'playing') window.scrollTo({ top: 0 })
  }, [current?.id, current?.status])
  useEffect(() => {
    if (review === null && moveList.current)
      moveList.current.scrollTop = moveList.current.scrollHeight
  }, [current?.moves.length, review])
  useEffect(() => {
    if (!joinOpen && !confirm) return
    const previous = document.activeElement as HTMLElement | null
    const root = dialog.current
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, a[href]',
        ) ?? [],
      )
    const preferred = root?.querySelector<HTMLElement>('input, [autofocus]')
    ;(preferred ?? focusable()[0])?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setJoinOpen(false)
        setConfirm(null)
      }
      if (event.key !== 'Tab') return
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      previous?.focus()
    }
  }, [joinOpen, confirm])
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const openSettings = () => {
    setDraft({
      name: session?.name ?? '',
      avatar: session?.avatar ?? null,
    })
    setCrop(null)
    setConfirm('settings')
  }
  const chooseAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        setCrop({
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
        setZoom(1)
        setCropOffset({ x: 0, y: 0 })
      }
      image.onerror = () => setError('That file is not an image.')
      image.src = String(reader.result)
    }
    reader.onerror = () => setError('That file could not be read.')
    reader.readAsDataURL(file)
  }
  const saveProfile = () =>
    run(async () => {
      if (!session?.signedIn) {
        setConfirm(null)
        return
      }
      const updated = await api<Session>('/profile', {
        name: draft.name,
        avatar: draft.avatar,
        sound,
      })
      setSession((current) => (current ? { ...current, ...updated } : current))
      setConfirm(null)
    })
  const openGame = (next: PublicGame) => {
    setPractice(null)
    accept(next)
    setPanel('play')
    window.scrollTo({ top: 0 })
    history.replaceState(null, '', `?game=${next.id}`)
  }
  const create = (isPublic: boolean) =>
    run(async () =>
      openGame(
        await api<PublicGame>('/games', {
          ...CONTROLS[control],
          public: isPublic,
          color,
        }),
      ),
    )
  const join = (id: string) =>
    run(async () => {
      openGame(
        await api<PublicGame>(`/games/${encodeURIComponent(id)}/join`, {}),
      )
      setJoinOpen(false)
    })
  const action = (name: string, data: object = {}) =>
    run(async () => {
      if (!game) return
      try {
        accept(
          await api<PublicGame>(`/games/${game.id}/${name}`, {
            revision: game.revision,
            ...data,
          }),
        )
        setReview(null)
      } catch (e) {
        await refresh(game.id)
        throw e
      }
    })
  const move = (from: Square, to: Square, promotion?: string) => {
    if (practice) {
      try {
        setPractice({
          ...moveGame(
            practice,
            'practice-you',
            from,
            to,
            promotion,
            Date.now(),
          ),
          revision: practice.revision + 1,
        })
      } catch (e) {
        setError((e as Error).message)
      }
    } else void action('move', { from, to, promotion })
  }
  // A review asks the engine about every position in the game, one at a time,
  // so it can be abandoned cleanly when the player leaves or starts again.
  const analyseGame = async () => {
    if (!current?.pgn || analysing) return
    const token = ++analysisToken.current
    const parsed = new Chess()
    parsed.loadPgn(current.pgn)
    const moves = parsed.history({ verbose: true })
    // A second board walks the game from the opening, because a board loaded
    // from the PGN is already sitting on the final position.
    const walk = new Chess()
    const fens = [walk.fen()]
    for (const played of moves) {
      walk.move(played.san)
      fens.push(walk.fen())
    }
    setError('')
    setAnalysis(null)
    setAnalysing({ done: 0, total: fens.length })
    try {
      const lines: { uci: string; cp: number }[][] = []
      // The move that was played is graded on its own position, never on the
      // next one: comparing two searches for different positions invents small
      // losses. When the engine ranked the move itself, its score comes from
      // the same search as the best move's and nothing extra is needed; only a
      // move outside the ranked lines is searched on its own.
      const playedScores: (number | null)[] = []
      for (let i = 0; i < fens.length; i++) {
        if (token !== analysisToken.current) return
        setAnalysing({ done: i, total: fens.length })
        if (new Chess(fens[i]).isGameOver()) {
          lines.push([])
          playedScores.push(null)
          continue
        }
        const ranked = await analysePosition(fens[i]).catch(() => [])
        lines.push(ranked)
        const played = moves[i]
        const uci = played
          ? `${played.from}${played.to}${played.promotion ?? ''}`
          : ''
        const listed = uci
          ? ranked.find((candidate) => candidate.uci === uci)
          : undefined
        playedScores.push(
          !uci
            ? null
            : listed
              ? listed.cp
              : await analyseMove(fens[i], uci).catch(() => null),
        )
      }
      if (token !== analysisToken.current) return
      setAnalysing(null)
      if (!lines.some((line) => line.length)) {
        setError('The engine could not start, so this game cannot be reviewed.')
        return
      }
      setAnalysis(
        reviewGame(
          moves.map((played, i) => ({
            san: played.san,
            fenBefore: fens[i],
            fenAfter: fens[i + 1],
            played: `${played.from}${played.to}${played.promotion ?? ''}`,
            playedScore: playedScores[i] ?? undefined,
            before: lines[i],
            after: lines[i + 1] ?? [],
          })),
        ),
      )
    } catch (e) {
      setAnalysing(null)
      setError((e as Error).message || 'The review could not finish.')
    }
  }
  const startPractice = () => {
    const you = { id: 'practice-you', name: session?.name || 'You', sub: null }
    const opponent = {
      id: 'practice-computer',
      name: `${BOTS[bot].name} (${BOTS[bot].elo})`,
      sub: null,
    }
    const side: Color =
      color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color
    setPractice({
      ...newGame(
        you,
        { ...CONTROLS[control], public: false, color: side },
        now,
      ),
      white: side === 'w' ? you : opponent,
      black: side === 'w' ? opponent : you,
      status: 'playing',
    })
    setReview(null)
    setFlipped(false)
    setAnalysis(null)
    setAnalysing(null)
    analysisToken.current += 1
    setGame(null)
    gameId.current = null
    setPanel('play')
    window.scrollTo({ top: 0 })
    history.replaceState(null, '', location.pathname)
  }
  const home = () => {
    setGame(null)
    setPractice(null)
    gameId.current = null
    setPanel('play')
    setReview(null)
    setAnalysis(null)
    setAnalysing(null)
    analysisToken.current += 1
    setFlipped(false)
    setError('')
    history.replaceState(null, '', location.pathname)
  }
  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(
        `${location.origin}/?game=${current!.id}`,
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  const count = current?.moves.length || 0
  const clock = (side: Color) =>
    current
      ? remaining(current, side, practice ? now : now + offset.current)
      : CONTROLS[control].minutes * 60000
  const topColor = orientation === 'w' ? 'b' : 'w',
    bottomColor = orientation
  const player = (side: Color) =>
    current ? (side === 'w' ? current.white : current.black) : null
  const status = waiting
    ? 'Waiting for a player'
    : current?.status === 'finished'
      ? current.reason
      : active
        ? visible.check
          ? 'Check'
          : turn === current?.seat
            ? 'Your move'
            : 'Their move'
        : ''
  const selected =
    analysis && review !== null ? analysis.moves[review - 1] : null
  // The account pages are their own URLs, so they replace the board rather
  // than sitting on top of it. No hooks run after this point.
  const themeVars = themeProperties(themeOf(themeId)) as CSSProperties
  if (isAuthPath(location.pathname)) {
    return (
      <AuthPage
        mode={location.pathname.startsWith('/signup') ? 'signup' : 'login'}
        session={session}
      />
    )
  }
  if (isDashboardPath(location.pathname)) {
    return <Dashboard session={session} />
  }
  return (
    <div
      className={`app ${!current || waiting || panel === 'history' ? 'setup' : 'in-game'}`}
      style={themeVars}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            home()
          }}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M9 7h6v6h3V7h4v6h3V7h6v12l-5 5v8H14v-8l-5-5zM11 34h18" />
          </svg>
          <span>
            rook<span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={panel === 'play' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setPanel('play')}
          >
            <Swords size={19} />
            Play
            <ArrowRight className="nav-arrow" size={16} />
          </button>
          <button
            className={panel === 'history' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setPanel('history')}
          >
            <History size={19} />
            Your games
          </button>
          {session?.signedIn && (
            <a className="nav-item" href="/dashboard">
              <LayoutDashboard size={19} />
              Dashboard
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setConfirm('help')}>
            <CircleHelp size={18} />
            How to play
          </button>
          <button className="nav-item" onClick={openSettings}>
            <Settings size={18} />
            Settings
          </button>
          <div className="account">
            <button
              className="account-avatar"
              aria-label="Profile and settings"
              title="Profile and settings"
              onClick={openSettings}
            >
              {session?.avatar ? (
                <img src={session.avatar} alt="" />
              ) : (
                (session?.name || 'Guest').slice(0, 1)
              )}
            </button>
            <div>
              <strong>
                {session?.signedIn ? session.name : 'Guest player'}
              </strong>
              {session?.signedIn ? (
                <button onClick={() => void signOut()}>Sign out</button>
              ) : (
                <a href="/login">
                  Sign in <ArrowRight size={12} />
                </a>
              )}
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="page-header">
          <div>
            <h1>{panel === 'history' ? 'Your games' : 'Play chess'}</h1>
          </div>
          <div className="header-actions">
            <span className="quiet-badge">
              <i /> {practice ? 'Practice' : 'Casual chess'}
            </span>
            <button
              className="icon-button"
              aria-label="Settings"
              title="Settings"
              onClick={openSettings}
            >
              <Settings size={19} />
            </button>
            <div className="theme-picker" ref={themePicker}>
              <button
                className="icon-button"
                aria-label="Board theme"
                title="Board theme"
                aria-haspopup="menu"
                aria-expanded={themeOpen}
                onClick={() => setThemeOpen((open) => !open)}
              >
                <Palette size={19} />
              </button>
              {themeOpen && (
                <div className="theme-menu" role="menu" aria-label="Board theme">
                  {THEMES.map((option) => (
                    <button
                      key={option.id}
                      role="menuitemradio"
                      aria-checked={option.id === themeId}
                      className="theme-option"
                      onClick={() => chooseTheme(option.id)}
                    >
                      <span
                        className="theme-swatch"
                        aria-hidden="true"
                        style={
                          {
                            '--sw-light': option.light,
                            '--sw-dark': option.dark,
                          } as CSSProperties
                        }
                      >
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>{option.name}</span>
