# Changelog

## Unreleased

- **Language picker.** `<LanguageSwitcher>` in `/client`: a button showing the current language that opens a searchable list, a bottom sheet on phones and a popover on larger screens. Search matches English and native names ("German" finds Deutsch) using `Intl.DisplayNames`. Combobox and listbox pattern with keyboard support, screen reader names and announcements, focus management and a focus trap. Themed with `--pg-*` variables that fall back to `--palette-*`. `languageList(payload)` supplies the site's languages.
- **Needs review tag.** A per-language setting, Languages tagged Needs review, in Translation settings. The picker tags only those languages.
- **`<TranslationNotice>`** in `/rsc`: the Beta note on every unreviewed machine translation (with a suggest link), plus reviewed and not-yet-translated notes.
- **Language requests** (`requests: true`, default off). Search continues into unsupported languages; signed-in accounts vote, one vote per language per account, removable, several languages allowed. New collection `polyglot-language-requests` (no writes through the API, unique key) and endpoints `GET /polyglot/requests`, `POST` and `DELETE /polyglot/requests/:language`. `languageRequestsSource()` returns the requests as items for a plugin that accepts item sources.

Tested: 86 tests (30 new): vote uniqueness including a race and the database index, removal, several languages, signed-out refusal, no writes to another account's votes through the API, the Needs review tag, English and native name search, the picker's keys, ARIA and requests in jsdom. Real Payload with in-memory MongoDB and a fake translator.

Checked in a real browser (Chromium, desktop and a 375 px phone width, keyboard only) with made-up languages. That pass found and fixed three things: a reply missing `mine` blanked the page, so the reply is now read defensively; a browser without native-name data showed the English name marked as the other language, so it is now marked English; and the phone sheet jumped in height while typing, so it now holds 70% of the screen. Request rows now show a visible Vote or Voted label. 89 tests.

Review fixes (PR 5): requests turn on only for an exact `true`. Staff (`canManage`, else admin users) can delete votes through the API; others cannot. Deleting an account in any auth collection deletes its votes (`afterDelete`). The language route parameter is no longer decoded twice (`/requests/%25` gave a 500, now 400). Counts are cached for 30 seconds and cleared on every vote change. The live region sits inside the dialog (aria-modal hides anything outside it), empty when it mounts and filled on the next tick, the Voted state is in the option's accessible name, and site-language names that fell back to English are marked `lang="en"`. The Reviewed by a human field is left open to anyone who can edit the document (unchanged; owner to decide).

Tested (review fixes): 102 tests (13 new): requests off for unset, false, "false", 1 and an object, with no collection and 404 on all three endpoints through Payload's real endpoint handler; on for `true`; staff delete allowed, member, other member and signed-out refused; account deletion removes only its votes; `%` gives 400; cache cleared on vote and unvote; live region inside the dialog and empty at mount, Voted name; English fallback `lang`.

Not tested: a screen reader, a real phone with its keyboard open, measured color contrast, and Roadmap itself (only the item shape is tested).

## 0.3.0 (2026-11-11)

- **Behavior change (2026-11-11): only admin users manage translations by default.** With no `canManage`, any signed-in account of any auth collection, members included, could start translations (which can cost money), change Translation settings, and read or clear the translation memory and status. Now only users of the admin collection (`admin.user` in the Payload config) can. Sites relying on the old default must pass the option.
- **Only an exact `true` from `canManage` or `canConfigure` counts.** Any other truthy answer, an object or an error is a no: 401 or 403 from the endpoints, never a 500, and no view, menu link or banner. The settings global no longer passes the site's answer to Payload as its access.
- The translation memory and status collections are now read and cleared by managers only, not by anyone signed in.
- **Only an exact `true` from `enabled` turns translation on (2026-11-11).** Any other truthy answer, an object or an error now means turned off: no translation on publish, "Translate now" answers 400 rather than a 500, and the dashboard shows it off. With no `enabled`, translation runs as before.
- **`syncAll()` asks `enabled` too (2026-11-11).** A sweep, dry runs included, is skipped unless it answers exactly `true`; it returns `stopped: 'off'` and logs "sweep skipped: translation is off". Before, a scheduled sweep translated (and spent) while translation was off. From a cron or script, `enabled` gets a local request with no user (`createLocalReq`); "Translate now" passes its own request.

Tested: 56 tests (18 new, in `test/enabled.test.ts`), 24 mutation checks (11 for `enabled`), with a fake translator only.

Earlier versions: see the GitHub releases.
