import { ApiError, type SyncApi } from "@superset/chats-sync";
import type { AppRouter } from "@superset/trpc";
import { type createTRPCProxyClient, TRPCClientError } from "@trpc/client";

type ApiClient = ReturnType<typeof createTRPCProxyClient<AppRouter>>;

/** The part of the sync layer's API the chat store calls today. */
export type ChatsApi = Pick<
	SyncApi,
	| "bootstrap"
	| "realtimeToken"
	| "sendMessage"
	| "olderMessages"
	| "deleteMessage"
	| "editMessage"
	| "markRead"
	| "reportTyping"
	| "createGroup"
	| "createPersonalDev"
	| "createAgent"
	| "updateDev"
	| "deleteDev"
	| "renameGroup"
	| "deleteGroup"
	| "addGroupDev"
	| "removeGroupDev"
>;

/**
 * The sync layer retries a failed request only when it never reached the API,
 * and tells the two apart by `ApiError`. A tRPC error with a status came from
 * the API; one without is the network.
 */
export function toApiError(error: unknown): unknown {
	if (!(error instanceof TRPCClientError)) return error;
	const data = error.data as { httpStatus?: number; code?: string } | null;
	if (typeof data?.httpStatus !== "number") return error.cause ?? error;
	return new ApiError(
		data.httpStatus,
		(data.code ?? "error").toLowerCase(),
		error.message,
	);
}

const call = <T>(request: Promise<T>): Promise<T> =>
	request.catch((error: unknown) => {
		throw toApiError(error);
	});

export function createChatsApi(
	client: ApiClient,
	organizationId: string,
): ChatsApi {
	const { chats } = client;
	return {
		bootstrap: () => call(chats.bootstrap.query({ organizationId })),
		realtimeToken: () => call(chats.realtimeTicket.query({ organizationId })),
		sendMessage: (groupId, body) =>
			call(
				chats.sendMessage.mutate({
					groupId,
					text: body.text,
					clientId: body.clientId,
					replyToId: body.replyToId,
				}),
			),
		olderMessages: (groupId, beforeId, limit) =>
			call(chats.olderMessages.query({ groupId, beforeId, limit })),
		deleteMessage: async (messageId) => {
			await call(chats.deleteMessage.mutate({ messageId }));
		},
		editMessage: (messageId, text) =>
			call(chats.editMessage.mutate({ messageId, text })),
		markRead: (groupId, messageId) =>
			call(chats.markRead.mutate({ groupId, messageId })),
		reportTyping: async (groupId, typing) => {
			await call(chats.reportTyping.mutate({ groupId, typing }));
		},
		createGroup: (body) =>
			call(
				chats.createGroup.mutate({
					organizationId,
					title: body.title,
					devName: body.devName || undefined,
					devColor: body.devColor || undefined,
				}),
			),
		createPersonalDev: (body) =>
			call(
				chats.createPersonalDev.mutate({
					organizationId,
					name: body.name,
					color: body.color,
				}),
			),
		createAgent: (body) =>
			call(
				chats.createDev.mutate({
					organizationId,
					name: body.name,
					color: body.color,
					description: body.description,
				}),
			),
		updateDev: (devId, patch) =>
			call(
				chats.updateDev.mutate({
					devId,
					name: patch.name,
					color: patch.color,
					description: patch.description,
				}),
			),
		deleteDev: async (devId) => {
			await call(chats.deleteDev.mutate({ devId }));
		},
		renameGroup: (groupId, title) =>
			call(chats.renameGroup.mutate({ groupId, title })),
		deleteGroup: async (groupId) => {
			await call(chats.deleteGroup.mutate({ groupId }));
		},
		addGroupDev: (groupId, devId) =>
			call(chats.addDevToGroup.mutate({ groupId, devId })),
		removeGroupDev: async (groupId, devId) => {
			await call(chats.removeDevFromGroup.mutate({ groupId, devId }));
		},
	};
}
