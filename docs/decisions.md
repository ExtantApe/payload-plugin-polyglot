# Decisions

## 2026-11-16: only translators and admins mark a translation reviewed

The owner's words: "Yes to the language stuff" (2026-11-16), accepting that only translators, for their assigned languages, and site admins can mark a translation reviewed, and that curators and everyone else can report a problem but not mark it reviewed.

- `canReview({ req, doc, locale })` decides it, per language. Default: users of the admin collection. Sites map translators to languages through it.
- Enforced as field-level update access on the field, not only in the interface. Only an exact `true` passes; any error is a no.
- Reporting a problem is a separate, optional feature (`reports: true`) open to any signed-in account and never marks anything reviewed.

## 2026-11-16: the translator role is a hook plus documentation, with no role built in

The owner's words: "Hook + site role + openly work with other perms plugins in docs so it's able to effectively create it for you" (2026-11-16).

- `canReview` stays the one hook. It is typed (`CanReview`, `ReviewArgs`) and documented. The plugin ships no role name and creates no role.
- `canReviewByRole({ roles, roleField, anyLanguageRoles, languagesField })` builds the hook from a roles field on the user, so a site wires a translator role in a few lines. The names are the site's.
- The README shows a roles field on users and the pattern for a generic access-control plugin.

## 2026-11-16: a review expires, and reports do not name the reporter

Follow-ups to review of the reviewed-mark work.

- Create and duplicate use the same `canReview` rule as update, and a new document always starts with nothing reviewed.
- A mark comes off when that language is edited (unless the same save adds it again), and at the next sync when the default language changed or no fingerprint is on record. Both fail closed. The language is then translated again; the old text is not kept by the plugin (use Payload versions to keep it).
- Reviewers read a report's page, language and message, never the reporter's account (admins still see it). Deleting an account deletes its reports.

## 2026-11-16: one public language picker, owned by Polyglot

The owner's words: "The label is only for machine translated languages we aren't sure about (say like Zulu). Still want the same warning on stuff until a human reviews but needs review isn't for everything" and "The language thing should be a list but also have an autocomplete like I mentioned. Everything should be accessibility conscious but designed for the modern age. No clunky designs" and "languages should appear with everything else and yes, votes don't need to be locked. That should be adjustable per implementation."

What that means here:

- **The picker is a combobox and listbox.** It was designed first (pill button, popover on desktop, bottom sheet on phones, theme variables) and then made accessible without swapping in a plainer control: focus stays in the search box, `aria-activedescendant` follows the arrows, results and votes are announced, targets are at least 44px, focus rings are 3px.
- **Names: `Intl.DisplayNames`, no bundled table.** It gives English and native names from Unicode CLDR for every language in a fixed list of about 190 codes. Nothing from CLDR is copied into the repo, so there is no data license to carry; the runtime's own Unicode License v3 covers it. If a runtime has no name for a code, that language is left out. Search folds case and accents and ranks exact, prefix and word-prefix matches first.
- **Needs review tag.** A per-language setting in Translation settings, off for everything by default. The Beta page notice stays on all unreviewed machine translation and does not depend on it.
- **Requests and votes.** Signed-in accounts of any auth collection vote; one vote per language per account, removable, several languages allowed. Stored in `polyglot-language-requests` with a unique `language|account` key, checked in code and enforced by the index. Nothing writes the collection through the API; the endpoints act as the signed-in account. Off unless `requests: true`.
- **Roadmap.** `languageRequestsSource()` returns the shared item shape (`externalId` `lang:<code>`, title, vote count, `language` tag). Polyglot imports nothing from Roadmap, and Roadmap's vote locking is its own setting.
- **Interpretation.** With an empty search the list shows only the site's languages; unsupported ones appear while typing, under a heading, so a long list never crowds the screen.
