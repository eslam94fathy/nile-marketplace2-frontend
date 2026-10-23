import { E2E_APPS } from '../apps';
import { routeProtectionTests } from '../fixtures/route-protection';

routeProtectionTests('seller', { path: '/orders?tab=new', heading: 'Orders', home: E2E_APPS.seller.landing });
