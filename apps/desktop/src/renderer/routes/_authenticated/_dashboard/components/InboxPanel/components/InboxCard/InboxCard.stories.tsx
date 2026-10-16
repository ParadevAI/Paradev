import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RouterOutputs } from "@superset/trpc";
import { fn } from "storybook/test";
import { InboxCard } from "./InboxCard";

type Card = RouterOutputs["inbox"]["list"]["items"][number];

const now = new Date("2026-10-01T17:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const card = (
	overrides: Partial<Card> & Pick<Card, "id" | "title" | "why">,
): Card => ({
	body: null,
	key: null,
	agentSessionId: "term-1",
	workspaceId: "ws-1",
	hostId: "host-1",
	recipientId: "satya",
	showAt: null,
	readAt: null,
	resolvedAt: null,
	outcome: null,
	documentVersion: 1,
	createdAt: ago(12),
	updatedAt: ago(12),
	sentBy: null,
	page: null,
	waiting: true,
	hasDocument: true,
	tier: "ask",
	inlineConfirm: null,
	cards: [],
	...overrides,
});

const meta = {
	component: InboxCard,
	decorators: [
		(Story) => (
			<div className="w-[400px] bg-sidebar p-3 dark:bg-muted/35">
				<Story />
			</div>
		),
	],
	args: {
		selected: false,
		view: "open",
		now,
		agentId: "claude",
		workspaceName: "Inbox sidebar with agent-driven cards",
		onOpen: fn(),
		onOpenSession: fn(),
		onArchive: fn(),
		onMarkRead: fn(),
		card: card({
			id: "stripe",
			title: "Refund the double charge on Local Admin's card",
			why: "My Stripe role caps refunds at $0, so this needs a person",
			body: "Two identical $20.00 charges 40 seconds apart on the same card. The second is a double charge.",
			cards: [{ brand: "stripe", ask: "Approve refund" }],
		}),
	},
} satisfies Meta<typeof InboxCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No document and no page: Done answers it on the card. */
export const Plain: Story = {
	args: {
		card: card({
			id: "plain",
			title: "Approve the 1.42 release notes",
			why: "The notes name two customers and I cannot tell whether either allows public mention",
			body: "Draft is in the workspace. Publishing waits on your answer.",
			hasDocument: false,
		}),
	},
};

/** A single yes/no question: the list card carries no button, the answer is given on its page. */
export const YesNo: Story = {
	args: {
		card: card({
			id: "yesno",
			title: "Delete 14 stale worktrees with no branch",
			why: "Deleting other people's checkouts is not something I should decide alone",
			body: "They total 41 GB under ~/.superset/worktrees and none has a branch or uncommitted changes.",
			inlineConfirm: { id: "delete", prompt: "Delete the 14 stale worktrees?" },
		}),
	},
};

/** A document with a form opens on click. */
export const AskForm: Story = {
	args: {
		card: card({
			id: "ask",
			title: "Pick a snapshot policy before I keep going",
			why: "Two ways to persist sandboxes across restarts; the cost differs 4x",
			body: "Two ways to persist sandboxes across restarts. Cost differs 4x.",
		}),
	},
};

export const StripeRefund: Story = {};

export const SlackReply: Story = {
	args: {
		card: card({
			id: "slack",
			title: "Reply to the question in #test-agents",
			why: "Posting under the Superset app in a channel is a commitment made in the team's name",
			body: "Someone asked a day ago and nobody answered. My draft reply is ready.",
			cards: [{ brand: "slack", ask: "Approve reply" }],
		}),
	},
};

export const PostHogFlag: Story = {
	args: {
		card: card({
			id: "posthog",
			title: "Roll the new sign-in screen out to everyone",
			why: "Rolling a flag to everyone is the widest blast radius on my list",
			body: "Metrics were flat-to-better on the new screen through the whole test.",
			cards: [{ brand: "posthog", ask: "Enable flag" }],
		}),
	},
};

export const GitHubMerge: Story = {
	args: {
		agentId: "codex",
		card: card({
			id: "github",
			title: "PR #7485 is ready to merge",
			why: "Branch protection on main refuses my token, so merging needs an admin",
			body: "Six checks green, one thread about the 0111 migration that Harshith answered.",
			cards: [{ brand: "github", ask: "Merge pull request" }],
		}),
	},
};

export const LinearRank: Story = {
	args: {
		card: card({
			id: "linear",
			title: "Rank SUPER-2363 against the terminal pool work",
			why: "A priority is a trade against roadmap work I cannot see",
			body: "Groomed 23 issues; this is the one I could not rank.",
			cards: [{ brand: "linear", ask: "Rank issue" }],
		}),
	},
};

/** Two integration blocks: the first ask shows, the rest sit behind +1. */
export const GmailTwoAsks: Story = {
	args: {
		card: card({
			id: "gmail",
			title: "Confirm proration before I reply to Priya at Acme",
			why: "The proration policy isn't written anywhere I can read",
			body: "She asked whether 14 seats moving to annual mid-cycle get prorated. The draft is ready.",
			cards: [
				{ brand: "gmail", ask: "Send reply" },
				{ brand: "gmail", ask: "Triage email" },
			],
		}),
	},
};

export const SentryResolve: Story = {
	args: {
		card: card({
			id: "sentry",
			title: "New crash cluster in 1.27.0",
			why: "Resolving an issue for 38 users is a call, not a chore",
			body: "1,204 events from 38 users in two hours, only in 1.27.0. Fix is a one-liner I have ready.",
			cards: [{ brand: "sentry", ask: "Resolve issue" }],
		}),
	},
};

export const CredentialRequest: Story = {
	args: {
		card: card({
			id: "credential",
			title: "Connect GitHub so I can sync the PR list",
			why: "I cannot connect accounts, and every gh call fails with 401 in this workspace",
			cards: [{ brand: "superset", ask: "Connect account" }],
		}),
	},
};

/** Already opened once: no unread dot. */
export const Read: Story = {
	args: { card: card({ ...meta.args.card, readAt: ago(5) }) },
};

/** Sent from a plain shell, with no agent the host can name. */
export const FromTheCli: Story = {
	args: { agentId: undefined },
};

/** Someone else's agent pushed this to you: their avatar instead of the agent's. */
export const Delegated: Story = {
	args: {
		card: card({
			...meta.args.card,
			sentBy: { id: "kiet", name: "Kiet Ho", image: null },
		}),
	},
};

/** Past a week the time becomes a date. */
export const LastWeek: Story = {
	args: {
		card: card({
			...meta.args.card,
			createdAt: new Date("2026-09-22T09:00:00Z"),
		}),
	},
};

export const Scheduled: Story = {
	args: {
		view: "scheduled",
		card: card({
			...meta.args.card,
			showAt: new Date("2026-10-03T09:00:00Z"),
		}),
	},
};

export const Archived: Story = {
	args: {
		view: "archive",
		card: card({
			...meta.args.card,
			resolvedAt: ago(30),
			outcome: { kind: "archived" },
		}),
	},
};

export const Answered: Story = {
	args: {
		view: "archive",
		card: card({
			...meta.args.card,
			resolvedAt: ago(30),
			outcome: { kind: "answered", card: "stripe.refund", action: "refund" },
		}),
	},
};

export const Selected: Story = { args: { selected: true } };
