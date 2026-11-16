import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { AgentSignIn } from "../../../../../../../../../../providers/TurnFailureActionsProvider";
import { AgentSignInDialog } from "./AgentSignInDialog";

afterEach(cleanup);

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function cloudClaude(save: () => Promise<void>): AgentSignIn {
	return { label: "Claude", mode: "token", saveToken: save, saveApiKey: save };
}

function codex(signals: AbortSignal[]): AgentSignIn {
	return {
		label: "Codex",
		mode: "device",
		openUrl: () => {},
		startDeviceCode: async () => ({
			userCode: "K7QM-4XPD",
			verificationUrl: "https://auth.openai.com/codex/device",
			handle: "handle",
			intervalSeconds: 5,
		}),
		waitForDeviceCode: (_code, signal) => {
			signals.push(signal);
			return new Promise<void>(() => {});
		},
		saveApiKey: async () => {},
	};
}

function pasteToken(view: ReturnType<typeof render>) {
	fireEvent.change(view.getByLabelText("Token"), {
		target: { value: "sk-ant-oat01-x" },
	});
	fireEvent.click(view.getByText("Sign in"));
}

test("a local sign-in shows the login command, then restarts the agent once", async () => {
	const onOpenChange = mock((_open: boolean) => {});
	const restartAndContinue = mock(async () => true);
	const view = render(
		<AgentSignInDialog
			onOpenChange={onOpenChange}
			open
			restartAndContinue={restartAndContinue}
			signIn={{ label: "Codex", mode: "command", command: "codex login" }}
		/>,
	);
	expect(view.getByText("codex login")).toBeTruthy();
	await act(async () => {
		fireEvent.click(view.getByText("I've signed in"));
	});
	expect(restartAndContinue).toHaveBeenCalledTimes(1);
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a sign-in cannot be closed mid-way, and a saved token still restarts the agent", async () => {
	const save = deferred();
	const onOpenChange = mock((_open: boolean) => {});
	const restartAndContinue = mock(async () => true);
	const view = render(
		<AgentSignInDialog
			onOpenChange={onOpenChange}
			open
			restartAndContinue={restartAndContinue}
			signIn={cloudClaude(() => save.promise)}
		/>,
	);
	expect(view.getByText("claude setup-token")).toBeTruthy();
	pasteToken(view);
	expect(view.getByText("Signing in…")).toBeTruthy();

	fireEvent.keyDown(document.body, { key: "Escape" });
	expect(onOpenChange).not.toHaveBeenCalled();
	expect(view.queryByRole("button", { name: "Close" })).toBeNull();

	await act(async () => save.resolve());
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
			signIn={cloudClaude(async () => {})}
		/>,
	);
	pasteToken(view);
	await act(async () => {});
	expect(view.getByText("Signed in, but Claude did not restart.")).toBeTruthy();
	expect(view.queryByLabelText("Token")).toBeNull();
});

test("going back from a Codex device code stops waiting for its approval", async () => {
	const signals: AbortSignal[] = [];
	const restartAndContinue = mock(async () => true);
	const view = render(
		<AgentSignInDialog
			onOpenChange={() => {}}
			open
			restartAndContinue={restartAndContinue}
			signIn={codex(signals)}
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
