import { z } from 'zod';

// The page CSP allows no `eval` (design 01 §10, T-I1). Zod 4 otherwise probes `Function("")` and compiles
// object parsers with it: blocked, that falls back silently but reports a violation on every page. Without
// JIT, parsing is the same, only interpreted. Imported first by this package's entry points and by the
// apps' query provider, so it runs before any schema is used.
z.config({ jitless: true });
