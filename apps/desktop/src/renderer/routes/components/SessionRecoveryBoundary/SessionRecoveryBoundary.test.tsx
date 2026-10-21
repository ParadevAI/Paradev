import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ComponentProps } from "react";
import { SessionRecoveryBoundary } from "./SessionRecoveryBoundary";

const { act, cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);

type Recovery = ComponentProps<typeof SessionRecoveryBoundary>["recovery"];

function recoveryState(overrides: Partial<Recovery> = {}): Recovery {
	return {
		hasLocalToken: true,
		isOnline: true,
		isPending: false,
		isRefetching: false,
		isRecovering: true,
		refetch: mock(async () => {}),
		session: null,
		...overrides,
	};
}

afterEach(cleanup);

describe("SessionRecoveryBoundary", () => {
	it.each([
		"authenticated",
		"sign-in",
	] as const)("keeps a settled session error on the %s restoration screen", (mode) => {
		const children = mock(() => <button type="button">Sign in</button>);
		const view = render(
			<SessionRecoveryBoundary
				recovery={recoveryState()}
				mode={mode}
				onSignOut={mock(async () => {})}
			>
				{children}
			</SessionRecoveryBoundary>,
		);

		expect(
			view.getByRole("region", { name: "Restoring your session" }),
		).toBeDefined();
		expect(children).not.toHaveBeenCalled();
		expect(view.queryByRole("button", { name: "Sign in" })).toBeNull();
	});

	it("offers Retry after the timeout while keeping sign-in hidden", async () => {
		const recovery = recoveryState();
		const view = render(
			<SessionRecoveryBoundary
				recovery={recovery}
				mode="sign-in"
				timeoutMs={0}
				onSignOut={mock(async () => {})}
			>
				{() => <button type="button">Sign in</button>}
			</SessionRecoveryBoundary>,
		);

		const retry = await waitFor(() =>
			view.getByRole("button", { name: "Retry" }),
		);
		expect(view.queryByRole("button", { name: "Sign in" })).toBeNull();
		await act(async () => fireEvent.click(retry));
		expect(recovery.refetch).toHaveBeenCalledTimes(1);
	});

	it("lets the user sign out from a timed-out recovery", async () => {
		let finishSignOut: (() => void) | undefined;
		const signingOut = new Promise<void>((resolve) => {
			finishSignOut = resolve;
		});
		const onSignOut = mock(() => signingOut);
		const view = render(
			<SessionRecoveryBoundary
				recovery={recoveryState()}
				mode="sign-in"
				timeoutMs={0}
				onSignOut={onSignOut}
			>
				{() => null}
			</SessionRecoveryBoundary>,
		);

		const signOut = await waitFor(() =>
			view.getByRole("button", { name: "Sign out" }),
		);
		fireEvent.click(signOut);
		expect(onSignOut).toHaveBeenCalledTimes(1);
		expect((signOut as HTMLButtonElement).disabled).toBe(true);
		await act(async () => finishSignOut?.());
		expect((signOut as HTMLButtonElement).disabled).toBe(false);
	});

	it("shows sign-in after the session lookup confirms sign-in is needed", () => {
		const view = render(
			<SessionRecoveryBoundary
				recovery={recoveryState({ isRecovering: false })}
				mode="sign-in"
				onSignOut={mock(async () => {})}
			>
				{() => <button type="button">Sign in</button>}
			</SessionRecoveryBoundary>,
		);

		expect(view.getByRole("button", { name: "Sign in" })).toBeDefined();
		expect(view.queryByRole("region")).toBeNull();
	});

	it("allows sign-in after an initial lookup times out without a saved token", async () => {
		const view = render(
			<SessionRecoveryBoundary
				recovery={recoveryState({
					hasLocalToken: false,
					isPending: true,
					isRecovering: false,
				})}
				mode="sign-in"
				timeoutMs={0}
				onSignOut={mock(async () => {})}
			>
				{() => <button type="button">Sign in</button>}
			</SessionRecoveryBoundary>,
		);

		await waitFor(() =>
			expect(view.getByRole("button", { name: "Sign in" })).toBeDefined(),
		);
	});

	it.each([
		"authenticated",
		"sign-in",
	] as const)("preserves the %s route's offline behavior", (mode) => {
		const children = mock(() => <p>Offline route content</p>);
		const view = render(
			<SessionRecoveryBoundary
				recovery={recoveryState({ isOnline: false, isRecovering: false })}
				mode={mode}
				onSignOut={mock(async () => {})}
			>
				{children}
			</SessionRecoveryBoundary>,
		);

		if (mode === "sign-in") {
			expect(view.getByRole("region")).toBeDefined();
			expect(children).not.toHaveBeenCalled();
		} else {
			expect(view.getByText("Offline route content")).toBeDefined();
		}
	});
});
