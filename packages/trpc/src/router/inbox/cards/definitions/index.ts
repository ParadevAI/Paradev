import type { RegisteredCard } from "../types";
import { agentFinished } from "./agentFinished";
import { agentNeeds } from "./agentNeeds";
import { automationFailed } from "./automationFailed";
import { calendarChange } from "./calendarChange";
import { calendarFindTime } from "./calendarFindTime";
import { calendarInvite } from "./calendarInvite";
import { githubBranch } from "./githubBranch";
import { githubCiFailed } from "./githubCiFailed";
import { githubDeployment } from "./githubDeployment";
import { githubIssue } from "./githubIssue";
import { githubPullRequest } from "./githubPullRequest";
import { githubRelease } from "./githubRelease";
import { gmailEmail } from "./gmail";
import { handoffBugReport } from "./handoffBugReport";
import { handoffFollowUps } from "./handoffFollowUps";
import { linearBulk } from "./linearBulk";
import { linearEdit } from "./linearEdit";
import { linearThread } from "./linearThread";
import { linearTriage } from "./linearTriage";
import { posthogFeatureFlag } from "./posthogFeatureFlag";
import { prReview } from "./prReview";
import { sentryIssue } from "./sentryIssue";
import { slackCanvas } from "./slackCanvas";
import { slackChannel } from "./slackChannel";
import { slackPost } from "./slackPost";
import { slackReminder } from "./slackReminder";
import { slackRequest } from "./slackRequest";
import { slackStatus } from "./slackStatus";
import { slackThread } from "./slackThread";
import { stripeAdjust } from "./stripeAdjust";
import { stripeDispute } from "./stripeDispute";
import { stripeFailedPayment } from "./stripeFailedPayment";
import { stripeInvoice } from "./stripeInvoice";
import { stripeRefund } from "./stripeRefund";
import { stripeSubscription } from "./stripeSubscription";
import { taskAssigned } from "./taskAssigned";

/**
 * The launch set: Superset's own cards for what happens inside it, then the
 * integration cards, plus `ask` which is a block rather than a card. Each
 * definition says which credential it really runs on; the set grows from what
 * agents keep asking.
 */
export const CARD_DEFINITIONS: RegisteredCard[] = [
	agentFinished,
	agentNeeds,
	prReview,
	taskAssigned,
	automationFailed,
	githubPullRequest,
	githubCiFailed,
	githubBranch,
	githubDeployment,
	githubRelease,
	githubIssue,
	gmailEmail,
	calendarInvite,
	calendarFindTime,
	calendarChange,
	slackThread,
	slackPost,
	slackChannel,
	slackReminder,
	slackStatus,
	slackCanvas,
	slackRequest,
	posthogFeatureFlag,
	linearBulk,
	handoffBugReport,
	handoffFollowUps,
	linearEdit,
	linearThread,
	linearTriage,
	stripeAdjust,
	stripeDispute,
	stripeFailedPayment,
	stripeInvoice,
	stripeRefund,
	stripeSubscription,
	sentryIssue,
];
