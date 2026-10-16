import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AskBlock } from "../../../AskBlock";
import {
	credentialActions,
	credentialView,
	longCredentialView,
	longToolView,
	otherCredentialView,
	questionView,
	retryWindowAsk,
	toolActions,
	toolNoWorkspaceView,
	toolView,
} from "../supersetFixtures";
import { SupersetStoryApp } from "../supersetStoryKit";
import { AgentNeedsBlock } from "./AgentNeedsBlock";

const meta = {
	component: AgentNeedsBlock,
	decorators: [
		(Story) => (
			<SupersetStoryApp>
				<div className="-m-6 h-screen overflow-y-auto p-6">
					<div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
						<Story />
					</div>
				</div>
			</SupersetStoryApp>
		),
	],
	args: {
		view: credentialView,
		actions: credentialActions("GitHub"),
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		onConnect: fn(),
		ask: null,
	},
} satisfies Meta<typeof AgentNeedsBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const tool = { view: toolView, actions: toolActions("gh pr merge") };
const question = (answers: Record<string, unknown> | null) => ({
	view: questionView,
	actions: [],
	ask: (
		<AskBlock
			block={retryWindowAsk}
			answers={answers ?? {}}
			skipped={[]}
			done={answers !== null}
			pending={false}
			focusedId={answers ? null : retryWindowAsk.ask.questions[0].id}
			onFocus={fn()}
			onAnswer={fn()}
			onSkip={fn()}
		/>
	),
});
const longTool = longToolView.tool ?? "";

/** An account to connect, with the scope the agent asked for. */
export const Default: Story = {};

/** A service the app has no mark for, from an agent with no workspace. */
export const CredentialOtherService: Story = {
	args: {
		view: otherCredentialView,
		actions: credentialActions("another service"),
	},
};

export const DecliningCredential: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Not granting this" }),
		);
	},
};

/** A tool the agent will not run without a yes. */
export const Tool: Story = { args: tool };

export const ToolNoWorkspace: Story = {
	args: { ...tool, view: toolNoWorkspaceView },
};

export const DenyingTool: Story = {
	args: tool,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Don't allow" }));
	},
};

/** The document's ask is drawn inside the card, and the card has no actions of its own. */
export const Question: Story = { args: question(null) };

export const QuestionAnswered: Story = {
	args: { ...question({ "retry-window": "5m" }), done: true },
};

export const Pending: Story = { args: { ...tool, pending: true } };

export const Failure: Story = {
	args: { ...tool, failure: "The agent stopped waiting for this answer" },
};

export const ResolvedCredential: Story = { args: { done: true } };

export const ResolvedTool: Story = { args: { ...tool, done: true } };

/** Hover "Allow gh pr merge" for the reason. */
export const DisabledWithReason: Story = {
	args: {
		...tool,
		actions: toolActions("gh pr merge").map((action) =>
			action.id === "approve"
				? { ...action, disabled: "Only the workspace's owner can allow this" }
				: action,
		),
	},
};

export const LongContentCredential: Story = {
	args: { view: longCredentialView },
};

export const LongContentTool: Story = {
	args: { view: longToolView, actions: toolActions(longTool) },
};
