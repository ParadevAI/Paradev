import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: the page renders real
// markup through React. Bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so unregister in afterAll to restore
// the shared mock document for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The session the recovery hook reports. Each case swaps it before rendering;
// the hook itself is covered by its own suite.
const retrySession = mock(() => {});
let sessionState: {
	hasLocalToken: boolean;
	isPending: boolean;
	session: { user: { id: string } } | null;
	sessionError: unknown;
	refetchSession: () => void;
} = {
	hasLocalToken: true,
	isPending: false,
	session: null,
	sessionError: null,
	refetchSession: retrySession,
};

// Spread the real module so the page keeps the real isNetworkFetchError (the
// behaviour under test); only the hook's session input is swapped.
const realRecovery = await import("./hooks/useSessionRecovery");
mock.module("./hooks/useSessionRecovery", () => ({
	...realRecovery,
	useSessionRecovery: () => sessionState,
}));
// Spread the real module: replacing it wholesale drops the exports other
// renderer code imported at module load (Link, Navigate, useRouter, ...).
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...realRouter,
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => () => {},
}));
mock.module("renderer/lib/analytics", () => ({ track: () => {} }));
// A full stub rather than a spread: the real client is a proxy, so spreading it
// drops createClient, which renderer/lib/trpc-client calls at module load.
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		auth: {
			signIn: { useMutation: () => ({ mutate: () => {}, isPending: false }) },
			persistToken: { useMutation: () => ({ mutateAsync: async () => {} }) },
		},
	},
}));
const realEnv = await import("renderer/env.renderer");
mock.module("renderer/env.renderer", () => ({
	...realEnv,
	env: { ...realEnv.env, NODE_ENV: "production" },
}));

const { SignInPage } = await import("./page");
const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const NETWORK_ERROR = new TypeError("Failed to fetch");

function setSession(next: {
	hasLocalToken?: boolean;
	isPending?: boolean;
	session?: { user: { id: string } } | null;
	sessionError?: unknown;
}) {
	sessionState = { ...sessionState, ...next };
}

describe("SignInPage", () => {
	test("names the unreachable API host when the session fetch fails on the network", () => {
		setSession({ hasLocalToken: true, sessionError: NETWORK_ERROR });

		const { container } = render(<SignInPage />);

		expect(container.textContent).toContain("Can't reach api.superset.sh");
		expect(container.textContent).toContain(
			"Check your network, VPN, or DNS filter",
		);

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(retrySession).toHaveBeenCalledTimes(1);
	});

	test("stays quiet while the session request is still in flight", () => {
		setSession({ hasLocalToken: true, isPending: true, sessionError: null });

		const { container } = render(<SignInPage />);

		expect(container.textContent).not.toContain("Can't reach");
	});

	test("stays quiet when the API answered and simply has no session", () => {
		setSession({ hasLocalToken: false, isPending: false, sessionError: null });

		const { container } = render(<SignInPage />);

		expect(container.textContent).not.toContain("Can't reach");
		expect(container.textContent).toContain("Sign in to get started");
	});

	test("stays quiet when the API rejected the session over HTTP", () => {
		setSession({
			hasLocalToken: true,
			sessionError: { status: 401, message: "Unauthorized" },
		});

		const { container } = render(<SignInPage />);

		expect(container.textContent).not.toContain("Can't reach");
	});
});
