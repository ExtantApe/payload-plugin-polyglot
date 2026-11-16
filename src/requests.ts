import { APIError, type CollectionAfterDeleteHook, type CollectionConfig, type CollectionSlug, type Endpoint, type Payload, type PayloadRequest } from 'payload'

import { mayManage } from './access.js'
import { knownRequestCode, languageName } from './languages.js'
import { polyglotOf } from './translate.js'

/** The account behind a request: its collection and id, e.g. `members:abc`. One vote is one account and one language. */
const accountOf = (user: unknown): string | null => {
  const u = user as { collection?: unknown; id?: unknown } | null | undefined
  return u && typeof u.collection === 'string' && (typeof u.id === 'string' || typeof u.id === 'number') ? `${u.collection}:${u.id}` : null
}
const voteKey = (language: string, account: string) => `${language}|${account}`

/**
 * Language requests: one record per account and language. Nobody writes it through the API (create and update are
 * closed, delete is for managers); votes go through the endpoints below, which act as the signed-in account. The unique `key`
 * (language and account) is the guard that keeps a vote single even when two requests race.
 */
export const requestsCollection = (slug: string): CollectionConfig => ({
  slug,
  labels: { singular: 'Language request', plural: 'Language requests' },
  admin: { useAsTitle: 'language', defaultColumns: ['language', 'account', 'createdAt'], description: 'One vote per account per language. Count them by language to rank requests.' },
  access: {
    // Staff read everything; an account sees only its own votes. Nobody creates, edits or deletes through the API.
    read: async ({ req }) => (!req.user ? false : (await mayManage(polyglotOf(req.payload), req)) ? true : { account: { equals: accountOf(req.user) ?? '' } }),
    create: () => false,
    update: () => false,
    // Managers (the same rule as the plugin's other admin access) can remove a vote, for ballot stuffing or erasure.
    delete: ({ req }) => Boolean(req.user) && mayManage(polyglotOf(req.payload), req),
  },
  fields: [
    { name: 'language', type: 'text', required: true, index: true },
    { name: 'account', type: 'text', required: true, index: true },
    { name: 'key', type: 'text', required: true, unique: true, admin: { hidden: true } },
  ],
  timestamps: true,
})

const slugOf = (payload: Payload) => polyglotOf(payload).requestsSlug as CollectionSlug

/** Removes an account's votes when the account is deleted. Runs as the system; the account is the deleted document. */
export const forgetVotesHook =
  (slug: string): CollectionAfterDeleteHook =>
  async ({ id, collection, req }) => {
    await req.payload.delete({ collection: slug as CollectionSlug, where: { account: { equals: `${collection.slug}:${id}` } }, overrideAccess: true, req })
    countCache.delete(req.payload)
  }

/** Counts are cached for a short time, so opening the picker does not read every vote. Any change here clears it. */
const COUNT_TTL_MS = 30_000
const countCache = new WeakMap<Payload, { at: number; rows: { language: string; votes: number }[] }>()

/** Counts of votes per language, most votes first. */
export async function requestCounts(payload: Payload): Promise<{ language: string; votes: number }[]> {
  const hit = countCache.get(payload)
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.rows.map((r) => ({ ...r }))
  const rows = await countVotes(payload)
  countCache.set(payload, { at: Date.now(), rows })
  return rows.map((r) => ({ ...r }))
}

async function countVotes(payload: Payload): Promise<{ language: string; votes: number }[]> {
  const { docs } = await payload.find({ collection: slugOf(payload), pagination: false, depth: 0, overrideAccess: true, select: { language: true } as never })
  const counts = new Map<string, number>()
  for (const d of docs as unknown as { language: string }[]) counts.set(d.language, (counts.get(d.language) ?? 0) + 1)
  return [...counts].map(([language, votes]) => ({ language, votes })).sort((a, b) => b.votes - a.votes || a.language.localeCompare(b.language))
}

/** Languages this account has voted for. */
export async function votesOf(payload: Payload, user: unknown): Promise<string[]> {
  const account = accountOf(user)
  if (!account) return []
  const { docs } = await payload.find({ collection: slugOf(payload), where: { account: { equals: account } }, pagination: false, depth: 0, overrideAccess: true })
  return (docs as unknown as { language: string }[]).map((d) => d.language)
}

export class VoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const requestable = (payload: Payload, language: string) => {
  const code = knownRequestCode(language, polyglotOf(payload).locales.concat(polyglotOf(payload).defaultLocale))
  if (!code) throw new VoteError('That language is not on the list.', 400)
  return code
}

/**
 * Adds the signed-in account's vote. A second vote for the same language is a no-op, never a second count: it is
 * checked here and the unique `key` enforces it in the database, so a race cannot double count.
 */
export async function castVote(payload: Payload, user: unknown, language: string): Promise<{ language: string; added: boolean }> {
  const account = accountOf(user)
  if (!account) throw new VoteError('Sign in to vote.', 401)
  const code = requestable(payload, language)
  const key = voteKey(code, account)
  const collection = slugOf(payload)
  const existing = await payload.find({ collection, where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
  if (existing.docs.length) return { language: code, added: false }
  try {
    await payload.create({ collection, data: { language: code, account, key } as never, overrideAccess: true })
    countCache.delete(payload)
    return { language: code, added: true }
  } catch (err) {
    // Lost a race: the unique key refused the second record, so the vote already exists.
    const again = await payload.find({ collection, where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
    if (again.docs.length) return { language: code, added: false }
    throw err
  }
}

/** Takes back this account's vote; only that account's own record is ever touched. */
export async function removeVote(payload: Payload, user: unknown, language: string): Promise<{ language: string; removed: boolean }> {
  const account = accountOf(user)
  if (!account) throw new VoteError('Sign in to vote.', 401)
  const code = requestable(payload, language)
  const res = await payload.delete({ collection: slugOf(payload), where: { key: { equals: voteKey(code, account) } }, overrideAccess: true })
  countCache.delete(payload)
  return { language: code, removed: res.docs.length > 0 }
}

const fail = (err: unknown): never => {
  if (err instanceof VoteError) throw new APIError(err.message, err.status, undefined, true)
  throw err
}
/** Payload has already decoded the route parameter; a stray `%` stays as text and is refused as not on the list. */
const languageParam = (req: PayloadRequest) => String((req.routeParams as { language?: unknown } | undefined)?.language ?? '')

/** GET /api/polyglot/requests, POST and DELETE /api/polyglot/requests/:language. */
export const requestEndpoints: Endpoint[] = [
  {
    path: '/polyglot/requests',
    method: 'get',
    handler: async (req) =>
      Response.json({
        signedIn: Boolean(accountOf(req.user)),
        requests: await requestCounts(req.payload),
        mine: await votesOf(req.payload, req.user),
      }),
  },
  {
    path: '/polyglot/requests/:language',
    method: 'post',
    handler: async (req) => Response.json(await castVote(req.payload, req.user, languageParam(req)).catch(fail)),
  },
  {
    path: '/polyglot/requests/:language',
    method: 'delete',
    handler: async (req) => Response.json(await removeVote(req.payload, req.user, languageParam(req)).catch(fail)),
  },
]

/** Structural copies of Roadmap's item-source types; neither plugin imports the other. */
export type SourceItem = { externalId: string; title: string; description?: string; votes: number; tags?: string[] }
export type ItemSource = { key: string; list: (args: { payload: unknown }) => Promise<SourceItem[]> }

/** Language requests as items for Roadmap's `itemSources`. Works only when the install has `requests: true`. */
export function languageRequestsSource(options: { key?: string } = {}): ItemSource {
  return {
    key: options.key ?? 'polyglot-language-requests',
    list: async ({ payload }) => {
      const p = payload as Payload
      return (await requestCounts(p)).map(({ language, votes }) => {
        const n = languageName(language)
        const title = n ? (n.native === n.english ? n.english : `${n.english} (${n.native})`) : language
        return { externalId: `lang:${language}`, title, description: `Visitors asked for the site in ${n?.english ?? language}.`, votes, tags: ['language'] }
      })
    },
  }
}
