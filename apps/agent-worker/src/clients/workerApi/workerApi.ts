import { ApplicationFailure } from "@temporalio/common";
import type { RoomPoster } from "../../activities/createActivities";
import type { CredentialsProvider, TurnCredentials } from "../credentials";
import type { HostTarget } from "../hostJobs";
import type {
	SessionStoreAccess,
	SettleTurnInput,
	TurnSettler,
} from "../settler";
import { TrpcCallError, type TrpcCallOptions, trpcMutation } from "../trpcCall";

const WORKER_SECRET_HEADER = "x-agent-worker-secret";
const TURN_TOKEN_HEADER = "x-agent-turn-token";

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
	/** The router key a turn without a workspace calls the model with. */
	modelHeaders?: Record<string, string>;
	/** For local runs, where a session has no box: a host and router headers to use instead. */
	local?: {
		host?: HostTarget & { workspaceId: string };
		modelHeaders?: Record<string, string>;
	};
}

interface TurnCredentialsResponse {
	sessionStore: { baseUrl: string; writeTicket: string };
	organizationId?: string;
	host: (HostTarget & { workspaceId: string }) | null;
	model: { headers: Record<string, string> } | null;
	room: { channelId: string; threadRootId: string | null } | null;
	agentToken: string;
	dev?: TurnCredentials["dev"];
	session?: TurnCredentials["session"];
	tools?: TurnCredentials["tools"];
}

/** The API's `agentWorker` routes (per-turn credentials and settling) and the Dev's room posts. */
export function workerApi(options: WorkerApiOptions): {
	credentials: CredentialsProvider;
	settler: TurnSettler;
	roomPoster: (credentials: TurnCredentials) => RoomPoster | null;
	reconcile: () => Promise<unknown>;
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
				const host = granted.host ?? options.local?.host ?? null;
				const headers =
					options.local?.modelHeaders ??
					granted.model?.headers ??
					routerKeyHeaders(options.modelHeaders, granted.organizationId);
				// A missing key is a deploy gap: retry, so the turn answers once it is set.
				if (!headers)
					throw ApplicationFailure.retryable(
						"Turn has no model credentials",
						"NoModelCredentials",
					);
				return {
					sessionStore: granted.sessionStore,
					host,
					room: granted.room,
					agentToken: granted.agentToken,
					model: { ...options.model, headers },
					...(granted.dev ? { dev: granted.dev } : {}),
					...(granted.session ? { session: granted.session } : {}),
					tools: granted.tools ?? null,
				};
			},
		},
		roomPoster: ({ room, agentToken }) =>
			room && agentToken
				? {
						post: (input) =>
							trpcMutation<{ id: string }>(
								`${options.apiUrl}/api/trpc/agentApi.postMessage`,
								{ [TURN_TOKEN_HEADER]: agentToken },
								{
									channelId: room.channelId,
									body: input.body,
									threadRootId: room.threadRootId,
									idempotencyKey: input.idempotencyKey,
								},
								options,
							).then((message) => ({ messageId: message.id })),
					}
				: null,
		reconcile: () => call("reconcile", undefined),
		settler: {
			async noteRetry(input) {
				await call("noteRetry", {
					...input,
					error: input.error.slice(0, 2000),
				});
			},
			async settle(input: SettleTurnInput) {
				try {
					const { sessionStore } = await call<{
						sessionStore: SessionStoreAccess;
					}>("settleTurn", input);
					return { steerPending: false as const, sessionStore };
				} catch (error) {
					if (
						error instanceof TrpcCallError &&
						error.code === "CONFLICT" &&
						error.message.startsWith("STEER_PENDING")
					) {
						return { steerPending: true as const };
					}
					throw error;
				}
			},
		},
	};
}

/** The router bills a key's turn to the organization the request names. */
function routerKeyHeaders(
	keyHeaders: Record<string, string> | undefined,
	organizationId: string | undefined,
): Record<string, string> | undefined {
	if (!keyHeaders) return undefined;
	return organizationId
		? { ...keyHeaders, "x-superset-organization-id": organizationId }
		: keyHeaders;
}
