import { describe, expect, test } from "bun:test";
import {
	firstJsonObject,
	firstLine,
	quotedOption,
	toolCommand,
	toolOutput,
	uuidOption,
	wordOption,
} from "./toolText";
import { claudeTool, terminalTool } from "./toolText.test-data";

const ID = "a94e7f3d-f144-4fee-9bee-c84e38765186";

describe("toolText", () => {
	test("reads the command and output however the harness stored them", () => {
		expect(toolCommand(claudeTool("ls", "a"))).toBe("ls");
		expect(toolCommand(terminalTool("ls", "a"))).toBe("ls");
		expect(toolOutput(claudeTool("ls", "a\nb"))).toBe("a\nb");
		expect(toolOutput(terminalTool("ls", "a\nb"))).toBe("a\nb");
	});

	test("reads uuid and word options", () => {
		const command = `superset sessions create --local --workspace ${ID} --agent claude --prompt "x"`;
		expect(uuidOption(command, "workspace")).toBe(ID);
		expect(uuidOption(command, "session")).toBeNull();
		expect(wordOption(command, "agent")).toBe("claude");
		expect(wordOption(`x --session='s-1' y`, "session")).toBe("s-1");
	});

	test("reads quoted options in each shell form", () => {
		expect(
			quotedOption(`a --prompt "Fix the \\"tabs\\" bar" --json`, "prompt"),
		).toBe('Fix the "tabs" bar');
		expect(quotedOption(`a --prompt 'Fix it' --json`, "prompt")).toBe("Fix it");
		expect(quotedOption(`a --prompt $'Line one\\nLine two'`, "prompt")).toBe(
			"Line one\nLine two",
		);
		expect(
			quotedOption(
				`a --prompt "$(cat <<'EOF'\nFirst line\n\nMore\nEOF\n)" --json`,
				"prompt",
			),
		).toBe("First line\n\nMore");
		expect(quotedOption("a --json", "prompt")).toBeNull();
	});

	test("takes the first line that says something, trimmed", () => {
		expect(firstLine("\n# Title\nbody", 10)).toBe("Title");
		expect(firstLine("a very long first line here", 10)).toBe("a very lo…");
		expect(firstLine("\n\n", 10)).toBeNull();
	});

	test("parses the first object in fenced output", () => {
		expect(firstJsonObject('```console\n{"a": {"b": "}"}}\n```')).toEqual({
			a: { b: "}" },
		});
		expect(firstJsonObject("no json")).toBeNull();
		expect(firstJsonObject("{broken")).toBeNull();
	});
});
