import { ApplicationFailure } from "@temporalio/common";
import type { CredentialsProvider, TurnCredentials } from "../credentials";
import type { HostTarget } from "../hostJobs";
import type { SettleTurnInput, TurnSettler } from "../settler";
import { TrpcCallError, type TrpcCallOptions, trpcMutation } from "../trpcCall";

const WORKER_SECRET_HEADER = "x-agent-worker-secret";

/** API answers that a retry cannot change. */
const NON_RETRYABLE: Record<string, string> = {
	NOT_FOUND: "TurnNotRunning",
	FORBIDDEN: "WorkspaceForbidden",
	BAD_REQUEST: "BadTurnRequest",
};

export interface WorkerApiOptions extends TrpcCallOptions {
	apiUrl: string;
	workerSecret: string;
	model: { baseUrl: string; modelId: string };
	/** For local runs, where a session has no box: a host and router headers to use instead. */
	local?: {
		host?: HostTarget & { workspaceId: string };
		modelHeaders?: Record<string, string>;
	};
}

interface TurnCredentialsResponse {
	sessionStore: { baseUrl: string; writeTicket: string };
	host: (HostTarget & { workspaceId: string }) | null;
	model: { headers: Record<string, string> } | null;
}

/** The API's `agentWorker` routes: per-turn credentials and settling. */
export function workerApi(options: WorkerApiOptions): {
	credentials: CredentialsProvider;
	settler: TurnSettler;
} {
	const call = <T>(procedure: string, input: unknown) =>
		trpcMutation<T>(
			`${options.apiUrl}/api/trpc/agentWorker.${procedure}`,
			{ [WORKER_SECRET_HEADER]: options.workerSecret },
			input,
			options,
		);

	return {
		credentials: {
			async forTurn({ turnId }): Promise<TurnCredentials> {
				const granted = await call<TurnCredentialsResponse>("turnCredentials", {
					turnId,
				}).catch((error: unknown) => {
					const type =
						error instanceof TrpcCallError && error.code
							? NON_RETRYABLE[error.code]
							: undefined;
					if (type && error instanceof Error) {
						throw ApplicationFailure.nonRetryable(error.message, type);
					}
					throw error;
				});
				const host = granted.host ?? options.local?.host;
				const headers = granted.model?.headers ?? options.local?.modelHeaders;
				if (!host || !headers)
					throw ApplicationFailure.nonRetryable(
						"Turn has no workspace to run in",
						"NoWorkspace",
					);
				return {
					sessionStore: granted.sessionStore,
					host,
					model: { ...options.model, headers },
				};
			},
		},
		settler: {
			async settle(input: SettleTurnInput) {
				try {
					await call("settleTurn", input);
				} catch (error) {
					if (!(error instanceof TrpcCallError)) throw error;
					if (
						error.code === "CONFLICT" &&
						error.message.startsWith("STEER_PENDING")
					) {
						return { steerPending: true };
					}
					// A retry after a settle that landed finds the turn no longer running.
					if (error.code !== "NOT_FOUND") throw error;
				}
				return { steerPending: false };
			},
		},
	};
}
