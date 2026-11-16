/**
 * Language names for the picker. Names come from the runtime's `Intl.DisplayNames`, which carries Unicode CLDR
 * (Unicode License v3), so no name table is bundled. Only the list of codes below is ours: ISO 639-1 codes plus a
 * few widely used tags, which are plain facts.
 */
export const LANGUAGE_CODES =
  'aa ab af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu ast ceb ckb fil haw hmn kab sco yue zh-Hans zh-Hant pt-BR pt-PT'.split(' ')

export type LanguageName = { code: string; english: string; native: string }

const cache = new Map<string, LanguageName | null>()
const displayNames = new Map<string, Intl.DisplayNames | null>()
const names = (locale: string) => {
  if (!displayNames.has(locale)) {
    try {
      displayNames.set(locale, new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' }))
    } catch {
      displayNames.set(locale, null)
    }
  }
  return displayNames.get(locale)!
}

/** English and native name of a language code, or null when the runtime has no name for it. */
export function languageName(code: string): LanguageName | null {
  if (cache.has(code)) return cache.get(code)!
  let result: LanguageName | null = null
  try {
    const english = names('en')?.of(code)
    if (english) result = { code, english, native: names(code)?.of(code) || english }
  } catch {
    result = null
  }
  cache.set(code, result)
  return result
}

/** Lowercase, accents removed, so "espanol" finds "español" and "german" finds "German". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim()

const matchRank = (haystack: string, q: string): number => {
  const h = fold(haystack)
  if (h === q) return 0
  if (h.startsWith(q)) return 1
  if (h.split(/[\s()\-,]+/).some((w) => w.startsWith(q))) return 2
  return h.includes(q) ? 3 : 9
}

/** Best rank (lower is better, 9 is no match) of a language against a search, by English name, native name or code. */
export function searchRank(name: Pick<LanguageName, 'code' | 'english' | 'native'>, query: string): number {
  const q = fold(query)
  if (!q) return 0
  return Math.min(matchRank(name.english, q), matchRank(name.native, q), name.code.toLowerCase() === q ? 0 : 9)
}

/** Filters and orders names for a search: best matches first, then alphabetical by English name. Empty search keeps alphabetical order. */
export function searchLanguages<T extends Pick<LanguageName, 'code' | 'english' | 'native'>>(all: T[], query: string): T[] {
  return all
    .map((n) => ({ n, r: searchRank(n, query) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.n.english.localeCompare(b.n.english, 'en'))
    .map((x) => x.n)
}

const base = (c: string) => c.toLowerCase().split('-')[0]!

/** Every language the runtime can name that the site does not already offer (any variant of a supported language counts as offered). */
export function requestableLanguages(supported: string[]): LanguageName[] {
  const haveBase = new Set(supported.map(base))
  return LANGUAGE_CODES.filter((c) => !haveBase.has(base(c))).flatMap((c) => {
    const n = languageName(c)
    return n ? [n] : []
  })
}

/** Is this a code Polyglot offers for requests (not already supported)? Compared as written, case-insensitively. */
export const knownRequestCode = (code: string, supported: string[]): string | null => {
  const hit = LANGUAGE_CODES.find((c) => c.toLowerCase() === code.toLowerCase())
  if (!hit || !languageName(hit)) return null
  return requestableLanguages(supported).some((n) => n.code === hit) ? hit : null
}
