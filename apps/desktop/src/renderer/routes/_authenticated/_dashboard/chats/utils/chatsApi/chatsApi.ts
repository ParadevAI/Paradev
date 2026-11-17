import { fileTypeFor } from "@superset/chats-core";
import { ApiError, cachedFileLinks, type SyncApi } from "@superset/chats-sync";
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
	| "beginFileUpload"
	| "putFilePart"
	| "finishFileUpload"
	| "fileLink"
	| "watchToken"
	| "answerQuestion"
	| "registry"
	| "registryListing"
	| "installListing"
	| "messageDetails"
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
	/** Where each open upload's bytes go: storage takes them straight from this device, in one part. */
	const uploads = new Map<
		string,
		{ url: string; headers: Record<string, string> }
	>();
	return {
		beginFileUpload: async (_groupId, body) => {
			const { fileId, upload } = await call(
				client.attachment.createUpload.mutate({
					name: body.name,
					contentType:
						fileTypeFor(body.name)?.mime ?? "application/octet-stream",
					sizeBytes: body.size,
				}),
			);
			uploads.set(fileId, upload);
			return { uploadId: fileId, partBytes: body.size, parts: 1 };
		},
		putFilePart: async (_groupId, uploadId, _index, bytes) => {
			const upload = uploads.get(uploadId);
			if (!upload) throw new Error("Upload not found");
			const response = await fetch(upload.url, {
				method: "PUT",
				headers: upload.headers,
				body: new Blob([bytes as BlobPart]),
			});
			if (!response.ok) throw new Error(`Upload failed (${response.status})`);
		},
		finishFileUpload: async (groupId, body) => {
			const sent = await call(
				chats.sendFile.mutate({
					groupId,
					fileId: body.uploadId,
					text: body.message,
					clientId: body.clientId,
				}),
			);
			uploads.delete(body.uploadId);
			return sent;
		},
		fileLink: cachedFileLinks((fileId) =>
			call(chats.fileLink.mutate({ fileId })),
		),
		answerQuestion: (questionId, body) =>
			call(chats.answerQuestion.mutate({ questionId, ...body })) as ReturnType<
				ChatsApi["answerQuestion"]
			>,
		registry: () => call(chats.registry.query()),
		registryListing: (slug) => call(chats.registryListing.query({ slug })),
		installListing: (slug, target, _timezone, name, paradevAccess) =>
			call(
				chats.installListing.mutate({
					organizationId,
					slug,
					target,
					name,
					paradevAccess,
				}),
			) as ReturnType<ChatsApi["installListing"]>,
		watchToken: (devId, groupId) =>
			call(chats.watchToken.mutate({ devId, groupId })),
		messageDetails: (messageId) =>
			call(chats.messageDetails.query({ messageId })) as ReturnType<
				ChatsApi["messageDetails"]
			>,
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
					paradevAccess: patch.paradevAccess,
					plugins: patch.plugins,
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
