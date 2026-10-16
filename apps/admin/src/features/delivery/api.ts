import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// AD-08 Governorates and agent share (spec 03; design 02 §2.4 `settings.delivery`, `governorates.admin`).

export type Governorate = Schema<'GovernorateDto'>;
export type DeliverySettings = Schema<'DeliverySettingsDto'>;

export const deliveryKeys = { settings: () => queryKey('admin', 'settings', 'delivery') };

export function deliverySettingsQuery() {
  return queryOptions({
    queryKey: deliveryKeys.settings(),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/admin/settings/delivery', { signal }))).data,
  });
}

export async function setAgentFeeShareRate(agentFeeShareRate: string): Promise<DeliverySettings> {
  return (await unwrap(browserApi.PUT('/api/v1/admin/settings/delivery', { body: { agentFeeShareRate } })))
    .data;
}

/** `deliveryFee` is always sent: a fee, or `null` to stop delivering there (api-inventory OA-6). */
export async function setDeliveryFee(
  governorateId: string,
  deliveryFee: string | null,
): Promise<Governorate> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/admin/governorates/{governorateId}', {
        params: { path: { governorateId } },
        body: { deliveryFee },
      }),
    )
  ).data;
}
