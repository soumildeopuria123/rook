import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { Color, PieceSymbol } from 'chess.js'
import { Piece } from './Piece'
import { signOut } from './session'
import type { Session } from './session'

const POINTS = [
  'Your games, results and reviews on every device',
  'Play people anywhere, or practise a player',
  'Nothing to install, just an email and a password',
]

type GlyphName = 'crown' | 'trophy' | 'clock' | 'shield' | 'hourglass' | 'target'

// Emblems from the game around the board — what a player is playing for —
// drawn with the same lighting, ink and 100×100 grid as the piece set so they
// sit beside it without looking like a second kind of illustration.
function Glyph({ name, color }: { name: GlyphName; color: Color }) {
  const id = useId().replace(/:/g, '')
  const dark = color === 'b'
  const ink = dark ? '#272a25' : '#796c50'
  const paths: Record<GlyphName, React.ReactNode> = {
    crown: (
      <>
        <path d="M24 71 17 30l21 15L50 16l12 29 21-15-7 41z" />
        <path d="M22 71h56v8H22zM19 79h62v7H19z" />
        <circle cx="17" cy="29" r="4.5" />
        <circle cx="50" cy="15" r="4.5" />
        <circle cx="83" cy="29" r="4.5" />
      </>
    ),
    trophy: (
      <>
        <path d="M34 20h32v15c0 13-7 21-16 21s-16-8-16-21z" />
        <path d="M34 24H25c0 12 5 18 12 19M66 24h9c0 12-5 18-12 19" fill="none" />
        <path d="M45 56h10v9H45zM38 65h24l4 8H34zM32 73h36v8H32z" />
      </>
    ),
    clock: (
      <>
        <circle cx="50" cy="53" r="26" />
        <path d="M50 53V37" fill="none" strokeWidth="3" />
        <path d="m50 53 12 7" fill="none" strokeWidth="3" />
        <circle cx="50" cy="53" r="2.6" fill={ink} stroke="none" />
        <path d="M38 21h9v6H38zM53 21h9v6H53z" />
        <path d="M43 79h14l4 7H39z" />
      </>
    ),
    shield: (
      <>
        <path d="M50 13l28 9v22c0 17-12 27-28 33-16-6-28-16-28-33V22z" />
        <path d="m36 41 14 14 14-14" fill="none" stroke={dark ? '#8b9179' : ink} strokeWidth="2.6" />
      </>
    ),
    hourglass: (
      <>
        <path d="M28 18h44v7H28zM28 75h44v7H28z" />
        <path d="M36 25h28v6c0 11-8 16-14 19-6-3-14-8-14-19z" />
        <path d="M36 75h28v-6c0-11-8-16-14-19-6 3-14 8-14 19z" />
        <path d="M44 69h12l-6-6z" fill={ink} stroke="none" />
      </>
    ),
    target: (
      <>
        <circle cx="50" cy="50" r="27" />
        <circle cx="50" cy="50" r="16" fill="none" strokeWidth="2.2" />
        <circle cx="50" cy="50" r="5.5" fill={ink} stroke="none" />
      </>
    ),
  }
  return (
    <svg className="piece-art" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2=".65">
          <stop stopColor={dark ? '#6b7060' : '#fffdf2'} />
          <stop offset=".38" stopColor={dark ? '#444a3c' : '#f3ead1'} />
          <stop offset="1" stopColor={dark ? '#252c24' : '#c9ba95'} />
        </linearGradient>
      </defs>
      <ellipse cx="51" cy="86" rx="26" ry="4" fill="#17251d" opacity=".16" />
      <g
        fill={`url(#${id})`}
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {paths[name]}
      </g>
    </svg>
  )
}

type Art =
  | { kind: 'piece'; type: PieceSymbol; color: Color }
  | { kind: 'glyph'; name: GlyphName; color: Color }

const pieceArt = (type: PieceSymbol, color: Color): Art => ({
  kind: 'piece',
  type,
  color,
})
const glyphArt = (name: GlyphName, color: Color): Art => ({
  kind: 'glyph',
  name,
  color,
})

type Floater = {
  art: Art
  size: number
  top?: string
  bottom?: string
  left?: string
  right?: string
  tilt: number
  duration: number
  delay: number
  /** Faint, and only where there is room: sits behind the words. */
  soft?: boolean
  /** Stays on small screens too, where only the page edges have room. */
  corner?: 'top' | 'bottom'
}

// Decorative figures drifting around the margins: the board's own pieces, and
// emblems from the game around it. They are placed by percentage so they stay
// in the gutter at any width, and every one is aria-hidden — the page reads the
// same without them.
const FLOATERS: Floater[] = [
  { art: pieceArt('n', 'w'), size: 176, top: '6%', left: '3%', tilt: -9, duration: 21, delay: 0, corner: 'top' },
  { art: pieceArt('r', 'b'), size: 104, top: '30%', left: '0%', tilt: 6, duration: 17, delay: -6 },
  { art: pieceArt('b', 'w'), size: 132, bottom: '8%', left: '6%', tilt: 8, duration: 23, delay: -11, corner: 'bottom' },
  { art: pieceArt('p', 'b'), size: 86, bottom: '3%', left: '26%', tilt: -5, duration: 15, delay: -3 },
  { art: pieceArt('k', 'w'), size: 150, top: '56%', left: '28%', tilt: 5, duration: 25, delay: -14, soft: true },
  { art: pieceArt('q', 'w'), size: 138, top: '5%', right: '3%', tilt: 8, duration: 20, delay: -8, corner: 'top' },
  { art: pieceArt('p', 'w'), size: 82, top: '38%', right: '1%', tilt: -6, duration: 16, delay: -2 },
  { art: pieceArt('r', 'w'), size: 118, bottom: '6%', right: '5%', tilt: -7, duration: 22, delay: -12, corner: 'bottom' },
  { art: pieceArt('b', 'b'), size: 96, bottom: '1%', right: '26%', tilt: 6, duration: 18, delay: -5, soft: true },
  { art: glyphArt('crown', 'w'), size: 126, top: '2%', left: '33%', tilt: -7, duration: 20, delay: -4 },
  { art: glyphArt('clock', 'w'), size: 100, top: '3%', left: '58%', tilt: 6, duration: 17, delay: -11 },
  { art: glyphArt('target', 'w'), size: 92, top: '44%', left: '0.5%', tilt: 8, duration: 19, delay: -14 },
  { art: glyphArt('hourglass', 'w'), size: 100, bottom: '3%', left: '20%', tilt: -6, duration: 16, delay: -7 },
  { art: glyphArt('shield', 'b'), size: 110, bottom: '5%', left: '46%', tilt: 5, duration: 22, delay: -12 },
  { art: glyphArt('trophy', 'w'), size: 148, top: '60%', right: '3%', tilt: -5, duration: 24, delay: -9 },
]

/**
 * The sign-in and sign-up pages. One page, two readings of it: an account is
 * created the first time a player signs in, so the only difference is the copy
 * and which of the two links is offered.
 */
export function AuthPage({
  mode,
  session,
}: {
  mode: 'login' | 'signup'
  session: Session | null
}) {
  const signup = mode === 'signup'
  const signedIn = !!session?.signedIn
  const cardTitle = signedIn
    ? 'Your account'
    : signup
      ? 'Create your account'
      : 'Sign in'

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = signedIn ? 'Your account — Rook' : `${cardTitle} — Rook`
  }, [cardTitle, signedIn])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const body: Record<string, string> = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    }
    if (signup) body.name = String(form.get('name') ?? '')
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/auth/${signup ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) throw new Error(result.error || 'Could not sign you in.')
      location.assign('/dashboard')
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Something went wrong.',
      )
      setPending(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-pieces" aria-hidden="true">
        {FLOATERS.map((piece, index) => {
          const style = {
            '--size': `${piece.size}px`,
            '--tilt': `${piece.tilt}deg`,
            top: piece.top,
            bottom: piece.bottom,
            left: piece.left,
            right: piece.right,
            animationDuration: `${piece.duration}s`,
            animationDelay: `${piece.delay}s`,
          } as CSSProperties
          return (
            <span
              key={index}
              className={`auth-piece${piece.soft ? ' auth-piece--soft' : ''}${
                piece.corner
                  ? ` auth-piece--corner auth-piece--${piece.corner}`
                  : ''
              }`}
              style={style}
            >
              {piece.art.kind === 'piece' ? (
                <Piece type={piece.art.type} color={piece.art.color} />
              ) : (
                <Glyph name={piece.art.name} color={piece.art.color} />
              )}
            </span>
          )
        })}
      </div>

      <div className="auth-shell">
        <section className="auth-pitch">
          <a className="brand auth-brand" href="/">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <path d="M9 7h6v6h3V7h4v6h3V7h6v12l-5 5v8H14v-8l-5-5zM11 34h18" />
            </svg>
            <span>
              rook<span className="brand-period">.</span>
            </span>
          </a>
          <h1 className="auth-headline">
            {signedIn
              ? 'Welcome back to the board.'
              : signup
                ? 'Start a record worth keeping.'
                : 'A quiet place for a good game.'}
          </h1>
          <p className="auth-lede">
            {signedIn
              ? `Signed in as ${session?.name}. Your games, results and reviews follow you here.`
              : signup
                ? 'Sign up once and your games, results and reviews follow you from device to device — nothing to install.'
                : 'Play a stranger, a friend, or a player from history. Sign in and your games, results and reviews follow you from device to device.'}
          </p>
          <ul className="auth-points">
            {POINTS.map((point) => (
              <li key={point}>
                <Check size={14} />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <span className="eyebrow">{signedIn ? 'Account' : 'Welcome'}</span>
          <h2 id="auth-title">{cardTitle}</h2>

          {signedIn ? (
            <div className="auth-actions">
              <div className="account-preview">
                <div className="settings-avatar">
                  {session?.avatar ? (
                    <img src={session.avatar} alt="" />
                  ) : (
                    (session?.name || 'You').slice(0, 1).toUpperCase()
                  )}
                </div>
                <p className="auth-signed-in">
                  You are signed in as <strong>{session?.name}</strong>.
                </p>
              </div>
              <a className="auth-primary" href="/dashboard">
                Go to your dashboard <ArrowRight size={16} />
              </a>
              <a className="auth-secondary" href="/">
                Back to the board
              </a>
              <a className="auth-secondary" href="/?settings=1">
                Profile picture and settings
              </a>
              <button className="auth-secondary" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <>
              <p className="auth-lead">
                {signup
                  ? 'An email, a password and a name — that is the whole account.'
                  : 'Sign in with the email and password you signed up with.'}
              </p>
              <form className="auth-form" onSubmit={submit} noValidate>
                {signup && (
                  <label className="auth-field">
                    <span>Name</span>
                    <input
                      name="name"
                      autoComplete="nickname"
                      maxLength={40}
                      placeholder="How you appear at the board"
                    />
                  </label>
                )}
                <label className="auth-field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="auth-field">
                  <span>Password</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    maxLength={200}
                    placeholder={
                      signup ? 'At least 8 characters' : 'Your password'
                    }
                  />
                </label>
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="auth-primary"
                  type="submit"
                  disabled={pending}
                >
                  {pending
                    ? 'One moment…'
                    : signup
                      ? 'Create account'
                      : 'Sign in'}
                  {!pending && <ArrowRight size={16} />}
                </button>
                <a className="auth-secondary" href="/">
                  Continue as a guest
                </a>
              </form>
              <p className="auth-switch">
                {signup ? (
                  <>
                    Already have an account? <a href="/login">Sign in</a>
                  </>
                ) : (
                  <>
                    New to Rook? <a href="/signup">Create an account</a>
                  </>
                )}
              </p>
            </>
          )}
        </section>
      </div>

      <p className="auth-footer">
        Guest games stay on this device. A free account keeps them.
      </p>
    </div>
  )
}
