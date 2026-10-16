import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { avery, me, message, newsletter, priya } from "../../fixtures";
import attachments from "../../realThreads/attachments.json";
import type { GmailEmailView } from "../../types";
import { GmailMessage } from "./GmailMessage";

const withFiles = (attachments as GmailEmailView).thread?.messages[0];

const meta = {
	component: GmailMessage,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-3xl rounded-lg border border-border bg-card">
				<Story />
			</div>
		),
	],
	args: {
		message: message({
			id: "m1",
			from: avery,
			to: [me, priya],
			cc: [{ name: "Marcus Bell", email: "marcus.bell@fieldstone.dev" }],
			snippet: "Nov 9 works for me. Can we push the start to Tuesday?",
			text: "Nov 9 works for me. Can we push the start to Tuesday so Monday stays free for the release?\n\nAvery\n\nOn Mon, Sep 28, 2026 at 9:14 AM Satya Patel <satya@superset.sh> wrote:\n> Proposing Tahoe for the week of Nov 9. Thoughts on dates before I book?",
		}),
		open: true,
		me: me.email,
		subject: "Team offsite in Tahoe",
		gmailUrl: "https://mail.google.com/",
		now: new Date(),
		onToggle: fn(),
		onReply: fn(),
		onStar: fn(),
	},
} satisfies Meta<typeof GmailMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open: time, star, reply and ⋮ (Reply, Reply all, Forward), who it went to, the body with its quote folded. */
export const Open: Story = {};

/** Folded the way Gmail folds a read message: sender, preview, time and star. */
export const Folded: Story = {
	args: { open: false },
};

export const FoldedStarred: Story = {
	args: {
		open: false,
		message: { ...meta.args.message, starred: true },
	},
};

/** Sent to me alone: the ⋮ menu has no Reply all. */
export const OneRecipient: Story = {
	args: { message: { ...meta.args.message, to: [me], cc: [] } },
};

export const DesignedHtml: Story = {
	args: { message: newsletter },
};

export const WithAttachments: Story = {
	args: { message: withFiles ?? meta.args.message },
};

/** No reply or star callbacks: only the time, a set star, and Open in Gmail. */
export const ReadOnly: Story = {
	args: {
		onReply: undefined,
		onStar: undefined,
		message: { ...meta.args.message, starred: true },
	},
};
