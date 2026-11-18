import { expect, test } from "bun:test";
import type { CloudAgentLaunchDescriptor } from "@superset/shared/cloud-agent-launch";
import {
	fetchPendingCloudLaunch,
	type PendingLaunchHostClient,
} from "./fetchPendingCloudLaunch";

const RENDERER_ROOT = `${import.meta.dir}/../../../../../../../../..`;

function hostAnswering(
	answer: () => Promise<CloudAgentLaunchDescriptor | null>,
): PendingLaunchHostClient {
	return { sandbox: { pendingLaunch: { query: answer } } };
}

test("passes the box's pending launch through", async () => {
	const launch: CloudAgentLaunchDescriptor = {
		agent: "claude",
		surface: "terminal",
		promptHash: null,
		terminalId: "promised-terminal",
	};
	expect(
		await fetchPendingCloudLaunch(
			hostAnswering(async () => launch),
			"ws",
		),
	).toEqual(launch);
	expect(
		await fetchPendingCloudLaunch(
			hostAnswering(async () => null),
			"ws",
		),
	).toBeNull();
});

test("a host without the procedure has no pending launch", async () => {
	const old = hostAnswering(async () => {
		throw new Error('No procedure found on path "sandbox.pendingLaunch"');
	});
	expect(await fetchPendingCloudLaunch(old, "ws")).toBeNull();
});

test("any other failure stays an error so the query retries", async () => {
	const down = hostAnswering(async () => {
		throw new Error("fetch failed");
	});
	await expect(fetchPendingCloudLaunch(down, "ws")).rejects.toThrow(
		"fetch failed",
	);
});

test("only fetchPendingCloudLaunch asks a host for its pending launch, and only the pending-launch store builds the waiting pane", async () => {
	const askers: string[] = [];
	const builders: string[] = [];
	for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(RENDERER_ROOT)) {
		if (/\.test\.tsx?$/.test(path)) continue;
		const source = await Bun.file(`${RENDERER_ROOT}/${path}`).text();
		if (/sandbox\s*\.\s*pendingLaunch\b/.test(source)) askers.push(path);
		if (/kind:\s*PENDING_CLOUD_LAUNCH_PANE_KIND\b/.test(source))
			builders.push(path);
	}
	expect(askers).toEqual([
		"routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useHostPendingCloudLaunch/utils/fetchPendingCloudLaunch/fetchPendingCloudLaunch.ts",
	]);
	expect(builders).toEqual([
		"stores/workspace-creates/pendingCloudLaunch/pendingCloudLaunch.ts",
	]);
});
