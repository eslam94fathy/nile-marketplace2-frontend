import { E2E_APPS } from '../apps';
import { routeProtectionTests } from '../fixtures/route-protection';

routeProtectionTests('storefront', {
  path: '/account/orders?status=placed',
  heading: 'Your orders',
  home: E2E_APPS.storefront.landing,
});
