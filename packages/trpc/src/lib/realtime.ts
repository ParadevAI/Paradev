import type { BoxPressure } from "@superset/shared/box-pressure";
import {
	type RealtimeNudgeKind,
	type RealtimeUpdate,
	realtimeWorkspaceForwardsPath,
} from "@superset/shared/realtime";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { env } from "../env";

/**
 * Tell an organization's subscribed windows that a kind of thing changed, so
 * they refetch instead of polling. Called after the write and never awaited
 * by it: the request is handed to the platform to finish after the response,
 * and a failed delivery only costs freshness until the next focus.
 */
export function nudge(
	organizationId: string,
	kind: RealtimeNudgeKind,
	update?: RealtimeUpdate,
): void {
	waitUntil(
		fetch(`${env.REALTIME_URL}/v2/nudge`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ organizationId, kind, update }),
			signal: AbortSignal.timeout(5_000),
		})
			.then((response) => {
				if (!response.ok) {
					console.warn(`[realtime] nudge ${kind} rejected: ${response.status}`);
				}
			})
			.catch((error) => {
				console.warn(
					`[realtime] nudge ${kind} failed:`,
					error instanceof Error ? error.message : error,
				);
			}),
	);
}

/** Awaited, unlike a nudge: the box retries only when this fails, and its next report must not overtake this one. */
export async function publishBoxPressure(
	organizationId: string,
	workspaceId: string,
	pressure: BoxPressure | null,
): Promise<boolean> {
	try {
		const response = await fetch(`${env.REALTIME_URL}/v2/box-pressure`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ organizationId, workspaceId, pressure }),
			signal: AbortSignal.timeout(5_000),
		});
		if (!response.ok) {
			console.warn(`[realtime] box pressure rejected: ${response.status}`);
		}
		return response.ok;
	} catch (error) {
		console.warn(
			"[realtime] box pressure failed:",
			error instanceof Error ? error.message : error,
		);
		return false;
	}
}

export async function readWorkspaceForwards(
	organizationId: string,
	workspaceId: string,
): Promise<z.infer<typeof forwardsResponseSchema>["forwards"]> {
	const response = await fetch(
		`${env.REALTIME_URL}${realtimeWorkspaceForwardsPath(organizationId, workspaceId)}`,
		{
			headers: { authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}` },
			signal: AbortSignal.timeout(5_000),
		},
	);
	if (!response.ok) {
		throw new Error(`realtime forwards read: ${response.status}`);
	}
	const parsed = forwardsResponseSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("realtime forwards read: malformed");
	return parsed.data.forwards;
}

const port = z.number().int().min(1).max(65535);
const forwardsResponseSchema = z.object({
	forwards: z.array(
		z.object({
			port,
			localPort: port,
			since: z.number(),
			user: z.object({
				id: z.string(),
				name: z.string(),
				image: z.string().nullable(),
			}),
		}),
	),
});
