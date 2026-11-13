/**
 * Board and piece palettes. One record drives both: the squares come from the
 * three board colours, the men from the two gradient ramps, so a theme can move
 * the whole set — ivory and charcoal on sage, walnut and bone on oak — without
 * touching the artwork itself.
 */
export type Theme = {
  id: ThemeId
  name: string
  light: string
  dark: string
  rim: string
  /** The white army: three gradient stops, its ink, its highlight. */
  white: [string, string, string]
  whiteInk: string
  whiteHi: string
  /** The black army, same shape. */
  black: [string, string, string]
  blackInk: string
  blackHi: string
}

const IDS = ['sage', 'walnut', 'slate', 'marble', 'ink', 'blush'] as const
export type ThemeId = (typeof IDS)[number]

export const THEMES: Theme[] = [
  {
    id: 'sage',
    name: 'Sage',
    light: '#eae7d5',
    dark: '#82977b',
    rim: '#65745d',
    white: ['#fffdf2', '#f3ead1', '#c9ba95'],
    whiteInk: '#796c50',
    whiteHi: '#fffbee',
    black: ['#6b7060', '#444a3c', '#252c24'],
    blackInk: '#272a25',
    blackHi: '#7b816e',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    light: '#ebdfc8',
    dark: '#af8865',
    rim: '#795c45',
    white: ['#fffaf0', '#f2e6cc', '#d0bb96'],
    whiteInk: '#7b6647',
    whiteHi: '#fffaf0',
    black: ['#5d4a37', '#3a2d21', '#221a13'],
    blackInk: '#241b12',
    blackHi: '#8b7358',
  },
  {
    id: 'slate',
    name: 'Slate',
    light: '#e7e9e5',
    dark: '#80959d',
    rim: '#546b76',
    white: ['#fbfcfd', '#e9edf0', '#bfc9cf'],
    whiteInk: '#6a7780',
    whiteHi: '#ffffff',
    black: ['#57646c', '#39454c', '#1d262b'],
    blackInk: '#1e262b',
    blackHi: '#82919a',
  },
  {
    id: 'marble',
    name: 'Marble',
    light: '#efeade',
    dark: '#c4bcaa',
    rim: '#a39c8b',
    white: ['#ffffff', '#f4f0e6', '#d6d0c1'],
    whiteInk: '#7d7462',
    whiteHi: '#ffffff',
    black: ['#5f6159', '#41443e', '#232622'],
    blackInk: '#22251f',
    blackHi: '#84887c',
  },
  {
    id: 'ink',
    name: 'Ink',
    light: '#d9ded7',
    dark: '#4b5a53',
    rim: '#2b3733',
    white: ['#ffffff', '#eef1ea', '#c3ccc2'],
    whiteInk: '#5c665c',
    whiteHi: '#ffffff',
    black: ['#2a3531', '#16211d', '#0c1512'],
    blackInk: '#0d1613',
    blackHi: '#5d7568',
  },
  {
    id: 'blush',
    name: 'Blush',
    light: '#f7e9e3',
    dark: '#c4918a',
    rim: '#9c6a63',
    white: ['#fffdf9', '#f8ece2', '#dcc7b7'],
    whiteInk: '#8a6f62',
    whiteHi: '#fffdf9',
    black: ['#5c3b3b', '#3b2426', '#211315'],
    blackInk: '#221416',
    blackHi: '#8a6a67',
  },
]

export const DEFAULT_THEME: ThemeId = 'sage'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (IDS as readonly string[]).includes(value)
}

export function themeOf(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

/** The custom properties the board and pieces read, ready for `style`. */
export function themeProperties(theme: Theme): Record<string, string> {
  return {
    '--light-square': theme.light,
    '--dark-square': theme.dark,
    '--board-rim': theme.rim,
    '--piece-w-1': theme.white[0],
    '--piece-w-2': theme.white[1],
    '--piece-w-3': theme.white[2],
    '--piece-w-ink': theme.whiteInk,
    '--piece-w-hi': theme.whiteHi,
    '--piece-b-1': theme.black[0],
    '--piece-b-2': theme.black[1],
    '--piece-b-3': theme.black[2],
    '--piece-b-ink': theme.blackInk,
    '--piece-b-hi': theme.blackHi,
  }
}
