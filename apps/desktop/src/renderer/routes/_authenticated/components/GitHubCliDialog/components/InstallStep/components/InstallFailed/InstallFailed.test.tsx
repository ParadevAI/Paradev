import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { InstallFailed, type InstallFailureReason } from "./InstallFailed";

afterEach(cleanup);

const ZIP =
	"https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_macOS_arm64.zip";

describe("InstallFailed", () => {
	test("each failure has a plain message, Try again and the macOS download", () => {
		const open = mock((_url?: string | URL) => null);
		window.open = open as unknown as typeof window.open;
		const cases: Array<[InstallFailureReason, RegExp]> = [
			["offline", /Couldn't reach GitHub/],
			["rate-limited", /GitHub is limiting downloads/],
			["download", /The download didn't finish/],
			["checksum", /The download looked wrong, so Paradev didn't install it/],
			["install", /Couldn't unpack or save GitHub CLI/],
			["stalled", /The install stopped responding/],
		];
		for (const [reason, message] of cases) {
			const onRetry = mock(() => {});
			render(
				<InstallFailed
					reason={reason}
					downloadUrl={ZIP}
					isMac
					onRetry={onRetry}
					onCheckAgain={async () => false}
				/>,
			);
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

	test("Check again finds a gh installed another way, or says it is still missing", async () => {
		const onCheckAgain = mock(async () => false);
		render(
			<InstallFailed
				reason="download"
				downloadUrl={null}
				isMac
				onRetry={() => {}}
				onCheckAgain={onCheckAgain}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Check again" }));
		await waitFor(() =>
			expect(
				screen.getByText("Paradev still can't find GitHub CLI."),
			).toBeTruthy(),
		);
		expect(onCheckAgain).toHaveBeenCalledTimes(1);
	});
});
