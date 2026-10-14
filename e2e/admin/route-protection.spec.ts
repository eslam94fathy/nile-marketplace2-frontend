import { E2E_APPS } from '../apps';
import { routeProtectionTests } from '../fixtures/route-protection';

routeProtectionTests('admin', {
  path: '/sellers?status=pending_approval',
  heading: 'Sellers',
  home: E2E_APPS.admin.landing,
});
