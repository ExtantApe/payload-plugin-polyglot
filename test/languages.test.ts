import { describe, expect, it } from 'vitest'

import { knownRequestCode, languageName, requestableLanguages, searchLanguages } from '../src/languages.js'

const all = ['de', 'zu', 'ja', 'es', 'fr', 'sw'].map((c) => languageName(c)!)

describe('language search', () => {
  it('has English and native names from CLDR', () => {
    expect(languageName('de')).toMatchObject({ english: 'German', native: 'Deutsch' })
    expect(languageName('zu')).toMatchObject({ english: 'Zulu', native: 'isiZulu' })
  })
  it('matches the English name: German finds Deutsch, Zulu finds isiZulu', () => {
    expect(searchLanguages(all, 'German').map((n) => n.native)).toEqual(['Deutsch'])
    expect(searchLanguages(all, 'zulu').map((n) => n.native)).toEqual(['isiZulu'])
  })
  it('matches the native name and ignores accents and case', () => {
    expect(searchLanguages(all, 'deutsch').map((n) => n.code)).toEqual(['de'])
    expect(searchLanguages(all, 'ESPANOL').map((n) => n.code)).toEqual(['es'])
    expect(searchLanguages(all, 'isizu').map((n) => n.code)).toEqual(['zu'])
  })
  it('puts prefix matches first and returns everything for an empty search', () => {
    expect(searchLanguages(all, '').length).toBe(all.length)
    expect(searchLanguages(all, 'zzzz')).toEqual([])
  })
  it('offers unsupported languages only, and never a variant of a supported one', () => {
    const codes = requestableLanguages(['en', 'de', 'zh-Hans', 'pt-BR']).map((n) => n.code)
    expect(codes).toContain('zu')
    expect(codes).not.toContain('de')
    expect(codes).not.toContain('zh')
    expect(codes).not.toContain('zh-Hant')
    expect(codes).not.toContain('pt-PT')
  })
  it('accepts only listed, unsupported codes for requests', () => {
    expect(knownRequestCode('ZU', ['en', 'de'])).toBe('zu')
    expect(knownRequestCode('de', ['en', 'de'])).toBeNull()
    expect(knownRequestCode('xx-not-a-language', ['en'])).toBeNull()
    expect(knownRequestCode('', ['en'])).toBeNull()
  })
})
