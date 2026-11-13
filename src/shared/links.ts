/**
 * The account pages, kept as real URLs so they can be linked to, bookmarked and
 * reloaded. The worker serves the app for unknown paths, so these are pages
 * rather than client-side route names.
 */
export const AUTH_PATHS = ['/login', '/signup'] as const
export type AuthPath = (typeof AUTH_PATHS)[number]

/** Where an account lands after signing in or signing up. */
export const DASHBOARD_PATH = '/dashboard'

/** Whether a path is one of the account pages, ignoring a trailing slash. */
export function isAuthPath(path: string): path is AuthPath {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  return (AUTH_PATHS as readonly string[]).includes(clean)
}

/** Whether a path is the signed-in dashboard, ignoring a trailing slash. */
export function isDashboardPath(path: string): boolean {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  return clean === DASHBOARD_PATH
}

