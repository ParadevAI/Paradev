import { describe, expect, test } from "bun:test";
import type { WorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { fallsBackToLocalHost } from "./fallsBackToLocalHost";

const remote: WorkspaceHostTarget = {
	status: "ready",
	kind: "remote",
	hostId: "linux-host",
	url: "https://relay.test/hosts/linux-host",
};
const local: WorkspaceHostTarget = {
	status: "ready",
	kind: "local",
	hostId: "this-machine",
	url: "http://127.0.0.1:4879",
};
const sandbox: WorkspaceHostTarget = {
	status: "ready",
	kind: "sandbox",
	hostId: "workspace-1",
	url: "https://sandbox.test",
	desktopUrl: "https://sandbox.test/desktop",
};

describe("fallsBackToLocalHost", () => {
	test("a remote host with no simulator hands the pane to this machine", () => {
		expect(
			fallsBackToLocalHost({ workspaceHost: remote, backend: "none" }),
		).toBe(true);
	});

	test("a remote host with its own simulators keeps the pane", () => {
		for (const backend of ["local-ios", "local-android", "eas"] as const) {
			expect(fallsBackToLocalHost({ workspaceHost: remote, backend })).toBe(
				false,
			);
		}
	});

	test("the pane waits for the remote host's answer", () => {
		expect(
			fallsBackToLocalHost({ workspaceHost: remote, backend: undefined }),
		).toBe(false);
	});

	test("this machine and a cloud sandbox keep the pane with no simulator", () => {
		expect(
			fallsBackToLocalHost({ workspaceHost: local, backend: "none" }),
		).toBe(false);
		expect(
			fallsBackToLocalHost({ workspaceHost: sandbox, backend: "none" }),
		).toBe(false);
	});

	test("a workspace whose host is not resolved keeps the pane", () => {
		expect(
			fallsBackToLocalHost({
				workspaceHost: { status: "loading" },
				backend: "none",
			}),
		).toBe(false);
	});
});
