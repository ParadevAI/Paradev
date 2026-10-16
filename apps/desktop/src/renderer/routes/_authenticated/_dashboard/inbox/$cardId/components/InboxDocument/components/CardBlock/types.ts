import type { RouterInputs, RouterOutputs } from "@superset/trpc";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
export type CardBlockData = Extract<DocumentBlocks[number], { type: "card" }>;
export type ResolvedCard = CardBlockData["resolved"];
export type CardAction = ResolvedCard["actions"][number];
export type CardInput = NonNullable<RouterInputs["inbox"]["act"]["input"]>;
type CardView = NonNullable<ResolvedCard["view"]>;
export type CardViewOf<K extends CardView["kind"]> = Extract<
	CardView,
	{ kind: K }
>;

export interface CardBlockViewProps<K extends CardView["kind"]> {
	view: CardViewOf<K>;
	actions: CardAction[];
	done: boolean;
	pending: boolean;
	failure: string | null;
	onAct: (actionId: string, input?: CardInput) => void;
}

export type CalendarInviteView = CardViewOf<"google_calendar.invite">;
export type CalendarFindTimeView = CardViewOf<"google_calendar.find_time">;
export type CalendarChangeView = CardViewOf<"google_calendar.change">;
export type CalendarEventView = CalendarInviteView["event"];
export type CalendarGuestView = CalendarEventView["guests"][number];
export type CalendarBusyView = CalendarInviteView["busy"][number];
export type CalendarSpan = CalendarInviteView["window"];
export type CalendarResponse = CalendarGuestView["response"];
export type CalendarAnswer = Exclude<CalendarResponse, "needsAction">;

export type LinearTriageView = CardViewOf<"linear.triage">;
export type LinearEditView = CardViewOf<"linear.edit">;
export type LinearThreadView = CardViewOf<"linear.thread">;
export type LinearBulkView = CardViewOf<"linear.bulk">;
export type LinearIssueView = LinearTriageView["issue"];
export type LinearFieldsView = LinearIssueView["fields"];
export type LinearOptionsView = LinearTriageView["options"];
export type LinearPersonView = LinearOptionsView["members"][number];
export type LinearStateView = LinearOptionsView["states"][number];
export type LinearLabelView = LinearOptionsView["labels"][number];
export type LinearCycleView = LinearOptionsView["cycles"][number];
export type LinearProjectView = LinearOptionsView["projects"][number];
export type LinearCommentView = LinearThreadView["root"];
export type LinearReactionView = LinearCommentView["reactions"][number];

export type HandoffBugReportView = CardViewOf<"handoff.bug_report">;
export type HandoffFollowUpsView = CardViewOf<"handoff.follow_ups">;
export type HandoffLandedView = NonNullable<HandoffBugReportView["filed"]>;
export type LinearDraftView = HandoffBugReportView["issue"];
export type RoutedItemView = HandoffFollowUpsView["items"][number];
export type RoutedDestinationView = NonNullable<RoutedItemView["destination"]>;
export type SentryIssueView = CardViewOf<"sentry.issue">;
export type SentryPersonView = SentryIssueView["members"][number];

export type GithubCiFailedView = CardViewOf<"github.ci_failed">;
export type GithubBranchView = CardViewOf<"github.branch">;
export type GithubDeploymentView = CardViewOf<"github.deployment">;
export type GithubReleaseView = CardViewOf<"github.release">;
export type GithubIssueView = CardViewOf<"github.issue">;
export type GithubPullView = GithubCiFailedView["pull"];
export type GithubPersonView = NonNullable<GithubPullView["author"]>;
export type GithubFailedJobView =
	GithubCiFailedView["runs"][number]["jobs"][number];
export type GithubEnvironmentView =
	GithubDeploymentView["environments"][number];
export type GithubLabelView = GithubIssueView["options"]["labels"][number];
export type GithubCommitView = GithubReleaseView["commits"][number];
export type AgentFixView = GithubCiFailedView["fix"];

export type SlackPostView = CardViewOf<"slack.message">;
export type SlackChannelView = CardViewOf<"slack.channel">;
export type SlackReminderView = CardViewOf<"slack.reminder">;
export type SlackStatusView = CardViewOf<"slack.status">;
export type SlackCanvasView = CardViewOf<"slack.canvas">;
export type SlackRequestView = CardViewOf<"slack.request">;
export type SlackPersonView = SlackPostView["reader"];
export type SlackConversationView = SlackPostView["destinations"][number];
export type SlackInviteeView = SlackChannelView["invitees"][number];
export type SlackComposeContextView = SlackPostView["compose"];

export type StripeRefundView = CardViewOf<"stripe.refund">;
export type StripeSubscriptionChangeView = CardViewOf<"stripe.subscription">;
export type StripeAdjustView = CardViewOf<"stripe.adjust">;
export type StripeFailedPaymentView = CardViewOf<"stripe.failed_payment">;
export type StripeDisputeView = CardViewOf<"stripe.dispute">;
export type StripeInvoiceActionView = CardViewOf<"stripe.invoice">;
export type StripeAccountView = StripeRefundView["account"];
export type StripeCustomerView = StripeSubscriptionChangeView["customer"];
export type StripeChargeView = StripeRefundView["charge"];
export type StripeCardView = NonNullable<StripeChargeView["card"]>;
export type StripeSubscriptionView =
	StripeSubscriptionChangeView["subscription"];
export type StripeCouponView = StripeAdjustView["coupons"][number];
export type StripeInvoiceView = StripeInvoiceActionView["invoice"];
export type StripeEvidenceView = StripeDisputeView["evidence"];
export type StripeEmailView = NonNullable<StripeRefundView["email"]>;
export type StripeRefundReason = NonNullable<
	StripeRefundView["proposed"]["reason"]
>;
