import type {
	ApiDev,
	ApiMessage,
	ApiQuestion,
	ApiTask,
	ApiTriggerBatch,
	Bootstrap,
} from "../api-types/api-types.ts";

/** Server-shaped data shared by the sync tests: me (u1) with my 1:1 with my Dev, and a group with Priya (u2). */
const ME = {
	id: "u1",
	email: "harshith@example.com",
	name: null,
	displayName: "harshith",
};
export const PRIYA = {
	id: "u2",
	email: "priya@example.com",
	name: "Priya",
	displayName: "Priya",
};

export function apiMessage(overrides: Partial<ApiMessage> = {}): ApiMessage {
	return {
		id: "m1",
		groupId: "g-me",
		authorId: ME.id,
		authorDevId: null,
		text: "hello",
		taskId: null,
		clientId: null,
		at: "2026-10-10T09:00:00.000Z",
		...overrides,
	};
}

/** My Dev's open question in my 1:1, for me. */
export function apiQuestion(overrides: Partial<ApiQuestion> = {}): ApiQuestion {
	return {
		id: "q1",
		devId: "m-me",
		taskId: null,
		kind: "select",
		title: "Which cuisine?",
		body: "",
		options: [{ label: "Italian" }, { label: "Thai" }],
		allowOther: true,
		placeholder: "",
		forUserId: ME.id,
		status: "open",
		answer: null,
		typed: false,
		answeredBy: null,
		answeredAt: null,
		expiresAt: "2026-10-10T09:20:00.000Z",
		...overrides,
	};
}

export function apiTask(overrides: Partial<ApiTask> = {}): ApiTask {
	return {
		id: "t1",
		groupId: "g-me",
		title: "Pay rent",
		description: "",
		status: "todo",
		assigneeId: ME.id,
		assigneeDevId: null,
		due: "2026-10-10",
		scheduledAt: null,
		remind: false,
		labels: [],
		repeat: null,
		createdBy: ME.id,
		createdByDevId: null,
		createdAt: "2026-10-10T09:00:00.000Z",
		startedAt: null,
		completedAt: null,
		...overrides,
	};
}

/** A trigger turn in my 1:1 that took two Linear events and hasn't settled. */
export function apiTriggerBatch(
	overrides: Partial<ApiTriggerBatch> = {},
): ApiTriggerBatch {
	return {
		id: "b1",
		groupId: "g-me",
		triggerId: "tr1",
		toolkit: "linear",
		count: 2,
		at: "2026-10-10T09:02:00.000Z",
		outcome: null,
		...overrides,
	};
}

export function apiDev(overrides: Partial<ApiDev> = {}): ApiDev {
	return {
		id: "m-me",
		kind: "personal",
		name: "Juniper",
		color: "#F2B23E",
		ownerUserId: ME.id,
		groupId: null,
		status: "stopped",
		createdAt: "2026-10-10T08:00:00.000Z",
		description: "Your personal Dev",
		look: null,
		...overrides,
	};
}

export function bootstrap(overrides: Partial<Bootstrap> = {}): Bootstrap {
	return {
		user: ME,
		needsOnboarding: false,
		devs: [
			apiDev({ descriptionText: "" }),
			apiDev({
				id: "m-trip",
				kind: "group",
				name: "Trip",
				color: "#2F6F6A",
				ownerUserId: null,
				groupId: "g-trip",
				description: "The Dev of Trip",
				descriptionText: "The Dev of Trip",
			}),
		],
		groups: [
			{
				id: "g-trip",
				kind: "group",
				title: "Trip",
				members: [
					{ ...ME, role: "owner" },
					{ ...PRIYA, role: "member" },
				],
			},
			{
				id: "g-me",
				kind: "direct",
				title: "Juniper",
				members: [{ ...ME, role: "owner" }],
			},
		],
		groupDevs: [
			{ groupId: "g-me", devId: "m-me", addedBy: ME.id },
			{ groupId: "g-trip", devId: "m-trip", addedBy: ME.id },
		],
		messages: [
			apiMessage({ id: "m2", at: "2026-10-10T09:05:00.000Z" }),
			apiMessage({ id: "m1", taskId: "t1", text: "/task Pay rent" }),
		],
		groupsWithOlderMessages: [],
		tasks: [apiTask()],
		apps: [],
		...overrides,
	};
}
