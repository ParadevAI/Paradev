import type { CommandStatus } from "@superset/db/schema";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export async function persistCommandStatus(params: {
	id: string;
	status: CommandStatus;
	claimedBy?: string;
	claimedAt?: Date;
	result?: Record<string, unknown>;
	error?: string;
	executedAt?: Date;
}): Promise<void> {
	const delays = [500, 1000, 2000];
	let lastError: unknown;

	for (let attempt = 0; attempt <= delays.length; attempt++) {
		try {
			await apiTrpcClient.agent.updateCommand.mutate(params);
			return;
		} catch (err) {
			lastError = err;
			console.warn(
				`[persistCommandStatus] Attempt ${attempt + 1} failed for ${params.id}:`,
				err,
			);
			if (attempt < delays.length) {
				await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
			}
		}
	}

	console.error(
		`[persistCommandStatus] All retries exhausted for ${params.id}:`,
		lastError,
	);
}
