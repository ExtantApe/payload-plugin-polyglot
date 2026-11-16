import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, getPayload, type Payload, type PayloadRequest } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { castVote, languageList, languageRequestsSource, polyglotPlugin, removeVote, requestCounts, requestEndpoints, votesOf } from '../src/index.js'
import { TranslationNoticeView } from '../src/rsc/TranslationNotice.js'

let payload: Payload
let mongo: MongoMemoryReplSet
const SLUG = 'polyglot-language-requests'
const translator = { translate: async () => new Map<string, string>() }
type U = { id: string; collection: string }
let ann: U, ben: U, staff: U

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  payload = await getPayload({
    config: await buildConfig({
      secret: 'test-secret-not-for-production',
      telemetry: false,
      typescript: { autoGenerate: false },
      db: mongooseAdapter({ url: mongo.getUri('polyglot-requests'), ensureIndexes: true }),
      localization: { locales: ['en', 'es', 'zu'], defaultLocale: 'en', fallback: true },
      admin: { user: 'users' },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'members', auth: true, fields: [] },
        { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
      ],
      plugins: [polyglotPlugin({ collections: { pages: ['title'] }, translator, requests: true })],
    }),
  })
  const mk = async (collection: 'users' | 'members', email: string): Promise<U> => {
    const d = await payload.create({ collection, data: { email, password: 'made-up-password-1' } as never })
    return { id: String(d.id), collection }
  }
  ann = await mk('members', 'ann@example.com')
  ben = await mk('members', 'ben@example.com')
  staff = await mk('users', 'staff@example.com')
}, 120_000)

afterAll(async () => {
  await payload?.destroy()
  await mongo?.stop()
})

const reqFor = (user: U | null, language?: string) => ({ payload, user, routeParams: { language } }) as unknown as PayloadRequest
const handler = (method: string, path = '/polyglot/requests/:language') => requestEndpoints.find((e) => e.method === method && e.path === path)!.handler
const status = async (p: Promise<unknown>) => p.then(() => 200, (e: { status?: number }) => e.status)
const total = async () => (await payload.count({ collection: SLUG as never, overrideAccess: true })).totalDocs

describe('language votes', () => {
  it('counts one vote per account per language, however many times it is sent', async () => {
    expect(await castVote(payload, ann, 'fr')).toEqual({ language: 'fr', added: true })
    expect(await castVote(payload, ann, 'fr')).toEqual({ language: 'fr', added: false })
    expect(await castVote(payload, ann, 'FR')).toEqual({ language: 'fr', added: false })
    expect((await requestCounts(payload)).find((r) => r.language === 'fr')?.votes).toBe(1)
  })
  it('does not double count when the same vote races', async () => {
    await Promise.all(Array.from({ length: 6 }, () => castVote(payload, ben, 'ja').catch(() => null)))
    expect((await requestCounts(payload)).find((r) => r.language === 'ja')?.votes).toBe(1)
  })
  it('is guarded by a unique index in the database, not only by the check', async () => {
    const dup = payload.create({ collection: SLUG as never, data: { language: 'fr', account: `members:${ann.id}`, key: `fr|members:${ann.id}` } as never, overrideAccess: true })
    await expect(dup).rejects.toThrow()
    expect((await requestCounts(payload)).find((r) => r.language === 'fr')?.votes).toBe(1)
  })
  it('lets one account vote for several languages, and a second account adds to the count', async () => {
    await castVote(payload, ann, 'sw')
    await castVote(payload, ben, 'fr')
    expect((await votesOf(payload, ann)).sort()).toEqual(['fr', 'sw'])
    expect((await requestCounts(payload)).find((r) => r.language === 'fr')?.votes).toBe(2)
  })
  it('removes only the caller\'s own vote, and removing twice is harmless', async () => {
    expect(await removeVote(payload, ann, 'fr')).toEqual({ language: 'fr', removed: true })
    expect(await removeVote(payload, ann, 'fr')).toEqual({ language: 'fr', removed: false })
    expect((await requestCounts(payload)).find((r) => r.language === 'fr')?.votes).toBe(1)
    expect(await votesOf(payload, ben)).toContain('fr')
  })
  it('refuses signed-out visitors', async () => {
    const before = await total()
    expect(await status(handler('post')(reqFor(null, 'fr')) as Promise<unknown>)).toBe(401)
    expect(await status(handler('delete')(reqFor(null, 'fr')) as Promise<unknown>)).toBe(401)
    expect(await total()).toBe(before)
  })
  it('refuses languages the site has or that are not on the list', async () => {
    expect(await status(handler('post')(reqFor(ann, 'es')) as Promise<unknown>)).toBe(400)
    expect(await status(handler('post')(reqFor(ann, 'zu')) as Promise<unknown>)).toBe(400)
    expect(await status(handler('post')(reqFor(ann, 'klingon')) as Promise<unknown>)).toBe(400)
  })
  it('votes and unvotes through the endpoints as the signed-in account', async () => {
    const res = await (await handler('post')(reqFor(ann, 'wo'))).json()
    expect(res).toEqual({ language: 'wo', added: true })
    const listed = await (await handler('get', '/polyglot/requests')(reqFor(ann))).json()
    expect(listed.signedIn).toBe(true)
    expect(listed.mine).toContain('wo')
    expect(JSON.stringify(listed)).not.toContain(ann.id)
    const anon = await (await handler('get', '/polyglot/requests')(reqFor(null))).json()
    expect(anon).toMatchObject({ signedIn: false, mine: [] })
    expect((await (await handler('delete')(reqFor(ann, 'wo'))).json()).removed).toBe(true)
  })
})

describe('nobody edits another account\'s vote through the API', () => {
  it('closes create, update and delete for members and staff alike', async () => {
    const doc = (await payload.find({ collection: SLUG as never, where: { account: { equals: `members:${ben.id}` } }, limit: 1, overrideAccess: true })).docs[0]!
    for (const user of [ann, ben, staff]) {
      const opts = { user, overrideAccess: false } as never
      await expect(payload.update({ collection: SLUG as never, id: doc.id, data: { account: `members:${ann.id}` } as never, ...(opts as object) })).rejects.toThrow()
      await expect(payload.delete({ collection: SLUG as never, id: doc.id, ...(opts as object) })).rejects.toThrow()
      await expect(payload.create({ collection: SLUG as never, data: { language: 'it', account: `members:${ann.id}`, key: 'x' } as never, ...(opts as object) })).rejects.toThrow()
    }
    expect(await votesOf(payload, ben)).toContain('fr')
  })
  it('shows an account its own votes only, and staff all of them', async () => {
    const asUser = async (user: U) => (await payload.find({ collection: SLUG as never, user: { ...user } as never, overrideAccess: false, pagination: false })).docs as unknown as { account: string }[]
    expect((await asUser(ann)).every((d) => d.account === `members:${ann.id}`)).toBe(true)
    expect((await asUser(staff)).some((d) => d.account === `members:${ben.id}`)).toBe(true)
  })
})

describe('Roadmap item source', () => {
  it('lists requests with their counts and the contract fields only', async () => {
    const items = await languageRequestsSource().list({ payload })
    expect(languageRequestsSource().key).toBe('polyglot-language-requests')
    const fr = items.find((i) => i.externalId === 'lang:fr')!
    expect(fr).toMatchObject({ title: 'French (français)', votes: 1, tags: ['language'] })
    expect(items.every((i) => i.externalId.startsWith('lang:') && typeof i.votes === 'number')).toBe(true)
    expect(JSON.stringify(items)).not.toContain(ann.id)
  })
})

describe('the low confidence tag', () => {
  it('is set only on languages staff flag', async () => {
    expect((await languageList(payload)).filter((l) => l.lowConfidence)).toEqual([])
    await payload.updateGlobal({ slug: 'polyglot-settings' as never, data: { lowConfidence: ['zu'] } as never, overrideAccess: true })
    const flagged = (await languageList(payload)).filter((l) => l.lowConfidence).map((l) => l.code)
    expect(flagged).toEqual(['zu'])
    expect((await languageList(payload)).find((l) => l.code === 'zu')).toMatchObject({ native: 'isiZulu', english: 'Zulu' })
  })
})

describe('the translation notice', () => {
  it('shows Beta for machine translation, with the suggest link, whether or not the language is flagged', () => {
    const html = renderToStaticMarkup(TranslationNoticeView({ kind: 'machine', suggestHref: '/help' }))
    expect(html).toContain('role="note"')
    expect(html).toContain('Beta')
    expect(html).toContain('href="/help"')
    expect(renderToStaticMarkup(TranslationNoticeView({ kind: 'reviewed', suggestHref: '/help' }))).not.toContain('href="/help"')
  })
})
