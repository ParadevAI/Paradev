import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "lib/trpc/routers";
import { createHostUsageStore } from "main/lib/host-usage/store";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { UsageAccount } from "shared/host-usage-observation";
import { useHostUsageQuota } from "./useHostUsageQuota";

const clients: QueryClient[] = [];
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});
function account(accountKey: string): UsageAccount[] {
	return [
		{
			agent: "claude",
			credentialKind: "subscription",
			accountKey,
			sourceLabel: accountKey,
			email: null,
			plan: null,
			status: "ok",
			statusDetail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: null,
			isDefault: false,
			fetchedAt: new Date(0),
		},
	];
}
function Probe({ name }: { name: string }) {
	const quota = useHostUsageQuota("http://127.0.0.1:1234");
	return (
		<div>
			<span data-testid={name}>
				{quota.data?.[0]?.accountKey ?? "pending"}:
				{quota.isError ? "offline" : "current"}
			</span>
			<button
				type="button"
				data-testid={`${name}-refresh`}
				onClick={() => void quota.refresh()}
			>
				Refresh
			</button>
		</div>
	);
}

test("two real hook consumers share refresh and failure state through the desktop subscription", async () => {
	let value = account("first");
	let offline = false;
	let reads = 0;
	const store = createHostUsageStore(() => ({
		key: "scope-a",
		load: async () => {
			reads++;
			if (offline) throw new Error("offline");
			return value;
		},
	}));
	const link: TRPCLink<AppRouter> =
		() =>
		({ op }) =>
			observable((observer) => {
				const input = op.input as { hostUrl: string; forceRefresh?: boolean };
				if (op.type === "subscription") {
					const unlisten = store.subscribe((data) => {
						if (data.hostUrl === input.hostUrl)
							observer.next({ result: { type: "data", data } });
					});
					const current = store.peek(input.hostUrl);
					if (current)
						observer.next({ result: { type: "data", data: current } });
					return unlisten;
				}
				if (op.path !== "hostUsage.read") {
					observer.error(
						TRPCClientError.from(new Error("Unexpected direct fallback")),
					);
					return;
				}
				void store.read(input.hostUrl, input.forceRefresh).then(
					(data) => {
						observer.next({ result: { data } });
						observer.complete();
					},
					(error) => observer.error(error),
				);
			});
	for (const name of ["left", "right"]) {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: Infinity } },
		});
		clients.push(queryClient);
		const client = electronTrpc.createClient({ links: [link] });
		render(
			<electronTrpc.Provider client={client} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>
					<Probe name={name} />
				</QueryClientProvider>
			</electronTrpc.Provider>,
		);
	}
	await waitFor(() => {
		expect(screen.getByTestId("left").textContent).toBe("first:current");
		expect(screen.getByTestId("right").textContent).toBe("first:current");
	});
	const before = reads;
	value = account("second");
	fireEvent.click(screen.getByTestId("left-refresh"));
	await waitFor(() => {
		expect(screen.getByTestId("left").textContent).toBe("second:current");
		expect(screen.getByTestId("right").textContent).toBe("second:current");
	});
	expect(reads).toBe(before + 1);
	offline = true;
	await act(async () => {
		await store.read("http://127.0.0.1:1234");
	});
	await waitFor(() => {
		expect(screen.getByTestId("left").textContent).toBe("second:offline");
		expect(screen.getByTestId("right").textContent).toBe("second:offline");
	});
});

test("an initial unavailable host does not start an observation reset loop", async () => {
	let reads = 0;
	const store = createHostUsageStore(() => ({
		key: "scope-a",
		load: async () => {
			reads++;
			throw new Error("offline");
		},
	}));
	const link: TRPCLink<AppRouter> =
		() =>
		({ op }) =>
			observable((observer) => {
				const input = op.input as { hostUrl: string; forceRefresh?: boolean };
				if (op.type === "subscription") {
					const unlisten = store.subscribe((data) => {
						if (data.hostUrl === input.hostUrl)
							observer.next({ result: { type: "data", data } });
					});
					const current = store.peek(input.hostUrl);
					if (current)
						observer.next({ result: { type: "data", data: current } });
					return unlisten;
				}
				void store.read(input.hostUrl, input.forceRefresh).then(
					(data) => {
						observer.next({ result: { data } });
						observer.complete();
					},
					(error) => observer.error(error),
				);
			});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	clients.push(queryClient);
	const client = electronTrpc.createClient({ links: [link] });
	render(
		<electronTrpc.Provider client={client} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<Probe name="first-failure" />
			</QueryClientProvider>
		</electronTrpc.Provider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId("first-failure").textContent).toBe(
			"pending:offline",
		),
	);
	expect(reads).toBe(1);
});
