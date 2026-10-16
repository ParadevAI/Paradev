import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CardStoryFrame } from "../cardStoryKit";
import {
	actions,
	composeView,
	forward,
	newsletter,
	threadView,
} from "./fixtures";
import { GmailEmailBlock } from "./GmailEmailBlock";
import attachments from "./realThreads/attachments.json";
import longThread from "./realThreads/long-thread.json";
import manyRecipients from "./realThreads/many-recipients.json";
import type { GmailEmailView } from "./types";

const real = (view: unknown, body = "") => {
	const v = view as GmailEmailView;
	return { ...v, draft: { ...v.draft, body } };
};

const withSubject = (view: GmailEmailView, subject: string) =>
	view.thread ? { ...view, thread: { ...view.thread, subject } } : view;

const meta = {
	component: GmailEmailBlock,
	render: (args) => (
		<CardStoryFrame title={args.view.account.email} className="max-w-3xl">
			{(headerSlot) => <GmailEmailBlock {...args} headerSlot={headerSlot} />}
		</CardStoryFrame>
	),
	args: {
		headerSlot: null,
		view: real(
			longThread,
			"Perfect, thanks Priya. I'll grab the clicker and an extension cord from the office so we're not hunting for outlets.\n\nCar one leaves the Mission office at 8 sharp on Tuesday. Text me if you're running late.\n\nSatya",
		),
		actions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		onConnect: fn(),
	},
} satisfies Meta<typeof GmailEmailBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A ten-message thread: the first folded, a count for the read middle, the last two, the reply-all draft in the reply box. */
export const LongThread: Story = {};

/** A message with an inline image, a PDF and a PNG attached. */
export const Attachments: Story = {
	args: {
		view: real(
			attachments,
			"Thanks Marcus, budget looks right to me. Approved, go ahead and pay the deposit.",
		),
	},
};

/** A reply-all to twelve people with six more on Cc. */
export const ManyRecipients: Story = {
	args: {
		view: real(
			manyRecipients,
			"Done, Leah has the front seat in car one. Everyone else, I still need your picks by Friday.",
		),
	},
};

/** A designed newsletter keeps its own light page, as Gmail shows it. */
export const Newsletter: Story = {
	args: {
		view: withSubject(threadView([newsletter]), "This week at the market"),
	},
};

/** A forward is not folded: its header and the forwarded email stay in view. */
export const Forward: Story = {
	args: {
		view: withSubject(
			threadView(
				[forward],
				{},
				"Added two bags of the dark chocolate one. See you Tuesday!",
			),
			"Fwd: This week at the market",
		),
	},
};

/** No thread yet: Gmail's New Message window with the agent's draft. */
export const NewEmail: Story = {
	args: { view: composeView },
};

/** The Google connection predates sending: reconnect in place of the reply box. */
export const NeedsReconnect: Story = {
	args: { view: { ...real(longThread), canSend: false } },
};

export const Sending: Story = {
	args: { pending: true },
};

/** Gmail refused it: the reason by the send button, the draft kept. */
export const SendFailed: Story = {
	args: { failure: "Gmail needs reconnecting" },
};

/** Sent or settled: the thread stays readable, with no reply box. */
export const Settled: Story = {
	args: { done: true },
};

/** No draft behind the card: an empty reply box is open, reply all because the last message had other recipients. */
export const DraftGone: Story = {
	args: { view: { ...real(longThread), draftGone: true } },
};

/** Resolved, with no star or label actions: those controls are hidden. */
export const ReadOnly: Story = {
	args: {
		done: true,
		actions: actions.filter((a) => a.id !== "star" && a.id !== "remove_label"),
	},
};

/** The reader scheduled the reply: the box gives way to when it goes out. */
export const Scheduled: Story = {
	args: {
		done: true,
		view: {
			...real(longThread),
			scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
		},
	},
};
