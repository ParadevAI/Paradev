import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ContextType } from "react";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import superjson from "superjson";
import { AddAccountDialog } from "./AddAccountDialog";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const HOME = "/home/test";
const RUN_HINT = "Run in a terminal on this host:";
const SIGNED_IN = "is signed in.";

interface CodexLogin {
	home: string;
	fingerprint: string | null;
	credentialKind: "subscription";
	/** Left out to stand for a host older than the field. */
	createdByParadev?: boolean;
}

const AMBIENT: CodexLogin = {
	home: `${HOME}/.codex`,
	fingerprint: null,
	credentialKind: "subscription",
	createdByParadev: false,
};

function codexLogin(
	name: string,
	fingerprint: string,
	createdByParadev?: boolean,
): CodexLogin {
	return {
		home: `${HOME}/.codex-${name}`,
		fingerprint,
		credentialKind: "subscription",
		...(createdByParadev === undefined ? {} : { createdByParadev }),
	};
}

function logins(...codex: CodexLogin[]) {
	return {
		homeDir: HOME,
		claudeDefaultFingerprint: null,
		claudeDefaultEmail: null,
		claude: [],
		codex: [AMBIENT, ...codex],
	};
}

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

/** A host whose usage.logins answer the test sets, and can hold back. */
function startHost() {
	let release = () => {};
	const host = {
		logins: logins(),
		held: null as Promise<void> | null,
		prepared: [] as unknown[],
		url: "",
		hold() {
			host.held = new Promise((resolve) => {
				release = resolve;
			});
		},
		release() {
			host.held = null;
			release();
		},
	};
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		usage: t.router({
			logins: t.procedure.query(async () => {
				await host.held;
				return host.logins;
			}),
			prepareAccount: t.procedure
				.input((input) => input)
				.mutation(({ input }) => {
					host.prepared.push(input);
					return { success: true as const };
				}),
		}),
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request) =>
			fetchRequestHandler({
				endpoint: "/trpc",
				req: request,
				router,
				allowMethodOverride: true,
			}),
	});
	stopHost = () => void server.stop(true);
	host.url = `http://127.0.0.1:${server.port}`;
	return host;
}
type Host = ReturnType<typeof startHost>;

/**
 * Opens the Codex add dialog. A remote host shows the command to copy; the
 * local host runs it behind Sign in.
 */
function mount(host: Host, { local = false } = {}) {
	const queryClient = new QueryClient();
	let added = 0;
	const ui = (open: boolean) => (
		<QueryClientProvider client={queryClient}>
			<LocalHostServiceContext.Provider
				value={
					{
						activeHostUrl: local ? host.url : "http://127.0.0.1:1",
					} as NonNullable<ContextType<typeof LocalHostServiceContext>>
				}
			>
				<AddAccountDialog
					open={open}
					onOpenChange={() => {}}
					hostUrl={host.url}
					agent="codex"
					onAccountAdded={() => {
						added++;
					}}
					onDefaultSwitched={() => {}}
				/>
			</LocalHostServiceContext.Provider>
		</QueryClientProvider>
	);
	const view = render(ui(true));
	return {
		view,
		added: () => added,
		setOpen: (open: boolean) => act(() => view.rerender(ui(open))),
		typeName: (name: string) =>
			act(() =>
				fireEvent.change(view.getByLabelText("Profile name"), {
					target: { value: name },
				}),
			),
		/** One logins poll, answered and rendered. */
		poll: () =>
			act(async () => {
				await queryClient.refetchQueries({
					queryKey: ["host-usage-logins"],
					type: "active",
				});
				await new Promise((resolve) => setTimeout(resolve, 0));
			}),
	};
}

describe("adding a profile on a remote host", () => {
	test("shows the command once logins have loaded, for a usable name whose home is free", async () => {
		const host = startHost();
		host.logins = logins(codexLogin("personal", "a"));
		host.hold();
		const dialog = mount(host);

		await dialog.typeName("work");
		expect(dialog.view.queryByText(RUN_HINT)).toBeNull();

		host.release();
		await dialog.poll();
		expect(await dialog.view.findByText(RUN_HINT)).toBeDefined();

		await dialog.typeName("personal");
		expect(
			dialog.view.getByText(/already exists\. Choose another name\./),
		).toBeDefined();
		expect(dialog.view.queryByText(RUN_HINT)).toBeNull();

		await dialog.typeName("仕事");
		expect(
			dialog.view.getByText("Use letters A–Z, digits, or hyphens."),
		).toBeDefined();
		expect(dialog.view.queryByText(RUN_HINT)).toBeNull();

		await dialog.typeName("");
		expect(dialog.view.queryByText(RUN_HINT)).toBeNull();
	});

	test("finds and prepares the new profile's first sign-in", async () => {
		const host = startHost();
		const dialog = mount(host);
		await dialog.poll();
		await dialog.typeName("work");
		await dialog.poll();

		host.logins = logins(codexLogin("work", "a", true));
		await dialog.poll();

		expect(await dialog.view.findByText(SIGNED_IN)).toBeDefined();
		expect(dialog.added()).toBe(1);
		await waitFor(() =>
			expect(host.prepared).toEqual([
				{ agent: "codex", selection: `${HOME}/.codex-work` },
			]),
		);
	});

	test("after Remove, adds the same name again in one visit", async () => {
		const host = startHost();
		const dialog = mount(host);
		await dialog.poll();
		await dialog.typeName("work");
		await dialog.poll();
		host.logins = logins(codexLogin("work", "a", true));
		await dialog.poll();
		expect(await dialog.view.findByText(SIGNED_IN)).toBeDefined();

		await dialog.setOpen(false);
		host.logins = logins();
		await dialog.setOpen(true);
		await dialog.poll();
		await dialog.typeName("work");
		await dialog.poll();
		expect(await dialog.view.findByText(RUN_HINT)).toBeDefined();
		host.logins = logins(codexLogin("work", "b", true));
		await dialog.poll();

		expect(await dialog.view.findByText(SIGNED_IN)).toBeDefined();
		expect(dialog.added()).toBe(2);
		await waitFor(() => expect(host.prepared).toHaveLength(2));
	});

	// An older host does not say who created a dir, so only a baseline from
	// this opening keeps the dialog from taking that login as the new one.
	test("does not take a login made while the dialog was closed as the new profile", async () => {
		const host = startHost();
		const dialog = mount(host);
		await dialog.poll();
		await dialog.setOpen(false);
		host.logins = logins(codexLogin("other", "x"));

		await dialog.setOpen(true);
		await dialog.typeName("other");
		await dialog.poll();
		await dialog.poll();

		expect(
			dialog.view.getByText(/already exists\. Choose another name\./),
		).toBeDefined();
		expect(dialog.view.queryByText(SIGNED_IN)).toBeNull();
		expect(dialog.added()).toBe(0);
		expect(host.prepared).toEqual([]);
	});

	test("does not take a login in a dir its command did not create as the new profile", async () => {
		const host = startHost();
		const dialog = mount(host);
		await dialog.poll();
		await dialog.typeName("team");
		await dialog.poll();

		host.logins = logins(codexLogin("team", "x", false));
		await dialog.poll();

		expect(dialog.view.queryByText(SIGNED_IN)).toBeNull();
		expect(dialog.added()).toBe(0);
		expect(host.prepared).toEqual([]);
	});

	test("does not take a token refresh in a home that was already signed in as the new profile", async () => {
		const host = startHost();
		host.logins = logins(codexLogin("work", "a", true));
		const dialog = mount(host);
		await dialog.poll();
		await dialog.typeName("work");
		await dialog.poll();

		host.logins = logins(codexLogin("work", "b", true));
		await dialog.poll();

		expect(dialog.view.queryByText(SIGNED_IN)).toBeNull();
		expect(dialog.added()).toBe(0);
		expect(host.prepared).toEqual([]);
	});

	test("starts each opening with an empty name", async () => {
		const host = startHost();
		const dialog = mount(host);
		await dialog.poll();
		await dialog.typeName("work");

		await dialog.setOpen(false);
		await dialog.setOpen(true);

		expect(
			(dialog.view.getByLabelText("Profile name") as HTMLInputElement).value,
		).toBe("");
	});
});

describe("adding a profile on this machine", () => {
	test("keeps Sign in off until logins have loaded and the name's home is free", async () => {
		const host = startHost();
		host.logins = logins(codexLogin("personal", "a"));
		host.hold();
		const dialog = mount(host, { local: true });
		const signIn = () =>
			dialog.view.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;

		await dialog.typeName("work");
		expect(signIn().disabled).toBe(true);

		host.release();
		await dialog.poll();
		await waitFor(() => expect(signIn().disabled).toBe(false));

		await dialog.typeName("personal");
		expect(signIn().disabled).toBe(true);

		await dialog.typeName("");
		expect(signIn().disabled).toBe(true);
	});
});
