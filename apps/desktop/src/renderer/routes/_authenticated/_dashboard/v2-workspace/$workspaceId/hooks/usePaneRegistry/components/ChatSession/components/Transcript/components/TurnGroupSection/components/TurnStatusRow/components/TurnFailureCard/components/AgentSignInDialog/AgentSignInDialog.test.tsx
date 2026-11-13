import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type {
	AgentSignIn,
	SignedInAccount,
} from "../../../../../../../../../../providers/TurnFailureActionsProvider";
import { AgentSignInDialog } from "./AgentSignInDialog";

afterEach(cleanup);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const account: SignedInAccount = { accountLabel: "person@example.com" };

function claude(finish: Promise<SignedInAccount>): AgentSignIn {
	return {
		agent: "claude",
		label: "Claude",
		openUrl: () => {},
		startOauth: async () => ({ url: "https://claude.ai/oauth" }),
		finishOauth: () => finish,
		saveApiKey: () => finish,
	};
}

async function pasteCode(view: ReturnType<typeof render>) {
	await act(async () => {
		fireEvent.click(view.getByText("Open claude.ai to sign in"));
	});
	fireEvent.change(view.getByLabelText("Code"), {
		target: { value: "code#state" },
	});
	fireEvent.click(view.getByText("Sign in"));
}

test("a sign-in cannot be closed mid-way, and a saved one still restarts the agent", async () => {
	const finish = deferred<SignedInAccount>();
	const onOpenChange = mock((_open: boolean) => {});
	const restartAndContinue = mock(async () => true);
	const view = render(
		<AgentSignInDialog
			onOpenChange={onOpenChange}
			open
			restartAndContinue={restartAndContinue}
			signIn={claude(finish.promise)}
		/>,
	);
	await pasteCode(view);
	expect(view.getByText("Signing in…")).toBeTruthy();

	fireEvent.keyDown(document.body, { key: "Escape" });
	expect(onOpenChange).not.toHaveBeenCalled();
	expect(view.queryByRole("button", { name: "Close" })).toBeNull();

	await act(async () => finish.resolve(account));
	expect(restartAndContinue).toHaveBeenCalledTimes(1);
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a restart that throws keeps the sign-in and offers to restart again", async () => {
	const view = render(
		<AgentSignInDialog
			onOpenChange={() => {}}
			open
			restartAndContinue={async () => {
				throw new Error("transport closed");
			}}
			signIn={claude(Promise.resolve(account))}
		/>,
	);
	await pasteCode(view);
	await act(async () => {});
	expect(view.getByText("Signed in, but Claude did not restart.")).toBeTruthy();
	expect(view.queryByLabelText("Code")).toBeNull();
});

function codex(signals: AbortSignal[]): AgentSignIn {
	return {
		agent: "codex",
		label: "Codex",
		openUrl: () => {},
		startDeviceCode: async () => ({
			userCode: "K7QM-4XPD",
			verificationUrl: "https://auth.openai.com/codex/device",
		}),
		waitForDeviceCode: (_code, signal) => {
			signals.push(signal);
			return new Promise<SignedInAccount>(() => {});
		},
		saveApiKey: async () => account,
	};
}

test("going back from a Codex device code stops waiting for its approval", async () => {
	const signals: AbortSignal[] = [];
	const restartAndContinue = mock(async () => true);
	const signIn = codex(signals);
	const view = render(
		<AgentSignInDialog
			onOpenChange={() => {}}
			open
			restartAndContinue={restartAndContinue}
			signIn={signIn}
		/>,
	);
	await act(async () => {
		fireEvent.click(view.getByText("Open ChatGPT to sign in"));
	});
	expect(view.getByText("K7QM-4XPD")).toBeTruthy();

	fireEvent.click(view.getByText("Back"));
	expect(signals[0]?.aborted).toBe(true);
	expect(view.getByText("Open ChatGPT to sign in")).toBeTruthy();
	expect(restartAndContinue).not.toHaveBeenCalled();
});

test("a dialog closed while waiting for a Codex approval opens ready to start again", async () => {
	const signals: AbortSignal[] = [];
	const props = {
		onOpenChange: () => {},
		restartAndContinue: async () => true,
		signIn: codex(signals),
	};
	const view = render(<AgentSignInDialog {...props} open />);
	await act(async () => {
		fireEvent.click(view.getByText("Open ChatGPT to sign in"));
	});
	expect(view.getByText("K7QM-4XPD")).toBeTruthy();

	view.rerender(<AgentSignInDialog {...props} open={false} />);
	expect(signals[0]?.aborted).toBe(true);
	view.rerender(<AgentSignInDialog {...props} open />);
	const start = view.getByText("Open ChatGPT to sign in").closest("button");
	expect(start?.disabled).toBe(false);
});
