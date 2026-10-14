// Checks the per-role fixtures themselves: each yields a signed-in account of its role.
import { expect, test } from './index';

test('customer, seller, agent and admin fixtures sign in with their role', ({
  customer,
  seller,
  agent,
  admin,
}) => {
  expect(customer.role).toBe('customer');
  expect(seller.role).toBe('seller');
  expect(seller.sellerId).not.toBe('');
  expect(agent.role).toBe('delivery_agent');
  expect(agent.agentId).not.toBe('');
  expect(admin.role).toBe('admin');
});
