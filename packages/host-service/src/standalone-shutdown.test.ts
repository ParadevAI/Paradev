import { expect, test } from "bun:test";
import { createStandaloneShutdown } from "./standalone-shutdown";

function setup(
	overrides: Partial<Parameters<typeof createStandaloneShutdown>[0]> = {},
) {
	const calls: string[] = [];
	let deadline = () => {};
	const shutdown = createStandaloneShutdown({
		stopServing: async () => {
			calls.push("stop serving");
		},
		dispose: async () => {
			calls.push("dispose");
		},
		exit: (code) => {
			calls.push(`exit ${code}`);
		},
		hardExit: () => {
			calls.push("hard exit");
		},
		scheduleDeadline: (callback) => {
			deadline = callback;
			return () => {
				calls.push("cancel deadline");
			};
		},
		log: () => {},
		...overrides,
	});
	return { shutdown, calls, deadline: () => deadline() };
}

test("stops serving and disposes before exiting, cancelling the deadline", async () => {
	const { shutdown, calls, deadline } = setup();
	await shutdown("SIGTERM");
	deadline();
	expect(calls).toEqual([
		"stop serving",
		"dispose",
		"cancel deadline",
		"exit 0",
	]);
});

test("stops the development daemon before disposing the app", async () => {
	const events: string[] = [];
	const { shutdown } = setup({
		stopServing: async () => {
			events.push("server");
		},
		stopDaemon: async () => {
			events.push("daemon");
		},
		dispose: async () => {
			events.push("dispose");
		},
	});
	await shutdown("SIGINT");
	expect(events).toEqual(["server", "daemon", "dispose"]);
});

test.each([
	"server",
	"daemon",
	"dispose",
])("a failing %s cleanup does not skip the remaining steps", async (failing) => {
	const events: string[] = [];
	const step = async (name: string) => {
		events.push(name);
		if (name === failing) throw new Error(`${name} failed`);
	};
	const { shutdown, calls } = setup({
		stopServing: () => step("server"),
		stopDaemon: () => step("daemon"),
		dispose: () => step("dispose"),
	});
	await shutdown("SIGTERM");
	expect(events).toEqual(["server", "daemon", "dispose"]);
	expect(calls).toEqual(["cancel deadline", "exit 0"]);
});

test.each([
	"deadline",
	"second signal",
])("hard-exits on %s without exiting again after disposal resolves", async (reason) => {
	const pending = Promise.withResolvers<void>();
	const entered = Promise.withResolvers<void>();
	const { shutdown, calls, deadline } = setup({
		dispose: () => {
			entered.resolve();
			return pending.promise;
		},
	});
	const first = shutdown("SIGTERM");
	await entered.promise;
	if (reason === "deadline") deadline();
	else await shutdown("SIGINT");
	pending.resolve();
	await first;
	expect(calls).toEqual(["stop serving", "cancel deadline", "hard exit"]);
});
