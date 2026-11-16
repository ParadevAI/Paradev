import { describe, expect, mock, spyOn, test } from "bun:test";
import { probeTerminalRunning } from "./confirm-close-terminals";

type ProbeUtils = Parameters<typeof probeTerminalRunning>[0];

function probeUtils(query: ReturnType<typeof mock>): ProbeUtils {
	return {
		client: { terminal: { hasRunningProcess: { query } } },
	} as unknown as ProbeUtils;
}

describe("probeTerminalRunning", () => {
	test("aborts a stalled request and allows the terminal to close", async () => {
		const controller = new AbortController();
		const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(
			controller.signal,
		);
		const warning = spyOn(console, "warn").mockImplementation(() => {});
		const query = mock(
			(_input: unknown, options: { signal?: AbortSignal }) =>
				new Promise<{ running: boolean }>((_resolve, reject) => {
					options.signal?.addEventListener("abort", () =>
						reject(options.signal?.reason),
					);
				}),
		);

		try {
			const result = probeTerminalRunning(
				probeUtils(query),
				"workspace",
				"term",
			);
			expect(timeout).toHaveBeenCalledWith(2_000);
			expect(query).toHaveBeenCalledWith(
				{ terminalId: "term", workspaceId: "workspace" },
				{ signal: controller.signal },
			);
			controller.abort(new DOMException("Timed out", "TimeoutError"));
			expect(await result).toBe(false);
			expect(warning).toHaveBeenCalledTimes(1);
		} finally {
			timeout.mockRestore();
			warning.mockRestore();
		}
	});

	for (const running of [true, false]) {
		test(`returns the live running state (${running})`, async () => {
			const query = mock(async () => ({ running }));
			expect(
				await probeTerminalRunning(probeUtils(query), "workspace", "term"),
			).toBe(running);
		});
	}
});
