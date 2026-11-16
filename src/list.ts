import type { Payload } from 'payload'

import { languageName } from './languages.js'
import { loadSettings } from './settings.js'
import { polyglotOf } from './translate.js'

export type PickerLanguage = { code: string; native: string; english: string; lowConfidence: boolean }

/**
 * The site's languages for the picker (pass the result to `<LanguageSwitcher languages>`): each with its own name,
 * its English name, and whether staff marked it low confidence in Translation settings.
 */
export async function languageList(payload: Payload): Promise<PickerLanguage[]> {
  const o = polyglotOf(payload)
  const { lowConfidence } = await loadSettings(payload, o)
  const configured = payload.config.localization
  const labels = new Map<string, string>()
  if (configured) for (const l of configured.locales) if (typeof l !== 'string' && typeof l.label === 'string') labels.set(l.code, l.label)
  return [o.defaultLocale, ...o.locales].map((code) => {
    const n = languageName(code)
    return { code, native: n?.native ?? labels.get(code) ?? code, english: n?.english ?? labels.get(code) ?? code, lowConfidence: lowConfidence.has(code) }
  })
}
