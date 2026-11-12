import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ToolInstallFailure } from "./hooks/useToolInstallState";
import { ToolInstallProgress } from "./ToolInstallProgress";

afterEach(() => {
	cleanup();
	mock.restore();
});

const ZIP =
	"https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_macOS_arm64.zip";

function renderFailed(
	reason: ToolInstallFailure,
	props: { onRetry?: () => void; onCheckAgain?: () => Promise<boolean> } = {},
) {
	return render(
		<ToolInstallProgress
			state={{ stage: "failed", reason, downloadUrl: ZIP }}
			name="GitHub CLI"
			vendor="GitHub"
			manualInstall={{ label: "Download from GitHub", url: ZIP }}
			onRetry={props.onRetry ?? (() => {})}
			onCheckAgain={props.onCheckAgain ?? (async () => false)}
			onCancel={() => {}}
		/>,
	);
}

describe("ToolInstallProgress", () => {
	test("each failure has a plain message, Try again and the manual download", () => {
		const open = spyOn(window, "open").mockReturnValue(null);
		const cases: Array<[ToolInstallFailure, RegExp]> = [
			["offline", /Couldn't reach GitHub/],
			["rate-limited", /GitHub is limiting downloads/],
			["download", /The download didn't finish/],
			["checksum", /The download looked wrong, so Paradev didn't install it/],
			["signature", /isn't signed by GitHub/],
			["disk-full", /enough free disk space to install GitHub CLI/],
			["install", /Couldn't set up GitHub CLI/],
			["stalled", /The install stopped responding/],
		];
		for (const [reason, message] of cases) {
			const onRetry = mock(() => {});
			renderFailed(reason, { onRetry });
			expect(screen.getByText(message)).toBeTruthy();
			fireEvent.click(screen.getByRole("button", { name: "Try again" }));
			fireEvent.click(
				screen.getByRole("button", { name: /Download from GitHub/ }),
			);
			expect(onRetry).toHaveBeenCalledTimes(1);
			cleanup();
		}
		expect(open.mock.calls.every((call) => call[0] === ZIP)).toBe(true);
	});

	test("Check again finds a tool installed another way, or says it is still missing", async () => {
		const onCheckAgain = mock(async () => false);
		renderFailed("download", { onCheckAgain });
		fireEvent.click(screen.getByRole("button", { name: "Check again" }));
		await waitFor(() =>
			expect(
				screen.getByText("Paradev still can't find GitHub CLI."),
			).toBeTruthy(),
		);
		expect(onCheckAgain).toHaveBeenCalledTimes(1);
	});

	test("Cancel during an install stops it", () => {
		const onCancel = mock(() => {});
		render(
			<ToolInstallProgress
				state={{ stage: "downloading", fraction: 0.4, receivedBytes: 40 }}
				name="Codex"
				vendor="OpenAI"
				manualInstall={{ label: "Install it yourself", url: ZIP }}
				onRetry={() => {}}
				onCheckAgain={async () => false}
				onCancel={onCancel}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
