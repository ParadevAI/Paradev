import { describe, expect, test } from "bun:test";
import {
	type CloudLaunchBox,
	type CloudLaunchRunRow,
	type CloudLaunchWorkspaceRow,
	decideCloudLaunchReport,
	type ReportCloudLaunchInput,
	runSessionColumns,
} from "./sessionRecord";

const chat = {
	kind: "chat" as const,
	sessionId: "11111111-1111-4111-8111-111111111111",
	terminalId: "term-chat",
	label: "Claude",
};

describe("runSessionColumns", () => {
	test("records a chat by its session id only when it is linked", () => {
		expect(runSessionColumns(chat, true)).toEqual({
			sessionKind: "chat",
			chatSessionId: chat.sessionId,
			terminalSessionId: "term-chat",
		});
		expect(runSessionColumns(chat, false)).toEqual({
			sessionKind: "terminal",
			chatSessionId: null,
			terminalSessionId: "term-chat",
		});
	});
});

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOX_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_BOX = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OTHER_USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

const box: CloudLaunchBox = {
	workspaceId: BOX_ID,
	organizationId: ORG,
	userId: USER,
};
const runAt = new Date("2026-05-01T00:00:00.000Z");
const createdAfterRun = new Date("2026-05-01T00:00:02.000Z");

function run(overrides: Partial<CloudLaunchRunRow> = {}): CloudLaunchRunRow {
	return {
		organizationId: ORG,
		hostId: "cloud",
		status: "dispatching",
		createdAt: runAt,
		cloudWorkspaceId: null,
		sessionKind: null,
		chatSessionId: null,
		terminalSessionId: null,
		...overrides,
	};
}

function workspace(
	overrides: Partial<CloudLaunchWorkspaceRow> = {},
): CloudLaunchWorkspaceRow {
	return {
		id: BOX_ID,
		organizationId: ORG,
		createdByUserId: USER,
		createdAt: createdAfterRun,
		...overrides,
	};
}

const chatReport: ReportCloudLaunchInput = {
	kind: "chat",
	sessionId: SESSION,
	terminalId: "term-1",
	automationRunId: RUN_ID,
};

describe("decideCloudLaunchReport", () => {
	test("rejects even a same-owner sandbox until the run is bound to its workspace", () => {
		expect(
			decideCloudLaunchReport({
				box,
				run: run(),
				automationOwnerUserId: USER,
				workspace: workspace(),
				input: chatReport,
			}),
		).toEqual({ record: false, recorded: false });
	});

	test("records a settled run only for the same cloud workspace", () => {
		expect(
			decideCloudLaunchReport({
				box,
				run: run({
					status: "dispatched",
					cloudWorkspaceId: BOX_ID,
				}),
				automationOwnerUserId: USER,
				workspace: workspace(),
				input: chatReport,
			}),
		).toEqual({ record: true, recorded: false });
	});

	test("refuses a null cloud workspace once dispatch has settled", () => {
		expect(
			decideCloudLaunchReport({
				box,
				run: run({ status: "dispatched" }),
				automationOwnerUserId: USER,
				workspace: workspace(),
				input: chatReport,
			}).record,
		).toBe(false);
	});

	test("refuses a workspace created before the run", () => {
		expect(
			decideCloudLaunchReport({
				box,
				run: run({ cloudWorkspaceId: BOX_ID }),
				automationOwnerUserId: USER,
				workspace: workspace({
					createdAt: new Date("2026-04-30T00:00:00.000Z"),
				}),
				input: chatReport,
			}).record,
		).toBe(false);
	});

	test("refuses a different workspace, org, owner, or host", () => {
		const accepted = {
			box,
			run: run({ cloudWorkspaceId: BOX_ID, status: "dispatched" }),
			automationOwnerUserId: USER,
			workspace: workspace(),
			input: chatReport,
		};
		expect(
			decideCloudLaunchReport({
				...accepted,
				box: { ...box, workspaceId: OTHER_BOX },
			}).record,
		).toBe(false);
		expect(
			decideCloudLaunchReport({
				...accepted,
				run: run({
					status: "dispatched",
					cloudWorkspaceId: OTHER_BOX,
				}),
			}).record,
		).toBe(false);
		expect(
			decideCloudLaunchReport({
				...accepted,
				box: { ...box, organizationId: OTHER_ORG },
			}).record,
		).toBe(false);
		expect(
			decideCloudLaunchReport({
				...accepted,
				box: { ...box, userId: OTHER_USER },
			}).record,
		).toBe(false);
		expect(
			decideCloudLaunchReport({
				...accepted,
				automationOwnerUserId: OTHER_USER,
			}).record,
		).toBe(false);
		expect(
			decideCloudLaunchReport({
				...accepted,
				workspace: workspace({ createdByUserId: OTHER_USER }),
			}).record,
		).toBe(false);
		expect(
			decideCloudLaunchReport({
				...accepted,
				run: run({ hostId: "laptop", cloudWorkspaceId: BOX_ID }),
			}).record,
		).toBe(false);
	});

	test("does not overwrite a different session and repeats the same report", () => {
		const settled = run({
			status: "dispatched",
			cloudWorkspaceId: BOX_ID,
			sessionKind: "chat",
			chatSessionId: SESSION,
			terminalSessionId: "term-1",
		});
		expect(
			decideCloudLaunchReport({
				box,
				run: settled,
				automationOwnerUserId: USER,
				workspace: workspace(),
				input: chatReport,
			}),
		).toEqual({ record: false, recorded: true });
		expect(
			decideCloudLaunchReport({
				box,
				run: settled,
				automationOwnerUserId: USER,
				workspace: workspace(),
				input: { ...chatReport, terminalId: "other" },
			}).recorded,
		).toBe(false);
	});
});
