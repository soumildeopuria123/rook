import { useEffect, useState } from 'react'
import { ArrowRight, History as HistoryIcon, LogOut, Settings, Swords } from 'lucide-react'
import type { PublicGame } from '../shared/game'
import { signOut } from './session'
import type { Session } from './session'

type Stats = { played: number; wins: number; draws: number } | null

/** How a finished game reads from the seat this player had in it. */
function outcome(game: PublicGame) {
  if (game.status === 'waiting') return { label: 'Waiting', tone: 'open' }
  if (game.status === 'cancelled') return { label: 'Cancelled', tone: 'flat' }
  if (!game.result || !game.seat) return { label: 'Finished', tone: 'flat' }
  if (game.result === '½-½') return { label: 'Draw', tone: 'flat' }
  const won =
    (game.result === '1-0' && game.seat === 'w') ||
    (game.result === '0-1' && game.seat === 'b')
  return won ? { label: 'Win', tone: 'win' } : { label: 'Loss', tone: 'loss' }
}

function when(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Where an account lands after signing in or signing up: who it is, what it has
 * played, and the two things there are to do next.
 */
export function Dashboard({ session }: { session: Session | null }) {
  const signedIn = !!session?.signedIn
  const [games, setGames] = useState<PublicGame[]>([])
  const [stats, setStats] = useState<Stats>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Dashboard — Rook'
  }, [])

  useEffect(() => {
    if (!session?.signedIn) {
      setLoading(false)
      return
    }
    let live = true
    fetch('/api/history', { cache: 'no-store' })
      .then(
        (response) =>
          response.json() as Promise<{ games?: PublicGame[]; stats?: Stats }>,
      )
      .then((result) => {
        if (!live) return
        setGames(result.games ?? [])
        setStats(result.stats ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [session?.signedIn])

  return (
    <div className="dash-page">
      <header className="dash-header">
        <a className="brand" href="/">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M9 7h6v6h3V7h4v6h3V7h6v12l-5 5v8H14v-8l-5-5zM11 34h18" />
          </svg>
          <span>
            rook<span className="brand-period">.</span>
          </span>
        </a>
        <div className="dash-header-actions">
          <a className="dash-link" href="/">
            <Swords size={16} />
            Play chess
          </a>
          {signedIn && (
            <button className="dash-link" onClick={() => void signOut()}>
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="dash-main">
        {signedIn ? (
          <>
            <section className="dash-hero">
              <div className="dash-avatar">
                {session?.avatar ? (
                  <img src={session.avatar} alt="" />
                ) : (
                  (session?.name || 'You').slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="dash-hero-text">
                <span className="eyebrow">Dashboard</span>
                <h1>Welcome back, {session?.name}.</h1>
                <p>{session?.email ?? 'Signed in to this browser.'}</p>
              </div>
              <div className="dash-hero-actions">
                <a className="auth-primary" href="/">
                  Start a game <ArrowRight size={16} />
                </a>
                <a className="dash-link" href="/?settings=1">
                  <Settings size={16} />
                  Profile and settings
                </a>
              </div>
            </section>

            <section className="dash-stats" aria-label="Your record">
              <div>
                <strong>{stats?.played ?? 0}</strong>
                <span>Played</span>
              </div>
              <div>
                <strong>{stats?.wins ?? 0}</strong>
                <span>Won</span>
              </div>
              <div>
                <strong>{stats?.draws ?? 0}</strong>
                <span>Drawn</span>
              </div>
            </section>

            <section className="dash-games" aria-labelledby="dash-games-title">
              <h2 id="dash-games-title">
                <HistoryIcon size={16} />
                Your games
              </h2>
              {loading ? (
                <p className="dash-empty">Loading your games…</p>
              ) : games.length === 0 ? (
                <p className="dash-empty">
                  No games yet. Your first one will appear here.{' '}
                  <a href="/">Play chess</a>
                </p>
              ) : (
                <ul>
                  {games.map((game) => {
                    const state = outcome(game)
                    return (
                      <li key={game.id}>
                        <a href={`/?game=${encodeURIComponent(game.id)}`}>
                          <span className={`dash-result ${state.tone}`}>
                            {state.label}
                          </span>
                          <span className="dash-opponent">
                            {game.white?.name ?? 'Open seat'} vs{' '}
                            {game.black?.name ?? 'Open seat'}
                          </span>
                          <span className="dash-meta">
                            {when(game.createdAt)} · {game.minutes}+
                            {game.increment}
                          </span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section className="dash-hero dash-signed-out">
            <span className="eyebrow">Dashboard</span>
            <h1>Sign in to pick up where you left off.</h1>
            <p>
              Your games, results and reviews follow your account from device to
              device.
            </p>
            <div className="dash-hero-actions">
              <a className="auth-primary" href="/login">
                Sign in <ArrowRight size={16} />
              </a>
              <a className="dash-link" href="/signup">
                Create an account
              </a>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
