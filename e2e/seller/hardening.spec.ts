import { securityTests } from '../fixtures/security';

// T-I1: security headers, CSP nonce, CSRF and session abuse (design 01 §4.3, §10).
securityTests('seller');
