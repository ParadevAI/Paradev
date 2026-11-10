import { describe, expect, it } from "bun:test";
import { parseAgentCliMissing } from "./acpCatalogue";
import { agentCliUnsupported } from "./agentCli";

describe("agentCliUnsupported", () => {
	it("names the version to install when nothing is found", () => {
		const message = agentCliUnsupported({
			binary: "codex",
			minVersion: "0.160.0",
			found: null,
			upgrade: "npm i -g @openai/codex@latest",
		});
		expect(message).toContain("codex was not found");
		expect(message).toContain("0.160.0");
		expect(message).toContain("npm i -g @openai/codex@latest");
	});

	it("names both versions when one is too old", () => {
		const message = agentCliUnsupported({
			binary: "gemini",
			minVersion: "0.62.0",
			found: "0.2.1",
			upgrade: "npm i -g @google/gemini-cli@latest",
		});
		expect(message).toContain("0.62.0 or newer");
		expect(message).toContain("0.2.1 is installed");
	});

	it("omits an upgrade command it was not given", () => {
		expect(
			agentCliUnsupported({
				binary: "opencode",
				minVersion: "1.15.5",
				found: "1.0.0",
			}),
		).not.toContain("Upgrade with");
	});
});

describe("parseAgentCliMissing", () => {
	it("reads the binary back from the missing-agent error", () => {
		const message = agentCliUnsupported({
			binary: "claude",
			minVersion: "2.1.226",
			found: null,
			upgrade: "npm i -g @anthropic-ai/claude-code@latest",
		});
		expect(parseAgentCliMissing(message)).toBe("claude");
		expect(parseAgentCliMissing(`Error: ${message}`)).toBe("claude");
	});

	it("ignores a too-old install and other errors", () => {
		expect(
			parseAgentCliMissing(
				agentCliUnsupported({
					binary: "codex",
					minVersion: "0.160.0",
					found: "0.1.0",
				}),
			),
		).toBeNull();
		expect(parseAgentCliMissing("socket closed")).toBeNull();
		expect(parseAgentCliMissing(undefined)).toBeNull();
	});
});
