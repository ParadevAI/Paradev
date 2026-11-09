import { describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
	type CommandLineToolsInstallFlowOptions,
	type RequestInstallResult,
	useCommandLineToolsInstallFlow,
} from "./useCommandLineToolsInstallFlow";

function setup(
	overrides: Partial<CommandLineToolsInstallFlowOptions> & {
		result?: RequestInstallResult | Error;
		gitInstalled?: boolean;
	} = {},
) {
	const { result: requestResult, gitInstalled = false, ...options } = overrides;
	return renderHook(
		(props: { installerRunning: boolean }) =>
			useCommandLineToolsInstallFlow({
				requestInstall: async () => {
					if (requestResult instanceof Error) throw requestResult;
					return requestResult ?? { status: "requested" };
				},
				isGitInstalled: async () => gitInstalled,
				appearTimeoutMs: 60_000,
				stallTimeoutMs: 60_000,
				...options,
				installerRunning: props.installerRunning,
			}),
		{ initialProps: { installerRunning: false } },
	);
}

describe("Command Line Tools install flow", () => {
	test("cancelling or a failed install in Apple's window offers a retry", async () => {
		const view = setup();
		await act(() => view.result.current.openInstaller());
		expect(view.result.current.phase).toEqual({
			kind: "requested",
			sawInstaller: false,
		});
		view.rerender({ installerRunning: true });
		expect(view.result.current.phase).toEqual({
			kind: "requested",
			sawInstaller: true,
		});
		view.rerender({ installerRunning: false });
		expect(view.result.current.phase).toEqual({ kind: "closed" });
	});

	test("an installer that never appears falls back to retry", async () => {
		const view = setup({ appearTimeoutMs: 10 });
		await act(() => view.result.current.openInstaller());
		await waitFor(() =>
			expect(view.result.current.phase).toEqual({ kind: "closed" }),
		);
	});

	test("an install that runs too long times out into retry", async () => {
		const view = setup({ stallTimeoutMs: 10 });
		view.rerender({ installerRunning: true });
		await act(() => view.result.current.openInstaller());
		await waitFor(() =>
			expect(view.result.current.phase).toEqual({ kind: "timed-out" }),
		);
	});

	test("an installer already open is followed, not started again", async () => {
		const view = setup({ result: { status: "already-running" } });
		await act(() => view.result.current.openInstaller());
		expect(view.result.current.phase).toEqual({
			kind: "requested",
			sawInstaller: false,
		});
		view.rerender({ installerRunning: true });
		expect(view.result.current.phase).toEqual({
			kind: "requested",
			sawInstaller: true,
		});
	});

	test("'already installed' with git still missing says so", async () => {
		const missing = setup({ result: { status: "already-installed" } });
		await act(() => missing.result.current.openInstaller());
		expect(missing.result.current.phase).toEqual({ kind: "not-found" });

		const found = setup({
			result: { status: "already-installed" },
			gitInstalled: true,
		});
		await act(() => found.result.current.openInstaller());
		expect(found.result.current.phase).toEqual({ kind: "idle" });
	});

	test("an xcode-select error shows its reason", async () => {
		const view = setup({ result: new Error("Can't connect to the server.") });
		await act(() => view.result.current.openInstaller());
		expect(view.result.current.phase).toEqual({
			kind: "failed",
			reason: "Can't connect to the server.",
		});
	});

	test("Check again reports when git is still missing", async () => {
		const view = setup();
		await act(() => view.result.current.checkAgain());
		expect(view.result.current.stillMissing).toBe(true);
	});
});
