import { describe, expect, test } from 'bun:test'
import { isAuthPath } from '../src/shared/links'

describe('account pages', () => {
  test('login and signup are their own URLs', () => {
    expect(isAuthPath('/login')).toBe(true)
    expect(isAuthPath('/signup')).toBe(true)
    // A trailing slash is still the same page.
    expect(isAuthPath('/signup/')).toBe(true)
    expect(isAuthPath('/')).toBe(false)
    expect(isAuthPath('/login/help')).toBe(false)
    expect(isAuthPath('/api/login')).toBe(false)
  })
})
