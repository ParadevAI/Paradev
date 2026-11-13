import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import {
	type AgentSignIn,
	TurnFailureActionsProvider,
} from "../../../../../../../../providers/TurnFailureActionsProvider";
import { TurnFailureCard } from "./TurnFailureCard";

const meta = {
	component: TurnFailureCard,
	decorators: [
		(Story) => (
			<TurnFailureActionsProvider
				value={{
					blocked: false,
					continueTask: fn(),
					changeModel: fn(),
					dismissed: new Set(),
					setDismissed: fn(),
				}}
			>
				<div className="w-[40rem]">
					<Story />
				</div>
			</TurnFailureActionsProvider>
		),
	],
	args: { latest: true, turnId: "t1", error: undefined },
} satisfies Meta<typeof TurnFailureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpendLimit: Story = {
	args: {
		error: {
			message:
				'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."}}',
		},
	},
};

export const SpendLimitDetails: Story = {
	args: SpendLimit.args,
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByText("Show details"));
	},
};

export const Crashed: Story = {
	args: {
		error: {
			kind: "crashed",
			message: "acp agent exited (code 1)",
			detail: "Segmentation fault",
		},
	},
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Any value starting with "bad" is refused, so the error states can be tried. */
async function check(value: string): Promise<void> {
	await wait(1200);
	if (value.startsWith("bad")) {
		throw new Error("The provider refused it: invalid or expired.");
	}
}

const localClaude: AgentSignIn = {
	label: "Claude",
	mode: "command",
	command: "claude auth login",
};

const cloudClaude: AgentSignIn = {
	label: "Claude",
	mode: "token",
	saveToken: check,
	saveApiKey: check,
};

const cloudCodex: AgentSignIn = {
	label: "Codex",
	mode: "device",
	openUrl: fn(),
	startDeviceCode: async () => {
		await wait(400);
		return {
			userCode: "K7QM-4XPD",
			verificationUrl: "https://auth.openai.com/codex/device",
			handle: "handle",
			intervalSeconds: 5,
		};
	},
	waitForDeviceCode: async (_code, signal) => {
		await wait(4000);
		signal.throwIfAborted();
	},
	saveApiKey: check,
};

function withSignIn(agentSignIn: AgentSignIn, restarts = true) {
	return (Story: () => React.JSX.Element) => (
		<TurnFailureActionsProvider
			value={{
				blocked: false,
				continueTask: fn(),
				restartAndContinue: async () => {
					await wait(1500);
					return restarts;
				},
				agentSignIn,
				dismissed: new Set(),
				setDismissed: fn(),
			}}
		>
			<div className="w-[40rem]">
				<Story />
			</div>
		</TurnFailureActionsProvider>
	);
}

const claudeAuthError = {
	kind: "auth" as const,
	message: "Invalid API key · Please run /login",
};

export const LocalSignIn: Story = {
	args: { error: { ...claudeAuthError, loginCommand: "claude auth login" } },
	decorators: [withSignIn(localClaude)],
};

/** Paste any token to sign in; one starting with "bad" shows the error. */
export const CloudClaudeSignIn: Story = {
	args: { error: claudeAuthError },
	decorators: [withSignIn(cloudClaude)],
};

export const CloudClaudeRestartFails: Story = {
	args: { error: claudeAuthError },
	decorators: [withSignIn(cloudClaude, false)],
};

/** The code is approved by itself after four seconds. */
export const CloudCodexSignIn: Story = {
	args: {
		error: {
			kind: "auth",
			message: "Your access token could not be refreshed. Please log in again.",
		},
	},
	decorators: [withSignIn(cloudCodex)],
};

export const ManualSignInIsUnchanged: Story = {
	args: { error: claudeAuthError },
	decorators: [
		(Story) => (
			<TurnFailureActionsProvider
				value={{
					blocked: false,
					continueTask: fn(),
					restartAndContinue: async () => true,
					agentSignIn: cloudClaude,
					manualSignIn: true,
					openAgentSettings: fn(),
					dismissed: new Set(),
					setDismissed: fn(),
				}}
			>
				<div className="w-[40rem]">
					<Story />
				</div>
			</TurnFailureActionsProvider>
		),
	],
};
