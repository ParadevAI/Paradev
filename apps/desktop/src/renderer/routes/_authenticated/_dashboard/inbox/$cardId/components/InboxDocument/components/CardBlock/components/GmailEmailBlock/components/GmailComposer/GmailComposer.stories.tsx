import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { sendAs } from "../../fixtures";
import manyRecipients from "../../realThreads/many-recipients.json";
import type { GmailEmailView, GmailThread } from "../../types";
import { GmailComposer } from "./GmailComposer";

const view = manyRecipients as GmailEmailView;
const thread = view.thread as GmailThread;

const draftFiles = [
	{
		partId: "2",
		filename: "projector-manual.pdf",
		mimeType: "application/pdf",
		size: 482_133,
		url: "https://example.com/projector-manual.pdf",
		blocked: false,
	},
	{
		partId: "3",
		filename: "driver-setup.exe",
		mimeType: "application/x-msdownload",
		size: 1_204_224,
		url: "https://example.com/driver-setup.exe",
		blocked: true,
	},
];

const meta = {
	component: GmailComposer,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-3xl rounded-lg border border-border bg-card">
				<Story />
			</div>
		),
	],
	args: {
		thread,
		draft: {
			...view.draft,
			body: "Put me in car one, front seat if it's free.",
			from: "satya@superset.sh",
		},
		sendAs,
		me: { name: null, email: "satya@superset.sh" },
		known: [...thread.replyAll.to, ...thread.replyAll.cc],
		gmailUrl: "https://mail.google.com/",
		pending: false,
		failure: null,
		request: null,
		onSend: fn(),
		onSaveDraft: fn(),
		onSchedule: fn(),
		onRemoveBlockedAndSend: fn(),
		onDiscard: fn(),
	},
} satisfies Meta<typeof GmailComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Reply: the recipients in a line until clicked, the arrow switches to reply-all. */
export const Reply: Story = {};

export const ReplyAll: Story = {
	args: {
		draft: {
			...meta.args.draft,
			to: thread.replyAll.to,
			cc: thread.replyAll.cc,
			replyAll: true,
		},
	},
};

export const Sending: Story = {
	args: { pending: true },
};

/** The draft carries a file Gmail blocks. */
export const BlockedFile: Story = {
	args: {
		draft: {
			...view.draft,
			from: "satya@superset.sh",
			attachments: draftFiles,
		},
	},
};
