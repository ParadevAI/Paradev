import type { ChatState, Dev } from "@superset/chats-core";
import type {
	ApiInvitations,
	ApiInvitePreview,
	CreatedChat,
	InstallTarget,
	SyncSignal,
} from "../api-types/api-types.ts";
import {
	applyAddedGroupDev,
	applyGroup,
	applySentMessage,
	applyUpdatedApp,
	removeDev,
	removeGroup,
	upsertDev,
} from "../apply-event/apply-event.ts";
import { ApiError, isUnauthorized, retryOnNetworkError } from "../http/http.ts";
import {
	setAppSaved,
	setChatDev,
	setChatTitle,
	setDevFields,
} from "../optimistic/optimistic.ts";
import type { DevPatch, SyncApi } from "../sync-api/sync-api.ts";

interface Deps {
	api: SyncApi;
	getState: () => ChatState | null;
	update: (change: (s: ChatState) => ChatState) => void;
	/** Shows a toast (or signs out on 401). */
	fail: (title: string, err: unknown) => void;
	/** Waits before each quiet repeat of a change that got no answer (see `retryOnNetworkError`). */
	retryDelaysMs?: number[];
	/**
	 * The viewer joined or created a chat: re-bootstrap and take a token for its channel now (the sync session's
	 * `groupsChanged`), so its Dev, messages and new messages show without waiting on realtime's `groups.changed`.
	 */
	groupsChanged: () => void;
	/** Tells the live views (a new Dev's first turn, which they'd otherwise hear nothing of). */
	signal?: (signal: SyncSignal) => void;
}

/**
 * Groups and Devs. Edits apply optimistically and roll back with a toast, like messages and tasks. Creating things
 * waits for the server instead, since the new chat's id comes from it; those resolve to the new chat's id, or null after
 * a toast.
 */
export function createWorkspaceActions({
	api,
	getState,
	update,
	fail,
	groupsChanged,
	signal,
	retryDelaysMs,
}: Deps) {
	const quietly = <T>(op: () => Promise<T>) =>
		retryOnNetworkError(op, retryDelaysMs);
	/** A refused invitation says why (the server's words); a lost session is a failure like any other; anything else is the network. */
	function invitationProblem(err: unknown, failTitle: string) {
		if (isUnauthorized(err)) fail(failTitle, err);
		if (err instanceof ApiError && err.status < 500)
			return { problem: err.message };
		return {
			problem: "Couldn't reach Paradev. Check your connection and try again.",
		};
	}

	async function createChat(
		failTitle: string,
		create: () => Promise<CreatedChat>,
	) {
		try {
			const created = await create();
			update((s) => applyGroup(s, created.group, created));
			if (created.firstTurnId)
				signal?.({
					type: "first-turn",
					devId: created.dev.id,
					groupId: created.group.id,
					at: Date.now(),
				});
			groupsChanged();
			return created.group.id;
		} catch (err) {
			fail(failTitle, err);
			return null;
		}
	}

	return {
		createPersonalDev: (input: {
			name: string;
			color: string;
			look?: string | null;
			voice?: string | null;
		}) =>
			createChat("Couldn't create your Dev", () =>
				api.createPersonalDev(input),
			),

		createGroup: (input: {
			title: string;
			devName: string;
			devColor: string;
		}) => createChat("Couldn't create the group", () => api.createGroup(input)),

		createAgent: (input: {
			name: string;
			color: string;
			description: string;
			look?: string | null;
			voice?: string | null;
		}) => createChat("Couldn't create the agent", () => api.createAgent(input)),

		/** Resolves to whether it saved, so a dialog can stay open on failure. */
		async updateDev(devId: string, patch: DevPatch) {
			const before = getState()?.devs[devId];
			if (!before) return false;
			// The shown description is worded by the server; until it answers, only the edited text changes.
			const { description, ...rest } = patch;
			const fields = {
				...rest,
				...(description !== undefined ? { descriptionText: description } : {}),
			};
			const previous = Object.fromEntries(
				Object.keys(fields).map((k) => [k, before[k as keyof Dev]]),
			) as typeof fields;
			update((s) => setDevFields(s, devId, fields));
			try {
				const saved = await quietly(() => api.updateDev(devId, patch));
				update((s) => upsertDev(s, saved));
				return true;
			} catch (err) {
				update((s) => setDevFields(s, devId, previous));
				fail("Couldn't save the Dev", err);
				return false;
			}
		},

		async deleteAgent(devId: string) {
			try {
				await quietly(() => api.deleteDev(devId));
			} catch (err) {
				// Already gone (another device deleted it): the outcome the user wanted.
				if (!(err instanceof ApiError && err.status === 404)) {
					fail("Couldn't delete the agent", err);
					return false;
				}
			}
			update((s) => removeDev(s, devId));
			return true;
		},

		/** Waits for the server (it can't be undone, and only the owner may); resolves to whether the group is gone. */
		async deleteGroup(groupId: string) {
			try {
				await quietly(() => api.deleteGroup(groupId));
			} catch (err) {
				// Already gone (deleted from another device): the outcome the user wanted.
				if (!(err instanceof ApiError && err.status === 404)) {
					fail("Couldn't delete the group", err);
					return false;
				}
			}
			update((s) => removeGroup(s, groupId));
			return true;
		},

		renameGroup(groupId: string, title: string) {
			const before = getState()?.chats.find((c) => c.id === groupId)?.title;
			if (before === undefined || before === title) return;
			update((s) => setChatTitle(s, groupId, title));
			quietly(() => api.renameGroup(groupId, title)).catch((err: unknown) => {
				update((s) => setChatTitle(s, groupId, before));
				fail("Couldn't rename the group", err);
			});
		},

		/**
		 * Gets a Dev from the registry: a Dev of the user's own (resolves to its new 1:1's id) or one added to a group
		 * (resolves to the group's id), named `name` or else the listing's name. Waits for the server, which makes it; null
		 * after a toast.
		 */
		async installListing(
			slug: string,
			target: InstallTarget,
			opts: { name?: string; timezone?: string } = {},
		) {
			try {
				const name = opts.name?.trim() || undefined;
				const installed = await api.installListing(
					slug,
					target,
					opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
					name,
				);
				if ("group" in installed) {
					update((s) => applyGroup(s, installed.group, installed));
					if (installed.firstTurnId)
						signal?.({
							type: "first-turn",
							devId: installed.dev.id,
							groupId: installed.group.id,
							at: Date.now(),
						});
					groupsChanged();
					return installed.group.id;
				}
				update((s) => applyAddedGroupDev(s, installed));
				if (installed.firstTurnId)
					signal?.({
						type: "first-turn",
						devId: installed.dev.id,
						groupId: installed.groupDev.groupId,
						at: Date.now(),
					});
				return installed.groupDev.groupId;
			} catch (err) {
				fail("Couldn't get that Dev", err);
				return null;
			}
		},

		/** Takes a Dev added from the registry out of a group, for good (whoever added it, or the group's owner). */
		async removeAddedDev(groupId: string, devId: string) {
			try {
				await quietly(() => api.removeGroupDev(groupId, devId));
			} catch (err) {
				if (!(err instanceof ApiError && err.status === 404)) {
					fail("Couldn't remove the Dev", err);
					return false;
				}
			}
			update((s) => removeDev(s, devId));
			return true;
		},

		/** Lets one of the user's Devs into a group, or takes it out. */
		setDevInGroup(groupId: string, devId: string, inGroup: boolean) {
			update((s) => setChatDev(s, groupId, devId, inGroup));
			const request = inGroup
				? api
						.addGroupDev(groupId, devId)
						.then((added) => update((s) => applyAddedGroupDev(s, added)))
				: api.removeGroupDev(groupId, devId);
			request.catch((err: unknown) => {
				update((s) => setChatDev(s, groupId, devId, !inGroup));
				fail(
					inGroup ? "Couldn't add your Dev" : "Couldn't remove your Dev",
					err,
				);
			});
		},

		async createInvite(groupId: string) {
			try {
				return (await api.createInvite(groupId)).inviteUrl;
			} catch (err) {
				fail("Couldn't create an invite link", err);
				return null;
			}
		},

		/** Republishes an older version as the newest; the app's frame reloads with it. */
		async restoreAppVersion(appId: string, number: number) {
			try {
				const { app } = await api.restoreAppVersion(appId, number);
				update((s) => applyUpdatedApp(s, app));
				return true;
			} catch (err) {
				fail("Couldn't restore that version", err);
				return false;
			}
		},

		/** Posts the sketch's card into its chat again. */
		async shareApp(appId: string) {
			try {
				const sent = await api.shareApp(appId);
				update((s) => applySentMessage(s, sent));
				return true;
			} catch (err) {
				fail("Couldn't share the sketch", err);
				return false;
			}
		},

		/** Saves a sketch for its chat (onto everyone's lists), or takes it back off; at once, rolled back if it fails. */
		async setAppSaved(appId: string, saved: boolean) {
			const before = getState()?.apps.find((a) => a.id === appId);
			if (!before || before.saved === saved) return;
			update((s) => setAppSaved(s, appId, saved));
			try {
				const { app } = await quietly(() => api.setAppSaved(appId, saved));
				update((s) => applyUpdatedApp(s, app));
			} catch (err) {
				update((s) => setAppSaved(s, appId, before.saved));
				fail(
					saved ? "Couldn't save the sketch" : "Couldn't unsave the sketch",
					err,
				);
			}
		},

		/**
		 * The invite behind a link, for its card, or why it can't be shown (it expired, was revoked, isn't valid, or the
		 * API couldn't be reached), said in the card rather than a toast.
		 */
		async previewInvite(
			token: string,
		): Promise<{ invite: ApiInvitePreview } | { problem: string }> {
			try {
				return await api.previewInvite(token);
			} catch (err) {
				if (isUnauthorized(err)) fail("Couldn't open the invite", err);
				if (
					err instanceof ApiError &&
					(err.status === 404 || err.status === 410)
				)
					return { problem: err.message };
				return {
					problem:
						"Couldn't load the invite. Check your connection and try again.",
				};
			}
		},

		/** Your invitations to Dev (three to give), or why they couldn't be loaded, said where they're shown. */
		async invitations(): Promise<ApiInvitations | { problem: string }> {
			try {
				return await api.invitations();
			} catch (err) {
				return invitationProblem(err, "Couldn't load your invitations");
			}
		},

		/** Invites someone: your invitations after, or why not (none left, already on Dev, already invited, a bad address). */
		async invite(email: string): Promise<ApiInvitations | { problem: string }> {
			try {
				return await api.invite(email);
			} catch (err) {
				return invitationProblem(err, "Couldn't send the invitation");
			}
		},

		/** Resolves to the joined group's chat id. */
		async acceptInvite(token: string) {
			try {
				const { group } = await api.acceptInvite(token);
				update((s) => applyGroup(s, group));
				groupsChanged();
				return group.id;
			} catch (err) {
				fail("Couldn't join the group", err);
				return null;
			}
		},
	};
}

export type WorkspaceActions = ReturnType<typeof createWorkspaceActions>;
