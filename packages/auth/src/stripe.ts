import Stripe from "stripe";
import { env } from "./env";
import { localMode } from "./local-mode";

export const stripeClient = localMode
	? new Proxy(new Stripe("sk_test_local_disabled"), {
			get() {
				throw new Error("Billing is unavailable in the personal installation.");
			},
		})
	: new Stripe(env.STRIPE_SECRET_KEY);

export async function syncCustomerName(customerId: string, name: string) {
	const [customer, taxIds] = await Promise.all([
		stripeClient.customers.retrieve(customerId),
		stripeClient.customers.listTaxIds(customerId, { limit: 1 }),
	]);
	if (customer.deleted || customer.business_name || taxIds.data.length > 0) {
		return;
	}

	await stripeClient.customers.update(customerId, { name });
}
