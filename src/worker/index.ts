import { Hono } from 'hono'
import type { Context as HonoContext } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import {
  CONTROLS,
  actorFor,
  GameError,
  finish,
  joinGame,
  moveGame,
  newGame,
  publicGame,
  seatFor,
  settleClock,
  type Game,
  type Player,
} from '../shared/game'
import {
  createRealtimeTicket,
  publishRealtime,
} from '../../realtime/server.js'
import { isThemeId } from '../shared/themes'

type Env = {
  ASSETS: Fetcher
  DB: D1Database
  REALTIME?: DurableObjectNamespace
  APP_ORIGIN?: string
}
/** A player row, plus the account it is signed in to, if any. */
type PlayerRow = Player & { account_id?: string | null }
type AppEnv = { Bindings: Env; Variables: { player: PlayerRow } }
type AppContext = HonoContext<AppEnv>
const ACCOUNT_PREFIX = 'account:'
/**
 * The origin this deployment answers on. Hosted environments do not always set
 * APP_ORIGIN, so the request's own origin is the fallback.
 */
function originFor(request: Request, configured?: string) {
  return configured || new URL(request.url).origin
}
/** Cookie name, split so an http development origin keeps its own session. */
function cookieName(origin: string) {
  return origin.startsWith('https:') ? '__Host-rook' : 'rook-local'
}
/**
 * Writes must come from this site: the browser's Origin has to match either the
 * configured origin or the host the request actually arrived on (preview
 * hostnames change, the request's own host does not).
 */
function sameOrigin(request: Request, configured?: string) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const from = new URL(origin)
    if (configured) {
      try {
        if (from.origin === new URL(configured).origin) return true
      } catch {
        /* An unusable configured origin just falls through to the host check. */
      }
    }
    return from.host === (request.headers.get('host') ?? new URL(request.url).host)
  } catch {
    return false
  }
}
const initialized = new WeakMap<D1Database, Promise<unknown>>()
function initialize(db: D1Database) {
  let pending = initialized.get(db)
  if (!pending) {
    pending = db
      .batch([
        db.prepare(
          'CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL, last_create INTEGER NOT NULL DEFAULT 0, account_id TEXT)',
        ),
        db.prepare(
          'CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER NOT NULL, avatar TEXT, sound INTEGER NOT NULL DEFAULT 1)',
        ),
        db.prepare(
          'CREATE TABLE IF NOT EXISTS preferences (sub TEXT PRIMARY KEY, theme TEXT NOT NULL, updated_at INTEGER NOT NULL)',
        ),
        db.prepare(
          'CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, public INTEGER NOT NULL, white_id TEXT, black_id TEXT, white_sub TEXT, black_sub TEXT, created_at INTEGER NOT NULL, state TEXT NOT NULL)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_lobby ON games(status, public, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_white ON games(white_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_black ON games(black_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_white_sub ON games(white_sub, status, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_black_sub ON games(black_sub, status, created_at)',
        ),
      ])
      .then(async (result) => {
        // Databases from before accounts existed need the column added once.
        for (const statement of [
          'ALTER TABLE players ADD COLUMN account_id TEXT',
          'ALTER TABLE accounts ADD COLUMN avatar TEXT',
          'ALTER TABLE accounts ADD COLUMN sound INTEGER NOT NULL DEFAULT 1',
        ])
          await db
            .prepare(statement)
            .run()
            .catch(() => {})
        return result
      })
      .catch((error) => {
        initialized.delete(db)
        throw error
      })
    initialized.set(db, pending)
  }
  return pending
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
async function load(db: D1Database, key: string) {
  if (!/^[a-z0-9-]{8,36}$/.test(key)) return null
  const row = await db
    .prepare('SELECT state FROM games WHERE id = ? OR code = ? LIMIT 1')
    .bind(key, key)
    .first<{ state: string }>()
  return row ? (JSON.parse(row.state) as Game) : null
}
async function save(db: D1Database, before: Game, next: Game) {
  next = { ...next, revision: before.revision + 1 }
  const result = await db
    .prepare(
      'UPDATE games SET state = ?, revision = ?, status = ?, white_id = ?, black_id = ?, white_sub = ?, black_sub = ? WHERE id = ? AND revision = ?',
    )
    .bind(
      JSON.stringify(next),
      next.revision,
      next.status,
      next.white?.id ?? null,
      next.black?.id ?? null,
      next.white?.sub ?? null,
      next.black?.sub ?? null,
      next.id,
      before.revision,
    )
    .run()
  if (result.meta.changes !== 1)
    throw new GameError('The game changed. Try again.')
  return next
}
async function broadcast(env: Env, game: Game) {
  if (!env.REALTIME) return
  try {
    await publishRealtime(env, {
      room: `game:${game.id}`,
      event: 'changed',
      data: { revision: game.revision },
    })
  } catch {
    console.warn(
      'Realtime publication unavailable; clients will refresh the snapshot.',
    )
  }
}
function view(game: Game, player: Player, now: number) {
  return publicGame(game, actorFor(game, player), now)
}
const app = new Hono<AppEnv>()
app.use(
  '/api/*',
  bodyLimit({
    // Room for a small profile photo; every route still validates its own fields.
    maxSize: 300_000,
    onError: (c) => c.json({ error: 'Request too large.' }, 413),
  }),
)
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  if (!c.env.DB)
    return c.json({ error: 'The game database is not connected.' }, 503)
  const origin = originFor(c.req.raw, c.env.APP_ORIGIN)
  if (c.req.method !== 'GET' && !sameOrigin(c.req.raw, origin))
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  if (
    c.req.method !== 'GET' &&
    !c.req.header('content-type')?.startsWith('application/json')
  )
    return c.json({ error: 'Send JSON.' }, 415)
  if (Number(c.req.header('content-length') ?? 0) > 300_000)
    return c.json({ error: 'Request too large.' }, 413)
  await initialize(c.env.DB)
  const token = getCookie(c, cookieName(origin))
  const stored =
    token && /^[a-f0-9]{64}$/.test(token)
      ? await c.env.DB.prepare(
          'SELECT id, name, account_id FROM players WHERE token_hash = ? AND expires_at > ?',
        )
          .bind(await hash(token), Date.now())
          .first<{ id: string; name: string; account_id: string | null }>()
      : null
  if (stored)
    c.set('player', {
      id: stored.id,
      name: stored.name,
      sub: stored.account_id ? `${ACCOUNT_PREFIX}${stored.account_id}` : null,
      account_id: stored.account_id,
    })
  else if (
    c.req.path !== '/api/session' &&
    !c.req.path.startsWith('/api/auth/')
  )
    return c.json({ error: 'Refresh to join as a guest.' }, 401)
  await next()
})
type Account = { email: string; avatar: string | null; sound: number }
function sessionView(
  env: Env,
  player: PlayerRow,
  account: Account | null,
  theme: string | null,
) {
  return {
    name: player.name,
    email: account?.email ?? null,
    avatar: account?.avatar ?? null,
    sound: account ? !!account.sound : true,
    signedIn: !!player.account_id,
    authEnabled: true,
    realtime: !!env.REALTIME,
    theme,
  }
}
/** The account row behind this player, or null for a guest. */
function accountFor(env: Env, player: PlayerRow) {
  return player.account_id
    ? env.DB.prepare('SELECT email, avatar, sound FROM accounts WHERE id = ?')
        .bind(player.account_id)
        .first<Account>()
    : Promise.resolve<Account | null>(null)
}
async function themeFor(env: Env, sub: string | null) {
  if (!sub) return null
  const row = await env.DB.prepare('SELECT theme FROM preferences WHERE sub = ?')
    .bind(sub)
    .first<{ theme: string }>()
  return row?.theme ?? null
}
/** Create the guest player row and its cookie the first time we meet a visitor. */
async function ensurePlayer(c: AppContext) {
  const existing = c.get('player')
  if (existing) return existing
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  const player: PlayerRow = {
    id: crypto.randomUUID(),
    name: `Guest ${Math.floor(1000 + Math.random() * 9000)}`,
    sub: null,
    account_id: null,
  }
  await c.env.DB.prepare(
    'INSERT INTO players (id, token_hash, name, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(player.id, await hash(token), player.name, Date.now() + 90 * 86400000)
    .run()
  const origin = originFor(c.req.raw, c.env.APP_ORIGIN)
  setCookie(c, cookieName(origin), token, {
    httpOnly: true,
    secure: origin.startsWith('https:'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 90 * 86400,
  })
  c.set('player', player)
  return player
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** PBKDF2 as Workers allow it: 100k rounds of SHA-256, a 256-bit result. */
const ROUNDS = 100_000
function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
function hexBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}
async function stretch(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexBytes(salt), iterations: ROUNDS },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
/** Compare two hex digests without leaking where they first differ. */
function equalDigest(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
async function readJson<T extends object>(c: AppContext) {
  return c.req
    .json<Partial<T>>()
    .catch((): Partial<T> => ({}))
}
/** Point this browser's player row at an account, then describe the session. */
async function attachAccount(
  c: AppContext,
  account: { id: string; name: string },
) {
  const player = await ensurePlayer(c)
  await c.env.DB.prepare(
    'UPDATE players SET account_id = ?, name = ? WHERE id = ?',
  )
    .bind(account.id, account.name, player.id)
    .run()
  player.account_id = account.id
  player.name = account.name
  player.sub = `${ACCOUNT_PREFIX}${account.id}`
  return c.json(
    sessionView(
      c.env,
      player,
      await accountFor(c.env, player),
      await themeFor(c.env, player.sub),
    ),
  )
}
app.post('/api/session', async (c) => {
  const player = await ensurePlayer(c)
  return c.json(
    sessionView(
      c.env,
      player,
      await accountFor(c.env, player),
      await themeFor(c.env, player.sub),
    ),
  )
})
app.post('/api/auth/signup', async (c) => {
  const body = await readJson<{
    name: string
    email: string
    password: string
  }>(c)
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name =
    (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 40) ||
    email.split('@')[0]?.slice(0, 40) ||
    'Player'
  if (email.length > 254 || !EMAIL.test(email))
    return c.json({ error: 'Enter a valid email address.' }, 400)
  if (password.length < 8)
    return c.json({ error: 'Use at least 8 characters for a password.' }, 400)
  if (password.length > 200)
    return c.json({ error: 'That password is too long.' }, 400)
  const taken = await c.env.DB.prepare('SELECT id FROM accounts WHERE email = ?')
    .bind(email)
    .first()
  if (taken)
    return c.json(
      { error: 'That email already has an account. Sign in instead.' },
      409,
    )
  const salt = randomHex(16)
  const account = { id: crypto.randomUUID(), name }
  await c.env.DB.prepare(
    'INSERT INTO accounts (id, email, name, salt, hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      account.id,
      email,
      name,
      salt,
      await stretch(password, salt),
      Date.now(),
      Date.now(),
    )
    .run()
  return attachAccount(c, account)
})
app.post('/api/auth/login', async (c) => {
  const body = await readJson<{ email: string; password: string }>(c)
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const account = await c.env.DB.prepare(
    'SELECT id, name, salt, hash FROM accounts WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; name: string; salt: string; hash: string }>()
  const digest = account ? await stretch(password, account.salt) : ''
  if (!account || !equalDigest(digest, account.hash))
    return c.json({ error: 'That email and password do not match.' }, 401)
  await c.env.DB.prepare('UPDATE accounts SET last_login = ? WHERE id = ?')
    .bind(Date.now(), account.id)
    .run()
  return attachAccount(c, account)
})
app.post('/api/auth/logout', async (c) => {
  const player = await ensurePlayer(c)
  const name = `Guest ${Math.floor(1000 + Math.random() * 9000)}`
  await c.env.DB.prepare(
    'UPDATE players SET account_id = NULL, name = ? WHERE id = ?',
  )
    .bind(name, player.id)
    .run()
  player.account_id = null
  player.sub = null
  player.name = name
  return c.json(sessionView(c.env, player, null, null))
})
const MAX_AVATAR = 200_000
app.post('/api/profile', async (c) => {
  const player = await ensurePlayer(c)
  if (!player.account_id)
    return c.json({ error: 'Sign in to change your profile.' }, 401)
  const body = await readJson<{
    name: string
    avatar: string | null
    sound: boolean
  }>(c)
  const name =
    typeof body.name === 'string' ? body.name.trim().slice(0, 40) : null
  if (name !== null && name.length < 2)
    return c.json({ error: 'Use at least 2 characters for your name.' }, 400)
  let avatar: string | null | undefined
  if (body.avatar !== undefined) {
    avatar = body.avatar
    if (
      avatar !== null &&
      (typeof avatar !== 'string' ||
        avatar.length > MAX_AVATAR ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))
    )
      return c.json({ error: 'That image could not be saved.' }, 400)
  }
  const sound = typeof body.sound === 'boolean' ? (body.sound ? 1 : 0) : null
  const updates: string[] = []
  const values: unknown[] = []
  if (name !== null) {
    updates.push('name = ?')
    values.push(name)
  }
  if (avatar !== undefined) {
    updates.push('avatar = ?')
    values.push(avatar)
  }
  if (sound !== null) {
    updates.push('sound = ?')
    values.push(sound)
  }
  if (!updates.length) return c.json({ error: 'Nothing to change.' }, 400)
  values.push(player.account_id)
  await c.env.DB.prepare(
    `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`,
  )
    .bind(...values)
    .run()
  if (name !== null) {
    await c.env.DB.prepare('UPDATE players SET name = ? WHERE id = ?')
      .bind(name, player.id)
      .run()
    player.name = name
  }
  return c.json(
    sessionView(
      c.env,
      player,
      await accountFor(c.env, player),
      await themeFor(c.env, player.sub),
    ),
  )
})
app.post('/api/preferences', async (c) => {
  const player = c.get('player')
  if (!player.sub) return c.json({ error: 'Sign in to keep a theme.' }, 401)
  const body = await readJson<{ theme: string }>(c)
  if (!isThemeId(body.theme)) return c.json({ error: 'Unknown theme.' }, 400)
  await c.env.DB.prepare(
    'INSERT INTO preferences (sub, theme, updated_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET theme = excluded.theme, updated_at = excluded.updated_at',
  )
    .bind(player.sub, body.theme, Date.now())
    .run()
  return c.json({ theme: body.theme })
})
app.get('/api/games', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT state FROM games WHERE status = ? AND public = 1 AND created_at > ? ORDER BY created_at DESC LIMIT 20',
  )
    .bind('waiting', Date.now() - 1800000)
    .all<{ state: string }>()
  return c.json(
    rows.results.map((row) =>
      view(JSON.parse(row.state), c.get('player'), Date.now()),
    ),
  )
})
app.get('/api/history', async (c) => {
  const player = c.get('player')
  const rows = await c.env.DB.prepare(
    'SELECT state FROM games WHERE ((white_id = ? AND white_sub IS NULL) OR (black_id = ? AND black_sub IS NULL) OR white_sub = ? OR black_sub = ?) ORDER BY created_at DESC LIMIT 50',
  )
    .bind(player.id, player.id, player.sub, player.sub)
    .all<{ state: string }>()
  const games = rows.results.map((row) => {
    const game = JSON.parse(row.state) as Game
    const id =
      player.sub && game.white?.sub === player.sub
        ? game.white.id
        : player.sub && game.black?.sub === player.sub
          ? game.black.id
          : player.id
    return publicGame(game, id, Date.now())
  })
  // Aggregate completed games for this authenticated account, with indexed predicates.
  const stats = player.sub
    ? await c.env.DB.prepare(
        `SELECT COUNT(*) AS played, SUM(CASE WHEN (white_sub = ? AND json_extract(state, '$.result') = '1-0') OR (black_sub = ? AND json_extract(state, '$.result') = '0-1') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN json_extract(state, '$.result') = '½-½' THEN 1 ELSE 0 END) AS draws FROM games WHERE status = 'finished' AND (white_sub = ? OR black_sub = ?)`,
      )
        .bind(player.sub, player.sub, player.sub, player.sub)
        .first()
    : null
  return c.json({ games, stats })
})
app.post('/api/games', async (c) => {
  const body = await c.req.json<{
    minutes: number
    increment: number
    public: boolean
    color: string
  }>()
  if (
    !CONTROLS.some(
      (t) => t.minutes === body.minutes && t.increment === body.increment,
    ) ||
    typeof body.public !== 'boolean' ||
    !['w', 'b', 'random'].includes(body.color)
  )
    return c.json({ error: 'Choose a time control and a side.' }, 400)
  const player = c.get('player')
  const admitted = await c.env.DB.prepare(
    'UPDATE players SET last_create = ? WHERE id = ? AND last_create < ?',
  )
    .bind(Date.now(), player.id, Date.now() - 5000)
    .run()
  if (!admitted.meta.changes)
    return c.json({ error: 'Wait a moment before creating another game.' }, 429)
  const active = await c.env.DB.prepare(
    "SELECT id FROM games WHERE status IN ('waiting', 'playing') AND (white_id = ? OR black_id = ?) AND created_at > ? LIMIT 5",
  )
    .bind(player.id, player.id, Date.now() - 86400000)
    .all()
  if (active.results.length >= 5)
    return c.json({ error: 'Finish or cancel an existing game first.' }, 409)
  const game = newGame(
    player,
    {
      ...body,
      color:
        body.color === 'random'
          ? Math.random() < 0.5
            ? 'w'
            : 'b'
          : (body.color as 'w' | 'b'),
    },
    Date.now(),
  )
  await c.env.DB.prepare(
    'INSERT INTO games (id, code, revision, status, public, white_id, black_id, white_sub, black_sub, created_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      game.id,
      game.code,
      0,
      game.status,
      Number(game.public),
      game.white?.id ?? null,
      game.black?.id ?? null,
      game.white?.sub ?? null,
      game.black?.sub ?? null,
      game.createdAt,
      JSON.stringify(game),
    )
    .run()
  return c.json(publicGame(game, player.id, Date.now()), 201)
})
app.get('/api/games/:id', async (c) => {
  let game = await load(c.env.DB, c.req.param('id'))
  if (!game) return c.json({ error: 'Game not found.' }, 404)
  const settled = settleClock(game, Date.now())
  if (settled !== game) {
    try {
      game = await save(c.env.DB, game, settled)
      c.executionCtx.waitUntil(broadcast(c.env, game))
    } catch (error) {
      if (!(error instanceof GameError)) throw error
      game = (await load(c.env.DB, game.id))!
    }
  }
  return c.json(view(game, c.get('player'), Date.now()))
})
app.post('/api/games/:id/:action', async (c) => {
  const game = await load(c.env.DB, c.req.param('id'))
  if (!game) return c.json({ error: 'Game not found.' }, 404)
  const player = c.get('player'),
    action = c.req.param('action'),
    now = Date.now()
  const body = await c.req.json<{
    revision?: number
    from?: string
    to?: string
    promotion?: string
  }>()
  const actor = actorFor(game, player)
  const seat = seatFor(game, actor)
  let next: Game
  if (action === 'join') next = actor ? game : joinGame(game, player, now)
  else {
    if (!seat)
      return c.json({ error: 'Only the players can change this game.' }, 403)
    if (body.revision !== game.revision)
      return c.json({ error: 'The board changed. Try again.' }, 409)
    next = settleClock(game, now)
    if (next === game) {
      if (action === 'cancel' && game.status === 'waiting')
        next = { ...game, status: 'cancelled' }
      else if (game.status !== 'playing')
        return c.json({ error: 'This game is not in play.' }, 409)
      else if (action === 'move')
        next = moveGame(
          game,
          actor,
          body.from ?? '',
          body.to ?? '',
          body.promotion,
          now,
        )
      else if (action === 'resign')
        next = finish(game, seat === 'w' ? '0-1' : '1-0', 'Resignation', now)
      else if (action === 'draw')
        next =
          game.drawOffer && game.drawOffer !== seat
            ? finish(game, '½-½', 'Draw agreed', now)
            : { ...game, drawOffer: seat }
      else if (action === 'decline') next = { ...game, drawOffer: null }
      else return c.json({ error: 'Unknown action.' }, 400)
    }
  }
  if (next !== game) next = await save(c.env.DB, game, next)
  c.executionCtx.waitUntil(broadcast(c.env, next))
  return c.json(view(next, player, Date.now()))
})
app.post('/api/realtime/ticket', async (c) => {
  if (!c.env.REALTIME) return c.json({ error: 'Realtime unavailable.' }, 503)
  const { room } = await c.req.json<{ room: string }>()
  if (typeof room !== 'string' || !room.startsWith('game:'))
    return c.json({ error: 'Invalid room.' }, 400)
  const game = await load(c.env.DB, room.slice(5))
  if (!game || !actorFor(game, c.get('player')))
    return c.json({ error: 'Join the game first.' }, 403)
  return c.json(
    await createRealtimeTicket(c.env, {
      room: `game:${game.id}`,
      userId: c.get('player').id,
      origin: originFor(c.req.raw, c.env.APP_ORIGIN),
      publish: false,
      presence: true,
    }),
  )
})
app.onError((error, c) => {
  if (error instanceof GameError) return c.json({ error: error.message }, 409)
  if (error instanceof SyntaxError)
    return c.json({ error: 'Invalid request.' }, 400)
  console.error('Chess request failed', error.name)
  return c.json({ error: 'Could not complete that request. Try again.' }, 500)
})
app.notFound((c) =>
  c.req.path.startsWith('/api/')
    ? c.json({ error: 'Not found.' }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
)
export default {
  fetch: app.fetch,
}
