# Pinned review toolbar

Status: implemented on branch `nav-button`. Verified in a browser; no screenshot-comparison QA pass was recorded because there was no source mockup to compare against.

## Design references

- `toolbar-desktop.png`: the bar at 1440 CSS pixels on the first applicant, with Prev disabled.
- `toolbar-mobile-390.png`: 390 CSS pixels, where the shell header wraps and the bar wraps with it.
- Brand source: https://acmucsd.com/

Both captures use the development Test Reviewer, so the applicants are mock rows. Captures of the scrolled and editing states are deliberately not committed because they show a real reviewer's saved comment against a real applicant row.

## Problem

Prev and Next sat in a 260px rail at the end of `ReviewPanel`, which renders after the applicant's question-and-answer card. That card has no height limit: answers use `whitespace-pre-wrap` with no clamp, and the number of prompts varies by applicant and by selected section.

The controls therefore landed at a different screen position on every record, and for a wordy applicant they were pushed off screen. Reviewers had to hunt for them on each applicant, which is the one action they repeat most.

## Decision

Pin the navigation to a bar that renders **inside the shell's existing sticky header**, below the rainbow rule.

`InternalShell` gained an optional `toolbar` prop. The review page is the only caller; Dashboard, Admin and Decisions pass nothing and are unchanged.

### Why inside the header

The header is the only sticky element in the app (`sticky top-0 z-40`). Its height is a `min-height` of `4.875rem` plus a `0.4rem` rule, and `.portal-header-content` wraps at 1050px and again at 720px. The header is therefore **taller on narrow screens**.

A page-level `sticky top-[5.275rem]` would have been correct only on wide viewports and would have needed a ResizeObserver to track the real height. Nesting the bar in the element that is already sticky removes the offset math completely and wraps correctly for free. Measured bar top by viewport width:

| Width | Bar top |
| --- | --- |
| 1440px | 90px |
| 1050px | 90px |
| 720px | 148px |
| 390px | 148px |
| 320px | 197px |

A hardcoded offset would have been wrong at three of those five widths.

## Behaviour

- Layout follows the approved sketch: Prev at the left, the counter centred, Next at the right, then a divider and Cancel and Save.
- Save and Cancel appear only while editing. The bar carries a fixed `min-h` so its height does not change when they appear.
- Save sits next to Next for the first time, so a divider and spacing separate them. Confusing the two costs either a lost draft or a skipped applicant.
- Both navigation controls go inert while a save is in flight, so a reviewer cannot navigate away mid-save.
- Enabled controls are `Link`s and disabled ones are inert `span`s, preserving the behaviour of the rail they replace.
- Below `sm` the bar wraps to a second row, and the counter moves beneath the two controls.
- The toolbar renders only when the queue is usable. It is hidden while loading, on a load error, and on an empty filtered queue.

## Constraints preserved

- **Navigation stays URL-driven.** `getReviewSelectionIndex` and `createReviewHref` are untouched, so no new state was introduced and `tests/reviewNavigation.test.ts` passes unchanged.
- Deep links still work: `createReviewHref` drops the `application` param and sets `q`, preserving queue and application filters.

## Knock-on changes

- `ReviewPanel` lost its right rail and collapsed to a single column. `ReviewPanelSkeleton` dropped the matching rail blocks.
- Anchor offsets moved from `scroll-mt-28` to `scroll-mt-40`, and `<main>`'s min-height subtracts the toolbar, because the pinned chrome grew from about 5.3rem to about 8.8rem.

## Verification

Typecheck, lint, all 70 tests across five groups, and a production build pass.

Driven in headless Chrome against both dev servers, signed in as the development Test Reviewer. Distance from the top of the viewport to the Prev control:

| State | Prev top |
| --- | --- |
| Applicant 1, page top | 104px |
| Applicant 1, scrolled 1626px | 104px |
| Applicant 2, page top | 104px |

The bar measured 68px tall both before and after entering edit mode. No horizontal overflow and no console errors at 1440, 1050, 720, 390 or 320 CSS pixels.

## Known follow-ups

- The queue position now appears three times in one viewport: the pinned bar, the black badge in the applicant header, and the progress band. The black badge repeats the bar's string verbatim and is the redundant one.
- The filters popover (`z-30`) can be covered by the `z-40` header once the page scrolls. This predates the toolbar, which widens the covered band by its own height.

## Workspace

- Branch: `nav-button`.
- Base: `origin/main` at `d93434a`.
