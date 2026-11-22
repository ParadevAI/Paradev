import { expect, test } from "bun:test";
import { normalizeAgentCredentialValue } from "./normalize-value";

test("removes terminal wrapping and indentation from a pasted Claude subscription token", () => {
	expect(
		normalizeAgentCredentialValue({
			agent: "claude",
			kind: "subscription",
			value: "  sk-ant-oat01-first\r\n  second\n\tthird \n",
		}),
	).toBe("sk-ant-oat01-firstsecondthird");
});

test("preserves whitespace inside other credential formats", () => {
	const value = '  {"access_token": "token", "label": "My account"}  ';
	expect(
		normalizeAgentCredentialValue({
			agent: "codex",
			kind: "subscription",
			value,
		}),
	).toBe(value.trim());
	expect(
		normalizeAgentCredentialValue({
			agent: "claude",
			kind: "api_key",
			value: "  custom key  ",
		}),
	).toBe("custom key");
});
