import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CommandLineToolsInstallPhase } from "../../hooks/useCommandLineToolsInstall";
import { GitSetupRow } from "./GitSetupRow";

afterEach(() => {
	cleanup();
	mock.restore();
});

const MISSING = { installed: false, needsCommandLineTools: true, error: null };

function renderRow(phase: CommandLineToolsInstallPhase, stillMissing = false) {
	const install = {
		phase,
		openInstaller: mock(async () => {}),
		checkAgain: mock(async () => {}),
		isRequesting: false,
		stillMissing,
	};
	render(<GitSetupRow git={MISSING} install={install} />);
	return install;
}

describe("GitSetupRow", () => {
	test("each failure gives a message, Try again, Check again and Apple's download page", () => {
		const open = spyOn(window, "open").mockReturnValue(null);
		const cases: Array<[CommandLineToolsInstallPhase, string]> = [
			[
				{ kind: "closed" },
				"Apple's installer closed before Git was installed.",
			],
			[{ kind: "timed-out" }, "This is taking longer than expected."],
			[
				{ kind: "not-found" },
				"Apple says the tools are installed, but Paradev can't find Git.",
			],
			[
				{ kind: "failed", reason: "Can't connect to the server." },
				"Apple's installer did not open: Can't connect to the server.",
			],
		];
		for (const [phase, message] of cases) {
			const install = renderRow(phase);
			expect(screen.getByText(message)).toBeTruthy();
			expect(screen.getByText(/about 20 GB of free space/)).toBeTruthy();
			fireEvent.click(screen.getByRole("button", { name: "Try again" }));
			fireEvent.click(screen.getByRole("button", { name: "Check again" }));
			fireEvent.click(
				screen.getByRole("button", { name: /Download from Apple/ }),
			);
			expect(install.openInstaller).toHaveBeenCalledTimes(1);
			expect(install.checkAgain).toHaveBeenCalledTimes(1);
			cleanup();
		}
		expect(open.mock.calls.map((call) => call[0])).toEqual(
			Array(cases.length).fill("https://developer.apple.com/download/all/"),
		);
	});

	test("Check again that still finds no git says so", () => {
		renderRow({ kind: "closed" }, true);
		expect(screen.getByText("Git still isn't installed.")).toBeTruthy();
	});

	test("shows Installed once git works, without a button", () => {
		render(
			<GitSetupRow
				git={{ installed: true, needsCommandLineTools: false, error: null }}
				install={{
					phase: { kind: "requested", sawInstaller: true },
					openInstaller: async () => {},
					checkAgain: async () => {},
					isRequesting: false,
					stillMissing: false,
				}}
			/>,
		);
		expect(screen.getByText("Installed")).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
	});
});
