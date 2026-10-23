import { E2E_APPS } from '../apps';
import { routeProtectionTests } from '../fixtures/route-protection';

routeProtectionTests('agent', { path: '/history', heading: 'History', home: E2E_APPS.agent.landing });
