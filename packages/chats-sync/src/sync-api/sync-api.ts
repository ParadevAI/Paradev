import type {
	FolderEntry,
	McpServer,
	QuestionPartAnswer,
	RegistryCard,
	RegistryListing,
	TaskDraft,
	TaskViewSpec,
} from "@superset/chats-core";
import { cachedFileLinks, type FileLink } from "../file-links/file-links.ts";
import { CHANGE_TIMEOUT_MS, request, requestBytes } from "../http/http.ts";
import type { Presence } from "../presence/presence.ts";

/**
 * A Dev's Wallet pass: unavailable while its public page is off (or the server signs no passes), else a link that
 * works for a few minutes and how many devices hold the pass (one more after it's added).
 */
export type DevPassLink =
	| { available: false }
	| { available: true; url: string; expiresAt: string; devices: number };

/** A Dev's public page, as its owner sees it: on or off, and its address. */
export interface ApiPublicLink {
	enabled: boolean;
	url: string;
}

import type {
	AddedGroupDev,
	ApiApp,
	ApiAppIntegration,
	ApiAppIntegrations,
	ApiAppTool,
	ApiAppVersion,
	ApiChatRead,
	ApiComposioAccount,
	ApiDev,
	ApiDevIntegrations,
	ApiGroup,
	ApiIntegrations,
	ApiInvitations,
	ApiInvitePreview,
	ApiMessage,
	ApiMessageDetails,
	ApiMessagePage,
	ApiQuestion,
	ApiStorageItem,
	ApiTask,
	ApiTaskActivity,
	ApiTaskView,
	ApiToolkit,
	ApiTrigger,
	ApiTriggerEvent,
	ApiTriggerOption,
	Bootstrap,
	CallSpeech,
	CreatedApp,
	CreatedChat,
	FileUpload,
	InstalledListing,
	InstallTarget,
	SendResult,
	SentMessage,
	SharedFileResult,
	TaskForm,
	TaskPatch,
	TriggerForm,
	TriggerPatch,
	WatchTicket,
} from "../api-types/api-types.ts";

/** An MCP server as sent for saving: `headers` values of `null` keep what the server has stored. */
export interface McpServerDraft {
	name: string;
	url: string;
	headers?: Record<string, string | null>;
}

/** A storage call as an app makes it through `window.dev.storage` (see apps/app-relay.ts). */
export type StorageCall =
	| { op: "get"; scope: "personal" | "shared"; key: string }
	| { op: "set"; scope: "personal" | "shared"; key: string; value: string }
	| { op: "delete"; scope: "personal" | "shared"; key: string }
	| { op: "list"; scope: "personal" | "shared"; prefix: string };

export type StorageResult =
	| { item: ApiStorageItem | null }
	| { items: ApiStorageItem[] }
	| { deleted: boolean };

export interface DevPatch {
	name?: string;
	color?: string;
	/** The editable part: a personal Dev owner's text after the generated opening, the whole description otherwise. */
	description?: string;
	/** A chosen look (core's `DEV_LOOK_IDS`), or null to be dressed by its words again. */
	look?: string | null;
	/** A voice from core's `DEV_VOICES`, or null for the server's default. */
	voice?: string | null;
	paradevAccess?: boolean;
}

/** A send is repeated with its clientId when it times out, so a dead connection is given up on well before iOS's 60 s. */
const SEND_TIMEOUT_MS = CHANGE_TIMEOUT_MS;

/** The signed-in API calls the sync store makes. */
export function createSyncApi(baseUrl: string, token: string) {
	const call = <T>(path: string, init: Parameters<typeof request>[2] = {}) =>
		request<T>(baseUrl, path, { ...init, token });
	return {
		bootstrap: () => call<Bootstrap>("/bootstrap"),
		realtimeToken: () =>
			call<{ token: string; channels: string[] }>("/realtime/token"),
		/**
		 * `via: "call"`: said on a voice call, so the Dev's answer is meant to be read aloud on it; `interrupted` is what
		 * you'd heard of its line when you cut it off.
		 */
		sendMessage: (
			groupId: string,
			body: {
				text: string;
				clientId: string;
				task?: TaskDraft;
				replyToId?: string;
				via?: "call";
				interrupted?: string;
			},
		) =>
			call<SendResult>(`/groups/${groupId}/messages`, {
				method: "POST",
				body,
				timeoutMs: SEND_TIMEOUT_MS,
			}),
		/** Up to `limit` messages of the chat from before `beforeId`, oldest first, with the apps and tasks they carry as cards. */
		olderMessages: (groupId: string, beforeId: string, limit: number) =>
			call<ApiMessagePage>(
				`/groups/${groupId}/messages?beforeId=${encodeURIComponent(beforeId)}&limit=${limit}&cards=1`,
			),
		deleteMessage: (messageId: string) =>
			call<void>(`/messages/${messageId}`, {
				method: "DELETE",
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		/** The viewer's own text message, its words changed for everyone. */
		editMessage: (messageId: string, text: string) =>
			call<{ message: ApiMessage }>(`/messages/${messageId}`, {
				method: "PATCH",
				body: { text },
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		/** The viewer has read the chat up to this message; null when they already had (reads only move forward). */
		markRead: (groupId: string, messageId: string) =>
			call<{ read: ApiChatRead | null }>(`/groups/${groupId}/read`, {
				method: "PUT",
				body: { messageId },
			}),
		/** Tells the chat's others this person is typing in it, or stopped; nothing is stored. */
		reportTyping: (groupId: string, typing: boolean) =>
			call<void>(`/groups/${groupId}/typing`, {
				method: "POST",
				body: { typing },
			}),
		answerQuestion: (
			questionId: string,
			body:
				| { answer: string; typed: boolean }
				| { answers: QuestionPartAnswer[] },
		) =>
			call<{ question: ApiQuestion }>(`/questions/${questionId}/answer`, {
				method: "POST",
				body,
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		messageDetails: (messageId: string) =>
			call<ApiMessageDetails>(`/messages/${messageId}/details`),
		/** A short-lived link to a shared file's bytes, which an image view, Quick Look or a browser opens without the session; reused while fresh. */
		fileLink: cachedFileLinks((fileId) =>
			call<FileLink>(`/files/${fileId}/link`),
		),
		/** One of your Devs' public page: whether it's on, and its address. */
		publicLink: (devId: string) =>
			call<ApiPublicLink>(`/devs/${devId}/public-link`),
		/** Switches the page on or off (the first time it's on, the Dev asks you in your 1:1 what visitors should know). */
		updatePublicLink: (devId: string, body: { enabled: boolean }) =>
			call<ApiPublicLink>(`/devs/${devId}/public-link`, {
				method: "PATCH",
				body,
			}),
		/** A new address for the page; the old one stops working at once. */
		rotatePublicLink: (devId: string) =>
			call<ApiPublicLink>(`/devs/${devId}/public-link/rotate`, {
				method: "POST",
			}),
		/**
		 * One of your Devs' browser, started on the first ask: the address of its live view, which shows it and lets you
		 * steer it, and its DevTools websocket, which the app's tabs and address bar drive. `size` is the window it's shown
		 * in, which the page is laid out for.
		 */
		openBrowser: (devId: string, size?: { width: number; height: number }) =>
			call<{ liveViewUrl: string; cdpWsUrl: string }>(
				`/devs/${devId}/browser`,
				{ method: "POST", body: size ?? {} },
			),
		/** The browser's window follows the one it's shown in. */
		resizeBrowser: (devId: string, size: { width: number; height: number }) =>
			call<void>(`/devs/${devId}/browser/size`, {
				method: "PUT",
				body: size,
			}),
		/** Ends the browser (it keeps its logins for the next one). */
		closeBrowser: (devId: string) =>
			call<void>(`/devs/${devId}/browser`, { method: "DELETE" }),
		/**
		 * What a Dev keeps in its folder (`/agent`), for anyone in a chat it's in: the entries of `path` ("" is the
		 * root), read from its storage; asking wakes a sleeping box's storage for the moment.
		 */
		devFolder: (devId: string, path: string) =>
			call<{ path: string; entries: FolderEntry[] }>(
				`/devs/${devId}/files?path=${encodeURIComponent(path)}`,
			),
		/** One file of that folder, whole (up to 5 MB). */
		devFile: (devId: string, path: string) =>
			requestBytes(
				baseUrl,
				`/devs/${devId}/files/content?path=${encodeURIComponent(path)}`,
				token,
			),
		/** The Dev's Wallet pass while its page is on: a short-lived link, which Safari adds to Apple Wallet. */
		devPass: (devId: string) => call<DevPassLink>(`/devs/${devId}/pass`),
		/** Opens an upload of a file to share in the chat; the API refuses a type or size it won't take before any byte goes. */
		beginFileUpload: (groupId: string, body: { name: string; size: number }) =>
			call<FileUpload>(`/groups/${groupId}/files/uploads`, {
				method: "POST",
				body,
			}),
		putFilePart: (
			groupId: string,
			uploadId: string,
			index: number,
			bytes: Uint8Array,
		) =>
			call<void>(
				`/groups/${groupId}/files/uploads/${uploadId}/parts/${index}`,
				{ method: "POST", body: bytes },
			),
		/** A single-use pass to stream a voice note being recorded to ElevenLabs, for its words live (see `live-transcript`). */
		/** A voice call's record, at hang-up: its length (the server stamps its start); what was said on it folds into it in the thread. */
		recordCall: (
			groupId: string,
			body: { durationMs: number; clientId: string },
		) => call<SendResult>(`/groups/${groupId}/calls`, { method: "POST", body }),
		/** A Dev's message read aloud for a voice call: PCM to play, never stored. */
		voiceSpeak: (messageId: string) =>
			call<CallSpeech>("/voice/speak", { method: "POST", body: { messageId } }),
		/** A short sample of a voice (null: the default) saying the Dev's name, or `name` for one not made yet. */
		voicePreview: (body: {
			voice: string | null;
			devId?: string;
			name?: string;
		}) => call<CallSpeech>("/voice/preview", { method: "POST", body }),
		/** Posts the uploaded file's card with its caption, which wakes Devs as a message would; a retry with the same `clientId` gets it back. */
		finishFileUpload: (
			groupId: string,
			body: {
				uploadId: string;
				name: string;
				size: number;
				sha256: string;
				message?: string;
				clientId?: string;
				voice?: { durationMs: number; waveform: number[]; text?: string };
			},
		) =>
			call<SharedFileResult>(`/groups/${groupId}/files`, {
				method: "POST",
				body,
			}),
		createTask: (groupId: string, body: TaskForm & { clientId: string }) =>
			call<SentMessage>(`/groups/${groupId}/tasks`, {
				method: "POST",
				body,
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		updateTask: (taskId: string, patch: TaskPatch) =>
			call<ApiTask>(`/tasks/${taskId}`, {
				method: "PATCH",
				body: patch,
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		/** `series`: stop the repeat too, rather than skip this occurrence. */
		deleteTask: (taskId: string, opts: { series?: boolean } = {}) =>
			call<void>(`/tasks/${taskId}${opts.series ? "?series=1" : ""}`, {
				method: "DELETE",
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		startTask: (taskId: string) =>
			call<ApiTask>(`/tasks/${taskId}/start`, { method: "POST" }),
		commentOnTask: (taskId: string, text: string) =>
			call<{ activity: ApiTaskActivity }>(`/tasks/${taskId}/comments`, {
				method: "POST",
				body: { text },
			}),
		taskActivity: (taskId: string) =>
			call<{ activity: ApiTaskActivity[] }>(`/tasks/${taskId}/activity`, {
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		createApp: (
			groupId: string,
			body: { id: string; name: string; description: string; color: number },
		) =>
			call<CreatedApp>(`/groups/${groupId}/apps`, {
				method: "POST",
				body,
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		deleteApp: (appId: string) =>
			call<void>(`/apps/${appId}`, {
				method: "DELETE",
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		appVersions: (appId: string) =>
			call<{ versions: ApiAppVersion[] }>(`/apps/${appId}/versions`),
		restoreAppVersion: (appId: string, number: number) =>
			call<{ app: ApiApp }>(`/apps/${appId}/versions/${number}/restore`, {
				method: "POST",
			}),
		shareApp: (appId: string) =>
			call<SentMessage>(`/apps/${appId}/share`, { method: "POST" }),
		setAppSaved: (appId: string, saved: boolean) =>
			call<{ app: ApiApp }>(`/apps/${appId}/save`, {
				method: saved ? "POST" : "DELETE",
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		appStorage: (appId: string, body: StorageCall) =>
			call<StorageResult>(`/apps/${appId}/storage`, { method: "POST", body }),
		appComplete: (appId: string, prompt: string) =>
			call<{ text: string }>(`/apps/${appId}/complete`, {
				method: "POST",
				body: { prompt },
			}),
		appAsk: (appId: string, dev: string, question: string) =>
			call<{ answer: string }>(`/apps/${appId}/ask`, {
				method: "POST",
				body: { dev, question },
			}),
		appAgentAsk: (appId: string, question: string) =>
			call<{ answer: string }>(`/apps/${appId}/agent/ask`, {
				method: "POST",
				body: { question },
			}),
		createPersonalDev: (body: {
			name: string;
			color: string;
			look?: string | null;
			voice?: string | null;
		}) => call<CreatedChat>("/devs/personal", { method: "POST", body }),
		createAgent: (body: {
			name: string;
			color: string;
			description: string;
			look?: string | null;
			voice?: string | null;
		}) => call<CreatedChat>("/devs", { method: "POST", body }),
		updateDev: (devId: string, patch: DevPatch) =>
			call<ApiDev>(`/devs/${devId}`, {
				method: "PATCH",
				body: patch,
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		deleteDev: (devId: string) =>
			call<void>(`/devs/${devId}`, { method: "DELETE" }),
		createGroup: (body: { title: string; devName: string; devColor: string }) =>
			call<CreatedChat>("/groups", { method: "POST", body }),
		createTaskView: (name: string, spec: TaskViewSpec) =>
			call<{ id: string; views: ApiTaskView[] }>("/task-views", {
				method: "POST",
				body: { name, spec },
			}),
		updateTaskView: (
			id: string,
			patch: { name?: string; spec?: TaskViewSpec },
		) =>
			call<{ views: ApiTaskView[] }>(`/task-views/${id}`, {
				method: "PATCH",
				body: patch,
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		deleteTaskView: (id: string) =>
			call<{ views: ApiTaskView[] }>(`/task-views/${id}`, {
				method: "DELETE",
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		/** Your invitations to Dev (three to give), and inviting someone, which answers with the same. */
		invitations: () => call<ApiInvitations>("/invitations"),
		invite: (email: string) =>
			call<ApiInvitations>("/invitations", { method: "POST", body: { email } }),
		renameGroup: (groupId: string, title: string) =>
			call<{ id: string; title: string }>(`/groups/${groupId}`, {
				method: "PATCH",
				body: { title },
				timeoutMs: CHANGE_TIMEOUT_MS,
			}),
		deleteGroup: (groupId: string) =>
			call<void>(`/groups/${groupId}`, { method: "DELETE" }),
		addGroupDev: (groupId: string, devId: string) =>
			call<AddedGroupDev>(`/groups/${groupId}/devs/${devId}`, {
				method: "POST",
			}),
		removeGroupDev: (groupId: string, devId: string) =>
			call<void>(`/groups/${groupId}/devs/${devId}`, {
				method: "DELETE",
			}),
		/** The Dev registry: every listing, one listing's page, and getting one. */
		registry: () => call<{ listings: RegistryCard[] }>("/registry"),
		registryListing: (slug: string) =>
			call<{ listing: RegistryListing }>(
				`/registry/${encodeURIComponent(slug)}`,
			),
		installListing: (
			slug: string,
			target: InstallTarget,
			timezone: string,
			name?: string,
			paradevAccess?: boolean,
		) =>
			call<InstalledListing>(`/registry/${encodeURIComponent(slug)}/install`, {
				method: "POST",
				body: {
					target,
					timezone,
					...(name ? { name } : {}),
					...(paradevAccess ? { paradevAccess } : {}),
				},
			}),
		createInvite: (groupId: string) =>
			call<{ id: string; inviteUrl: string; expiresAt: string }>(
				`/groups/${groupId}/invites`,
				{ method: "POST" },
			),
		watchToken: (devId: string, groupId: string) =>
			call<WatchTicket>(`/devs/${devId}/watch-token`, {
				method: "POST",
				body: { groupId },
			}),
		previewInvite: (token: string) =>
			call<{ invite: ApiInvitePreview }>(
				`/invites/${encodeURIComponent(token)}/preview`,
			),
		acceptInvite: (token: string) =>
			call<{ group: ApiGroup }>("/invites/accept", {
				method: "POST",
				body: { token },
			}),
		/** The person's MCP servers. */
		integrations: () => call<ApiIntegrations>("/integrations"),
		createMcpServer: (server: McpServerDraft) =>
			call<{ server: McpServer }>("/integrations/mcp-servers", {
				method: "POST",
				body: server,
			}),
		updateMcpServer: (serverId: string, patch: Partial<McpServerDraft>) =>
			call<{ server: McpServer }>(`/integrations/mcp-servers/${serverId}`, {
				method: "PATCH",
				body: patch,
			}),
		deleteMcpServer: (serverId: string) =>
			call<void>(`/integrations/mcp-servers/${serverId}`, { method: "DELETE" }),
		devIntegrations: (devId: string) =>
			call<ApiDevIntegrations>(`/devs/${devId}/integrations`),
		/** Replaces what the Dev uses (its owner's personal or custom Dev; a group's Dev is a 400). */
		setDevIntegrations: (devId: string, integrations: ApiDevIntegrations) =>
			call<ApiDevIntegrations>(`/devs/${devId}/integrations`, {
				method: "PUT",
				body: integrations,
			}),
		appIntegrations: (appId: string) =>
			call<ApiAppIntegrations>(`/apps/${appId}/integrations`),
		appIntegrationTools: (appId: string, plugin: string) =>
			call<{ tools: ApiAppTool[] }>(
				`/apps/${appId}/integrations/${encodeURIComponent(plugin)}/tools`,
			),
		setAppIntegrationApprovals: (
			appId: string,
			plugin: string,
			tools: Record<string, boolean>,
		) =>
			call<{ plugin: ApiAppIntegration | null }>(
				`/apps/${appId}/integrations/${encodeURIComponent(plugin)}/approvals`,
				{ method: "POST", body: { tools } },
			),
		/** `account` (an account's id or label) picks one of the viewer's accounts; the API requires it when they have several. */
		appIntegrationCall: (
			appId: string,
			plugin: string,
			tool: string,
			args: Record<string, unknown>,
			account?: string,
		) =>
			call<{ result: unknown }>(
				`/apps/${appId}/integrations/${encodeURIComponent(plugin)}/call`,
				{ method: "POST", body: { tool, arguments: args, account } },
			),
		/** Composio's toolkits (Linear, Gmail) with the person's accounts; `configured` is false while the API has no Composio key. */
		composioToolkits: () =>
			call<{ configured: boolean; toolkits: ApiToolkit[] }>(
				"/composio/toolkits",
			),
		/** Where to send the person to connect an account; Composio brings them back to the API's callback. */
		composioConnect: (toolkit: string) =>
			call<{ url: string }>("/composio/connect", {
				method: "POST",
				body: { toolkit },
			}),
		/** The account's choices for a trigger type's id fields, by field name; a field left out takes free text. */
		composioAccountOptions: (accountId: string, triggerType: string) =>
			call<{ fields: Record<string, ApiTriggerOption[]> }>(
				`/composio/accounts/${accountId}/options?triggerType=${encodeURIComponent(triggerType)}`,
			),
		/** Adds an account to one of Dev's own apps by its key; the app checks it first (a refused one is a 400 `invalid_key`). */
		addAppKey: (toolkit: string, key: string) =>
			call<{ account: ApiComposioAccount }>(
				`/integrations/apps/${encodeURIComponent(toolkit)}/accounts`,
				{ method: "POST", body: { key } },
			),
		/** Disconnects the account; its triggers go with it. */
		deleteComposioAccount: (accountId: string) =>
			call<void>(`/composio/accounts/${accountId}`, { method: "DELETE" }),
		groupTriggers: (groupId: string) =>
			call<{ triggers: ApiTrigger[] }>(`/groups/${groupId}/triggers`),
		createTrigger: (groupId: string, body: TriggerForm) =>
			call<{ trigger: ApiTrigger }>(`/groups/${groupId}/triggers`, {
				method: "POST",
				body,
			}),
		updateTrigger: (triggerId: string, patch: TriggerPatch) =>
			call<{ trigger: ApiTrigger }>(`/triggers/${triggerId}`, {
				method: "PATCH",
				body: patch,
			}),
		deleteTrigger: (triggerId: string) =>
			call<void>(`/triggers/${triggerId}`, { method: "DELETE" }),
		/** The events one batch took; titles only for the trigger's person. */
		triggerEvents: (groupId: string, batchId: string) =>
			call<{ events: ApiTriggerEvent[] }>(
				`/groups/${groupId}/trigger-events?batch=${encodeURIComponent(batchId)}`,
			),
		/** Push notifications for this device: saving an Expo push token again just updates it. */
		registerPushToken: (token: string, deviceName?: string) =>
			call<void>("/push-tokens", {
				method: "POST",
				body: { token, deviceName },
			}),
		unregisterPushToken: (token: string) =>
			call<void>(`/push-tokens/${encodeURIComponent(token)}`, {
				method: "DELETE",
			}),
		/** Whether this app is in use and which chat it shows (`createPresenceReporter` sends it). */
		reportPresence: (body: Presence & { device: "desktop" | "mobile" }) =>
			call<void>("/presence", { method: "PUT", body }),
	};
}

export type SyncApi = ReturnType<typeof createSyncApi>;
