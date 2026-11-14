import { describe, expect, test } from "bun:test";
import type { RepositoryShipStep } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots/utils/repositoryShipStep";
import { actionableShipRepositories } from "./actionableShipRepositories";

const steps: RepositoryShipStep[] = [
	"commit",
	"push",
	"create-pr",
	"error",
	"pull-request",
	"up-to-date",
	"loading",
	"unavailable",
];
const repositories = [
	...steps.map((step) => ({ repositoryId: step })),
	{ repositoryId: "no-snapshot" },
];
const snapshots = Object.fromEntries(steps.map((step) => [step, { step }]));
const ids = (list: Array<{ repositoryId: string }>) =>
	list.map(({ repositoryId }) => repositoryId);

describe("actionableShipRepositories", () => {
	test("keeps only repositories with a step to take or an error", () => {
		expect(
			ids(actionableShipRepositories(repositories, snapshots, null)),
		).toEqual(["commit", "push", "create-pr", "error"]);
	});

	test("keeps the open repository after it has nothing left to do", () => {
		expect(
			ids(actionableShipRepositories(repositories, snapshots, "pull-request")),
		).toEqual(["commit", "push", "create-pr", "error", "pull-request"]);
	});
});
