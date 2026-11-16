# payload-plugin-polyglot

Keeps all your [Payload](https://payloadcms.com) 3 content translated into every language you
have, a little at a time.

> **Beta (0.x).** Used on a live site. Feedback and issues welcome.
>
> **Language picker, requests and notice (unreleased).** Tested with Vitest: real Payload with in-memory MongoDB for votes, access and the settings, and jsdom for the picker's keyboard and ARIA behavior. It has not been seen in a real browser, on a phone, or with a screen reader yet.

- **Finds your content.** List the fields to translate per collection; they become per-language
  (Payload localization). Slugs, paths, relationships and images stay shared.
- **Translates on publish** (in Next.js, after the response, so saving stays fast) and in a
  **sweep** (`syncAll()`, from a cron or script) that catches anything missed or changed.
- **Pays only for what changed.** A fingerprint of each document's text skips unchanged
  documents; a translation memory of every sentence skips known text, so an edit only sends
  the edited sentences.
- **Never wastes calls on placeholders.** Lorem ipsum (and friends) is never sent.
- **Respects people.** Languages marked "Reviewed by a human" are never overwritten; when the
  source changes they are flagged as stale instead.
- **Cheap or free engines.** Claude built in (Haiku by default: in our test a 24,000-character
  site into 21 languages cost $0.30, about half that through the Batch API, with quality close
  to Opus); Microsoft Translator (free tier, about 2 million characters a month) built in; bring
  your own engine.
  A per-run character cap and clean stops on a used-up quota keep you inside free tiers: the
  next run continues where the last stopped.
- **Do-not-translate list** for product names, brands and scientific names.
- **Translation settings in the admin** (no deploy): pause automatic translation, languages not
  machine-translated, extra never-translate terms, notes for the translator (tone, audience), a
  glossary of preferred translations per language, a per-sweep character cap, and characters
  sent per month. The Translations view shows coverage per collection and language, with
  Translate now.
- **Tells admins when it stops.** Out of credits, a free quota used up or a refused key stops
  translation cleanly (nothing is lost) and shows why on the admin dashboard, as ⚠ next to
  Translations in the menu, and on the Translations view; `onStop` runs once (e.g. to email
  admins) and everything clears with the next successful translation.
- **Engine per language** (`translatorFor`), e.g. one engine for European languages and another
  for the rest.

## On its own, and with others

**On its own.** Polyglot needs Payload localization turned on (it refuses to start without it) and a translation engine: Microsoft Translator or Claude, both built in, or your own. It doesn't use any other plugin.

**Works with:** nothing designed yet. It translates the fields you list in any collection, including collections other plugins add, as long as it comes last in `plugins`.

**Family.** Polyglot is in the Locale family, with Places, which is named but not built yet. Locale is marked to be split, so its members and name will change, and all the families are a working draft.

## The language picker

`<LanguageSwitcher>` (from `@extantape/payload-plugin-polyglot/client`) is a button showing the current language. It opens a bottom sheet on phones and a popover on larger screens, with a search box and a list of your languages, each in its own name with the English name under it. Typing `German` finds Deutsch and typing `Zulu` finds isiZulu. Names come from the browser's `Intl.DisplayNames`, which carries Unicode CLDR data (Unicode License v3), so no name table ships with the plugin. It is a combobox with a listbox: focus stays in the search box, the arrow keys move, Enter chooses, Escape clears the search and then closes. The colors come from `--pg-*` variables that fall back to `--palette-*` theme tokens, so a theme restyles it. All of its text can be replaced with the `text` prop.

```tsx
// Server component
import { languageList } from '@extantape/payload-plugin-polyglot'
const languages = await languageList(payload)

// Client component
<LanguageSwitcher languages={languages} current={locale} hrefFor={(code) => `/${code}`} requests apiRoute="/api" signInHref="/sign-in" />
```

- **Needs review tag.** The list has no labels except a Needs review tag on languages staff pick under Translation settings, Languages tagged Needs review. Use it for machine translations you are unsure about.
- **Beta notice.** `<TranslationNotice>` (from `/rsc`) shows the Beta note on every machine translation a person has not reviewed, whatever the tag says. It also says when a language is reviewed or a page is not translated yet.
- **Requests.** With `requests: true`, the search continues into every other language the browser can name. Signed-in accounts (any auth collection) vote for a language, one vote per language per account, any number of languages, and take a vote back. Signed-out visitors can read counts and are sent to sign in. Votes live in the `polyglot-language-requests` collection. Nobody creates or edits a vote through the API; staff (the same rule as `canManage`: admin users by default) read all of it and can delete a vote, and an account reads only its own. Deleting an account in any auth collection deletes its votes too. Only an exact `true` turns requests on. Counts are cached for 30 seconds per server. A unique key on language and account keeps a vote single even if two requests race. Default off.
- **Limits.** The only limit is one vote per account per language, so a site with open sign-up can have votes stuffed cheaply; staff can delete votes in the admin. Voting and un-voting are cookie-authenticated POST and DELETE calls, so they rely on your Payload `csrf` setting and SameSite cookies.
- **With Roadmap.** `languageRequestsSource()` returns the requests as items (`lang:zu`, title, vote count) for a plugin that takes item sources. Polyglot does not need one.

Limits: the list is about 190 languages and regional variants, from a fixed list of codes. A language the browser has no name for is not offered. The picker needs JavaScript.

## Install

```bash
npm install @extantape/payload-plugin-polyglot
```

```ts
import { microsoftTranslator, polyglotPlugin } from '@extantape/payload-plugin-polyglot'

export default buildConfig({
  localization: { locales: ['en', 'de', 'fr', 'ja'], defaultLocale: 'en', fallback: true },
  plugins: [
    // Last, so it sees collections other plugins add.
    polyglotPlugin({
      collections: {
        pages: ['title', 'layout', 'meta'],
        posts: ['title', 'content', 'meta'],
        guides: ['title', 'summary', 'sections.heading', 'sections.body'], // only these parts of each row
      },
      translator: microsoftTranslator({ key: process.env.MS_TRANSLATOR_KEY!, region: 'westeurope' }),
      keep: ['Acme', 'Python regius'],
      maxCharactersPerRun: 200_000,
    }),
  ],
})
```

Run the sweep from a cron job or script:

```ts
import { syncAll } from '@extantape/payload-plugin-polyglot'

const report = await syncAll(payload) // { translated, pending, stopped: 'done' | 'budget' | 'quota' | 'paused' | 'off', … }
```

Claude instead of Microsoft:

```ts
import { claudeTranslator } from '@extantape/payload-plugin-polyglot/claude'

translator: claudeTranslator({ instructions: 'A website for reptile keepers.' }) // ANTHROPIC_API_KEY
// Default model claude-haiku-5-5; pass { model: 'claude-sonnet-5-5' } for more care.
// syncAll(payload, { useBatch: true }) uses the Message Batches API (half price)
```

Notes and glossary from Translation settings reach AI engines (Claude); Microsoft ignores them.
Engines we tried and did not build in: MyMemory (no key, but about 50,000 characters a day),
Firefox's Bergamot models and MADLAD-400 (free and local, but noticeably weaker, and MADLAD
repeats sentences), LibreTranslate's public server (now needs a key).

Show visitors what they are reading: `languageStatus(payload, collection, doc, locale)` returns
`source`, `machine`, `reviewed`, `stale` or `pending`.

## Options

| Option | Default | |
|---|---|---|
| `collections` | (required) | Fields per collection; dotted paths reach into arrays/groups |
| `translator` | (required) | `microsoftTranslator()`, `claudeTranslator()` or your own `{ translate, batch? }` |
| `translatorFor` | | Engine per language |
| `keep` | `[]` | Terms never translated |
| `maxCharactersPerRun` | no cap | Stop a sweep after this many characters |
| `enabled` | always | Whether a request may call the engine (keys, environments). Only an exact `true` turns it on; any other answer, or an error, is off. `syncAll()` asks it first and skips the whole sweep when off (`stopped: 'off'`); from a cron or script it gets a local request with no user |
| `include` | published docs | Which documents to translate |
| `skip` | lorem ipsum | Text never sent |
| `skipKeys` | urls, ids, slugs… | Keys whose strings are never text |
| `identityFields` | `slug`, `generateSlug`, `path` | Never change when another language is saved |
| `memorySlug` / `stateSlug` | `polyglot-memory` / `polyglot-state` | Collections it adds |
| `statusField` | `translations` | Per-document "Reviewed by a human" languages |
| `writeContext` | | Context for writes (e.g. `{ disableRevalidate: true }` in scripts) |
| `onPublish` | `true` | Translate after publishing |
| `onStop` | | Called once when translation stops (`{ payload, stop: { reason, message, at } }`), e.g. to email admins |
| `canManage` | admin users | Who sees the Translations view, the translation memory and status, and can Translate now. Only `true` counts: see [Access](#access) |
| `canConfigure` | `canManage` | Who may read and change Translation settings. Only `true` counts |
| `settings` | `true` | Add the Translation settings global (`settingsSlug` `polyglot-settings`, `settingsGroup` `Settings`) |

## Access

`canManage` decides who sees the Translations view, its menu link and the stop banner, who calls the
coverage and Translate now endpoints (which can spend money on the engine), and who reads or clears
the translation memory and status collections. `canConfigure` decides who reads and changes
Translation settings, and falls back to `canManage`.

Only an answer of exactly `true` counts. Anything else is a no: `false`, `1`, `'yes'`, an object
(one shaped like a query included), or an error thrown or rejected. An error doesn't escape as a 500;
the endpoints answer 403 (401 if nobody is signed in). Nobody who isn't signed in is let in, whatever
the functions say. What they return is never handed to Payload as access.

With neither option set, only users of your admin collection (`admin.user` in your Payload config,
usually `users`) are let in. Accounts from any other auth collection, such as site members, are refused.

**Changed 2026-11-11 (unreleased):** the default used to let any signed-in account in, members of
other auth collections included, so a member could start paid translations, change settings, and
read or clear the translation memory. Any truthy answer from `canManage` or `canConfigure` also
counted as yes. Sites relying on the old default must pass the option, for example
`canManage: ({ req }) => Boolean(req.user)`.

## License

MIT
