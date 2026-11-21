import type { SelectConnection } from "@superset/db/schema";
import { grantSharedWithAnotherConnection } from "../../../lib/connectors/lookup";
import { decryptOptional, decryptSecret } from "../../plugins/crypto";
import { googleConfigOf } from "./state";

export async function releaseGoogleGrant(
	connection: SelectConnection,
): Promise<void> {
	try {
		if (await grantSharedWithAnotherConnection(connection)) return;
	} catch {
		console.warn("[google/disconnect] Could not check for a shared grant", {
			connectionId: connection.id,
		});
		return;
	}

	if (googleConfigOf(connection.state).gmail?.watchExpiresAt) {
		await attemptCleanup(connection.id, "stop mailbox watch", async () =>
			fetch("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${await decryptSecret(connection.accessToken)}`,
				},
				signal: AbortSignal.timeout(10_000),
			}),
		);
	}

	await attemptCleanup(connection.id, "revoke grant", async () =>
		fetch("https://oauth2.googleapis.com/revoke", {
			method: "POST",
			body: new URLSearchParams({
				token:
					(await decryptOptional(connection.refreshToken)) ??
					(await decryptSecret(connection.accessToken)),
			}),
			signal: AbortSignal.timeout(10_000),
		}),
	);
}

async function attemptCleanup(
	connectionId: string,
	operation: string,
	request: () => Promise<Response>,
): Promise<void> {
	try {
		const response = await request();
		if (!response.ok) {
			console.warn(`[google/disconnect] Could not ${operation}`, {
				connectionId,
				status: response.status,
			});
		}
	} catch {
		console.warn(`[google/disconnect] Could not ${operation}`, {
			connectionId,
		});
	}
}
