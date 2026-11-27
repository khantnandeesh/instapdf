/**
 * Lays the All tools panel's groups out in columns (owner 2026-11-27): a group is never split across
 * columns. Small groups stack in one column, in catalogue order; a group too tall for the panel's
 * height spans two (or more) columns side by side and flows its rows across them, under one heading.
 * The panel picks the shortest height (at least 8 rows) at which every group fits in `tracks` columns.
 *
 * `rows`: each group's row count. `head`: a heading plus the gap to the next group, in rows.
 * Returns the columns: the groups in each (by index) and how many tracks it spans.
 */
export type MenuColumn = { groups: number[]; span: number; h: number };

export function packMenu(rows: readonly number[], tracks: number, head = 1.7): MenuColumn[] {
  const total = rows.reduce((s, n) => s + n + head, 0);
  // A column is never shorter than 8 rows (or the tallest group): a short list is not spread thin.
  for (let h = Math.max(total / tracks, Math.min(8, Math.max(...rows)) + head); ; h += 0.1) {
    const cols: MenuColumn[] = [];
    let open: MenuColumn | undefined;
    rows.forEach((n, i) => {
      const span = Math.ceil(n / Math.max(1, Math.floor(h - head)));
      if (span > 1) cols.push((open = { groups: [i], span, h }));
      else if (open && open.h + n + head <= h + 1e-9) {
        open.groups.push(i);
        open.h += n + head;
      } else cols.push((open = { groups: [i], span, h: n + head }));
    });
    if (h >= total || cols.reduce((s, c) => s + c.span, 0) <= tracks) return cols;
  }
}
