# Dashboard and decisions design QA

Final result: passed

## Findings

No actionable P0, P1, or P2 findings remain after the comparison and verification loop.

## Visual targets and evidence

Project: `/Users/justinwang/.codex/worktrees/decisions-dashboard/ACMProjectsAppReview`.

| Screen | Source visual truth | Implementation screenshot | Full comparison | Focused comparison |
| --- | --- | --- | --- | --- |
| Dashboard | `docs/design/decisions-dashboard/dashboard-mockup.png` | `artifacts/decisions-dashboard.local/dashboard-final.png` | `artifacts/decisions-dashboard.local/dashboard-comparison-final.png` | `artifacts/decisions-dashboard.local/dashboard-detail-final.png` |
| Decisions | `docs/design/decisions-dashboard/decisions-page-layout.png` | `artifacts/decisions-dashboard.local/decisions-final.png` | `artifacts/decisions-dashboard.local/decisions-comparison-final.png` | `artifacts/decisions-dashboard.local/decisions-detail-final.png` |

Implementation URLs: `http://localhost:5178/` and `http://localhost:5178/rankings`.

### Viewport, density, and state

- Dashboard source: 1586 × 992 pixels. CSS comparison viewport: 1440 × 900. Raw capture: 1920 × 1200. Normalized implementation: 1440 × 900.
- Decisions source: 1490 × 1056 pixels. CSS comparison viewport: 1440 × 1021. Raw capture: 1920 × 1361. Normalized implementation: 1440 × 1021.
- In-app browser reported DPR 0.75. Its raw captures include surplus canvas beyond the app viewport. Cropped that canvas at the observed CSS viewport bounds; did not stretch the implementation. Resized source images to the matching comparison dimensions. Source and implementation are joined in each comparison image.
- Same state: white theme, Test Reviewer, admin navigation visible, deadline October 9, 2026, three days remaining, 23 saved decisions, six accepted applicants selected.
- Isolated sample fixture supplies the existing API contracts and development sheet loader. No fixture is included in the normal production build.
- Additional viewports checked: 960 × 800, 390 × 844, and 320 × 800 CSS pixels. Narrow screens keep the table in its own scrolling region.

## Required fidelity surfaces

- **Fonts and typography:** DM Sans is loaded and verified in the browser. Preserved two-line dashboard heading, blue second line, date hierarchy, table name/ID hierarchy, rating scale, and readable control text. Revised the initially small table typography after the first comparison.
- **Spacing and layout rhythm:** Integrated deadline shares the dashboard hero grid with a thin vertical divider; no card surrounds it. Review and View Decisions sit together. Four equal summary columns align under a horizontal divider. Decisions uses the selected table structure with active filter underlines. Removed extra viewport-height overflow and tightened table rows after recapture.
- **Colors and tokens:** Uses the selected soft ACM blue `#62b0ff`, charcoal `#333`, original rainbow header rule, and semantic decision colors. Browser computed the Review background as `rgb(98, 176, 255)`. Dark text on the soft blue Review button is an intentional contrast adjustment (6.29:1). Links and focus outlines use darker blue; accepted badge text was darkened after a contrast check.
- **Image quality and assets:** Reused the actual repository ACM logo; no generated replacement or CSS approximation. Heroicons supplies the standard arrows and decision icons. Raster reference noise and antialiasing differences are expected.
- **Copy and content:** Preserved Projects Application / Review Portal, the requested subtitle, Review, and View Decisions. Decisions copy uses Browse applicants by their saved decision, as in the selected user reference. Omitted sample-data annotations from the application. Actual track names come from the sheet, so the fixture displays Hack where the illustrative table says SWE.

## Comparison history

1. **Initial comparison:** `dashboard-comparison-1.png` and `decisions-comparison-1.png` in the evidence folder. P2: decisions names, IDs, dates, and badges were smaller than the reference. Increased the appropriate text sizes. Kept the latest dashboard header styling consistent across both pages rather than copying the older decisions header shell.
2. **Responsive comparison:** P2: 320 px decision filters and the loading heading overflowed the page. Added bounded filter scrolling, adjusted narrow filter spacing/type, and constrained the loading placeholder. Rechecked: document width equals body width; all three filters fit the 260 px filter area.
3. **Layout recapture:** P2: redundant main minimum height caused a small dashboard scrollbar; filter negative margin caused an internal vertical scrollbar. Removed the redundant minimum height and filter overlap. Expanded the table's minimum width and application column so actions remain inside their cells. Reduced row padding to restore the reference density. Rechecked: dashboard scroll height equals its 900 px viewport; decisions scroll height equals its 1021 px comparison viewport.
4. **Contrast check:** P2: accepted badge text initially measured below 4.5:1. Darkened its foreground and the focus outlines. Recaptured and rechecked the final full and focused comparison images listed above. No remaining P0/P1/P2 findings.

## Behavior and state verification

- View Decisions opens the replacement `/rankings` page with Accepted selected.
- Accepted, Waitlisted, and Rejected show six, five, and twelve rows; an unrated waitlisted applicant remains visible.
- Selected filter survives reload through its URL parameter. Keyboard Tab then Space selected Waitlisted.
- View application for Maya Patel opens `/review?application=sheet-row%3A27`, displaying Maya and application 27 of 63.
- Changed Maya to Waitlist and saved through the existing review form. Dashboard changed from 6/5/12 to 5/6/12; the decisions view showed Maya in the six-row waitlist group. Restored fixture seed data afterward.
- Explicit missing application ID shows Application unavailable with no editable review panel. All applications returns to the queue.
- Empty response shows No accepted applicants yet. Forced API failure shows Could not load decisions and Try again; retry recovered after restoring the API fixture.
- A 2500 ms fixture delay exposed the loading skeleton, including the narrow mobile state. `decisions-loading-mobile.png`, `decisions-empty.png`, and `decisions-error.png` document these states.
- Mobile horizontal scrolling reached the application action column while the document remained at scrollLeft zero. Evidence: `decisions-mobile-actions.png`. Dashboard mobile and tablet evidence: `dashboard-mobile.png` and `dashboard-tablet.png`.
- Console check after recovery and normal navigation returned no warnings or errors. The forced failure was an intentional fixture response.

## Code verification

- `npm test`: 35 passed, zero failures (12 backend, 8 sheet, 15 feature tests).
- `npm run build`: passed, including TypeScript compilation.
- `npm run lint`: passed.
- `git diff --check`: passed.
- Independent read-only review found no regressions in decision grouping, direct application selection, queue pagination, or unavailable application handling.
- React review: independent reads run in parallel, route chunks remain lazy, grouping is memoized, effects guard unmounted updates, links/buttons use native semantics, and the table has column headers and a labelled focusable scrolling region.

## Implementation checklist

- [x] Approved dashboard layout and deadline countdown.
- [x] Saved decisions page replacing candidate ratings.
- [x] Correct application links and unrated applicants.
- [x] Loading, empty, error, and retry states.
- [x] Desktop, tablet, and mobile layout checks.
- [x] Post-fix full and focused design comparisons.
- [x] Build, lint, tests, and independent correctness review.

## Limits and follow-up polish

Browser checks used isolated localhost sample data, not live production authentication or storage. The existing physical sheet-row identifier scheme remains in use. Minor generated-reference font/antialiasing differences are P3. The source blue headline is retained as explicitly selected; operational controls use darker foregrounds for readability.

Evidence and fixture files are local verification artifacts in ignored `.local` directories. The application itself reads the existing real APIs and sheet data in its normal configuration.

## Follow-up: vertical centering

The user's latest instruction supersedes the original fixed top spacing. The dashboard now fills the viewport below the actual navigation height and centers the hero plus statistics as one group. Its shell class is specific to the dashboard. Small screens retain normal document scrolling.

- Desktop 1440 × 900: top gap 161.27 px, bottom gap 161.27 px, document scroll height 900 px.
- Current browser viewport 1836 × 1565: top and bottom gaps differ by less than 0.34 px.
- Mobile 390 × 844: no horizontal page overflow; heading starts 40 px below navigation; content scrolls naturally to 886 px.
- Evidence: `artifacts/decisions-dashboard.local/dashboard-centered-desktop.png`, `dashboard-centered-mobile.png`, and `dashboard-centered-comparison.png`. Raw browser captures are retained beside them; viewport canvas is cropped using the same normalization as above.
- Font sizes, brand palette, assets, and app copy retain the previously reviewed values. The changed vertical position is intentional.
- Build and lint checks passed after this change.

Final result: passed

## Follow-up: navigation outline

Restored the enclosing capsule border, padding, and subtle shadow on the shared navigation. These styles were accidentally omitted when the shared header was updated. Verified the Admin active state in the browser and checked the navigation at 390 px without clipping or horizontal page overflow.

Evidence: `artifacts/decisions-dashboard.local/navigation-outline-restored.png`. Build, lint, and `git diff --check` passed after the change.

Final result: passed

## Follow-up: app-wide typography

The user requested consistent typography across the app. Shared font tokens and text roles now live in `src/typography.css`. The dashboard, decisions, review, admin, and sign-in screens use DM Sans with regular (400), semibold (600), and bold (700) roles. Standard page titles, section titles, card titles, captions, labels, applicant names, fields, and controls use the same scale. The approved dashboard keeps its larger display heading.

- Desktop at 1440 × 900: review, decisions, admin, and sign-in page titles are 50 px / 700. Review and decisions section titles share the same responsive size. Card titles are 24 px / 700. Applicant names in both tables are 16 px / 600. Form fields and review answers are 16 px / 400; standard controls are 14 px / 600 and large controls are 16 px / 600.
- The dashboard retains vertical centering; the measured upper and lower gaps differ by 0.03 px. Its document height remains 900 px at the desktop viewport.
- Mobile at 390 × 844: reviewed all signed-in pages. Review questions and answers are 16 px, and fields use 16 px. Decisions filtering still changes the selected group correctly. Long answers wrap without document overflow.
- Narrow 320 × 800 check found overlapping navigation text. Gave the navigation a minimum readable width so the header wraps controls. Rechecked: all labels fit their boxes, and no review content extends beyond the document width.
- Hid the desktop admin column heading row below the existing stacked-row breakpoint. This removes the clipped Assigned to label on mobile. Final mobile admin check found no text outside the page width.
- Sign-in was checked at 1440 × 900 and 355 × 767. The isolated preview omits Supabase auth configuration, so its existing local configuration-error state was visible. The sample reviewer session was restored after checking this state. Production authentication was not exercised.
- Final browser console check returned no warnings or errors on the restored review page.
- `npm run build`, `npm run lint`, `npm run test:decisions` (15 tests), and `git diff --check` passed after the relevant changes. The last changes after the test run were CSS-only and passed a subsequent build and lint check.
- React check: this follow-up changes presentation classes only. Existing data loading, hooks, keyboard interaction, routing, and review-save logic retain their existing behavior.

Evidence: `artifacts/decisions-dashboard.local/typography-app-overview.png`, five desktop page captures, mobile page captures, and `typography-review-narrow.png`. All checks use isolated localhost sample data. Browser viewport overrides were cleared after verification.

Final result: passed


## Follow-up: admin copy emails by decision

Added an admin-only Copy emails action beside the selected decision group. Accepted, Waitlisted, and Rejected each copy only that category. The action uses the existing admin role response and starts hidden while the role is unknown. It copies applicant addresses from the application sheet, including applicants without a rating, and never uses reviewer addresses.

- Output uses comma-space separators with no trailing comma or newlines. Addresses are trimmed, deduplicated without case sensitivity, and checked for a single email address. Missing or malformed emails are omitted and reported. An empty list disables copying.
- Unit checks cover relocated general email columns, track-specific email questions, the legacy column-B layout, missing sheet rows, explicit blank email cells, separate decision categories, unrated applicants, duplicate addresses, plus addresses, and malformed/multiple-address values.
- Native browser clipboard was read by an ignored same-origin verification page after each copy. Exact expected fixture output matched for Accepted (6), Waitlisted (5), and Rejected (12). All three outputs had no newlines or trailing comma. The check displayed only comparison results and counts, not clipboard contents.
- Non-admin fixture: no copy button on any of the three tabs. Admin empty fixture: copy button disabled. Switching categories resets the copied confirmation.
- Desktop capture: 1308 px content width, button aligned with the results heading. Mobile was checked in same-origin 390 px and 320 px frames because this run's browser viewport override did not change the measured viewport. The toolbar wraps, the 44 px button remains inside the document, and only the existing table scrolls horizontally. Frame scrollbars reduce the measured content widths to 370 px and 300 px.
- An ignored browser fixture replaced clipboard writing with a rejected promise to verify failure handling. The app showed its alert and a read-only, selectable email list at narrow width. The browser did not enforce the attempted iframe permissions-policy denial, so that attempt was not used as evidence.
- npm run test:decisions: 20 passed. npm run build and npm run lint passed. git diff --check passed.
- React check: grouping and email formatting are memoized; the clipboard action runs from a native button; status and failure messages have live-region semantics; the fallback field is labelled; per-category component keys prevent stale confirmation text.

Evidence: artifacts/decisions-dashboard.local/decisions-copy-emails-desktop.png, decisions-copy-emails-success.png, decisions-copy-emails-mobile.png, and decisions-copy-emails-fallback.png. Browser checks used isolated localhost sample data. Live production authentication was not exercised. Temporary viewport overrides were cleared and the decisions preview was restored.

Final result: passed


## Publication validation on current main

Rebased onto c55cf9d after the application-filters PR merged during publication. Preserved shared-comment saves, first-choice/answer filtering, both icon dependencies, and all existing test commands. Direct application selection now uses the same clamped pagination logic as the review filters. Pagination and filter changes clear the direct application parameter.

- npm ci --ignore-scripts completed; npm test passed all 70 tests (26 backend, 8 sheet, 6 review-editor, 9 application-filter, 21 dashboard/decisions/navigation). Production build, lint, and diff checks passed.
- Browser: View application for Maya Patel opened sheet-row:27 and Application 27 of 63. Next opened q=28, Sample Applicant 28. Applying the AI first-choice filter from Maya's direct link cleared the application parameter, reset q=1, and displayed Sample Applicant 01, AI, Application 1 of 18. The restored decisions view still showed its admin copy action and Copied 6 accepted emails confirmation.
- Publication includes the feature commit and design references. Ignored fixture servers and local evidence remain outside the PR.

Final result: passed
