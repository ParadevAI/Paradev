import { describe, expect, test } from "bun:test";
import type { ChatState } from "@superset/chats-core";
import type {
	Bootstrap,
	CreatedChat,
	SyncSignal,
} from "../api-types/api-types.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { ApiError } from "../http/http.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";
import { apiDev, bootstrap } from "../test-fixtures/test-fixtures.ts";
import { createWorkspaceActions } from "./workspace-actions.ts";

/** Actions over an in-memory state, with the given API calls; anything not stubbed fails like a 500. */
function setup(api: Partial<SyncApi>, start: Partial<Bootstrap> = {}) {
	let state: ChatState = fromBootstrap(bootstrap(start));
	const failures: string[] = [];
	const signals: SyncSignal[] = [];
	let groupsChanged = 0;
	const reject = () => Promise.reject(new ApiError(500, "internal", "boom"));
	const actions = createWorkspaceActions({
		api: new Proxy(api, {
			get: (target, key) => target[key as keyof SyncApi] ?? reject,
		}) as SyncApi,
		getState: () => state,
		update: (change) => (state = change(state)),
		fail: (title) => failures.push(title),
		groupsChanged: () => groupsChanged++,
		signal: (s) => signals.push(s),
		retryDelaysMs: [0, 0],
	});
	return {
		actions,
		failures,
		signals,
		state: () => state,
		groupsChanged: () => groupsChanged,
	};
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("workspace actions", () => {
	test("a rename and a delete repeat quietly when the connection drops", async () => {
		let renames = 0;
		let deletes = 0;
		const { actions, failures } = setup({
			renameGroup: async (id, title) => {
				if (++renames < 3) throw new TypeError("timed out");
				return { id, title };
			},
			deleteGroup: async () => {
				// The first one reached the server, whose answer was lost.
				if (++deletes === 1) throw new TypeError("timed out");
				throw new ApiError(404, "not_found", "gone");
			},
		});
		actions.renameGroup("g-me", "Renamed");
		expect(await actions.deleteGroup("g-me")).toBe(true);
		await settle();
		expect(renames).toBe(3);
		expect(deletes).toBe(2);
		expect(failures).toEqual([]);
	});

	test("a new agent whose first turn is starting shows getting ready in its chat at once", async () => {
		const created = (firstTurnId: string | null): CreatedChat => ({
			group: {
				id: "g-new",
				kind: "direct",
				title: "Sol",
				members: [
					{
						id: "u1",
						email: "me@example.com",
						name: "Me",
						displayName: "Me",
						role: "owner",
					},
				],
			},
			dev: apiDev({ id: "m-sol", kind: "custom", name: "Sol" }),
			groupDev: { groupId: "g-new", devId: "m-sol", addedBy: "u1" },
			firstTurnId,
		});
		const { actions, signals, groupsChanged } = setup({
			createAgent: async () => created("turn-1"),
		});
		expect(
			await actions.createAgent({
				name: "Sol",
				color: "#2F6F6A",
				description: "Plans trips",
			}),
		).toBe("g-new");
		expect(signals).toMatchObject([
			{ type: "first-turn", devId: "m-sol", groupId: "g-new" },
		]);
		expect(groupsChanged()).toBe(1);
		// A server that starts no first turn (or an older one) says nothing.
		const quiet = setup({ createAgent: async () => created(null) });
		await quiet.actions.createAgent({
			name: "Sol",
			color: "#2F6F6A",
			description: "Plans trips",
		});
		expect(quiet.signals).toEqual([]);
	});

	test("getting a Dev from the registry for me opens its new 1:1, by the name given; for a group, it joins the group's Devs", async () => {
		const forMe: CreatedChat = {
			group: {
				id: "g-money",
				kind: "direct",
				title: "Money",
				members: [
					{
						id: "u1",
						email: "me@example.com",
						name: "Me",
						displayName: "Me",
						role: "owner",
					},
				],
			},
			dev: apiDev({
				id: "m-money",
				kind: "custom",
				name: "Money",
				listing: { slug: "money", version: "1.0.0" },
			}),
			groupDev: { groupId: "g-money", devId: "m-money", addedBy: "u1" },
			firstTurnId: "turn-1",
		};
		const added = {
			groupDev: { groupId: "g-trip", devId: "m-planner", addedBy: "u1" },
			dev: apiDev({
				id: "m-planner",
				kind: "added",
				name: "Trip Planner",
				ownerUserId: null,
				groupId: "g-trip",
			}),
			firstTurnId: "turn-2",
		};
		const calls: unknown[][] = [];
		const { actions, signals, state } = setup({
			installListing: async (...args) => (
				calls.push(args), args[1].kind === "you" ? forMe : added
			),
		});
		expect(
			await actions.installListing(
				"money",
				{ kind: "you" },
				{ name: " Penny ", timezone: "Asia/Kolkata" },
			),
		).toBe("g-money");
		expect(state().devs["m-money"]?.listing).toEqual({
			slug: "money",
			version: "1.0.0",
		});
		expect(
			await actions.installListing(
				"trip-planner",
				{ kind: "group", groupId: "g-trip" },
				{ name: "  ", timezone: "Asia/Kolkata" },
			),
		).toBe("g-trip");
		expect(state().chats.find((c) => c.id === "g-trip")?.devIds).toContain(
			"m-planner",
		);
		expect(calls).toEqual([
			// A name is sent trimmed; a blank one is left out, so the listing's name stands.
			["money", { kind: "you" }, "Asia/Kolkata", "Penny"],
			[
				"trip-planner",
				{ kind: "group", groupId: "g-trip" },
				"Asia/Kolkata",
				undefined,
			],
		]);
		expect(signals).toMatchObject([
			{ type: "first-turn", devId: "m-money", groupId: "g-money" },
			{ type: "first-turn", devId: "m-planner", groupId: "g-trip" },
		]);

		const failing = setup({});
		expect(
			await failing.actions.installListing("money", { kind: "you" }),
		).toBeNull();
		expect(failing.failures).toEqual(["Couldn't get that Dev"]);
	});

	test("removing an added Dev waits for the server, then it's gone", async () => {
		const { actions, state, failures } = setup(
			{ removeGroupDev: async () => undefined },
			{
				devs: [
					apiDev({
						id: "m-planner",
						kind: "added",
						ownerUserId: null,
						groupId: "g-trip",
					}),
				],
			},
		);
		expect(await actions.removeAddedDev("g-trip", "m-planner")).toBe(true);
		expect(state().devs["m-planner"]).toBeUndefined();
		expect(failures).toEqual([]);
	});

	test("a failed rename shows at once, then rolls back with a toast", async () => {
		const { actions, failures, state } = setup({});
		actions.renameGroup("g-trip", "Goa trip");
		expect(state().chats.find((c) => c.id === "g-trip")?.title).toBe(
			"Goa trip",
		);
		await settle();
		expect(state().chats.find((c) => c.id === "g-trip")?.title).toBe("Trip");
		expect(failures).toEqual(["Couldn't rename the group"]);
	});

	test("letting my Dev into a group is optimistic and rolls back on failure", async () => {
		const { actions, failures, state } = setup({});
		actions.setDevInGroup("g-trip", "m-me", true);
		expect(state().chats.find((c) => c.id === "g-trip")?.devIds).toContain(
			"m-me",
		);
		await settle();
		expect(state().chats.find((c) => c.id === "g-trip")?.devIds).not.toContain(
			"m-me",
		);
		expect(failures).toEqual(["Couldn't add your Dev"]);
	});

	test("a saved Dev takes the server's copy, incl. MCP servers (names only)", async () => {
		const saved = apiDev({ name: "Juno", descriptionText: "Be brief" });
		const { actions, state } = setup({ updateDev: async () => saved });
		expect(await actions.updateDev("m-me", { name: "Juno" })).toBe(true);
		expect(state().devs["m-me"]).toMatchObject({
			name: "Juno",
			descriptionText: "Be brief",
		});
	});

	test("an edited description shows as typed at once; the server's wording replaces it, or a failure restores it", async () => {
		let answer: (m: ReturnType<typeof apiDev>) => void = () => {};
		const ok = setup({
			updateDev: () => new Promise((resolve) => (answer = resolve)),
		});
		const saving = ok.actions.updateDev("m-me", {
			description: "Knows my week",
		});
		expect(ok.state().devs["m-me"]).toMatchObject({
			description: "Your personal Dev",
			descriptionText: "Knows my week",
		});
		answer(
			apiDev({
				description: "Your personal Dev · Knows my week",
				descriptionText: "Knows my week",
			}),
		);
		expect(await saving).toBe(true);
		expect(ok.state().devs["m-me"]?.description).toBe(
			"Your personal Dev · Knows my week",
		);

		const failed = setup({});
		expect(
			await failed.actions.updateDev("m-me", {
				description: "Knows my week",
			}),
		).toBe(false);
		expect(failed.state().devs["m-me"]?.descriptionText).toBe("");
	});

	test("a failed Dev edit restores only the fields it changed", async () => {
		const { actions, failures, state } = setup({});
		expect(await actions.updateDev("m-me", { name: "Juno" })).toBe(false);
		expect(state().devs["m-me"]).toMatchObject({
			name: "Juniper",
			color: "#F2B23E",
		});
		expect(failures).toEqual(["Couldn't save the Dev"]);
	});

	test("creating a group adds its chat and Dev and resolves to its id; a failure resolves to null", async () => {
		const group = {
			id: "g-goa",
			kind: "group" as const,
			title: "Goa trip",
			members: [],
		};
		const dev = apiDev({
			id: "m-goa",
			kind: "group",
			name: "Goa trip",
			ownerUserId: null,
			groupId: "g-goa",
		});
		const ok = setup({
			createGroup: async () => ({
				group,
				dev,
				groupDev: { groupId: "g-goa", devId: "m-goa", addedBy: "u1" },
			}),
		});
		expect(
			await ok.actions.createGroup({
				title: "Goa trip",
				devName: "Goa trip",
				devColor: "#F2B23E",
			}),
		).toBe("g-goa");
		expect(ok.state().chats.at(-1)?.devIds).toEqual(["m-goa"]);
		expect(ok.state().devs["m-goa"]?.name).toBe("Goa trip");

		const failed = setup({});
		expect(
			await failed.actions.createGroup({
				title: "x",
				devName: "x",
				devColor: "#F2B23E",
			}),
		).toBeNull();
		expect(failed.failures).toEqual(["Couldn't create the group"]);
	});

	test("deleting a group drops it once the server agrees; a refusal keeps it and toasts; already gone counts as done", async () => {
		const refused = setup({
			deleteGroup: () =>
				Promise.reject(
					new ApiError(
						403,
						"forbidden",
						"Only the group's owner can delete it",
					),
				),
		});
		expect(await refused.actions.deleteGroup("g-trip")).toBe(false);
		expect(refused.state().chats.map((c) => c.id)).toContain("g-trip");
		expect(refused.failures).toEqual(["Couldn't delete the group"]);

		const ok = setup({ deleteGroup: async () => {} });
		expect(await ok.actions.deleteGroup("g-trip")).toBe(true);
		expect(ok.state().chats.map((c) => c.id)).not.toContain("g-trip");

		const gone = setup({
			deleteGroup: () =>
				Promise.reject(new ApiError(404, "not_found", "Group not found")),
		});
		expect(await gone.actions.deleteGroup("g-trip")).toBe(true);
		expect(gone.state().chats.map((c) => c.id)).not.toContain("g-trip");
	});

	test("deleting an agent someone already deleted still removes it here", async () => {
		const { actions, failures, state } = setup({
			deleteDev: () => Promise.reject(new ApiError(404, "not_found", "gone")),
		});
		expect(await actions.deleteAgent("m-me")).toBe(true);
		expect(state().devs["m-me"]).toBeUndefined();
		expect(failures).toEqual([]);
	});

	test("restoring a version swaps in the restored app; a failure toasts", async () => {
		const live = (number: number) => ({
			id: "a1",
			groupId: "g-trip",
			name: "Budget",
			description: "",
			color: 1,
			status: "live" as const,
			version: {
				number,
				label: number === 3 ? "Restored version 1" : "",
				createdAt: "2026-10-11T10:00:00.000Z",
			},
			url: `http://a1.localhost:3002/_v/${number}/`,
			createdByDevId: null,
			saved: true,
			createdAt: "2026-10-11T09:00:00.000Z",
		});
		const { actions, state } = setup({
			restoreAppVersion: async () => ({ app: live(3) }),
		});
		expect(await actions.restoreAppVersion("a1", 1)).toBe(true);
		expect(state().apps).toEqual([
			expect.objectContaining({
				id: "a1",
				status: "live",
				version: expect.objectContaining({ number: 3 }),
				url: "http://a1.localhost:3002/_v/3/",
			}),
		]);
		const failing = setup({});
		expect(await failing.actions.restoreAppVersion("a1", 1)).toBe(false);
		expect(failing.failures).toEqual(["Couldn't restore that version"]);
	});

	test("sharing an app adds its card to the chat; a failure toasts", async () => {
		const card = {
			id: "m-card",
			groupId: "g-trip",
			authorId: "u-me",
			authorDevId: null,
			text: "Shared Budget",
			taskId: null,
			appId: "a1",
			appVersion: 2,
			clientId: null,
			at: "2026-10-11T10:00:00.000Z",
		};
		const { actions, state } = setup({
			shareApp: async () => ({ message: card, task: null }),
		});
		expect(await actions.shareApp("a1")).toBe(true);
		expect(state().messages.find((m) => m.id === "m-card")).toMatchObject({
			chatId: "g-trip",
			appId: "a1",
			appVersion: 2,
		});
		const failing = setup({});
		expect(await failing.actions.shareApp("a1")).toBe(false);
		expect(failing.failures).toEqual(["Couldn't share the sketch"]);
	});

	test("saving a sketch puts it on the lists at once; a failure takes it back off with a toast", async () => {
		const sketch = {
			id: "a1",
			groupId: "g-trip",
			name: "Split",
			description: "",
			color: 1,
			status: "live" as const,
			version: null,
			url: null,
			createdByDevId: null,
			saved: false,
			createdAt: "2026-10-11T09:00:00.000Z",
		};
		let answer: (saved: boolean) => void = () => {};
		const { actions, state } = setup(
			{
				setAppSaved: (_id, _saved) =>
					new Promise(
						(r) => (answer = (s) => r({ app: { ...sketch, saved: s } })),
					),
			},
			{ apps: [sketch] },
		);
		const saving = actions.setAppSaved("a1", true);
		expect(state().apps[0]?.saved).toBe(true);
		answer(true);
		await saving;
		expect(state().apps[0]?.saved).toBe(true);

		const failing = setup({}, { apps: [sketch] });
		await failing.actions.setAppSaved("a1", true);
		expect(failing.state().apps[0]?.saved).toBe(false);
		expect(failing.failures).toEqual(["Couldn't save the sketch"]);
	});

	test("an invite's preview comes back for its card; a dead link or a lost connection says why, without a toast", async () => {
		const invite = {
			groupId: "g-new",
			title: "Goa trip",
			invitedBy: "Nina",
			people: [],
			peopleCount: 2,
			dev: null,
			joined: false,
			expiresAt: "2026-10-20T00:00:00Z",
		};
		expect(
			await setup({
				previewInvite: async () => ({ invite }),
			}).actions.previewInvite("tok"),
		).toEqual({ invite });

		const expired = setup({
			previewInvite: () =>
				Promise.reject(
					new ApiError(
						410,
						"expired",
						"This invite link has expired. Ask for a new one.",
					),
				),
		});
		expect(await expired.actions.previewInvite("tok")).toEqual({
			problem: "This invite link has expired. Ask for a new one.",
		});
		expect(expired.failures).toEqual([]);

		const offline = setup({
			previewInvite: () =>
				Promise.reject(new TypeError("Network request failed")),
		});
		expect(await offline.actions.previewInvite("tok")).toEqual({
			problem: "Couldn't load the invite. Check your connection and try again.",
		});

		const signedOut = setup({
			previewInvite: () =>
				Promise.reject(new ApiError(401, "unauthorized", "Sign in")),
		});
		await signedOut.actions.previewInvite("tok");
		expect(signedOut.failures).toEqual(["Couldn't open the invite"]);
	});

	test("invitations: the list, inviting someone, and the server's reason when it can't", async () => {
		const mine = {
			left: 2,
			invitations: [
				{
					email: "nina@example.com",
					createdAt: "2026-10-30T10:00:00Z",
					joined: false,
				},
			],
		};
		const ok = setup({
			invitations: async () => mine,
			invite: async () => mine,
		});
		expect(await ok.actions.invitations()).toEqual(mine);
		expect(await ok.actions.invite("nina@example.com")).toEqual(mine);

		const none = setup({
			invite: () =>
				Promise.reject(
					new ApiError(
						409,
						"no_invites_left",
						"You've used all 3 of your invites",
					),
				),
		});
		expect(await none.actions.invite("sam@example.com")).toEqual({
			problem: "You've used all 3 of your invites",
		});
		expect(none.failures).toEqual([]);

		const offline = setup({
			invitations: () =>
				Promise.reject(new TypeError("Network request failed")),
		});
		expect(await offline.actions.invitations()).toEqual({
			problem: "Couldn't reach Paradev. Check your connection and try again.",
		});
	});

	test("joining shows the group at once and asks for it whole (its Dev, messages, channel) without waiting on realtime", async () => {
		const group = {
			id: "g-new",
			kind: "group" as const,
			title: "Goa trip",
			members: [],
		};
		const joined = setup({ acceptInvite: async () => ({ group }) });
		expect(await joined.actions.acceptInvite("tok")).toBe("g-new");
		expect(joined.state().chats.some((c) => c.id === "g-new")).toBe(true);
		expect(joined.groupsChanged()).toBe(1);

		const failed = setup({});
		expect(await failed.actions.acceptInvite("tok")).toBeNull();
		expect(failed.groupsChanged()).toBe(0);
	});
});
