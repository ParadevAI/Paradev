import { describe, expect, it } from "bun:test";
import type { PromptInputCommand } from "../../types";
import { rankCommands } from "./rankCommands";

function command(
	id: string,
	extra: Partial<PromptInputCommand> = {},
): PromptInputCommand {
	return { id, title: `/${id}`, onSelect: () => {}, ...extra };
}

function ids(commands: PromptInputCommand[]): string[] {
	return commands.map((entry) => entry.id);
}

describe("rankCommands", () => {
	it("puts the command named exactly by the query ahead of longer ones it starts", () => {
		const ranked = rankCommands(
			[
				command("mcp:notion:make-a-page"),
				command("mcp"),
				command("superset-mcp"),
			],
			"mcp",
		);
		expect(ids(ranked)).toEqual([
			"mcp",
			"mcp:notion:make-a-page",
			"superset-mcp",
		]);
	});

	it("finds a command by an alias, and by a word of its description", () => {
		const commands = [
			command("new", { searchAliases: ["clear", "reset"] }),
			command("resume", { description: "Chat history" }),
			command("compact"),
		];
		expect(ids(rankCommands(commands, "clear"))).toEqual(["new"]);
		expect(ids(rankCommands(commands, "hist"))).toEqual(["resume"]);
		expect(ids(rankCommands(commands, "cmpt"))).toEqual(["compact"]);
		expect(ids(rankCommands(commands, "mpt"))).toEqual([]);
	});

	it("searches descriptions only when no name or alias matches", () => {
		const commands = [
			command("model", { description: "Choose the model" }),
			command("effort", { description: "Set the model's effort" }),
		];
		expect(ids(rankCommands(commands, "model"))).toEqual(["model"]);
		expect(ids(rankCommands(commands, "choose"))).toEqual(["model"]);
	});

	it("leads with the group of the best match, and with the first group on a tie", () => {
		const commands = [
			command("app:resume", { title: "/resume", group: "App" }),
			command("app:preview", { title: "/preview", group: "App" }),
			command("review", { group: "Agent" }),
		];
		expect(ids(rankCommands(commands, "re"))).toEqual([
			"app:resume",
			"app:preview",
			"review",
		]);
		expect(ids(rankCommands(commands, "rev"))).toEqual([
			"review",
			"app:preview",
		]);
	});

	it("offers nothing once arguments are being typed", () => {
		expect(rankCommands([command("fork")], "fork ")).toEqual([]);
	});
});
