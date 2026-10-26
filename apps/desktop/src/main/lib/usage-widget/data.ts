import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpLink } from "@trpc/client";
import { hostUsageObservations } from "main/lib/host-usage";
import {
	projectWidgetAccounts,
	type WidgetAppearances,
} from "shared/usage-widget/model";
import superjson from "superjson";

export async function readUsageWidget(
	connection: { port: number; secret: string },
	force: boolean,
	appearances: WidgetAppearances = {},
) {
	const observation = await hostUsageObservations.read(
		`http://127.0.0.1:${connection.port}`,
		force,
	);
	const data = observation?.data;
	if (!data || !observation) throw new Error("Usage host unavailable");
	const client = createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: `http://127.0.0.1:${connection.port}/trpc`,
				transformer: superjson,
				headers: { Authorization: `Bearer ${connection.secret}` },
				fetch: (url, options) =>
					fetch(url, { ...options, signal: AbortSignal.timeout(5_000) }),
			}),
		],
	});
	return {
		accounts: projectWidgetAccounts(data, appearances, observation.offline),
		offline: observation.offline,
		version: observation.version,
		claimResets: (ids: string[]) =>
			client.usage.claimQuotaResetNotices.mutate({ ids }),
	};
}
