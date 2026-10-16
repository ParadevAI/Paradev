import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { fn } from "storybook/test";
import { CardBlock, type ResolvedCard } from "./CardBlock";
import {
	actions as gmailActions,
	message,
	threadView,
} from "./components/GmailEmailBlock/fixtures";
import {
	deploymentActions,
	deploymentView,
	issueActions,
	issueView,
	releaseActions,
	releaseView,
} from "./components/githubFixtures";
import {
	bulkActions,
	bulkView,
	editActions,
	editView,
	threadView as linearThreadView,
	suggestedTriageView,
	threadActions,
	triageActions,
} from "./components/linearFixtures";
import {
	actions as slackActions,
	thread as slackThread,
} from "./components/SlackThreadBlock/fixtures";
import {
	broadcastPostView,
	canvasActions,
	canvasView,
	createActions,
	createView,
	postActions,
	reminderActions,
	reminderView,
	requestActions,
	requestView,
	statusActions,
	statusView,
} from "./components/slackApprovalFixtures";
import {
	cancelView,
	couponActions,
	couponView,
	disputeActions,
	disputeView,
	failedPaymentActions,
	failedPaymentView,
	invoiceActions,
	invoiceView,
	liveAccount,
	packageCharge,
	refundActions,
	refundView,
	subscriptionActions,
} from "./components/stripeFixtures";
import {
	automationActions,
	automationFailedView,
	cloudWorkspace,
	finishedCloudActions,
	finishedCloudView,
	localWorkspace,
	task,
} from "./components/supersetFixtures";
import { SupersetStoryApp } from "./components/supersetStoryKit";

type Block = ComponentProps<typeof CardBlock>["block"];

const block = (
	type: string,
	refs: Record<string, string | number>,
	resolved: ResolvedCard,
): Block => ({
	id: "c1",
	type: "card",
	actionable: true,
	card: { type, refs },
	resolved,
});

const stripeBlock = (
	type: string,
	refs: Record<string, string | number>,
	view: NonNullable<ResolvedCard["view"]>,
	actions: ResolvedCard["actions"],
): Block =>
	block(type, refs, {
		type,
		brand: "stripe",
		state: "ok",
		title: "Avery Chen",
		fields: [],
		view,
		actions,
	});

const slackBlock = (
	type: string,
	title: string,
	view: NonNullable<ResolvedCard["view"]>,
	actions: ResolvedCard["actions"],
): Block =>
	block(
		type,
		{},
		{
			type,
			brand: "slack",
			state: "ok",
			title,
			subtitle: "Superset",
			fields: [],
			view,
			actions,
		},
	);

const githubBlock = (
	type: string,
	status: NonNullable<ResolvedCard["status"]>,
	view: NonNullable<ResolvedCard["view"]>,
	actions: ResolvedCard["actions"],
): Block =>
	block(
		type,
		{ owner: "lumen-labs", repo: "app" },
		{
			type,
			brand: "github",
			state: "ok",
			title: "lumen-labs/app",
			status,
			fields: [],
			view,
			actions,
		},
	);

const meta = {
	component: CardBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-2xl">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		onConnect: fn(),
		block: stripeBlock(
			"stripe.refund",
			{ charge: packageCharge.id },
			refundView,
			refundActions,
		),
	},
} satisfies Meta<typeof CardBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A sandbox account: the header says "Test mode". */
export const StripeRefund: Story = {};

export const StripeRefundLive: Story = {
	args: {
		block: stripeBlock(
			"stripe.refund",
			{ charge: packageCharge.id },
			{ ...refundView, account: liveAccount },
			refundActions,
		),
	},
};

/** An account with no name reads "Stripe". */
export const StripeRefundNoAccountName: Story = {
	args: {
		block: stripeBlock(
			"stripe.refund",
			{ charge: packageCharge.id },
			{ ...refundView, account: { ...liveAccount, name: null } },
			refundActions,
		),
	},
};

export const StripeSubscription: Story = {
	args: {
		block: stripeBlock(
			"stripe.subscription",
			{ subscription: cancelView.subscription.id },
			cancelView,
			subscriptionActions,
		),
	},
};

export const StripeAdjust: Story = {
	args: {
		block: stripeBlock(
			"stripe.adjust",
			{ customer: couponView.customer.id },
			couponView,
			couponActions,
		),
	},
};

export const StripeFailedPayment: Story = {
	args: {
		block: stripeBlock(
			"stripe.failed_payment",
			{ invoice: failedPaymentView.invoice.id },
			failedPaymentView,
			failedPaymentActions,
		),
	},
};

export const StripeDispute: Story = {
	args: {
		block: stripeBlock(
			"stripe.dispute",
			{ dispute: disputeView.dispute.id },
			disputeView,
			disputeActions,
		),
	},
};

export const StripeInvoice: Story = {
	args: {
		block: stripeBlock(
			"stripe.invoice",
			{ invoice: invoiceView.invoice.id },
			invoiceView,
			invoiceActions,
		),
	},
};

export const SlackThread: Story = {
	args: {
		block: block(
			"slack.thread",
			{ channel: "C0TESTAGNT1", thread_ts: "1787255144.913739" },
			{
				type: "slack.thread",
				brand: "slack",
				state: "ok",
				title:
					"Does the inbox CLI need its own API key or can it reuse the desktop login?",
				subtitle: "#test-agents",
				fields: [
					{ label: "Channel", value: "#test-agents" },
					{ label: "Asked by", value: "Avery Chen" },
					{ label: "Replies", value: "2" },
				],
				view: slackThread(),
				actions: slackActions,
			},
		),
	},
};

/** The six Slack approval cards carry the Slack mark and the workspace's name. */
export const SlackMessage: Story = {
	args: {
		block: slackBlock(
			"slack.message",
			"#test-agents",
			broadcastPostView,
			postActions,
		),
	},
};

export const SlackChannel: Story = {
	args: {
		block: slackBlock(
			"slack.channel",
			"#launch-133",
			createView,
			createActions,
		),
	},
};

export const SlackReminder: Story = {
	args: {
		block: slackBlock(
			"slack.reminder",
			reminderView.text,
			reminderView,
			reminderActions,
		),
	},
};

export const SlackStatus: Story = {
	args: {
		block: slackBlock(
			"slack.status",
			"Set your status",
			statusView,
			statusActions,
		),
	},
};

export const SlackCanvas: Story = {
	args: {
		block: slackBlock(
			"slack.canvas",
			canvasView.canvas.title,
			canvasView,
			canvasActions,
		),
	},
};

export const SlackRequest: Story = {
	args: {
		block: slackBlock(
			"slack.request",
			"Can I get into #leadership?",
			requestView,
			requestActions,
		),
	},
};

export const PostHogFeatureFlag: Story = {
	args: {
		block: block(
			"posthog.feature_flag",
			{ key: "sign-in-screen" },
			{
				type: "posthog.feature_flag",
				brand: "posthog",
				state: "ok",
				title:
					"Feature Flag for Experiment Sign-in screen: value prop, product tour",
				subtitle: "sign-in-screen",
				status: { tone: "neutral", text: "Off" },
				fields: [
					{
						label: "Flag",
						value: "sign-in-screen",
						href: "https://us.posthog.com/project/1/feature_flags/sign-in-screen",
						mono: true,
					},
					{ label: "State", value: "Disabled" },
					{ label: "Created by", value: "avery@superset.sh" },
				],
				actions: [
					{
						id: "enable",
						label: "Enable",
						style: "primary",
						role: "primary",
						confirm: "Turn sign-in-screen on with its current condition (25%).",
					},
					{
						id: "rollout",
						label: "Set rollout",
						style: "secondary",
						role: "other",
						input: "Percentage, 0 to 100, applied to every condition",
						confirm:
							"Change sign-in-screen's rollout. Its property filters stay as they are.",
					},
					{
						id: "disable",
						label: "Disable",
						style: "danger",
						role: "other",
						disabled: "Already off",
					},
				],
			},
		),
	},
};

export const GitHubPullRequest: Story = {
	args: {
		block: block(
			"github.pull_request",
			{ owner: "superset-sh", repo: "superset", number: 7485 },
			{
				type: "github.pull_request",
				brand: "github",
				state: "ok",
				title: "feat(inbox): agent inbox with block documents",
				subtitle: "superset-sh/superset#7485",
				status: { tone: "good", text: "Checks passed" },
				fields: [
					{ label: "Branch", value: "inbox-sidebar-cards → main", mono: true },
					{ label: "Checks", value: "6 of 6 passed" },
					{ label: "Reviews", value: "1 approval" },
					{ label: "Changes", value: "+22,677 −36 in 100 files" },
				],
				actions: [
					{
						id: "merge",
						label: "Squash and merge",
						style: "primary",
						role: "primary",
						confirm:
							"Squash 1 commit into main as 7485. The branch is deleted afterwards.",
					},
					{
						id: "comment",
						label: "Comment",
						style: "secondary",
						role: "other",
						input: "Your comment, posted as you",
					},
					{
						id: "close",
						label: "Close without merging",
						style: "danger",
						role: "other",
					},
				],
			},
		),
	},
};

const linearCard = (
	type: string,
	title: string,
	subtitle: string,
	view: NonNullable<ResolvedCard["view"]>,
	actions: ResolvedCard["actions"],
): Block =>
	block(
		type,
		{ issue: subtitle },
		{
			type,
			brand: "linear",
			state: "ok",
			title,
			subtitle,
			fields: [],
			view,
			actions,
		},
	);

/** An issue in triage, with the agent's suggestions and the issue it may repeat. */
export const LinearTriage: Story = {
	args: {
		block: linearCard(
			"linear.triage",
			suggestedTriageView.issue.title,
			"AGT-2",
			suggestedTriageView,
			triageActions,
		),
	},
};

/** The agent's changes to an issue, as a diff the reader can change. */
export const LinearEdit: Story = {
	args: {
		block: linearCard(
			"linear.edit",
			editView.issue.title,
			"AGT-3",
			editView,
			editActions,
		),
	},
};

export const LinearThread: Story = {
	args: {
		block: linearCard(
			"linear.thread",
			linearThreadView.issue.title,
			"AGT-6",
			{ ...linearThreadView, draft: "Lazy restore works for me. Ship it?" },
			threadActions,
		),
	},
};

export const LinearBulk: Story = {
	args: {
		block: linearCard(
			"linear.bulk",
			"Close 5 issues",
			"AGT",
			bulkView,
			bulkActions,
		),
	},
};

export const GmailEmail: Story = {
	args: {
		block: block(
			"gmail.email",
			{ thread: "1a0fb9dc85867470", draft: "r5797482049277459071" },
			{
				type: "gmail.email",
				brand: "gmail",
				state: "ok",
				title: "Team offsite in Tahoe",
				fields: [],
				view: threadView(
					[
						message({
							id: "m1",
							snippet: "Proposing Tahoe for the week of Nov 9.",
							text: "Proposing Tahoe for the week of Nov 9.",
						}),
						message({
							id: "m2",
							snippet: "Who is bringing the projector?",
							text: "Lodge is booked. Who is bringing the projector?",
						}),
					],
					{},
					"I'll bring the projector.",
				),
				actions: gmailActions,
			},
		),
	},
};

export const SentryIssue: Story = {
	args: {
		block: block(
			"sentry.issue",
			{ issue: "6723918452" },
			{
				type: "sentry.issue",
				brand: "sentry",
				state: "ok",
				title:
					"TypeError: Cannot read properties of undefined (reading 'dispose')",
				subtitle: "DESKTOP-4K2",
				status: { tone: "bad", text: "Unresolved" },
				fields: [
					{
						label: "Issue",
						value: "DESKTOP-4K2",
						href: "https://superset.sentry.io/issues/6723918452/",
						mono: true,
					},
					{ label: "Project", value: "desktop" },
					{ label: "Events", value: "1,204" },
					{ label: "Users", value: "38" },
					{ label: "First seen", value: "2 hours ago" },
					{ label: "Last seen", value: "4 minutes ago" },
					{
						label: "Where",
						value: "terminal-runtime-registry.ts in release",
						mono: true,
					},
				],
				actions: [
					{
						id: "resolve",
						label: "Resolve",
						style: "primary",
						role: "primary",
					},
					{
						id: "ignore",
						label: "Ignore",
						style: "secondary",
						role: "other",
						confirm: "Ignore DESKTOP-4K2. It stops counting until it changes.",
					},
				],
			},
		),
	},
};

export const GithubDeployment: Story = {
	args: {
		block: githubBlock(
			"github.deployment",
			{ tone: "warn", text: "Waiting for approval" },
			deploymentView,
			deploymentActions,
		),
	},
};

export const GithubRelease: Story = {
	args: {
		block: githubBlock(
			"github.release",
			{ tone: "neutral", text: "Not released" },
			releaseView,
			releaseActions,
		),
	},
};

export const GithubIssue: Story = {
	args: {
		block: githubBlock(
			"github.issue",
			{ tone: "neutral", text: "Open" },
			issueView,
			issueActions,
		),
	},
};

export const CredentialRequest: Story = {
	args: {
		block: block(
			"credential.request",
			{ service: "github", scope: "repo, read:org" },
			{
				type: "credential.request",
				brand: "superset",
				state: "ok",
				title: "Connect GitHub",
				subtitle: "Needs repo, read:org",
				fields: [
					{ label: "Service", value: "GitHub" },
					{ label: "Scope", value: "repo, read:org", mono: true },
					{ label: "Where", value: "Settings › Connections" },
				],
				actions: [
					{
						id: "connected",
						label: "I connected GitHub",
						style: "primary",
						role: "primary",
					},
					{
						id: "declined",
						label: "Not granting this",
						style: "secondary",
						role: "dismiss",
						input: "Why not, for the agent",
					},
				],
			},
		),
	},
};

/** The organization has no Slack connection: a dashed card with the way to fix it. */
export const NotConnected: Story = {
	args: {
		block: block(
			"slack.thread",
			{ channel: "C0TESTAGNT1", thread_ts: "1787255144.913739" },
			{
				type: "slack.thread",
				brand: null,
				state: "no_connector",
				title: "Slack thread",
				fields: [],
				notice: {
					tone: "neutral",
					text: "Connect Slack for this organization to see this thread",
				},
				actions: [],
				connect: { label: "Connect Slack", href: "#/settings/integrations" },
			},
		),
	},
};

/** Connected, but this account cannot reach the object. */
export const NoAccess: Story = {
	args: {
		block: block(
			"github.pull_request",
			{ owner: "superset-sh", repo: "superset", number: 7485 },
			{
				type: "github.pull_request",
				brand: "github",
				state: "no_access",
				title: "GitHub pull request",
				fields: [],
				notice: {
					tone: "neutral",
					text: "Your GitHub account cannot see superset-sh/superset#7485",
				},
				actions: [],
			},
		),
	},
};

/** The thing the agent pointed at is no longer there. */
export const Gone: Story = {
	args: {
		block: block(
			"stripe.refund",
			{ charge: "ch_3UEgm65GN2XwxcTZ0t0eOuyk" },
			{
				type: "stripe.refund",
				brand: "stripe",
				state: "gone",
				title: "Stripe refund",
				fields: [],
				notice: { tone: "neutral", text: "Stripe has no charge with that id" },
				actions: [],
			},
		),
	},
};

export const IntegrationError: Story = {
	args: {
		block: block(
			"linear.triage",
			{ issue: "AGT-2" },
			{
				type: "linear.triage",
				brand: "linear",
				state: "error",
				title: "Linear triage",
				fields: [],
				notice: {
					tone: "bad",
					text: "Unsupported state or unable to authenticate data",
				},
				actions: [],
			},
		),
	},
};

/** After the person pressed Refund: the integration's own notice, and the block's controls are gone. */
export const Resolved: Story = {
	args: {
		done: true,
		block: block(
			"stripe.refund",
			{ charge: packageCharge.id },
			{
				...meta.args.block.resolved,
				status: { tone: "done", text: "Refunded" },
				notice: {
					tone: "good",
					text: "Refunded $25.00 to Avery Chen (Visa •••• 4242)",
				},
			},
		),
	},
};

const supersetCard = (
	type: string,
	refs: Record<string, string | number>,
	resolved: Partial<ResolvedCard> & Pick<ResolvedCard, "title">,
): Block =>
	block(type, refs, {
		type,
		brand: "superset",
		state: "ok",
		fields: [],
		actions: [],
		...resolved,
	});

/** Superset's own cards carry the Superset mark and the card's title. */
export const SupersetAutomationFailed: Story = {
	args: {
		block: supersetCard(
			"superset.automation_failed",
			{ run: automationFailedView.run.id },
			{
				title: "Automation failed",
				subtitle: automationFailedView.automation.name,
				view: automationFailedView,
				actions: automationActions,
			},
		),
	},
};

/** After Retry: the notice the server answered with, and no actions. */
export const SupersetResolvedWithNotice: Story = {
	args: {
		done: true,
		block: supersetCard(
			"superset.automation_failed",
			{ run: automationFailedView.run.id },
			{
				title: "Automation failed",
				view: automationFailedView,
				actions: automationActions,
				notice: { tone: "good", text: "Running again" },
			},
		),
	},
};

/** After Archive workspace on an agent's finished work. */
export const SupersetArchivedWithNotice: Story = {
	decorators: [
		(Story) => (
			<SupersetStoryApp>
				<Story />
			</SupersetStoryApp>
		),
	],
	args: {
		done: true,
		block: supersetCard(
			"superset.agent_finished",
			{ workspace: cloudWorkspace.id },
			{
				title: "Agent finished",
				view: finishedCloudView,
				actions: finishedCloudActions,
				notice: { tone: "done", text: "Archived" },
			},
		),
	},
};

/** No Superset card resolves to this today; the state is drawn as every other card draws it. */
export const SupersetNotConnected: Story = {
	args: {
		block: supersetCard(
			"superset.pr_review",
			{ workspace: cloudWorkspace.id },
			{
				brand: null,
				state: "no_connector",
				title: "Review comments",
				notice: {
					tone: "neutral",
					text: "Connect GitHub for this organization to see these review comments",
				},
				connect: { label: "Connect GitHub", href: "#/settings/integrations" },
			},
		),
	},
};

/** An agent wrote a card only Superset may place. */
export const SupersetNoAccess: Story = {
	args: {
		block: supersetCard(
			"superset.task_assigned",
			{ task: task.id },
			{
				state: "no_access",
				title: "Task assigned",
				notice: { tone: "neutral", text: "Only Superset places this card" },
			},
		),
	},
};

/** A cloud workspace the reader was not given. */
export const SupersetPrivateWorkspace: Story = {
	args: {
		block: supersetCard(
			"superset.agent_finished",
			{ workspace: cloudWorkspace.id },
			{
				state: "no_access",
				title: "Agent finished",
				notice: { tone: "neutral", text: "That workspace is private" },
			},
		),
	},
};

export const SupersetTaskGone: Story = {
	args: {
		block: supersetCard(
			"superset.task_assigned",
			{ task: task.id },
			{
				state: "gone",
				title: "Task assigned",
				notice: { tone: "neutral", text: "That task no longer exists" },
			},
		),
	},
};

export const SupersetNoPullRequest: Story = {
	args: {
		block: supersetCard(
			"superset.pr_review",
			{ workspace: localWorkspace.id, host: "host-mira-mbp" },
			{
				state: "gone",
				title: "Review comments",
				notice: {
					tone: "neutral",
					text: "That workspace has no pull request",
				},
			},
		),
	},
};

export const SupersetRunGone: Story = {
	args: {
		block: supersetCard(
			"superset.automation_failed",
			{ run: automationFailedView.run.id },
			{
				state: "gone",
				title: "Automation failed",
				notice: {
					tone: "neutral",
					text: "That run or its automation was deleted",
				},
			},
		),
	},
};

/** The workspace's machine is asleep or off the relay. */
export const SupersetError: Story = {
	args: {
		block: supersetCard(
			"superset.agent_finished",
			{ workspace: localWorkspace.id, host: "host-mira-mbp" },
			{
				state: "error",
				title: "Agent finished",
				notice: {
					tone: "bad",
					text: "The workspace's machine did not answer",
				},
			},
		),
	},
};
