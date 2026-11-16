# Changelog

## Unreleased

- **Who can mark a translation reviewed (2026-11-16).** New `canReview({ req, doc, locale })` option. The Reviewed by a human field now has field-level update access: each language a save adds or removes must pass `canReview` with exactly `true`, or the whole change to that field is dropped. A throw, a rejection, another answer or no user is a no. **Behavior change:** the default is users of the admin collection only; before, anyone who could edit the document could mark a language reviewed. Sites with translators pass `canReview` (README has an example).
- **Report a problem with a translation.** `reports: true` (default off, exact `true` only) adds `POST /polyglot/reports` and the `polyglot-reports` collection. Signed-in accounts only; the message is capped at 500 characters; 10 reports an hour per account. Admins and `canReview` reviewers (for their languages) read; nobody writes through the API.

Tested: 83 tests (`test/review.test.ts`, 27 new): admin allowed, non-admin refused by default (add, remove, no user), a translator allowed for one language and refused for another and for a mixed change, a throw, a rejection and three non-true answers refused, reports off for unset, false, 'true', 1 and an object, signed-out refused, message cap (over refused, exact allowed), unknown page or language, report read rules by language, no writes, rate limit. Real Payload with in-memory MongoDB.

Not tested: a real translator workflow in the admin UI, and the field in a Payload version other than the one in devDependencies. Overlap with PR 5: both change `plugin.ts`, `types.ts`, `README.md`, `CHANGELOG.md` and `docs/decisions.md`; expect a small rebase.

## 0.3.0 (2026-11-11)

- **Behavior change (2026-11-11): only admin users manage translations by default.** With no `canManage`, any signed-in account of any auth collection, members included, could start translations (which can cost money), change Translation settings, and read or clear the translation memory and status. Now only users of the admin collection (`admin.user` in the Payload config) can. Sites relying on the old default must pass the option.
- **Only an exact `true` from `canManage` or `canConfigure` counts.** Any other truthy answer, an object or an error is a no: 401 or 403 from the endpoints, never a 500, and no view, menu link or banner. The settings global no longer passes the site's answer to Payload as its access.
- The translation memory and status collections are now read and cleared by managers only, not by anyone signed in.
- **Only an exact `true` from `enabled` turns translation on (2026-11-11).** Any other truthy answer, an object or an error now means turned off: no translation on publish, "Translate now" answers 400 rather than a 500, and the dashboard shows it off. With no `enabled`, translation runs as before.
- **`syncAll()` asks `enabled` too (2026-11-11).** A sweep, dry runs included, is skipped unless it answers exactly `true`; it returns `stopped: 'off'` and logs "sweep skipped: translation is off". Before, a scheduled sweep translated (and spent) while translation was off. From a cron or script, `enabled` gets a local request with no user (`createLocalReq`); "Translate now" passes its own request.

Tested: 56 tests (18 new, in `test/enabled.test.ts`), 24 mutation checks (11 for `enabled`), with a fake translator only.

Earlier versions: see the GitHub releases.
