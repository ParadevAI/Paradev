import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	disabledActions,
	LONG_DESCRIPTION,
	rootComment,
	threadActions,
	threadView,
} from "../linearFixtures";
import { LinearThreadBlock } from "./LinearThreadBlock";

const meta = {
	component: LinearThreadBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		view: threadView,
		actions: threadActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof LinearThreadBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A root comment with a code block, one reply, a reaction on each, and an empty reply box. */
export const Default: Story = {};

/** The agent drafted the reply. */
export const Drafted: Story = {
	args: {
		view: {
			...threadView,
			draft:
				"Agreed, lazy restore is the way. @marcus can you ship it behind a flag?",
		},
	},
};

export const RootOnly: Story = {
	args: { view: { ...threadView, replies: [] } },
};

export const LongComment: Story = {
	args: {
		view: {
			...threadView,
			root: { ...rootComment, body: LONG_DESCRIPTION, edited: true },
		},
	},
};

export const ReactionPickerOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		const [first] = canvas.getAllByRole("button", { name: "Add reaction" });
		if (first) await userEvent.click(first);
	},
};

/** Replied and settled: the thread stays, the reply box is gone. */
export const Resolved: Story = { args: { done: true } };

export const Pending: Story = {
	args: { pending: true, view: { ...threadView, draft: "On it." } },
};

export const Failure: Story = {
	args: {
		failure: "The thread has new comments. Look again before you reply",
		view: { ...threadView, draft: "On it." },
	},
};

/** The reader may read the thread but not reply: hover the send button for the reason. */
export const ReplyNotAllowed: Story = {
	args: {
		actions: disabledActions(threadActions, "Reconnect Linear to comment"),
		view: { ...threadView, draft: "On it." },
	},
};
