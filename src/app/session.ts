/** What the server says about this visitor, fetched once on load. */
export type Session = {
  name: string
  email: string | null
  /** A square data URL, kept on the account. */
  avatar: string | null
  sound: boolean
  signedIn: boolean
  authEnabled: boolean
  realtime: boolean
  /** The board theme saved to this account, if it has one. */
  theme: string | null
}

/** End the session on the server, then land on the sign-in page. */
export async function signOut() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {})
  location.assign('/login')
}
