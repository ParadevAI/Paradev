import { describe, expect, test } from "bun:test";
import { pickCloudRepository } from "./pickCloudRepository";

const setup = {
	fullName: "me/personal-setup",
	owner: "me",
	name: "personal-setup",
	defaultBranch: "personal-setup-ssh-key",
};
const app = {
	fullName: "acme/app",
	owner: "acme",
	name: "app",
	defaultBranch: "main",
};

describe("pickCloudRepository", () => {
	test("prefers the repository of the selected project over the first one", () => {
		expect(pickCloudRepository([setup, app], "acme/app")).toBe(app);
	});

	test("matches the project's repository regardless of case", () => {
		expect(pickCloudRepository([setup, app], "ACME/App")).toBe(app);
	});

	test("falls back to the first repository without a project", () => {
		expect(pickCloudRepository([setup, app], null)).toBe(setup);
	});

	test("falls back to the first repository when none matches", () => {
		expect(pickCloudRepository([setup, app], "acme/other")).toBe(setup);
	});

	test("returns null for an environment with no repositories", () => {
		expect(pickCloudRepository([], "acme/app")).toBeNull();
		expect(pickCloudRepository(undefined, "acme/app")).toBeNull();
	});
});
