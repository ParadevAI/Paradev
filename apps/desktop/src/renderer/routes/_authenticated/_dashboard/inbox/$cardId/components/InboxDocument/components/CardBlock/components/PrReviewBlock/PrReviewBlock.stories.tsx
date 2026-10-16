import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	reviewActions,
	reviewDraftView,
	reviewLocalView,
	reviewLongView,
	reviewNoThreadsActions,
	reviewNoThreadsView,
	reviewOneThreadView,
	reviewOutdatedView,
	reviewView,
} from "../supersetFixtures";
import { SupersetStoryApp } from "../supersetStoryKit";
import { PrReviewBlock } from "./PrReviewBlock";

const meta = {
	component: PrReviewBlock,
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
		view: reviewOneThreadView,
		actions: reviewActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof PrReviewBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One open thread on a cloud workspace's pull request. */
export const Default: Story = {};

export const SeveralThreads: Story = { args: { view: reviewView } };

/** The outdated thread starts closed, as on GitHub. */
export const OutdatedThread: Story = { args: { view: reviewOutdatedView } };

/** Hover "Address with agent" for the reason. */
export const NoOpenThreads: Story = {
	args: { view: reviewNoThreadsView, actions: reviewNoThreadsActions },
};

/** A workspace on a device: its host reports no line counts for the pull request. */
export const LocalWorkspace: Story = { args: { view: reviewLocalView } };

export const DraftPullRequest: Story = { args: { view: reviewDraftView } };

export const WritingReply: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(
			canvas.getByPlaceholderText("Write a reply…"),
			"Capped at five attempts in the next commit.",
		);
	},
};

export const AddressingWithNote: Story = {
	args: { view: reviewView },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Address with agent" }),
		);
	},
};

export const Pending: Story = { args: { view: reviewView, pending: true } };

export const Failure: Story = {
	args: { failure: "That thread is no longer open" },
};

/** The threads stay to read; nothing in them can be pressed. */
export const Resolved: Story = { args: { view: reviewView, done: true } };

export const LongContent: Story = { args: { view: reviewLongView } };
