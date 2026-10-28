// Lighthouse CI budgets (T-I3, architecture §8): storefront home, a category listing, a product page and the
// cart on Lighthouse's default mobile profile (a mid-range phone, slow 4G, 4x CPU slowdown), 3 runs per URL,
// judged on the median run. The URLs and the cart's session come from e2e/perf/lighthouse.spec.ts.
// INP needs real interactions, which a navigation run doesn't have: Total Blocking Time is its lab stand-in.

const median = (maxNumericValue) => ({ maxNumericValue, aggregationMethod: 'median-run' });

/* global module -- CommonJS: Lighthouse CI loads its config with require(). */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      settings: { onlyCategories: ['performance'] },
    },
    assert: {
      assertions: {
        // The plan's budgets (implementation plan T-I3).
        'largest-contentful-paint': ['error', median(2500)],
        'cumulative-layout-shift': ['error', median(0.1)],
        'total-blocking-time': ['error', median(200)],
        // Early warnings, not gates.
        'first-contentful-paint': ['warn', median(1800)],
        'resource-summary:script:size': ['warn', median(350_000)],
      },
    },
    upload: { target: 'filesystem', outputDir: 'lighthouse-report' },
  },
};
