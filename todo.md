# Habitator — TODO / Recommendations

This file lists recommended improvements, priorities, and short implementation notes for the Habitator plugin (source: `src/main.ts` and `src/settings.ts`). Use these as small, focused PRs.

## High priority

1) Proper leap-year support (Recommended)
   - Problem: UI always renders 365 buttons. Leap years (e.g. 2024) miss Feb 29 and are off by one day.
   - Goal: Render the correct number of days for the configured `year` (365 or 366), keep labels and `is-today` detection correct.
   - Files: `src/main.ts`
   - Implementation notes:
     - Add helper `daysInYear(year)` that returns 365/366.
     - Replace `for (let i = 0; i < 365; i++)` with `for (let i = 0; i < daysInYear(year); i++)`.
     - Ensure `formatDayLabel` and `toIsoDate` are used consistently.
   - Estimated effort: 30–60 minutes.

2) Reset should clear only the selected year's days (Fix mismatch)
   - Problem: Settings "Reset all progress" text suggests clearing progress for the selected year, but current code clears all completed days across all years.
   - Goal: Only remove completed ISO dates that fall within the configured `year`.
   - Files: `src/settings.ts` (settings UI), `src/main.ts` (helper utilities)
   - Implementation notes:
     - Implement helper `isIsoDateInYear(isoDate, year)` or parse `YYYY` and compare.
     - In settings reset handler, filter `habit.completedDays` to remove dates matching `this.plugin.settings.year` rather than clearing entire array.
   - Estimated effort: 20–40 minutes.

## Medium priority

3) Add keyboard accessibility for the day buttons
   - Problem: Day marking relies on pointer events (tap/long-press). Keyboard users can't toggle days.
   - Goal: Support keyboard activation (Space/Enter) to toggle, and a keyboard-friendly way to clear (e.g., Shift+Enter to clear).
   - Files: `src/main.ts`
   - Implementation notes:
     - Make each day element focusable (e.g., `btn.tabIndex = 0`) and add `keydown` handlers.
     - Add ARIA labels: `aria-pressed` and a descriptive label like "Jan 1, completed".
     - Respect long-press semantics or provide alternative key combo for clearing.
   - Estimated effort: 60–120 minutes.

4) Confirm destructive actions (delete habit, reset)
   - Problem: Delete and Reset are immediate and might be surprising.
   - Goal: Show a small confirmation modal or dialog before performing destructive actions.
   - Files: `src/settings.ts`
   - Implementation notes:
     - Use Obsidian's `Modal` for confirmation or a two-step button (click to confirm) with `.setWarning()`.
     - Keep flows keyboard accessible.
   - Estimated effort: 20–40 minutes.

5) Improve long-press UX & accidental triggers
   - Problem: Fixed 600ms timer may be too short/long on some devices.
   - Goal: Tune timer or offer an explicit "clear" modifier (e.g., long-press or Shift+click) and provide undo via Notice with action (if feasible).
   - Files: `src/main.ts`
   - Estimated effort: 20–60 minutes.

## Low priority / Nice to have

6) Per-year data organization (optional)
   - Idea: Store completed days by year or namespace to make multi-year behavior explicit and easier to query.
   - Options:
     - Keep the current flat ISO strings (simple), or
     - Store `completedByYear: { [year: string]: string[] }` per habit.
   - Files: `src/main.ts`, `src/settings.ts`, migration code in `normalizeSettings`
   - Estimated effort: 1–3 hours (includes migration logic and tests).

7) Tests for storage and migration
   - What to test: `normalizeSettings` migration, `tryLoadFromVaultFile`/`trySaveToVaultFile` behaviors (mock adapter), and `setDayCompleted`/`isDayCompleted` logic.
   - Files: add `tests/*` (Jest or Vitest), small unit tests for the utilities.
   - Estimated effort: 1–2 hours.

8) Improve UI/UX: Today highlight, month separators, tooltips
   - Ideas: Add month labels, week rows, or CSS grid improvements; show tooltip with ISO date on hover; animate toggles.
   - Files: `styles.css`, `src/main.ts`
   - Estimated effort: variable.

## Implementation details & small code hints

- daysInYear helper (suggestion):

```ts
function daysInYear(year: number): number {
  return (new Date(year, 11, 31).getDay(), (new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / (24 * 60 * 60 * 1000));
}
```
(You can also use `return (isLeapYear ? 366 : 365)` with a simple leap check.)

- Reset per-year example hint:

```ts
const year = this.plugin.settings.year;
habit.completedDays = habit.completedDays.filter(d => !d.startsWith(`${year}-`));
```

- Accessibility hint: set `btn.tabIndex = 0`, `btn.setAttribute('role', 'button')`, and `btn.setAttribute('aria-pressed', String(isCompleted));` then add `btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { /* toggle */ } });`.

## Suggested PR plan (small, reviewable steps)

1. Implement leap-year support + update `formatDayLabel` if needed. (small focused PR)
2. Fix reset to be per-year only. (small focused PR)
3. Add keyboard accessibility and ARIA attributes. (medium PR)
4. Add confirmations for delete/reset. (small PR)
5. Add unit tests for the above behaviors. (medium PR)

## Notes / assumptions

- These recommendations assume the project's UI and storage flows in `src/main.ts` and `src/settings.ts` as currently implemented.
- I intentionally kept changes minimal per item to keep PRs easy to review.

---

If you'd like, I can start implementing the top-priority item (leap-year support) now and open a small PR (or make changes locally). Which task should I pick first?