# Dashboard and decisions feature

Status: dashboard and decisions page implemented in the feature worktree. See the project-root `design-qa.md` for verification evidence.

## Design references

- `dashboard-mockup.png`: the latest approved dashboard iteration, including the blue Review button.
- `decisions-page-layout.png`: the earlier accepted layout for the decisions page. Apply the dashboard's final brand palette when implementing it.
- Brand source: https://acmucsd.com/

## Dashboard

- Use the heading on two lines: **Projects Application** / **Review Portal**. The second line uses the same soft ACM blue throughout (#62b0ff).
- Keep the subtitle: "Get to reviewing the applications lil bro".
- Place a blue **Review** button and a charcoal **View Decisions** button next to each other, with View Decisions on the right.
- Keep the full desktop viewport, balanced spacing, existing navigation, ACM logo, and rainbow rule. Do not enlarge elements to fill whitespace.
- Put the deadline to the right of the heading, integrated into the hero grid with a subtle vertical divider and no enclosing box.
- The deadline contains the date, days remaining, and a slim time-remaining bar. No percentage, Today row, or timeline.
- The approved sample shows October 9, 2026 and 3 days left. The existing portal uses a 14-day countdown window; the blue portion represents the remaining 3/14 of the window in this mockup.
- Keep the four aligned statistics: Total decisions, Accepted, Waitlisted, Rejected. The reference counts (23, 6, 5, 12) are sample data.
- Do not add a separate View Decisions row, Decision Overview heading, or Review Outcomes heading.

## Decisions page

- Replace the existing Application Ratings / Candidate Ratings view at `/rankings` with the decisions view.
- Show accepted applicants by default and allow filtering between Accepted, Waitlisted, and Rejected, with counts on the filters.
- Use an aligned applicant table: applicant name and application ID, first choice, rating, decision, updated by/date, and View application action.
- Keep a Back to Dashboard action.
- Use real saved decisions and applicant data; sample rows in the mockup are visual references only.

## Workspace

- Branch: `wangjus/decisions-dashboard`.
- Base: `origin/main` at worktree creation.
- The original checkout and its uncommitted application changes are preserved.
- Implementation was authorized after design selection. The user subsequently authorized publishing the feature branch and creating a pull request; merging remains outside this request.
