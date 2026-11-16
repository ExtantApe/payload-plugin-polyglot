import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reportEndpoint, MAX_REPORT_CHARS, MAX_REPORTS_PER_HOUR } from '../src/review.js'
import { polyglotPlugin } from '../src/index.js'
import type { PolyglotOptions } from '../src/types.js'

const translator = { translate: async () => new Map<string, string>() }
const started: { payload: Payload; mongo: MongoMemoryReplSet }[] = []
let n = 0

/** Made-up install: an admin collection (users) and a member collection, three languages. */
const build = async (extra: Partial<PolyglotOptions>, seed = true) => {
  const name = `review${n++}`
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const payload = await getPayload({
    config: await buildConfig({
      secret: 'test-secret-not-for-production',
      telemetry: false,
      typescript: { autoGenerate: false },
      db: mongooseAdapter({ url: mongo.getUri(name), ensureIndexes: true }),
      localization: { locales: ['en', 'es', 'fr'], defaultLocale: 'en', fallback: true },
      admin: { user: 'users' },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'members', auth: true, fields: [] },
        { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
      ],
      plugins: [polyglotPlugin({ collections: { pages: ['title'] }, translator, onPublish: false, ...extra })],
    }),
    key: name,
  })
  started.push({ payload, mongo })
  if (!seed) return { payload } as never
  const admin = { ...(await payload.create({ collection: 'users', data: { email: 'a@example.test', password: 'pw-made-up-1' } })), collection: 'users' }
  const member = { ...(await payload.create({ collection: 'members', data: { email: 'm@example.test', password: 'pw-made-up-2' } })), collection: 'members' }
  const page = await payload.create({ collection: 'pages', data: { title: 'Hello' } })
  return { payload, admin, member, page }
}
afterAll(async () => {
  for (const s of started) {
    await s.payload.db.destroy?.()
    await s.mongo.stop()
  }
})

const review = async (payload: Payload, user: unknown, id: string | number, reviewed: string[]) => {
  await payload.update({ collection: 'pages', id, data: { translations: { reviewed } } as never, user: user as never, overrideAccess: false })
  const doc = (await payload.findByID({ collection: 'pages', id, depth: 0 })) as unknown as { translations?: { reviewed?: string[] } }
  return doc.translations?.reviewed ?? []
}

describe('canReview: default (admins only)', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeAll(async () => {
    ctx = await build({})
  })
  it('lets an admin mark a language reviewed', async () => {
    expect(await review(ctx.payload, ctx.admin, ctx.page.id, ['es'])).toEqual(['es'])
  })
  it('refuses a non-admin, and the stored value stays', async () => {
    expect(await review(ctx.payload, ctx.member, ctx.page.id, ['es', 'fr'])).toEqual(['es'])
  })
  it('refuses a non-admin taking the mark off', async () => {
    expect(await review(ctx.payload, ctx.member, ctx.page.id, [])).toEqual(['es'])
  })
  it('refuses a request with no user (Payload refuses the update; the stored value stays)', async () => {
    await expect(review(ctx.payload, undefined, ctx.page.id, ['fr'])).rejects.toThrow()
    expect(((await ctx.payload.findByID({ collection: 'pages', id: ctx.page.id })) as never as { translations: { reviewed: string[] } }).translations.reviewed).toEqual(['es'])
  })
  it('lets a non-admin save the page when the reviewed list does not change', async () => {
    expect(await review(ctx.payload, ctx.member, ctx.page.id, ['es'])).toEqual(['es'])
  })
})

describe('canReview: a translator for one language', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  const seen: string[] = []
  beforeAll(async () => {
    ctx = await build({
      canReview: ({ req, locale }) => {
        seen.push(locale)
        return (req.user as { collection?: string } | null)?.collection === 'members' && locale === 'es'
      },
    })
  })
  it('allows the assigned language and refuses another', async () => {
    expect(await review(ctx.payload, ctx.member, ctx.page.id, ['es'])).toEqual(['es'])
    expect(await review(ctx.payload, ctx.member, ctx.page.id, ['es', 'fr'])).toEqual(['es'])
    expect(seen).toContain('fr')
  })
  it('refuses the whole change when one language of several is not allowed', async () => {
    expect(await review(ctx.payload, ctx.member, ctx.page.id, ['fr'])).toEqual(['es'])
  })
  it('lets the translator take their own language off', async () => {
    expect(await review(ctx.payload, ctx.member, ctx.page.id, [])).toEqual([])
  })
  it('no longer lets an admin through when canReview replaces the default', async () => {
    expect(await review(ctx.payload, ctx.admin, ctx.page.id, ['fr'])).toEqual([])
  })
})

describe('canReview: bad answers are refused', () => {
  const cases: [string, () => unknown][] = [
    ['a throw', () => { throw new Error('directory down') }],
    ['a rejection', async () => { throw new Error('directory down') }],
    ['a truthy non-true', () => 1],
    ['the string yes', () => 'yes'],
    ['an object', () => ({ ok: true })],
  ]
  for (const [label, canReview] of cases)
    it(`refuses ${label}`, async () => {
      const ctx = await build({ canReview: canReview as never })
      expect(await review(ctx.payload, ctx.admin, ctx.page.id, ['es'])).toEqual([])
    })
})

describe('reports', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  const call = (user: unknown, data: unknown) =>
    Promise.resolve(reportEndpoint.handler({ payload: ctx.payload, user, data, headers: new Headers(), method: 'POST' } as unknown as PayloadRequest)).then(
      (r: Response) => ({ status: r.status }),
      (e: { status?: number }) => ({ status: e.status ?? 500 }),
    )
  const ok = (message = 'The button label is wrong') => ({ collection: 'pages', id: ctx.page.id, locale: 'es', message })
  const asReader = (user: unknown) => ({ user: user as never, overrideAccess: false })
  const count = async (user: unknown) => (await ctx.payload.find({ collection: 'polyglot-reports' as never, ...asReader(user) })).totalDocs

  beforeAll(async () => {
    ctx = await build({
      reports: true,
      canReview: ({ req, locale }) => (req.user as { collection?: string } | null)?.collection === 'members' && locale === 'es',
    })
  })

  it('refuses someone signed out', async () => {
    expect((await call(undefined, ok())).status).toBe(401)
  })
  it('takes a report from a signed-in member', async () => {
    expect((await call(ctx.member, ok())).status).toBe(200)
  })
  it('refuses an empty message, an over-long one, and unknown pages or languages', async () => {
    expect((await call(ctx.member, ok('   '))).status).toBe(400)
    expect((await call(ctx.member, ok('x'.repeat(MAX_REPORT_CHARS + 1)))).status).toBe(400)
    expect((await call(ctx.member, { ...ok(), locale: 'de' })).status).toBe(400)
    expect((await call(ctx.member, { ...ok(), collection: 'users' })).status).toBe(400)
    expect((await call(ctx.member, { ...ok(), id: '000000000000000000000000' })).status).toBe(404)
  })
  it('accepts a message of exactly the cap', async () => {
    expect((await call(ctx.admin, ok('x'.repeat(MAX_REPORT_CHARS)))).status).toBe(200)
  })
  it('lets admins and the reviewer of that language read; nobody writes through the API', async () => {
    expect(await count(ctx.admin)).toBe(2)
    expect(await count(ctx.member)).toBe(2)
    await expect(count(undefined)).rejects.toThrow()
    await expect(ctx.payload.create({ collection: 'polyglot-reports' as never, data: { collectionSlug: 'pages', doc: '1', locale: 'es', message: 'x', account: 'a' } as never, ...asReader(ctx.admin) })).rejects.toThrow()
    await expect(ctx.payload.delete({ collection: 'polyglot-reports' as never, where: { id: { exists: true } }, ...asReader(ctx.member) })).rejects.toThrow()
  })
  it('hides reports in a language the reviewer is not assigned', async () => {
    await call(ctx.admin, { ...ok('French wording'), locale: 'fr' })
    expect(await count(ctx.admin)).toBe(3)
    expect(await count(ctx.member)).toBe(2)
  })
  it('limits one account to a few reports an hour', async () => {
    const other = { ...(await ctx.payload.create({ collection: 'members', data: { email: 'o@example.test', password: 'pw-made-up-3' } })), collection: 'members' }
    let last = 0
    for (let i = 0; i <= MAX_REPORTS_PER_HOUR; i++) last = (await call(other, ok(`note ${i}`))).status
    expect(last).toBe(429)
  })
})

describe('reports are off by default', () => {
  it.each([[undefined], [false], ['true'], [1], [{}]])('no collection and no endpoint for %j', async (value) => {
    const { payload } = await build(value === undefined ? {} : { reports: value as never }, false)
    expect(payload.collections['polyglot-reports' as never]).toBeUndefined()
    expect(payload.config.endpoints.some((e) => e.path === '/polyglot/reports')).toBe(false)
  })
  it('is on for exactly true', async () => {
    const { payload } = await build({ reports: true }, false)
    expect(payload.collections['polyglot-reports' as never]).toBeDefined()
    expect(payload.config.endpoints.some((e) => e.path === '/polyglot/reports')).toBe(true)
  })
})
