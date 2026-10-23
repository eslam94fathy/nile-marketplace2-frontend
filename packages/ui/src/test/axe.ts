import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * axe on a rendered component (jsdom). Colour contrast needs real layout, so it is checked in the browser
 * instead (token page and component gallery, Playwright); the token pairs are also unit-tested. `region`
 * (content inside landmarks) is a page rule: components are rendered alone here, pages are checked in E2E.
 */
export async function expectNoAxeViolations(container: Element = document.body): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  const violations = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} at ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(violations).toEqual([]);
}
