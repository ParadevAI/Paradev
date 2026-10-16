/**
 * Stands in for renderer/lib/electron-trpc under Storybook, where no tRPC
 * provider is mounted. Hooks return inert results: a mutation that does
 * nothing, a query with no data. A story that needs real data passes it in
 * as props.
 */
const inert = {
	data: undefined,
	error: null,
	isPending: false,
	isLoading: false,
	isError: false,
	isSuccess: false,
	mutate: () => undefined,
	mutateAsync: async () => undefined,
	refetch: async () => undefined,
};

const lenient = (): unknown =>
	new Proxy(() => inert, {
		get: (_target, key) => (typeof key === "symbol" ? undefined : lenient()),
		apply: () => inert,
	});

export const electronTrpc = lenient();
