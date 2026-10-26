import { expect, mock, test } from "bun:test";
import type { ChatLaunchContext } from "@superset/chat/protocol";
import type { HostDb } from "../db";
import { prepareChatAccountSwitch } from "./accountSwitch";

const source: ChatLaunchContext = {
	v: 1,
	cwd: "/fixture/work",
	terminalId: "pane",
	account: {
		agent: "claude",
		directory: "/fixture/a",
		selection: "/fixture/a",
		identity: "a".repeat(64),
	},
};
const target = {
	...source.account,
	directory: "/fixture/b",
	selection: "/fixture/b",
	identity: "b".repeat(64),
};
const input = {
	harness: "claude-acp",
	scopeId: "workspace",
	cwd: source.cwd,
	harnessSessionId: "native-session",
	source,
	account: target,
};
function fixture() {
	const evidence = {
		path: "/shared/session.jsonl",
		device: 1,
		inode: 2,
		size: 10,
		modifiedAt: 1,
		changedAt: 1,
		sha256: "a".repeat(64),
	};
	const release = mock(() => {});
	const deps = {
		prepare: mock(async () => target),
		validate: mock(async () => {}),
		inspect: mock(async () => ({ ...evidence })),
		assertCurrent: mock((_history: typeof evidence) => {}),
		writers: mock(async () => {}),
		claim: mock(() => release),
	};
	return { evidence, release, deps };
}

test("refuses an inaccessible independent history before returning an exit plan", async () => {
	const f = fixture();
	f.deps.inspect = mock(async () => {
		throw new Error("independent histories");
	});
	await expect(
		prepareChatAccountSwitch({} as HostDb, input, f.deps),
	).rejects.toThrow("independent histories");
	expect(f.release).toHaveBeenCalledTimes(1);
	expect(f.deps.writers).not.toHaveBeenCalled();
});

test("binds the exact source and target, then checkpoints final appended history", async () => {
	const f = fixture();
	const plan = await prepareChatAccountSwitch({} as HostDb, input, f.deps);
	f.deps.inspect = mock(async () => ({
		...f.evidence,
		size: 20,
		sha256: "b".repeat(64),
	}));
	const ready = await plan.finish();
	expect(f.deps.inspect).toHaveBeenCalledWith(
		expect.objectContaining({ previous: f.evidence }),
	);
	expect(ready.account).toEqual(target);
	expect(f.deps.writers).toHaveBeenCalledWith({
		sessionId: "native-session",
		directories: ["/fixture/a", "/fixture/b"],
	});
	ready.assertCurrent();
	expect(f.deps.assertCurrent.mock.calls.at(-1)?.[0]).toEqual({
		...f.evidence,
		size: 20,
		sha256: "b".repeat(64),
	});
	plan.release();
	expect(f.release).toHaveBeenCalledTimes(1);
});

test("a replaced transcript or changed destination refuses post-exit preparation", async () => {
	for (const failure of ["inode", "identity"] as const) {
		const f = fixture();
		const plan = await prepareChatAccountSwitch({} as HostDb, input, f.deps);
		if (failure === "inode")
			f.deps.inspect = mock(async () => ({ ...f.evidence, inode: 99 }));
		else
			f.deps.prepare = mock(async () => ({
				...target,
				identity: "c".repeat(64),
			}));
		await expect(plan.finish()).rejects.toThrow(
			failure === "inode" ? "history moved" : "account changed",
		);
		plan.release();
	}
});

test("a surviving native writer or changed final checkpoint refuses launch authorization", async () => {
	const f = fixture();
	const plan = await prepareChatAccountSwitch({} as HostDb, input, f.deps);
	f.deps.writers = mock(async () => {
		throw new Error("writer remains");
	});
	await expect(plan.finish()).rejects.toThrow("writer remains");
	f.deps.writers = mock(async () => {});
	const ready = await plan.finish();
	f.deps.assertCurrent = mock(() => {
		throw new Error("checkpoint changed");
	});
	expect(() => ready.assertCurrent()).toThrow("checkpoint changed");
	plan.release();
});

for (const mutation of ["truncate", "rewrite"] as const) {
	test(`the host refuses ${mutation} of admitted bytes even when the file identity is unchanged`, async () => {
		const f = fixture();
		const plan = await prepareChatAccountSwitch({} as HostDb, input, f.deps);
		f.deps.inspect = mock(async () => ({
			...f.evidence,
			size: mutation === "truncate" ? 5 : f.evidence.size,
			sha256: "b".repeat(64),
		}));
		await expect(plan.finish()).rejects.toThrow("history moved");
		expect(f.deps.writers).not.toHaveBeenCalled();
		plan.release();
	});
}
