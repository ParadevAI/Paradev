import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import { createContext, type ReactNode } from "react";
import { stripeTestKit } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock/components/stripeTestKit";

const { act, render } = await stripeTestKit();
// Other test files replace this module for the whole process. When one has, put a working client in its place.
const loaded = await import("renderer/lib/cloud-trpc").catch(() => null);
const working = Boolean(
	(loaded?.cloudTrpc as { createClient?: unknown } | undefined)?.createClient,
);
const cloudTrpc =
	working && loaded
		? loaded.cloudTrpc
		: createTRPCReact<AppRouter>({ context: createContext(null) });
if (!working)
	mock.module("renderer/lib/cloud-trpc", () => ({ ...loaded, cloudTrpc }));
const { useInboxSelectionStore } = await import(
	"renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore"
);
const { useInboxCard } = await import("./useInboxCard");

type Listed = ReturnType<
	typeof useInboxSelectionStore.getState
>["cards"][string];
type Document = NonNullable<
	ReturnType<typeof useInboxCard>["document"]["data"]
>;

/** A network that never answers: whatever renders did not wait for it. */
let requested: string[] = [];
const silent: TRPCLink<AppRouter> = () => (opts) =>
	observable(() => {
		requested.push(opts.op.path);
	});

const listed = (id: string, hasDocument: boolean) =>
	({ id, title: `Card ${id}`, why: "Because", hasDocument }) as Listed;
const document = { version: 3, blocks: [] } as unknown as Document;

let seen: { title?: string; version?: number; placeholder: boolean }[] = [];
function Probe({ cardId }: { cardId: string }) {
	const { card, document } = useInboxCard(cardId);
	seen.push({
		title: card.data?.title,
		version: document.data?.version,
		placeholder: card.isPlaceholderData,
	});
	return null;
}
function mount(cardId: string, seed?: (client: QueryClient) => void) {
	const queryClient = new QueryClient();
	const client = cloudTrpc.createClient({ links: [silent] });
	function Seed({ children }: { children: ReactNode }) {
		const utils = cloudTrpc.useUtils();
		if (seed && !utils.inbox.document.getData({ id: "a" }))
			utils.inbox.document.setData({ id: "a" }, document);
		return children;
	}
	const tree = (id: string) => (
		<cloudTrpc.Provider client={client} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<Seed>
					<Probe cardId={id} />
				</Seed>
			</QueryClientProvider>
		</cloudTrpc.Provider>
	);
	const view = render(tree(cardId));
	return { ...view, show: (id: string) => view.rerender(tree(id)) };
}
const rest = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 200));
	});

beforeEach(() => {
	requested = [];
	seen = [];
	useInboxSelectionStore.setState({
		cards: {
			a: listed("a", true),
			b: listed("b", true),
			c: listed("c", false),
		},
	});
});

describe("a card opens before the network answers", () => {
	test("a card read before renders its title and document on the first render, with no answer from the network", () => {
		mount("a", () => {});
		expect(seen[0]).toEqual({ title: "Card a", version: 3, placeholder: true });
	});

	test("a card not read before renders its shell from the list on the first render; its document is what waits", () => {
		mount("b");
		expect(seen[0]).toEqual({
			title: "Card b",
			version: undefined,
			placeholder: true,
		});
		expect(requested).toContain("inbox.document");
	});

	test("selecting another cached card renders it in the same render, before any load starts", () => {
		const view = mount("b", () => {});
		requested = [];
		seen = [];
		view.show("a");
		expect(seen[0]).toEqual({ title: "Card a", version: 3, placeholder: true });
		expect(requested).toEqual([]);
	});

	test("cards passed over by a held key are not loaded; the one the selection rests on is", async () => {
		const view = mount("c");
		await rest();
		requested = [];
		view.show("a");
		view.show("b");
		view.show("c");
		view.show("b");
		await rest();
		expect(requested.filter((path) => path === "inbox.document")).toHaveLength(
			1,
		);
		expect(requested.filter((path) => path === "inbox.get")).toHaveLength(1);
	});
});
