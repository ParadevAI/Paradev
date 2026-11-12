import { describe, expect, test } from "bun:test";
import {
	type InstallCommandLineToolsDeps,
	installCommandLineTools,
} from "./install-command-line-tools";

function deps(
	installerRunning: boolean,
	xcodeSelect: () => Promise<void>,
): InstallCommandLineToolsDeps & { raised: number; ran: number } {
	const result = {
		raised: 0,
		ran: 0,
		isInstallerRunning: async () => installerRunning,
		runXcodeSelectInstall: async () => {
			result.ran++;
			await xcodeSelect();
		},
		bringInstallerToFront: async () => {
			result.raised++;
		},
	};
	return result;
}

function exit1(stderr: string) {
	return async () => {
		throw Object.assign(new Error("Command failed"), { code: 1, stderr });
	};
}

describe("installCommandLineTools", () => {
	test("opens Apple's installer and brings it to the front", async () => {
		const d = deps(false, async () => {});
		expect(await installCommandLineTools(d)).toEqual({ status: "requested" });
		expect(d.raised).toBe(1);
	});

	test("raises an installer that is already open instead of starting another", async () => {
		const d = deps(true, async () => {});
		expect(await installCommandLineTools(d)).toEqual({
			status: "already-running",
		});
		expect(d.ran).toBe(0);
		expect(d.raised).toBe(1);
	});

	test("reads xcode-select's stderr for installed, running and other errors", async () => {
		expect(
			await installCommandLineTools(
				deps(
					false,
					exit1(
						'xcode-select: error: command line tools are already installed, use "Software Update" in System Settings to install updates\n',
					),
				),
			),
		).toEqual({ status: "already-installed" });
		expect(
			await installCommandLineTools(
				deps(false, exit1("xcode-select: note: install already in progress\n")),
			),
		).toEqual({ status: "already-running" });
		expect(
			await installCommandLineTools(
				deps(
					false,
					exit1("xcode-select: error: Can't connect to the server.\n"),
				),
			),
		).toEqual({ status: "failed", reason: "Can't connect to the server." });
		expect(await installCommandLineTools(deps(false, exit1("")))).toEqual({
			status: "failed",
			reason: null,
		});
	});
});
