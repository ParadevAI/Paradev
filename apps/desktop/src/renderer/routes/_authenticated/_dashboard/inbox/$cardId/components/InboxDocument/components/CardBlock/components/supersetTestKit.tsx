import type { ComponentType, ReactNode } from "react";
import { stripeTestKit } from "./stripeTestKit";

interface RunInWorkspaceProps {
	tasks: {
		id: string;
		slug: string;
		title: string;
		description?: string | null;
		branch?: string | null;
	}[];
	onComplete: () => void;
	trigger?: ReactNode;
	align?: "start" | "end";
}

const AUTH = "renderer/lib/auth-client";
const LOCAL_HOST =
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider";
const HOST_WORKSPACES =
	"renderer/routes/_authenticated/providers/HostWorkspacesProvider";
const OPEN_PULL_REQUEST =
	"renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
const RUN_IN_WORKSPACE =
	"renderer/routes/_authenticated/_dashboard/tasks/components/RunInWorkspacePopoverV2";

/** The block test kit, plus what Superset's own cards reach for in the app around them: the router, the signed-in reader, this machine's host, and the task list's run-in-workspace picker. */
export async function supersetTestKit() {
	const kit = await stripeTestKit();
	const { afterAll, beforeEach, mock } = await import("bun:test");
	const { LOCAL_HOST_ID, VIEWER_ID } = await import("./supersetFixtures");
	const navigate = mock();
	const openPullRequest = mock();
	const picker: { props: RunInWorkspaceProps | null } = { props: null };

	const router = { ...(await import("@tanstack/react-router")) };
	mock.module("@tanstack/react-router", () => ({
		...router,
		useNavigate: () => navigate,
		Link: ({ children }: { children?: ReactNode }) => (
			<a href="/">{children}</a>
		),
	}));
	mock.module("renderer/lib/clickPolicy", () => ({
		useUrlLinkAction: () => () => null,
	}));
	mock.module("renderer/lib/electron-trpc", () => ({
		electronTrpc: {
			createClient: () => ({}),
			external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
		},
	}));
	const auth = { ...(await import(AUTH)) };
	mock.module(AUTH, () => ({
		...auth,
		authClient: new Proxy(auth.authClient, {
			get: (target, key, receiver) =>
				key === "useSession"
					? () => ({ data: { user: { id: VIEWER_ID } } })
					: Reflect.get(target, key, receiver),
		}),
	}));
	mock.module(LOCAL_HOST, () => ({
		useLocalHostService: () => ({
			machineId: LOCAL_HOST_ID,
			activeHostUrl: null,
		}),
	}));
	mock.module(HOST_WORKSPACES, () => ({
		useHostWorkspaces: () => ({
			workspaces: [],
			cache: { isSandboxHost: () => false, resolveHostUrl: () => null },
		}),
	}));
	mock.module("renderer/hooks/useRelayUrl", () => ({
		useRelayUrl: () => "wss://relay.invalid",
	}));
	mock.module(OPEN_PULL_REQUEST, () => ({
		useOpenPullRequestInApp: () => openPullRequest,
	}));
	mock.module(RUN_IN_WORKSPACE, () => ({
		RunInWorkspacePopoverV2: (props: RunInWorkspaceProps) => {
			picker.props = props;
			return props.trigger;
		},
	}));

	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);

	beforeEach(() => {
		navigate.mockClear();
		openPullRequest.mockClear();
		picker.props = null;
	});
	afterAll(() => {
		mock.module(AUTH, () => auth);
	});

	/** The block inside the query cache the sidebar's rows read. */
	function inApp<Props extends object>(Block: ComponentType<Props>) {
		return function InApp(props: Props) {
			return (
				<QueryClientProvider client={new QueryClient()}>
					<Block {...props} />
				</QueryClientProvider>
			);
		};
	}

	/** The sentence a switched-off action shows on hover. */
	const reason = async (button: HTMLElement) => {
		await kit.act(async () => {
			kit.fireEvent.focus(button.parentElement as HTMLElement);
			await new Promise((resolve) => setTimeout(resolve, 350));
		});
		return document.body.querySelector("[role=tooltip]")?.textContent ?? null;
	};

	return { ...kit, inApp, reason, navigate, openPullRequest, picker };
}
