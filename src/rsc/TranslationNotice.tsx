import type { Payload } from 'payload'
import React from 'react'

import { languageStatus } from '../translate.js'

export type NoticeKind = 'reviewed' | 'machine' | 'pending'
export type NoticeMessages = { reviewed: string; machine: string; pending: string; suggest: string }

export const DEFAULT_NOTICE: NoticeMessages = {
  reviewed: 'Reviewed by a human.',
  machine: 'Beta: this page is machine translated and a person has not reviewed it yet. It may contain mistakes.',
  pending: 'This page is not translated yet, so you are reading the original.',
  suggest: 'Suggest a better translation',
}

const CSS = `
.pgn{--pgn-text:var(--palette-text,#1f2937);--pgn-line:var(--palette-border,#d1d5db);--pgn-bg:var(--palette-surface-sunken,#f3f4f6);margin:0 0 1.5rem;max-width:48rem;padding:.625rem .875rem;border:1px solid var(--pgn-line);border-radius:10px;background:var(--pgn-bg);color:var(--pgn-text);font-size:.9375rem;line-height:1.5}
.pgn[data-kind=machine]{--pgn-line:#b45309;--pgn-bg:#fffbeb;--pgn-text:#78350f}
.pgn[data-kind=reviewed]{--pgn-line:#047857;--pgn-bg:#ecfdf5;--pgn-text:#064e3b}
@media (prefers-color-scheme:dark){.pgn[data-kind=machine]{--pgn-line:#d97706;--pgn-bg:#451a03;--pgn-text:#fef3c7}.pgn[data-kind=reviewed]{--pgn-line:#34d399;--pgn-bg:#022c22;--pgn-text:#d1fae5}}
.pgn a{color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.pgn a:focus-visible{outline:3px solid currentColor;outline-offset:2px}
`

/** The notice itself, with no data fetching. `kind` is `reviewed`, `machine` or `pending`. */
export function TranslationNoticeView({ kind, messages, suggestHref, lang }: { kind: NoticeKind; messages?: Partial<NoticeMessages>; suggestHref?: string; lang?: string }) {
  const m = { ...DEFAULT_NOTICE, ...messages }
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p role="note" className="pgn" data-kind={kind} lang={lang}>
        {m[kind]}
        {kind === 'machine' && suggestHref ? (
          <>
            {' '}
            <a href={suggestHref}>{m.suggest}</a>
          </>
        ) : null}
      </p>
    </>
  )
}

/**
 * Above translated content: every machine translation a person has not reviewed shows the Beta notice (a
 * review-state notice that never depends on the picker's Needs review tag); a reviewed language shows
 * "Reviewed by a human"; content not yet translated says so. The default language shows nothing.
 */
export async function TranslationNotice({ payload, doc, collection, locale, messages, suggestHref }: { payload: Payload; doc: { id: string | number } | null | undefined; collection: string; locale: string; messages?: Partial<NoticeMessages>; suggestHref?: string }) {
  if (!doc) return null
  const status = await languageStatus(payload, collection, doc as Record<string, unknown>, locale)
  if (status === 'source') return null
  const kind: NoticeKind = status === 'reviewed' ? 'reviewed' : status === 'pending' ? 'pending' : 'machine'
  return <TranslationNoticeView kind={kind} messages={messages} suggestHref={suggestHref} />
}
