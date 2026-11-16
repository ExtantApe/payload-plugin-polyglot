'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { languageName, requestableLanguages, searchLanguages, type LanguageName } from '../languages.js'
import type { PickerLanguage } from '../list.js'
import { PG_STYLES } from './styles.js'

/** Every visible string, so a site can translate or reword it. */
export type PickerText = {
  label: string
  search: string
  close: string
  needsReview: string
  moreHeading: string
  moreHint: string
  signIn: string
  yourVote: string
  noMatch: string
  votes: (n: number) => string
  results: (n: number) => string
  voteAdded: (name: string) => string
  voteRemoved: (name: string) => string
  voteFailed: string
  mustSignIn: string
}
export const DEFAULT_TEXT: PickerText = {
  label: 'Language',
  search: 'Search languages',
  close: 'Close',
  needsReview: 'Needs review',
  moreHeading: 'Not available yet. Vote to ask for one.',
  moreHint: 'Type a language name to find more.',
  signIn: 'Sign in to vote',
  yourVote: 'your vote',
  noMatch: 'No languages match.',
  votes: (n) => `${n} ${n === 1 ? 'vote' : 'votes'}`,
  results: (n) => `${n} ${n === 1 ? 'language' : 'languages'} found`,
  voteAdded: (name) => `Voted for ${name}`,
  voteRemoved: (name) => `Vote for ${name} removed`,
  voteFailed: 'Could not save your vote. Try again.',
  mustSignIn: 'Sign in to vote for a language.',
}

export type LanguageSwitcherProps = {
  languages: PickerLanguage[]
  /** Code of the language showing now. */
  current: string
  /** Called with the chosen code. */
  onSelect?: (code: string) => void
  /** Where choosing a language goes when `onSelect` is not given. */
  hrefFor?: (code: string) => string
  /** Offer requests and votes for languages the site does not have (needs `requests: true` in the plugin). Default false. */
  requests?: boolean
  /** The Payload API route. Default `/api`. */
  apiRoute?: string
  /** Where signed-out visitors sign in. */
  signInHref?: string
  text?: Partial<PickerText>
  className?: string
}

type Row =
  | { kind: 'language'; id: string; code: string; native: string; english: string; lowConfidence: boolean }
  | { kind: 'request'; id: string; code: string; native: string; english: string }

const Globe = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
  </svg>
)
const Chevron = () => (
  <svg className="pg-trigger__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const Check = () => (
  <svg className="pg-option__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 12 5 5 9-10" />
  </svg>
)

type RequestState = { loaded: boolean; signedIn: boolean; counts: Record<string, number>; mine: string[] }
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled])'

/**
 * The public language picker. A button showing the current language opens a searchable list (a bottom sheet on
 * phones, a popover on larger screens). Search matches English and native names. With `requests`, the search
 * continues into languages the site does not offer, where signed-in visitors can vote. Combobox and listbox
 * pattern: focus stays in the search box, arrows move through the list, Enter chooses, Escape closes.
 */
export function LanguageSwitcher({ languages, current, onSelect, hrefFor, requests = false, apiRoute = '/api', signInHref, text: textOverride, className }: LanguageSwitcherProps) {
  const text = { ...DEFAULT_TEXT, ...textOverride }
  const uid = useId()
  const listId = `${uid}-list`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [announce, setAnnounce] = useState('')
  const [req, setReq] = useState<RequestState>({ loaded: false, signedIn: false, counts: {}, mine: [] })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const currentLanguage = languages.find((l) => l.code === current)
  const q = query.trim()

  const rows = useMemo<{ languages: Row[]; more: Row[]; all: Row[] }>(() => {
    const found = searchLanguages(languages, q).map<Row>((l) => ({ kind: 'language', id: `${uid}-l-${l.code}`, code: l.code, native: l.native, english: l.english, lowConfidence: l.lowConfidence }))
    const more =
      requests && q
        ? searchLanguages<LanguageName>(requestableLanguages(languages.map((l) => l.code)), q)
            .slice(0, 40)
            .map<Row>((l) => ({ kind: 'request', id: `${uid}-r-${l.code}`, code: l.code, native: l.native, english: l.english }))
        : []
    return { languages: found, more, all: [...found, ...more] }
  }, [languages, q, requests, uid])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    if (open) setAnnounce(rows.all.length ? text.results(rows.all.length) : text.noMatch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.all.length, open])

  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    setQuery('')
    if (returnFocus) trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    if (!requests || req.loaded) return
    let live = true
    fetch(`${apiRoute}/polyglot/requests`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { signedIn: boolean; requests: { language: string; votes: number }[]; mine: string[] }) => {
        if (live) setReq({ loaded: true, signedIn: d.signedIn, counts: Object.fromEntries(d.requests.map((x) => [x.language, x.votes])), mine: d.mine })
      })
      .catch(() => live && setReq((r) => ({ ...r, loaded: true })))
    return () => {
      live = false
    }
  }, [open, requests, req.loaded, apiRoute])

  useEffect(() => {
    document.getElementById(rows.all[active]?.id ?? '')?.scrollIntoView?.({ block: 'nearest' })
  }, [active, rows.all])

  const choose = (code: string) => {
    close(false)
    if (onSelect) onSelect(code)
    else if (hrefFor && typeof window !== 'undefined') window.location.assign(hrefFor(code))
  }

  const toggleVote = async (row: Row) => {
    if (!req.signedIn) {
      setAnnounce(text.mustSignIn)
      return
    }
    const voted = req.mine.includes(row.code)
    const res = await fetch(`${apiRoute}/polyglot/requests/${encodeURIComponent(row.code)}`, { method: voted ? 'DELETE' : 'POST', credentials: 'include' }).catch(() => null)
    if (!res?.ok) {
      setAnnounce(text.voteFailed)
      return
    }
    setReq((r) => ({
      ...r,
      mine: voted ? r.mine.filter((c) => c !== row.code) : [...r.mine, row.code],
      counts: { ...r.counts, [row.code]: Math.max(0, (r.counts[row.code] ?? 0) + (voted ? -1 : 1)) },
    }))
    setAnnounce((voted ? text.voteRemoved : text.voteAdded)(row.english))
  }

  const activate = (row: Row | undefined) => {
    if (!row) return
    if (row.kind === 'language') choose(row.code)
    else void toggleVote(row)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    const last = rows.all.length - 1
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(i + 1, last)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)))
    else if (e.key === 'Home' && !query) (e.preventDefault(), setActive(0))
    else if (e.key === 'End' && !query) (e.preventDefault(), setActive(Math.max(last, 0)))
    else if (e.key === 'Enter') (e.preventDefault(), activate(rows.all[active]))
  }

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (e.target === input.current && query) setQuery('')
      else close()
    } else if (e.key === 'Tab') {
      // Only what can take focus now: the Close button is hidden on larger screens.
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => getComputedStyle(el).display !== 'none')
      const first = items[0]
      const lastItem = items[items.length - 1]
      if (!first || !lastItem) return
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), lastItem.focus())
      else if (!e.shiftKey && document.activeElement === lastItem) (e.preventDefault(), first.focus())
    }
  }

  const label = currentLanguage?.native ?? languageName(current)?.native ?? current
  const renderRow = (row: Row, index: number) => {
    const isActive = index === active
    if (row.kind === 'language') {
      const isCurrent = row.code === current
      return (
        <div key={row.id} id={row.id} role="option" aria-selected={isCurrent} data-active={isActive} data-current={isCurrent} className="pg-option" onClick={() => activate(row)} onMouseMove={() => setActive(index)}>
          <span className="pg-option__names">
            <span className="pg-option__native" lang={row.code}>
              {row.native}
            </span>
            {row.english !== row.native ? <span className="pg-option__english">{row.english}</span> : null}
          </span>
          {row.lowConfidence ? <span className="pg-tag">{text.needsReview}</span> : null}
          {isCurrent ? <Check /> : null}
        </div>
      )
    }
    const voted = req.mine.includes(row.code)
    const n = req.counts[row.code] ?? 0
    return (
      <div key={row.id} id={row.id} role="option" aria-selected={false} aria-checked={voted} data-active={isActive} className="pg-option" onClick={() => activate(row)} onMouseMove={() => setActive(index)}>
        <span className="pg-option__names">
          <span className="pg-option__native" lang={row.code}>
            {row.native}
          </span>
          {row.english !== row.native ? <span className="pg-option__english">{row.english}</span> : null}
        </span>
        <span className="pg-votes">
          {text.votes(n)}
          {voted ? ` (${text.yourVote})` : ''}
        </span>
      </div>
    )
  }

  return (
    <div className={['pg', className].filter(Boolean).join(' ')}>
      <style dangerouslySetInnerHTML={{ __html: PG_STYLES }} />
      <button ref={trigger} type="button" className="pg-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <Globe />
        <span className="pg-sr">{text.label}: </span>
        <span lang={current}>{label}</span>
        <Chevron />
      </button>
      {open ? (
        <>
          <div className="pg-backdrop" onClick={() => close()} />
          <div ref={panel} className="pg-panel" role="dialog" aria-modal="true" aria-label={text.label} onKeyDown={onPanelKey}>
            <div className="pg-head">
              <input
                ref={input}
                className="pg-search"
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={rows.all[active]?.id}
                aria-label={text.search}
                placeholder={text.search}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
              />
              <button type="button" className="pg-close" onClick={() => close()}>
                {text.close}
              </button>
            </div>
            <div id={listId} role="listbox" aria-label={text.label} className="pg-list">
              {rows.languages.map((row, i) => renderRow(row, i))}
              {rows.more.length ? (
                <div role="group" aria-labelledby={`${uid}-more`}>
                  <p id={`${uid}-more`} className="pg-group__title">
                    {text.moreHeading}
                  </p>
                  {rows.more.map((row, i) => renderRow(row, rows.languages.length + i))}
                </div>
              ) : null}
            </div>
            {!rows.all.length ? <p className="pg-empty">{text.noMatch}</p> : null}
            {requests && !q ? <p className="pg-hint">{text.moreHint}</p> : null}
            {requests && rows.more.length && req.loaded && !req.signedIn && signInHref ? (
              <p className="pg-foot">
                <a href={signInHref}>{text.signIn}</a>
              </p>
            ) : null}
            <div className="pg-sr" role="status" aria-live="polite">
              {announce}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
