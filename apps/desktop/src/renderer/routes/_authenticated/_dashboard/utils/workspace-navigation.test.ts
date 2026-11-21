import { afterEach, expect, spyOn, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import {
	navigateToWorkspace,
	navigateToWorkspaceAndThen,
} from "./workspace-navigation";

const originalFrame = Object.getOwnPropertyDescriptor(
	globalThis,
	"requestAnimationFrame",
);
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	if (originalFrame)
		Object.defineProperty(globalThis, "requestAnimationFrame", originalFrame);
	else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
});

async function setup(loader?: (workspaceId: string) => Promise<void>) {
	const root = createRootRoute();
	const workspace = createRoute({
		getParentRoute: () => root,
		path: "/workspace/$workspaceId",
		validateSearch: (search: Record<string, unknown>) => search,
		loader: ({ params }) => loader?.(params.workspaceId),
	});
	const other = createRoute({ getParentRoute: () => root, path: "/other" });
	const router = createRouter({
		routeTree: root.addChildren([workspace, other]),
		history: createMemoryHistory({ initialEntries: ["/workspace/a"] }),
	});
	cleanups.push(
		router.history.subscribe(() => {
			void router.load();
		}),
	);
	await router.load();
	const frames: FrameRequestCallback[] = [];
	const tasks: (() => void)[] = [];
	Object.defineProperty(globalThis, "requestAnimationFrame", {
		configurable: true,
		value: (callback: FrameRequestCallback) => frames.push(callback),
	});
	const frame = () => {
		const originalTimeout = globalThis.setTimeout;
		globalThis.setTimeout = ((callback: () => void) => {
			tasks.push(callback);
			return 1;
		}) as unknown as typeof setTimeout;
		try {
			for (const callback of frames.splice(0)) callback(0);
		} finally {
			globalThis.setTimeout = originalTimeout;
		}
	};
	const flush = async () => {
		frame();
		for (const callback of tasks.splice(0)) callback();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	};
	return { router, frames, tasks, frame, flush };
}

test("follow-up waits for navigation and a paint opportunity without extending navigation", async () => {
	const pending = Promise.withResolvers<void>();
	const { router, frames, tasks, frame, flush } = await setup((id) =>
		id === "b" ? pending.promise : Promise.resolve(),
	);
	let ran = false;
	const switched = navigateToWorkspaceAndThen("b", router, () => {
		ran = true;
	});
	expect(frames).toHaveLength(0);
	pending.resolve();
	await switched;
	expect(ran).toBe(false);
	expect(frames).toHaveLength(1);
	frame();
	expect(tasks).toHaveLength(1);
	expect(ran).toBe(false);
	await flush();
	expect(ran).toBe(true);
});

test("deep-link search and replace options reach the router without callback data", async () => {
	const { router, flush } = await setup();
	let ran = false;
	await navigateToWorkspaceAndThen(
		"b",
		router,
		() => {
			ran = true;
		},
		{
			replace: true,
			search: { terminalId: "terminal-1", focusRequestId: "focus-1" },
		},
	);
	expect(router.state.location.pathname).toBe("/workspace/b");
	expect(router.state.location.search).toEqual({
		terminalId: "terminal-1",
		focusRequestId: "focus-1",
	});
	expect(router.history.length).toBe(1);
	await flush();
	expect(ran).toBe(true);
});

test("consuming a deep-link search keeps the same workspace follow-up", async () => {
	const { router, flush } = await setup();
	let ran = false;
	await navigateToWorkspaceAndThen(
		"b",
		router,
		() => {
			ran = true;
		},
		{ search: { terminalId: "terminal-1" } },
	);
	await navigateToWorkspace("b", router.navigate, { replace: true });
	await flush();
	expect(router.state.location.search).toEqual({});
	expect(ran).toBe(true);
});

test("a rejected navigation does not schedule follow-up work", async () => {
	const { router, frames } = await setup();
	const failure = new Error("navigation rejected");
	const navigate = spyOn(router, "navigate").mockRejectedValue(failure);
	cleanups.push(() => navigate.mockRestore());
	await expect(
		navigateToWorkspaceAndThen("b", router, () => {
			throw new Error("must not run");
		}),
	).rejects.toBe(failure);
	expect(frames).toHaveLength(0);
});

test("blocked navigation leaves destination follow-up work untouched", async () => {
	const { router, frames, flush } = await setup();
	const blocked = Promise.withResolvers<void>();
	const unblock = router.history.block({
		blockerFn: () => {
			blocked.resolve();
			return true;
		},
	});
	cleanups.push(unblock);
	let ran = false;
	const attempted = navigateToWorkspaceAndThen("b", router, () => {
		ran = true;
	});
	await blocked.promise;
	expect(router.state.location.pathname).toBe("/workspace/a");
	expect(frames).toHaveLength(0);
	unblock();
	await navigateToWorkspace("c", router.navigate);
	await attempted;
	await flush();
	expect(ran).toBe(false);
});

test("an asynchronous blocker can allow navigation without losing its follow-up", async () => {
	const { router, flush } = await setup();
	const decision = Promise.withResolvers<boolean>();
	const unblock = router.history.block({ blockerFn: () => decision.promise });
	cleanups.push(unblock);
	let ran = false;
	const navigation = navigateToWorkspaceAndThen("b", router, () => {
		ran = true;
	});
	decision.resolve(false);
	await navigation;
	await flush();
	expect(router.state.location.pathname).toBe("/workspace/b");
	expect(ran).toBe(true);
});

test("clicking the current workspace still performs its follow-up once", async () => {
	const { router, flush } = await setup();
	let runs = 0;
	await navigateToWorkspaceAndThen("a", router, () => {
		runs++;
	});
	await flush();
	expect(runs).toBe(1);
});

test("a destination loader error does not mark the workspace seen", async () => {
	const { router, frames } = await setup(async (id) => {
		if (id === "b") throw new Error("destination failed");
	});
	await navigateToWorkspaceAndThen("b", router, () => {});
	expect(router.state.matches.some((match) => match.status === "error")).toBe(
		true,
	);
	expect(frames).toHaveLength(0);
});

test("a superseded navigation never clears attention for the unvisited workspace", async () => {
	const pending = Promise.withResolvers<void>();
	const entered = Promise.withResolvers<void>();
	const { router, flush } = await setup((id) => {
		if (id !== "b") return Promise.resolve();
		entered.resolve();
		return pending.promise;
	});
	const seen: string[] = [];
	const first = navigateToWorkspaceAndThen("b", router, () => {
		seen.push("b");
	});
	await entered.promise;
	const second = navigateToWorkspaceAndThen("c", router, () => {
		seen.push("c");
	});
	await second;
	pending.resolve();
	await first;
	await flush();
	expect(router.state.location.pathname).toBe("/workspace/c");
	expect(seen).toEqual(["c"]);
});

test("leaving after resolution cancels queued work even when returning to the same workspace", async () => {
	const { router, frame, flush } = await setup();
	let ran = false;
	await navigateToWorkspaceAndThen("b", router, () => {
		ran = true;
	});
	frame();
	await navigateToWorkspace("c", router.navigate);
	await navigateToWorkspace("b", router.navigate);
	await flush();
	expect(ran).toBe(false);
});

test.each([
	"throw",
	"reject",
])("follow-up %s is reported without rejecting completed navigation", async (mode) => {
	const { router, flush } = await setup();
	const failure = new Error(`follow-up ${mode}`);
	const errors = spyOn(console, "error").mockImplementation(() => {});
	cleanups.push(() => errors.mockRestore());
	await navigateToWorkspaceAndThen("b", router, () => {
		if (mode === "throw") throw failure;
		return Promise.reject(failure);
	});
	await flush();
	expect(router.state.location.pathname).toBe("/workspace/b");
	expect(errors).toHaveBeenCalledWith(
		"[renderer] Error boundary caught:",
		failure,
		undefined,
	);
});
