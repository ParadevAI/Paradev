import { describe, expect, it } from "bun:test";
import { withoutTaskNotifications } from "./withoutTaskNotifications";

const TASK_NOTIFICATION = [
	"<task-notification>",
	"<task-id>bpnxmf1pv</task-id>",
	"<tool-use-id>toolu_01RXAk</tool-use-id>",
	"<output-file>/private/tmp/claude-501/tasks/bpnxmf1pv.output</output-file>",
	"<status>completed</status>",
	'<summary>Monitor "wait for PR 9909 checks" stream ended</summary>',
	"<event>DONE Lint=SUCCESS Test=SUCCESS Typecheck=SUCCESS</event>",
	"If this event is something the user would act on now, send a PushNotification. Routine or benign output doesn't need one.",
	"</task-notification>",
].join("\n");

const REPEATED = [
	"<system-reminder>",
	"[SYSTEM NOTIFICATION - NOT USER INPUT]",
	"This is an automated background-task event, NOT a message from the user.",
	"Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.",
	"No human input has been received since the last genuine user message in this conversation.",
	"",
	TASK_NOTIFICATION,
	"</system-reminder>",
].join("\n");

describe("withoutTaskNotifications", () => {
	it("removes a repeated task notification and keeps the reply around it", () => {
		expect(
			withoutTaskNotifications(
				`Checking CI.\n\n${REPEATED}\n\nCI passed.`,
				true,
			),
		).toBe("Checking CI.\n\nCI passed.");
		expect(withoutTaskNotifications(`${TASK_NOTIFICATION}\nOK.`, true)).toBe(
			"OK.",
		);
		expect(
			withoutTaskNotifications(
				`The [SYSTEM NOTIFICATION - NOT USER INPUT] header marks it.\n\n${REPEATED}\n\nCI passed.`,
				true,
			),
		).toBe(
			"The [SYSTEM NOTIFICATION - NOT USER INPUT] header marks it.\n\nCI passed.",
		);
	});

	it("shows no part of it while the reply streams", () => {
		const text = `Checking CI.\n\n${REPEATED}\n\nCI passed.`;
		let shown = "";
		for (let end = 1; end <= text.length; end++) {
			const visible = withoutTaskNotifications(text.slice(0, end), false);
			expect(visible.startsWith(shown)).toBe(true);
			expect(visible).not.toContain("[SYSTEM");
			expect(visible).not.toContain("<task");
			expect(visible).not.toContain("<system");
			shown = visible;
		}
		expect(shown).toBe("Checking CI.\n\nCI passed.");
	});

	it("keeps the format when the reply quotes it in code or names it in prose", () => {
		for (const text of [
			"Claude wraps it in `<task-notification>` and ends it with `</task-notification>`.",
			"A payload: `notice: <task-notification><task-id>x</task-id></task-notification>` is one line.",
			`The format:\n\n\`\`\`xml\n${REPEATED}\n\`\`\`\n\nThat is all.`,
			`Nested:\n\n\`\`\`\`md\n\`\`\`xml\n${REPEATED}\n\`\`\`\n\`\`\`\`\n\nThat is all.`,
			"The [SYSTEM NOTIFICATION - NOT USER INPUT] header marks an automated event.",
			"[SYSTEM NOTIFICATION - NOT USER INPUT]\n`payload: <task-notification><task-id>x</task-id></task-notification>`",
		]) {
			expect(withoutTaskNotifications(text, true)).toBe(text);
		}
	});

	it("hides a notification the reply leaves unfinished, but not a lone bracket", () => {
		expect(
			withoutTaskNotifications(
				"Done.\n\n<task-notification>\n<task-id>b1</task-id>\n<status>comp",
				true,
			),
		).toBe("Done.\n\n");
		expect(
			withoutTaskNotifications("Done.\n\n<task-notification>\n", true),
		).toBe("Done.\n\n");
		expect(withoutTaskNotifications("See:\n[", false)).toBe("See:\n");
		expect(withoutTaskNotifications("See:\n[", true)).toBe("See:\n[");
		expect(withoutTaskNotifications("See [", false)).toBe("See [");
	});
});
