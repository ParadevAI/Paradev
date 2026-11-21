import { Client, Connection } from "@temporalio/client";
import { TRPCError } from "@trpc/server";
import { env } from "../../env";

let client: Promise<Client> | null = null;

/** One connection per server process; agents are off where Temporal is not configured. */
export function agentTemporal(): Promise<Client> {
	if (!env.TEMPORAL_ADDRESS) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Agents are not available here.",
		});
	}
	const address = env.TEMPORAL_ADDRESS;
	const apiKey = env.TEMPORAL_API_KEY;
	client ??= Connection.connect({
		address,
		...(apiKey ? { tls: true, apiKey } : {}),
	})
		.then(
			(connection) =>
				new Client({ connection, namespace: env.TEMPORAL_NAMESPACE }),
		)
		.catch((error) => {
			client = null;
			throw error;
		});
	return client;
}
