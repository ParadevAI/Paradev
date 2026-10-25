import { expect, mock, test } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import { switchAccountConversation } from "./switchAccountConversation";

const input = {
	commandId: "00000000-0000-4000-8000-000000000001",
	sessionId: "source",
	account: { selection: "/fixture/b", identity: "b".repeat(64) },
};
const result = { sessionId: "successor", epoch: "epoch", terminalId: "pane" };
function fixture() {
	return {
		switchAccountSession: mock(async () => result),
		accountSessionByCommand: mock(async () => result),
		getSession: mock(async () => ({
			session: { predecessorSessionId: "source" },
			account: { ...input.account, agent: "claude" },
		})),
	};
}
type Transport = Pick<
	ChatTransport,
	"switchAccountSession" | "accountSessionByCommand" | "getSession"
>;

test("sends the immutable choice once and does not send a continuation prompt", async () => {
	const f = fixture();
	expect(
		await switchAccountConversation(f as unknown as Transport, input),
	).toEqual(result);
	expect(f.switchAccountSession).toHaveBeenCalledTimes(1);
	expect(f.switchAccountSession).toHaveBeenCalledWith(input);
	expect(f.accountSessionByCommand).not.toHaveBeenCalled();
});

test("a lost reply resolves only the recorded successor and exact destination identity", async () => {
	const f = fixture();
	f.switchAccountSession = mock(async () => {
		throw new Error("lost reply");
	});
	expect(
		await switchAccountConversation(f as unknown as Transport, input),
	).toEqual(result);
	expect(f.switchAccountSession).toHaveBeenCalledTimes(1);
	expect(f.accountSessionByCommand).toHaveBeenCalledWith({
		commandId: input.commandId,
	});
});

test("a different receipt, unavailable host or missing procedure never retries a default launch", async () => {
	for (const failure of ["principal", "predecessor", "unavailable"] as const) {
		const f = fixture();
		f.switchAccountSession = mock(async () => {
			throw new Error("No procedure switchAccountSession");
		});
		if (failure === "principal")
			f.getSession = mock(async () => ({
				session: { predecessorSessionId: "source" },
				account: { ...input.account, agent: "claude", identity: "other" },
			}));
		if (failure === "predecessor")
			f.getSession = mock(async () => ({
				session: { predecessorSessionId: "different" },
				account: { ...input.account, agent: "claude" },
			}));
		if (failure === "unavailable")
			f.accountSessionByCommand = mock(async () => {
				throw new Error("offline");
			});
		await expect(
			switchAccountConversation(f as unknown as Transport, input),
		).rejects.toThrow("No procedure");
		expect(f.switchAccountSession).toHaveBeenCalledTimes(1);
	}
});
