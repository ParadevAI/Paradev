import { msg } from "@lingui/core/macro";
import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "@superset/host-service";
import { i18n } from "@superset/i18n";
import { TRPCClientError } from "@trpc/client";
import type { DestroyWorkspaceError } from "../../useDestroyWorkspace";

export function normalizeDestroyWorkspaceError(
	err: unknown,
	{
		viaRelay,
		relayTokenExpired,
	}: { viaRelay: boolean; relayTokenExpired: boolean },
): DestroyWorkspaceError {
	if (isDestroyWorkspaceError(err)) return err;
	if (err instanceof TRPCClientError) {
		const data = err.data as
			| {
					code?: string;
					teardownFailure?: TeardownFailureCause;
					deleteInProgress?: DeleteInProgressCause;
			  }
			| undefined;

		if (data?.teardownFailure) {
			return { kind: "teardown-failed", cause: data.teardownFailure };
		}
		if (data?.deleteInProgress) {
			return { kind: "in-progress", message: err.message };
		}
		if (data?.code === "CONFLICT") {
			return { kind: "conflict", message: err.message };
		}
		// A host reached directly also uses this code, for its own failures.
		if (data?.code === "SERVICE_UNAVAILABLE" && viaRelay) {
			return {
				kind: "host-offline",
				message: i18n._(
					msg({
						message: "The host is offline. Try again when it's back online.",
					}),
				),
			};
		}
		// The relay refuses an expired token, and the token is only still
		// expired here when refreshing it failed.
		if (data?.code === "UNAUTHORIZED" && viaRelay && relayTokenExpired) {
			return {
				kind: "sign-in-expired",
				message: i18n._(
					msg({
						message:
							"Your sign-in couldn't be refreshed. Check your connection, then try again.",
					}),
				),
			};
		}
		return { kind: "unknown", message: err.message };
	}
	return {
		kind: "unknown",
		message: err instanceof Error ? err.message : String(err),
	};
}

function isDestroyWorkspaceError(err: unknown): err is DestroyWorkspaceError {
	return (
		!!err &&
		typeof err === "object" &&
		"kind" in err &&
		typeof (err as { kind: unknown }).kind === "string"
	);
}
