import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	FEEDBACK_INPUT,
	finishedArchivedActions,
	finishedCloudActions,
	finishedCloudNoPullRequestView,
	finishedCloudView,
	finishedLocalActions,
	finishedLocalView,
	finishedLongCloudView,
	finishedLongLocalView,
	finishedMergedView,
	finishedNoPullRequestView,
} from "../supersetFixtures";
import { SupersetStoryApp } from "../supersetStoryKit";
import { AgentFinishedBlock } from "./AgentFinishedBlock";

const meta = {
	component: AgentFinishedBlock,
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
		view: finishedLocalView,
		actions: finishedLocalActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof AgentFinishedBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const cloud = { view: finishedCloudView, actions: finishedCloudActions };

/** A workspace on the reader's machine, with the pull request its host reports. */
export const Default: Story = {};

/** A cloud workspace can be archived from the card. */
export const CloudWorkspace: Story = { args: cloud };

export const NoPullRequest: Story = {
	args: { view: finishedNoPullRequestView },
};

export const CloudNoPullRequest: Story = {
	args: { ...cloud, view: finishedCloudNoPullRequestView },
};

export const MergedPullRequest: Story = {
	args: { ...cloud, view: finishedMergedView },
};

/** "Send back" stays off until something is written. */
export const WritingFeedback: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Send back" }));
	},
};

export const FeedbackWritten: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Send back" }));
		await userEvent.type(
			canvas.getByLabelText(FEEDBACK_INPUT),
			"Cap the retries at five and add a test for the cap.",
		);
	},
};

export const ConfirmingArchive: Story = {
	args: cloud,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Archive workspace" }),
		);
	},
};

/** Hover "Archive workspace" for the reason. */
export const AlreadyArchived: Story = {
	args: { ...cloud, actions: finishedArchivedActions },
};

export const Pending: Story = { args: { ...cloud, pending: true } };

export const Failure: Story = {
	args: { failure: "The workspace's machine did not answer" },
};

export const Resolved: Story = { args: { ...cloud, done: true } };

export const LongContent: Story = { args: { view: finishedLongLocalView } };

export const LongContentCloud: Story = {
	args: { ...cloud, view: finishedLongCloudView },
};
