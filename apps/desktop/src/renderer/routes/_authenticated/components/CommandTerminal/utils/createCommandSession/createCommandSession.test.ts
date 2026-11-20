import { expect, mock, test } from "bun:test";
import {
	type CommandTransport,
	createCommandSession,
} from "./createCommandSession";

function setup() {
	let resolveCreate!: () => void;
	let rejectCreate!: (error: unknown) => void;
	const created = new Promise<void>((resolve, reject) => {
		resolveCreate = resolve;
		rejectCreate = reject;
	});
	let events!: Parameters<CommandTransport["subscribe"]>[0];
	const unsubscribe = mock(() => {});
	const transport = {
		subscribe: (handlers: typeof events) => {
			events = handlers;
			return { unsubscribe };
		},
		create: mock(() => created),
		write: mock(async (_data: string) => {}),
		resize: mock(async (_size: { cols: number; rows: number }) => {}),
		kill: mock(async () => {}),
	};
	const onOutput = mock((_data: string) => {});
	const onExit = mock((_code: number | null) => {});
	const onError = mock((_error: unknown) => {});
	const session = createCommandSession({
		transport,
		size: { cols: 80, rows: 24 },
		onOutput,
		onExit,
		onError,
	});
	return {
		session,
		transport,
		events,
		unsubscribe,
		onOutput,
		onExit,
		onError,
		resolveCreate,
		rejectCreate,
	};
}

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("waits for subscription, starts once, and forwards output during creation", async () => {
	const t = setup();
	expect(t.transport.create).not.toHaveBeenCalled();
	t.events.onStarted();
	t.events.onStarted();
	t.events.onData({ type: "data", data: "Paste code > " });
	expect(t.transport.create).toHaveBeenCalledTimes(1);
	expect(t.onOutput).toHaveBeenCalledWith("Paste code > ");
	t.resolveCreate();
	await settle();
	t.session.dispose();
});

test("queues input and the latest size until the process exists", async () => {
	const t = setup();
	t.session.write("a");
	t.session.resize({ cols: 100, rows: 30 });
	t.events.onStarted();
	t.session.write("b");
	t.session.resize({ cols: 120, rows: 40 });
	expect(t.transport.write).not.toHaveBeenCalled();
	expect(t.transport.resize).not.toHaveBeenCalled();
	t.resolveCreate();
	await settle();
	expect(t.transport.create).toHaveBeenCalledWith({ cols: 100, rows: 30 });
	expect(t.transport.write.mock.calls).toEqual([["a"], ["b"]]);
	expect(t.transport.resize).toHaveBeenCalledWith({ cols: 120, rows: 40 });
	t.session.dispose();
});

test("closing before subscription starts prevents process creation", () => {
	const t = setup();
	t.session.dispose();
	t.events.onStarted();
	expect(t.transport.create).not.toHaveBeenCalled();
	expect(t.unsubscribe).toHaveBeenCalledTimes(1);
});

test("closing during creation kills the late process and drops queued input", async () => {
	const t = setup();
	t.events.onStarted();
	t.session.write("queued");
	t.session.dispose();
	t.session.dispose();
	t.resolveCreate();
	await settle();
	t.events.onData({ type: "data", data: "late" });
	expect(t.transport.kill).toHaveBeenCalledTimes(1);
	expect(t.transport.write).not.toHaveBeenCalled();
	expect(t.onOutput).not.toHaveBeenCalled();
	expect(t.onExit).not.toHaveBeenCalled();
	expect(t.unsubscribe).toHaveBeenCalledTimes(1);
});

test("reports an early exit once and never flushes input into an exited process", async () => {
	const t = setup();
	t.events.onStarted();
	t.session.write("queued");
	t.events.onData({ type: "exit", exitCode: 0 });
	t.resolveCreate();
	await settle();
	t.events.onData({ type: "exit", exitCode: 1 });
	expect(t.onExit.mock.calls).toEqual([[0]]);
	expect(t.transport.write).not.toHaveBeenCalled();
	expect(t.transport.kill).toHaveBeenCalledTimes(1);
	t.session.dispose();
});

test("reports a failed create instead of leaving input queued forever", async () => {
	const t = setup();
	t.events.onStarted();
	const error = new Error("spawn failed");
	t.rejectCreate(error);
	await settle();
	expect(t.onError).toHaveBeenCalledWith(error);
	expect(t.onExit.mock.calls).toEqual([[null]]);
	t.session.write("ignored");
	expect(t.transport.write).not.toHaveBeenCalled();
	t.session.dispose();
});

test.each([
	"write",
	"resize",
] as const)("a rejected %s ends and cleans up the session", async (operation) => {
	const t = setup();
	t.events.onStarted();
	t.resolveCreate();
	await settle();
	t.transport[operation].mockRejectedValueOnce(new Error("connection lost"));
	if (operation === "write") t.session.write("input");
	else t.session.resize({ cols: 90, rows: 30 });
	await settle();
	expect(t.onExit.mock.calls).toEqual([[null]]);
	expect(t.transport.kill).toHaveBeenCalledTimes(1);
	t.session.dispose();
	expect(t.transport.kill).toHaveBeenCalledTimes(1);
});

test("disconnect and subsequent subscription errors only finish once", async () => {
	const t = setup();
	t.events.onStarted();
	t.resolveCreate();
	await settle();
	t.events.onData({ type: "disconnect", reason: "daemon stopped" });
	t.events.onError(new Error("stream closed"));
	expect(t.onError).toHaveBeenCalledTimes(1);
	expect(t.onExit.mock.calls).toEqual([[null]]);
	expect(t.transport.kill).toHaveBeenCalledTimes(1);
	t.session.dispose();
});

test("a rejected create after disposal still cleans up a possibly spawned command", async () => {
	const t = setup();
	t.events.onStarted();
	t.session.dispose();
	t.rejectCreate(new Error("response lost"));
	await Promise.resolve();
	expect(t.transport.kill).toHaveBeenCalledTimes(1);
});
