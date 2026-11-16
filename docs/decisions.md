# Decisions

## 2026-11-16: one public language picker, owned by Polyglot

The owner's words: "The label is only for machine translated languages we aren't sure about (say like Zulu). Still want the same warning on stuff until a human reviews but needs review isn't for everything" and "The language thing should be a list but also have an autocomplete like I mentioned. Everything should be accessibility conscious but designed for the modern age. No clunky designs" and "languages should appear with everything else and yes, votes don't need to be locked. That should be adjustable per implementation."

What that means here:

- **The picker is a combobox and listbox.** It was designed first (pill button, popover on desktop, bottom sheet on phones, theme variables) and then made accessible without swapping in a plainer control: focus stays in the search box, `aria-activedescendant` follows the arrows, results and votes are announced, targets are at least 44px, focus rings are 3px.
- **Names: `Intl.DisplayNames`, no bundled table.** It gives English and native names from Unicode CLDR for every language in a fixed list of about 190 codes. Nothing from CLDR is copied into the repo, so there is no data license to carry; the runtime's own Unicode License v3 covers it. If a runtime has no name for a code, that language is left out. Search folds case and accents and ranks exact, prefix and word-prefix matches first.
- **Needs review tag.** A per-language setting in Translation settings, off for everything by default. The Beta page notice stays on all unreviewed machine translation and does not depend on it.
- **Requests and votes.** Signed-in accounts of any auth collection vote; one vote per language per account, removable, several languages allowed. Stored in `polyglot-language-requests` with a unique `language|account` key, checked in code and enforced by the index. Nothing writes the collection through the API; the endpoints act as the signed-in account. Off unless `requests: true`.
- **Roadmap.** `languageRequestsSource()` returns the shared item shape (`externalId` `lang:<code>`, title, vote count, `language` tag). Polyglot imports nothing from Roadmap, and Roadmap's vote locking is its own setting.
- **Interpretation.** With an empty search the list shows only the site's languages; unsupported ones appear while typing, under a heading, so a long list never crowds the screen.
