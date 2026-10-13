import { describe, expect, test } from "bun:test";
import { buildHostsAddCommand, isValidSshTarget } from "./buildHostsAddCommand";

describe("buildHostsAddCommand", () => {
	test("quotes the target so the shell passes it to ssh as one word", () => {
		const command = buildHostsAddCommand("me@box; rm -rf ~", "org-1");
		expect(command).toEndWith(
			"superset hosts add --org org-1 'me@box; rm -rf ~'",
		);
		expect(command).toStartWith("export SUPERSET_ORGANIZATION_ID=org-1; ");
	});
});

describe("isValidSshTarget", () => {
	test("accepts destinations and refuses ssh options and spaces", () => {
		expect(isValidSshTarget("me@box.example.com")).toBe(true);
		expect(isValidSshTarget("devbox")).toBe(true);
		expect(isValidSshTarget("-oProxyCommand=evil")).toBe(false);
		expect(isValidSshTarget("me@box extra")).toBe(false);
		expect(isValidSshTarget("")).toBe(false);
	});
});
