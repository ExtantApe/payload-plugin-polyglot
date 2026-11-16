import { APIError, type CollectionConfig, type CollectionSlug, type Endpoint, type FieldAccess, type PayloadRequest } from 'payload'

import { exactlyTrue, isAdminUser } from './access.js'
import { polyglotOf } from './translate.js'
import type { ResolvedPolyglot } from './types.js'

type Doc = Record<string, unknown> | undefined

/**
 * May this request mark `locale` reviewed (or take the mark off)? Signed in, and then only an answer of exactly `true`
 * counts. With no `canReview`, only users of the admin collection. A throw, a rejection or any other answer is no.
 */
export const mayReview = (o: Pick<ResolvedPolyglot, 'canReview'>, req: PayloadRequest, doc: Doc, locale: string): Promise<boolean> =>
  req.user ? exactlyTrue(() => (o.canReview ? o.canReview({ req, doc, locale }) : isAdminUser(req.payload, req.user))) : Promise.resolve(false)

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

/**
 * Field-level update access for "Reviewed by a human". The languages that change (added or removed) must each pass
 * `canReview`; if any does not, the whole change is dropped and the stored value stays. Resending the same list is
 * always fine. The local API with `overrideAccess` (the plugin's own runs) does not call this.
 */
export const reviewedAccess =
  (statusField: string): FieldAccess =>
  async ({ req, doc, siblingData }) => {
    const next = (siblingData as { reviewed?: unknown } | undefined)?.reviewed
    if (next === undefined) return true
    const before = asList((doc?.[statusField] as { reviewed?: unknown } | undefined)?.reviewed)
    const after = asList(next)
    const changed = [...after.filter((l) => !before.includes(l)), ...before.filter((l) => !after.includes(l))]
    if (!changed.length) return true
    const o = polyglotOf(req.payload)
    for (const locale of changed) if (!(await mayReview(o, req, doc, locale))) return false
    return true
  }

export const MAX_REPORT_CHARS = 500
/** Reports one account may send in an hour. */
export const MAX_REPORTS_PER_HOUR = 10

const accountOf = (user: unknown): string | null => {
  const u = user as { collection?: unknown; id?: unknown } | null | undefined
  return u && typeof u.collection === 'string' && (typeof u.id === 'string' || typeof u.id === 'number') ? `${u.collection}:${u.id}` : null
}

/** Reviewers' locales for a read filter: the languages `canReview` allows (asked without a document). */
const reviewableLocales = async (o: ResolvedPolyglot, req: PayloadRequest) => {
  const out: string[] = []
  for (const l of o.locales) if (await mayReview(o, req, undefined, l)) out.push(l)
  return out
}

/**
 * Problem reports about a translation. Nobody writes it through the API: reports come in through the endpoint, which
 * acts as the signed-in account. Admins read everything; a reviewer sees the languages `canReview` allows (it is asked
 * with no document, so it must cope with that). Only admins delete.
 */
export const reportsCollection = (slug: string): CollectionConfig => ({
  slug,
  labels: { singular: 'Translation report', plural: 'Translation reports' },
  admin: { useAsTitle: 'message', defaultColumns: ['locale', 'collectionSlug', 'doc', 'message', 'createdAt'], description: 'Problems people reported with a translation.' },
  access: {
    read: async ({ req }) => {
      if (!req.user) return false
      if (isAdminUser(req.payload, req.user)) return true
      const locales = await reviewableLocales(polyglotOf(req.payload), req)
      return locales.length ? { locale: { in: locales } } : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => Boolean(req.user) && isAdminUser(req.payload, req.user),
  },
  fields: [
    { name: 'collectionSlug', type: 'text', required: true, index: true },
    { name: 'doc', type: 'text', required: true, index: true },
    { name: 'locale', type: 'text', required: true, index: true },
    { name: 'message', type: 'textarea', required: true, maxLength: MAX_REPORT_CHARS },
    { name: 'account', type: 'text', required: true, index: true },
  ],
  timestamps: true,
})

const bad = (message: string, status = 400) => new APIError(message, status, undefined, true)

/** POST /api/polyglot/reports { collection, id, locale, message }. Signed in; only when `reports` is exactly true. */
export const reportEndpoint: Endpoint = {
  path: '/polyglot/reports',
  method: 'post',
  handler: async (req) => {
    const o = polyglotOf(req.payload)
    const account = accountOf(req.user)
    if (!account) throw bad('Sign in to report a problem.', 401)
    const { addDataAndFileToRequest } = await import('payload')
    await addDataAndFileToRequest(req)
    const d = (req.data ?? {}) as Record<string, unknown>
    const collection = typeof d.collection === 'string' ? d.collection : ''
    const id = typeof d.id === 'string' || typeof d.id === 'number' ? String(d.id) : ''
    const locale = typeof d.locale === 'string' ? d.locale : ''
    const message = typeof d.message === 'string' ? d.message.trim() : ''
    if (!Object.hasOwn(o.collections, collection) || !id || !o.locales.includes(locale)) throw bad('That page or language is not known.')
    if (!message) throw bad('Say what is wrong.')
    if (message.length > MAX_REPORT_CHARS) throw bad(`Keep it to ${MAX_REPORT_CHARS} characters or fewer.`)
    const found = await req.payload.findByID({ collection: collection as CollectionSlug, id, depth: 0, overrideAccess: true, disableErrors: true })
    if (!found) throw bad('That page was not found.', 404)
    const slug = o.reportsSlug as CollectionSlug
    const recent = await req.payload.count({ collection: slug, where: { account: { equals: account }, createdAt: { greater_than: new Date(Date.now() - 3_600_000).toISOString() } }, overrideAccess: true })
    if (recent.totalDocs >= MAX_REPORTS_PER_HOUR) throw bad('Too many reports. Try again later.', 429)
    await req.payload.create({ collection: slug, data: { collectionSlug: collection, doc: id, locale, message, account } as never, overrideAccess: true })
    return Response.json({ reported: true })
  },
}
