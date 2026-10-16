/**
 * Stands in for renderer/lib/trpc-client under Storybook, where there is no
 * Electron preload to expose the IPC bridge. Importing the real module throws
 * before any story renders; this one only throws if a story actually calls a
 * procedure, which names the component that still needs a prop instead.
 * Subscriptions stay open and silent, as if the main process never sent
 * anything, so stores that subscribe at import keep their defaults.
 */
const unavailable = (path: string[]): unknown =>
	new Proxy(() => undefined, {
		get: (_target, key) =>
			typeof key === "symbol" ? undefined : unavailable([...path, key]),
		apply: () => {
			if (path.at(-1) === "subscribe") return { unsubscribe: () => undefined };
			throw new Error(
				`electronTrpc.${path.join(".")} is not available in Storybook; pass the value in as a prop`,
			);
		},
	});

export const electronReactClient = unavailable(["react"]);
export const electronTrpcClient = unavailable([]);
