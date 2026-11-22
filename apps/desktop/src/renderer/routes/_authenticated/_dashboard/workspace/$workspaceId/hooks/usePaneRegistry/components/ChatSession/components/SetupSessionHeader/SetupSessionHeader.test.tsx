import { describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { cleanup, render } = await import("@testing-library/react");
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { SetupSessionHeader } = await import("./SetupSessionHeader");

describe("SetupSessionHeader", () => {
	test("names the environment being set up", async () => {
		const link: TRPCLink<AppRouter> = () => () =>
			observable((observer) => {
				observer.next({ result: { data: { id: "env-1", name: "superset" } } });
				observer.complete();
			});
		const view = render(
			<cloudTrpc.Provider
				client={cloudTrpc.createClient({ links: [link] })}
				queryClient={new QueryClient()}
			>
				<SetupSessionHeader environmentId="env-1" />
			</cloudTrpc.Provider>,
		);
		expect(view.container.textContent).toContain("Cloud environment setup");
		await view.findByText("superset");
		cleanup();
	});
});
