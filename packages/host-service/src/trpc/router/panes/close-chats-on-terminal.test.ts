import { describe, expect, test } from "bun:test";
import { closeChatsOnTerminal } from "./close-chats-on-terminal";

function runtimeWith(
	sessions: Array<{
		sessionId: string;
		terminalId: string | null;
		live: boolean;
	}>,
) {
	const closed: Array<{ sessionId: string; userClosed?: boolean }> = [];
	const ctx = {
		runtime: {
			chat: () => ({
				commands: {
					listSessions: () => sessions,
					closeSession: async (input: {
						sessionId: string;
						userClosed?: boolean;
					}) => {
						closed.push(input);
					},
				},
			}),
		},
	} as unknown as Parameters<typeof closeChatsOnTerminal>[0];
	return { ctx, closed };
}

describe("closeChatsOnTerminal", () => {
	test("stops the live chats on the pane's terminal as closed by a person", async () => {
		const { ctx, closed } = runtimeWith([
			{ sessionId: "on-pane", terminalId: "t1", live: true },
			{ sessionId: "stopped", terminalId: "t1", live: false },
			{ sessionId: "elsewhere", terminalId: "t2", live: true },
		]);
		await closeChatsOnTerminal(ctx, "ws", "t1");
		expect(closed).toEqual([{ sessionId: "on-pane", userClosed: true }]);
	});

	test("matches a chat with no terminal by its session id, as its pane shows it", async () => {
		const { ctx, closed } = runtimeWith([
			{ sessionId: "from-mobile", terminalId: null, live: true },
		]);
		await closeChatsOnTerminal(ctx, "ws", "from-mobile");
		expect(closed).toEqual([{ sessionId: "from-mobile", userClosed: true }]);
	});

	test("does nothing on a host without chat", async () => {
		const ctx = { runtime: {} } as unknown as Parameters<
			typeof closeChatsOnTerminal
		>[0];
		await closeChatsOnTerminal(ctx, "ws", "t1");
	});
});
