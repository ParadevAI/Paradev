import { syncOrganizationSubscription } from "@superset/auth/billing";
import { Webhook } from "svix";
import { env } from "@/env";

export const dynamic = "force-dynamic";

const webhook = new Webhook(env.AUTUMN_WEBHOOK_SECRET);
const PLAN_CHANGE_EVENTS = new Set([
	"billing.updated",
	"customer.products.updated",
]);

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	try {
		webhook.verify(body, Object.fromEntries(request.headers));
	} catch {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}
	const event = JSON.parse(body) as {
		type?: string;
		data?: { customer_id?: string };
	};
	const customerId = event.data?.customer_id;
	if (!event.type || !PLAN_CHANGE_EVENTS.has(event.type) || !customerId) {
		return Response.json({ ok: true });
	}
	await syncOrganizationSubscription(customerId);
	return Response.json({ ok: true, synced: customerId });
}
