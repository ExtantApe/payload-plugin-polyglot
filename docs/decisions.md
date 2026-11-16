# Decisions

## 2026-11-16: only translators and admins mark a translation reviewed

The owner's words: "Yes to the language stuff" (2026-11-16), accepting that only translators, for their assigned languages, and site admins can mark a translation reviewed, and that curators and everyone else can report a problem but not mark it reviewed. Captive Origins task K5041, decision D5011.

- `canReview({ req, doc, locale })` decides it, per language. Default: users of the admin collection. Sites map translators to languages through it.
- Enforced as field-level update access on the field, not only in the interface. Only an exact `true` passes; any error is a no.
- Reporting a problem is a separate, optional feature (`reports: true`) open to any signed-in account and never marks anything reviewed.
