import { describe, expect, it } from "bun:test";
import { planEnvironmentSetup } from "./planEnvironmentSetup";

const PENDING = { choiceKey: "project-a", environmentId: "env-1" };
const base = {
	pending: null,
	choiceKey: "project-a",
	selectedEnvironmentId: null,
	needsEnvironment: true,
	repository: { id: "repo-1" },
};

describe("planEnvironmentSetup", () => {
	it("retries on the environment made earlier before the list has caught up", () => {
		expect(planEnvironmentSetup({ ...base, pending: PENDING })).toEqual({
			kind: "reuse",
			environmentId: "env-1",
		});
	});

	it("retries once that environment is the selected one", () => {
		expect(
			planEnvironmentSetup({
				...base,
				pending: PENDING,
				selectedEnvironmentId: "env-1",
				needsEnvironment: false,
			}),
		).toEqual({ kind: "reuse", environmentId: "env-1" });
	});

	it("leaves a different selected environment alone", () => {
		expect(
			planEnvironmentSetup({
				...base,
				pending: PENDING,
				selectedEnvironmentId: "env-2",
				needsEnvironment: false,
			}),
		).toBeNull();
	});

	it("does not carry a pending environment to another project", () => {
		expect(
			planEnvironmentSetup({
				...base,
				pending: PENDING,
				choiceKey: "project-b",
			}),
		).toEqual({ kind: "create", repository: { id: "repo-1" } });
	});

	it("asks through the dialog when the repository is out of reach", () => {
		expect(planEnvironmentSetup({ ...base, repository: undefined })).toEqual({
			kind: "dialog",
		});
	});
});
