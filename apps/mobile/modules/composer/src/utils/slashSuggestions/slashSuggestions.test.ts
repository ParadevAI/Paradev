import { describe, expect, test } from "bun:test";
import type { ComposerSlashCommand } from "../../Composer.types";
import { committedSlashDraft, slashSuggestions } from "./slashSuggestions";

const command = (
	name: string,
	extra: Partial<ComposerSlashCommand> = {},
): ComposerSlashCommand => ({ id: `/${name}`, name, trigger: "/", ...extra });

const names = (matches: ComposerSlashCommand[] | null) =>
	matches?.map((match) => match.name) ?? null;

describe("slashSuggestions", () => {
	const commands = [
		command("review", { isBuiltin: true }),
		command("preview"),
		command("compact", { isBuiltin: true, aliases: ["shrink"] }),
		command("deploy", { argumentHint: "<env>" }),
		command("plan", { trigger: "$" }),
	];

	test("opens only on a bare trigger token", () => {
		expect(names(slashSuggestions("/", commands))).toEqual([
			"deploy",
			"preview",
			"compact",
			"review",
		]);
		expect(slashSuggestions("fix /rev", commands)).toBeNull();
		expect(slashSuggestions("/review now", commands)).toBeNull();
		expect(slashSuggestions("/rev", [])).toBeNull();
	});

	test("ranks exact, then prefix, then substring, then aliases", () => {
		expect(names(slashSuggestions("/review", commands))).toEqual([
			"review",
			"preview",
		]);
		expect(names(slashSuggestions("/SHR", commands))).toEqual(["compact"]);
	});

	test("keeps the triggers apart", () => {
		expect(names(slashSuggestions("$", commands))).toEqual(["plan"]);
		expect(slashSuggestions("/plan", commands)).toBeNull();
	});

	test("closes for a fully typed command that takes arguments", () => {
		expect(slashSuggestions("/deploy", commands)).toBeNull();
		expect(names(slashSuggestions("/dep", commands))).toEqual(["deploy"]);
	});

	test("commits the token with a trailing space", () => {
		expect(committedSlashDraft(command("deploy"))).toBe("/deploy ");
	});
});
