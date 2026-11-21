import { describe, expect, mock, test } from "bun:test";
import type { ComposerActionContext } from "@superset/chat-ui/PromptInput";
import { APP_COMMANDS, type AppCommandContext } from "./appCommands";

const NOOP = () => {};

function availableNames(context: AppCommandContext): string[] {
	return APP_COMMANDS.filter((command) => command.available(context)).map(
		(command) => command.name,
	);
}

function listedNames(context: AppCommandContext): string[] {
	return APP_COMMANDS.filter(
		(command) =>
			command.available(context) && (command.listed?.(context) ?? true),
	).map((command) => command.name);
}

function command(name: string) {
	const found = APP_COMMANDS.find((entry) => entry.name === name);
	if (!found) throw new Error(`no /${name}`);
	return found;
}

const COMPOSER: ComposerActionContext = {
	insertChip: NOOP,
	attachFiles: NOOP,
	openPanel: NOOP,
	query: "",
};

describe("APP_COMMANDS", () => {
	test("offers a command only when the chat can carry it out", () => {
		expect(availableNames({})).toEqual(["attach"]);
		expect(
			listedNames({
				newChat: NOOP,
				openModelPicker: NOOP,
				fast: { on: false, set: NOOP },
				plan: { active: false, enter: NOOP, leave: NOOP },
				fork: { targets: ["workspace"], run: NOOP },
				openHistory: NOOP,
				openMcp: NOOP,
				openStatus: NOOP,
				openFind: NOOP,
				createAutomation: NOOP,
			}),
		).toEqual([
			"new",
			"model",
			"fast",
			"plan",
			"fork",
			"resume",
			"mcp",
			"status",
			"find",
			"attach",
			"automation",
		]);
		const inPlan = { plan: { active: true, enter: NOOP, leave: NOOP } };
		expect(availableNames(inPlan)).toEqual(["plan", "default", "attach"]);
		expect(listedNames(inPlan)).toEqual(["default", "attach"]);
	});

	test("runs with parsed arguments and refuses ones it does not take", () => {
		const set = mock((_on: boolean) => {});
		const run = mock((_target: string) => {});
		const createAutomation = mock((_prompt: string) => {});
		const context: AppCommandContext = {
			newChat: NOOP,
			fast: { on: true, set },
			fork: { targets: ["workspace", "worktree"], run },
			createAutomation,
		};
		expect(command("fast").run(context, "", COMPOSER)).toBe("done");
		expect(set).toHaveBeenLastCalledWith(false);
		expect(command("fork").run(context, "worktree", COMPOSER)).toBe("done");
		expect(run).toHaveBeenLastCalledWith("worktree");
		expect(command("automation").run(context, "check CI", COMPOSER)).toBe(
			"done",
		);
		expect(createAutomation).toHaveBeenLastCalledWith("check CI");
		expect(command("new").run(context, "please", COMPOSER)).toBe("bad-args");
		expect(command("automation").run(context, "", COMPOSER)).toBe("bad-args");
		expect(command("fast").run(context, "faster", COMPOSER)).toBe("bad-args");
	});
});
