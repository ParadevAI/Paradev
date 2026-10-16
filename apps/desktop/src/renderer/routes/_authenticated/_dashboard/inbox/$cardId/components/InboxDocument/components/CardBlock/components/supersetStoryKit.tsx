import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CollectionsContext } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { LOCAL_HOST_ID } from "./supersetFixtures";

type Value<Provider extends (props: never) => unknown> = NonNullable<
	Parameters<Provider>[0]["value"]
>;
type CloudClient = ComponentProps<typeof cloudTrpc.Provider>["client"];

const localHost: Value<typeof LocalHostServiceContext.Provider> = {
	machineId: LOCAL_HOST_ID,
	activeHostUrl: null,
	activeOrganizationId: null,
	activeOrganizationName: null,
	hostServiceStatus: "stopped",
	waitForHostReady: async () => null,
};
const hostWorkspaces = {
	workspaces: [],
	isReady: true,
	cache: { isSandboxHost: () => false, resolveHostUrl: () => null },
} as unknown as Value<typeof HostWorkspacesContext.Provider>;
const collections = {
	activeOrganizationId: "org_lumen_labs",
} as unknown as Value<typeof CollectionsContext.Provider>;

// The Electron preload sets this; the device picker reads the app version from it.
window.App ??= { appVersion: "0.0.0" } as typeof window.App;

function createClients() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(["relay-endpoint"], { url: "wss://relay.invalid" });
	const cloudClient = cloudTrpc.createClient({
		links: [() => () => observable(() => {})],
	}) as CloudClient;
	return { queryClient, cloudClient };
}

/** What Superset's own cards reach for in the app around them, for stories: a signed-in machine with no hosts answering and a cloud API that never answers. */
export function SupersetStoryApp({ children }: { children: ReactNode }) {
	const [{ queryClient, cloudClient }] = useState(createClients);
	return (
		<QueryClientProvider client={queryClient}>
			<cloudTrpc.Provider client={cloudClient} queryClient={queryClient}>
				<CollectionsContext.Provider value={collections}>
					<LocalHostServiceContext.Provider value={localHost}>
						<HostWorkspacesContext.Provider value={hostWorkspaces}>
							{children}
						</HostWorkspacesContext.Provider>
					</LocalHostServiceContext.Provider>
				</CollectionsContext.Provider>
			</cloudTrpc.Provider>
		</QueryClientProvider>
	);
}
