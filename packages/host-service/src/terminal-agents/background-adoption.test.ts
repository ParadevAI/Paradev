import { expect, test } from "bun:test";
import {
	backgroundAdoptionLaunchId,
	backgroundWorkerBirthHash,
	parseBackgroundAdoptionLaunchId,
} from "./background-adoption";

test("an adoption grant binds only its exact source launch, account, worktree and worker incarnation", () => {
	const input = {
		source: {
			terminalId: "old",
			workspaceId: "workspace",
			launchId: "original-launch",
			sessionId: "native-session",
			account: {
				pinned: true as const,
				agent: "claude" as const,
				selection: "/profile",
				directory: "/profile",
				identity: "a".repeat(64),
				credentialKind: "subscription" as const,
			},
			definitionId: "claude",
			startedAt: 10,
		},
		terminalId: "new",
		cwd: "/project",
		adoptedAt: 20,
		worker: { pid: 123, birthHash: backgroundWorkerBirthHash("birth") },
	};
	const grant = backgroundAdoptionLaunchId(input);
	expect(grant.length).toBeLessThanOrEqual(128);
	expect(parseBackgroundAdoptionLaunchId(grant)).toEqual(input.worker);
	for (const changed of [
		{ ...input, terminalId: "other" },
		{ ...input, cwd: "/other" },
		{ ...input, adoptedAt: 21 },
		{ ...input, source: { ...input.source, launchId: "new-launch" } },
		{
			...input,
			source: {
				...input.source,
				account: { ...input.source.account, identity: "b".repeat(64) },
			},
		},
		{
			...input,
			worker: {
				...input.worker,
				birthHash: backgroundWorkerBirthHash("reused"),
			},
		},
	])
		expect(backgroundAdoptionLaunchId(changed)).not.toBe(grant);
	expect(parseBackgroundAdoptionLaunchId("unrelated-new-launch")).toBeNull();
});
