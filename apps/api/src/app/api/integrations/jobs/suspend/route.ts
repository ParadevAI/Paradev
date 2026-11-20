import { db } from "@superset/db/client";
import { connections, githubInstallations } from "@superset/db/schema";
import { revokeLinearConnection } from "@superset/trpc/integrations/linear";
import {
	organizationSyncsNow,
	syncingOrganizationIds,
} from "@superset/trpc/sync-policy";
import { Client } from "@upstash/qstash";
import { Redis } from "@upstash/redis";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "@/env";
import {
	appPlacedSuspension,
	suspendInstallation,
} from "@/lib/github/suspension";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { sweepConnections } from "./sweepConnections/sweepConnections";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const qstash = new Client({ token: env.QSTASH_TOKEN });
const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

// api.superset.sh answers through Cloudflare, which returns 524 to the caller
// once the origin has been silent for ~100s; QStash then retries and a second
// run starts while the first is still going. The budget keeps the summary
// inside that window; every processed row is already written, and the next
// run takes the rest.
const RUN_BUDGET_MS = 60_000;

/**
 * Hourly: bring every provider into line with `organizationSyncsNow`, so the
 * traffic of an iced organization stops at the provider instead of being
 * accepted and dropped here.
 *
 * GitHub can be paused: the App installation is suspended, and unsuspended
 * and backfilled when the policy readmits the organization. Linear cannot:
 * its tokens are revoked and the connection marked disconnected, and coming
 * back is the Connect flow again. The subscription hook readmits the org that
 * has just paid immediately; this is what catches everyone else, such as a
 * policy that also ices idle organizations and lets them back on return.
 *
 * Each provider stops at its first rate-limit response or at the run budget
 * and the next run carries on; whatever is left over is still iced an hour
 * later.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/jobs/suspend",
	);
	if (rejected) return rejected;

	const deadline = Date.now() + RUN_BUDGET_MS;
	const [github, linear] = await Promise.all([
		githubPass(deadline),
		linearPass(deadline),
	]);
	return Response.json({ github, linear });
}

async function githubPass(deadline: number) {
	const rows = await db
		.select({
			id: githubInstallations.id,
			installationId: githubInstallations.installationId,
			organizationId: githubInstallations.organizationId,
			suspended: githubInstallations.suspended,
		})
		.from(githubInstallations)
		.orderBy(githubInstallations.id);
	const key = "integrations:suspend:github:cursor";
	const outcomes = {
		candidates: 0,
		suspended: 0,
		gone: 0,
		rate_limited: 0,
		failed: 0,
		resumed: 0,
	};
	const progress = await sweepConnections({
		rows,
		deadline,
		cursor: await redis.get<string>(key),
		syncing: syncingOrganizationIds,
		checkpoint: (cursor) => (cursor ? redis.set(key, cursor) : redis.del(key)),
		visit: async (installation, allowed) => {
			if (!installation.suspended && !allowed) {
				outcomes.candidates++;
				if (await organizationSyncsNow(installation.organizationId))
					return true;
				const outcome = await suspendInstallation(installation);
				outcomes[outcome]++;
				return outcome !== "rate_limited";
			}
			if (installation.suspended && allowed) {
				try {
					if (!(await appPlacedSuspension(installation))) return true;
					await qstash.publishJSON({
						url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
						body: {
							installationDbId: installation.id,
							organizationId: installation.organizationId,
						},
						retries: 3,
					});
					outcomes.resumed++;
				} catch (error) {
					console.error(
						`[integrations/suspend] github resume failed for installation ${installation.installationId}:`,
						error,
					);
					outcomes.failed++;
				}
			}
			return true;
		},
	});
	return { ...outcomes, ...progress };
}

async function linearPass(deadline: number) {
	const rows = await db
		.select()
		.from(connections)
		.where(
			and(
				eq(connections.connector, "linear"),
				eq(connections.authMethod, "oauth2"),
				isNull(connections.disconnectedAt),
			),
		)
		.orderBy(connections.id);
	const key = "integrations:suspend:linear:cursor";
	const outcomes = { candidates: 0, revoked: 0, rate_limited: 0, failed: 0 };
	const progress = await sweepConnections({
		rows,
		deadline,
		cursor: await redis.get<string>(key),
		syncing: syncingOrganizationIds,
		checkpoint: (cursor) => (cursor ? redis.set(key, cursor) : redis.del(key)),
		visit: async (connection, allowed) => {
			if (allowed) return true;
			outcomes.candidates++;
			if (await organizationSyncsNow(connection.organizationId)) return true;
			const outcome = await revokeLinearConnection(connection).catch(
				(error) => {
					console.error(
						`[integrations/suspend] linear revoke failed for connection ${connection.id}:`,
						error,
					);
					return "failed" as const;
				},
			);
			outcomes[outcome]++;
			return outcome !== "rate_limited";
		},
	});
	return { ...outcomes, ...progress };
}
