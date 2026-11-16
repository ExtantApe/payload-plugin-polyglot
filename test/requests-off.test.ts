import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, getPayload, handleEndpoints, type Payload } from 'payload'
import { afterAll, describe, expect, it } from 'vitest'

import { polyglotPlugin } from '../src/index.js'

const translator = { translate: async () => new Map<string, string>() }
const SLUG = 'polyglot-language-requests'
const keys = new Map<Payload, string>()
const started: { payload: Payload; mongo: MongoMemoryReplSet }[] = []

const build = async (name: string, requests?: unknown) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const payload = await getPayload({
    config: await buildConfig({
      secret: 'test-secret-not-for-production',
      telemetry: false,
      typescript: { autoGenerate: false },
      db: mongooseAdapter({ url: mongo.getUri(name) }),
      localization: { locales: ['en', 'es'], defaultLocale: 'en', fallback: true },
      admin: { user: 'users' },
      collections: [{ slug: 'users', auth: true, fields: [] }, { slug: 'pages', fields: [{ name: 'title', type: 'text' }] }],
      plugins: [polyglotPlugin({ collections: { pages: ['title'] }, translator, ...(requests === undefined ? {} : { requests: requests as never }) })],
    }),
    key: name,
  })
  keys.set(payload, name)
  started.push({ payload, mongo })
  return payload
}

afterAll(async () => {
  for (const s of started) {
    await s.payload.destroy()
    await s.mongo.stop()
  }
})

const call = (payload: Payload, method: string, path: string) =>
  handleEndpoints({ config: payload.config as never, payloadInstanceCacheKey: keys.get(payload), request: new Request(`http://localhost/api${path}`, { method }) })

describe('requests are off unless the option is exactly true', () => {
  for (const [label, value] of [['not set', undefined], ['false', false], ['the string "false"', 'false'], ['1', 1], ['an object', {}]] as const) {
    it(`with requests ${label}: no collection, and the endpoints answer 404`, async () => {
      const payload = await build(`off-${label.replace(/\W/g, '')}`, value)
      expect(payload.collections[SLUG as never]).toBeUndefined()
      expect((payload.config.endpoints ?? []).some((e) => e.path.startsWith('/polyglot/requests'))).toBe(false)
      expect((await call(payload, 'GET', '/polyglot/requests')).status).toBe(404)
      expect((await call(payload, 'POST', '/polyglot/requests/fr')).status).toBe(404)
      expect((await call(payload, 'DELETE', '/polyglot/requests/fr')).status).toBe(404)
    }, 120_000)
  }
  it('with requests true: the collection and endpoints exist', async () => {
    const payload = await build('on-true', true)
    expect(payload.collections[SLUG as never]).toBeDefined()
    expect((await call(payload, 'GET', '/polyglot/requests')).status).toBe(200)
  }, 120_000)
})
