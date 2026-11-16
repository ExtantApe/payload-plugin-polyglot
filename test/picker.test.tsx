// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LanguageSwitcher } from '../src/client/index.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const languages = [
  { code: 'en', native: 'English', english: 'English', lowConfidence: false },
  { code: 'de', native: 'Deutsch', english: 'German', lowConfidence: false },
  { code: 'es', native: 'español', english: 'Spanish', lowConfidence: false },
  { code: 'zu', native: 'isiZulu', english: 'Zulu', lowConfidence: true },
]
const open = () => fireEvent.click(screen.getByRole('button', { name: /Language: English/ }))
const box = () => screen.getByRole('combobox', { name: 'Search languages' })
const names = () => screen.getAllByRole('option').map((o) => o.textContent)

function mockApi(state: { signedIn: boolean; requests?: { language: string; votes: number }[]; mine?: string[] }) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return new Response(JSON.stringify({ signedIn: state.signedIn, requests: state.requests ?? [], mine: state.mine ?? [], added: true, removed: true }), { status: 200 })
    }),
  )
  return calls
}

describe('picker: button, dialog and focus', () => {
  it('names the current language on a button that opens a labelled dialog, and focuses the search', () => {
    render(<LanguageSwitcher languages={languages} current="en" />)
    const b = screen.getByRole('button', { name: /Language: English/ })
    expect(b.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Language' }).getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(box())
  })
  it('Escape clears a search first, then closes and returns focus to the button', () => {
    render(<LanguageSwitcher languages={languages} current="en" />)
    open()
    fireEvent.change(box(), { target: { value: 'ger' } })
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((box() as HTMLInputElement).value).toBe('')
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Language: English/ }))
  })
  it('keeps Tab inside the dialog, skipping the Close button where it is hidden', async () => {
    mockApi({ signedIn: false })
    render(<LanguageSwitcher languages={languages} current="en" requests signInHref="/sign-in" />)
    open()
    await act(async () => {})
    fireEvent.keyDown(box(), { key: 'Tab' })
    expect(document.activeElement).toBe(box())
    fireEvent.change(box(), { target: { value: 'Wolof' } })
    const link = screen.getByRole('link', { name: 'Sign in to vote' })
    link.focus()
    fireEvent.keyDown(link, { key: 'Tab' })
    expect(document.activeElement).toBe(box())
    fireEvent.keyDown(box(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(link)
  })
})

describe('picker: combobox and listbox', () => {
  it('wires the combobox to the listbox and marks the current language selected', () => {
    render(<LanguageSwitcher languages={languages} current="de" />)
    fireEvent.click(screen.getByRole('button', { name: /Language: Deutsch/ }))
    const list = screen.getByRole('listbox')
    expect(box().getAttribute('aria-controls')).toBe(list.id)
    expect(box().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('option', { name: /Deutsch/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: /español/ }).getAttribute('aria-selected')).toBe('false')
  })
  it('moves the active option with the arrows and chooses with Enter, focus staying in the search', () => {
    const onSelect = vi.fn()
    render(<LanguageSwitcher languages={languages} current="en" onSelect={onSelect} />)
    open()
    expect(box().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id)
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(box().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]!.id)
    fireEvent.keyDown(box(), { key: 'ArrowUp' })
    fireEvent.keyDown(box(), { key: 'ArrowUp' })
    expect(box().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id)
    fireEvent.keyDown(box(), { key: 'End' })
    expect(document.activeElement).toBe(box())
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('zu')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('finds Deutsch by typing German and announces the count', () => {
    render(<LanguageSwitcher languages={languages} current="en" />)
    open()
    fireEvent.change(box(), { target: { value: 'German' } })
    expect(names()).toEqual(['DeutschGerman'])
    expect(screen.getByRole('status').textContent).toBe('1 language found')
    fireEvent.change(box(), { target: { value: 'zzzz' } })
    expect(screen.getByRole('status').textContent).toBe('No languages match.')
  })
  it('sets the language of each name for screen readers', () => {
    render(<LanguageSwitcher languages={languages} current="en" />)
    open()
    expect(within(screen.getByRole('option', { name: /Deutsch/ })).getByText('Deutsch').getAttribute('lang')).toBe('de')
  })
})

describe('picker: the Needs review tag', () => {
  it('shows only on languages staff flagged', () => {
    render(<LanguageSwitcher languages={languages} current="en" />)
    open()
    expect(screen.getAllByText('Needs review')).toHaveLength(1)
    expect(within(screen.getByRole('option', { name: /isiZulu/ })).getByText('Needs review')).toBeTruthy()
    expect(within(screen.getByRole('option', { name: /Deutsch/ })).queryByText('Needs review')).toBeNull()
  })
})

describe('picker: requests', () => {
  it('stays closed to requests unless turned on', () => {
    const calls = mockApi({ signedIn: true })
    render(<LanguageSwitcher languages={languages} current="en" />)
    open()
    fireEvent.change(box(), { target: { value: 'wolof' } })
    expect(screen.getAllByText('No languages match.').length).toBeGreaterThan(0)
    expect(calls).toEqual([])
  })
  it('continues the search into unsupported languages, and a signed-in account votes and takes it back', async () => {
    const calls = mockApi({ signedIn: true, requests: [{ language: 'wo', votes: 3 }] })
    render(<LanguageSwitcher languages={languages} current="en" requests />)
    open()
    await act(async () => {})
    fireEvent.change(box(), { target: { value: 'Wolof' } })
    const row = screen.getByRole('option', { name: /Wolof/ })
    expect(row.textContent).toContain('3 votes')
    expect(row.getAttribute('aria-checked')).toBe('false')
    await act(async () => void fireEvent.click(row))
    expect(calls).toContain('POST /api/polyglot/requests/wo')
    expect(screen.getByRole('option', { name: /Wolof/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('option', { name: /Wolof/ }).textContent).toContain('4 votes')
    expect(screen.getByRole('status').textContent).toBe('Voted for Wolof')
    await act(async () => void fireEvent.keyDown(box(), { key: 'Enter' }))
    expect(calls).toContain('DELETE /api/polyglot/requests/wo')
    expect(screen.getByRole('status').textContent).toBe('Vote for Wolof removed')
  })
  it('refuses signed-out visitors: no request is sent, the reason is announced and a sign-in link shows', async () => {
    const calls = mockApi({ signedIn: false })
    render(<LanguageSwitcher languages={languages} current="en" requests signInHref="/sign-in" />)
    open()
    await act(async () => {})
    fireEvent.change(box(), { target: { value: 'Wolof' } })
    await act(async () => void fireEvent.click(screen.getByRole('option', { name: /Wolof/ })))
    expect(calls.filter((c) => !c.startsWith('GET'))).toEqual([])
    expect(screen.getByRole('status').textContent).toBe('Sign in to vote for a language.')
    expect(screen.getByRole('link', { name: 'Sign in to vote' }).getAttribute('href')).toBe('/sign-in')
  })
})
