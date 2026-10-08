# Applicant name search

Status: implemented on branch `search-bar`, off `nav-button`. Verified in a browser on both screens at four widths.

## Design references

- `queue-search.png`: the review queue filtered to one match, showing the input in the filter bar and the queue pill count following the search.
- `queue-no-match.png`: the zero-match empty state with its Clear search action.

Both captures use the development Test Reviewer, so the applicants are mock rows. No Decisions screenshot is committed, because that page reads real saved decisions and its table shows live applicant rows.

## Problem

Reviewers page through applicants one at a time. There was no way to reach a specific person except clicking Next until they appeared. The Decisions page had the same gap in a different shape: a whole decision bucket rendered as one table with no way to look a single applicant up.

The Admin screen had already solved this for itself, matching name or email case-insensitively. The two screens that needed it most had nothing.

## Decisions

### Typing filters the queue

Chosen over a jump-to-person typeahead. Filtering reuses the existing URL-driven filter pipeline, composes with the Assigned scope and the Filters popover, and leaves Prev and Next paging through the matches. A reviewer searching a common surname gets all of them in the queue rather than picking one from a dropdown and losing the rest.

### The search term is not part of `ApplicationFilters`

This is the load-bearing decision.

`ApplicationFiltersPopover` is a draft/commit control. It seeds local draft state when opened and, on Apply, calls back with a whole `ApplicationFilters` object built only from its own draft. Had `search` been a field on that interface, every Apply would have sent an empty term and silently wiped the reviewer's active search.

Giving the search its own query parameter makes that bug structurally impossible rather than merely avoided. Two useful behaviors then come free from code that already existed:

- `writeApplicationFilters` copies the incoming params and deletes only the keys it owns, so an active `search` survives an Apply. The existing test asserting an unrelated parameter survives is the guarantee.
- `createReviewHref`, the Prev and Next path, never goes through that function at all, so paging stays inside the match set.

### The parameter is `search`, not `name`

`name` was already taken. Both `readQueueScope` and `readApplicationFilters` still read it as a legacy track and scope alias from older shared links, and `writeApplicationFilters` deletes it.

### Matching is shared, and so is the applicant's name

The name was hardcoded to sheet column index 2 in four places and the email to index 1, with no resolver anywhere. A search that disagreed with the name on screen would be worse than no search, so both columns now resolve from the sheet headers, falling back to the original Google Form positions when no header matches. That fallback is what keeps callers working on sheets with absent or unlabelled headers.

Matching mirrors the Admin semantics, hitting name or email, and adds accent and whitespace folding so `jose` finds `José` and `maya  patel` finds `Maya Patel`.

## Behavior

- The input lives in the filter bar, **not** the pinned toolbar. The toolbar is suppressed when the queue is empty, so an input there would leave a reviewer with a zero-match search and no way to clear it. This is an invariant, not a layout preference.
- The term is **debounced by 200ms**. This is correctness, not polish. A half-typed term matching nobody clears the selected applicant, and the review editor only preserves an unsaved draft while the application id holds steady, so an intermediate term would discard a comment in progress.
- The input value is **local state synced from the URL**. A fully URL-controlled input round-trips every keystroke and resets the caret to the end mid-word, which also breaks IME composition.
- Params are written with **`replace: true`**. Without it, each keystroke becomes its own history entry. Measured: zero entries added across a typing session.
- When the applicant on screen still matches a new term, the queue narrows **around them** rather than jumping to the first match. An unconditional reset would yank a reviewer away mid-sentence, and typing fires repeatedly where an Apply click does not.
- The queue pills count the search, so they cannot contradict the visible queue.
- On Decisions, the search filters **all three buckets** so the tab counts reveal which decision a name landed in. The email copy action keeps the whole bucket, because a filter box must not quietly shrink a mail list.

## Verification

Typecheck, lint, all tests across five groups, and a production build pass.

Driven in headless Chrome against both dev servers, signed in as the development Test Reviewer.

| Check | Result |
| --- | --- |
| Queue narrowed by a term | 2 applicants to 1, counter and pill both followed |
| History entries added while typing | 0 |
| Zero-match state | Dedicated copy plus a working Clear search action |
| Reload of a `?search=` URL | Restored, input repopulated |
| Decisions tab counts under search | Followed; a no-match term drove all three to 0 |
| Decisions URL | `?search=` with no stray `q`, as intended for a page with no pager |

No horizontal overflow and no console errors at 1440, 720, 390 or 320 CSS pixels on either page.

The development sheet only has two applicants, so a real `@acmucsd.org` sign-in is needed to exercise the search against a full queue.

## Known follow-ups

- Admin keeps its own search UI and local React state. Only its name and email lookups were pointed at the shared resolver, so the three screens agree on who an applicant is. Unifying the control itself was left out of scope.
- Matching is substring, with no minimum length, so a single character matches nearly everyone. That is the same behavior Admin has always had.
- An applicant whose name cell is blank cannot be reached while a search is active.
