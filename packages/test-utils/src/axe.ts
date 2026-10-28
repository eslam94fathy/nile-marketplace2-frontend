import axe from 'axe-core';

// axe in component tests (T-I2): the same WCAG 2.2 AA rule tags as the Playwright runs (e2e/fixtures), on a
// screen rendered with mocked data, so every screen is checked without the backend. jsdom has no layout:
// colour contrast stays with the browser runs.

/** Impacts that fail a test (CLAUDE.md §7: zero serious/critical violations). */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Need a real layout or a whole page (landmarks): checked in the browser runs instead. */
const LAYOUT_RULES = ['color-contrast', 'region'];

/** The serious and critical violations in `container`, one line each (empty when there are none). */
export async function axeViolations(container: Element = document.body): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: TAGS },
    rules: Object.fromEntries(LAYOUT_RULES.map((rule) => [rule, { enabled: false }])),
    resultTypes: ['violations'],
  });
  return results.violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} at ${targets}`;
    });
}
