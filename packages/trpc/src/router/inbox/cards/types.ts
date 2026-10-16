import type { cloudWorkspaces } from "@superset/db/schema";
import type { z } from "zod";
import { cardSource } from "./source";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

/**
 * What the client draws for an integration card: a finite set of primitives.
 * Every string here was written by the integration from live data fetched
 * with the reader's credentials, or is a fixed label of ours. Live data can
 * still be the agent's words: a Gmail draft is, recipients included, and so
 * are a calendar card's drafted note, reply, event title and guests, a
 * Linear card's proposed title, description and comment, and a Stripe card's
 * drafted email and dispute evidence, which the reader sees and can change
 * before anything is sent. The one
 * markup is an email's own HTML body, which the client sanitizes and draws in
 * a sandboxed frame with scripts off.
 */
export type CardTone = "neutral" | "good" | "warn" | "bad" | "done";

export type CardBrand =
	| "github"
	| "gmail"
	| "google_calendar"
	| "slack"
	| "linear"
	| "posthog"
	| "stripe"
	| "sentry"
	| "superset";

export interface CardField {
	label: string;
	value: string;
	href?: string;
	mono?: boolean;
}

/**
 * What an action is to its card, which decides its key: `primary` carries out
 * what the card asks, `dismiss` is the card's "no", anything else is `other`.
 */
export type CardActionRole = "primary" | "dismiss" | "other";

export interface CardActionView {
	id: string;
	label: string;
	style: "primary" | "secondary" | "danger";
	role: CardActionRole;
	/** Present when the reader may see the action but not take it, with the reason. */
	disabled?: string;
	/** A confirmation sentence built from resolved facts, never from agent text. */
	confirm?: string;
	/** The action wants a short free-text input from the reader, labelled thus. */
	input?: string;
}

export type CardState = "ok" | "no_connector" | "no_access" | "gone" | "error";

export interface SlackPersonView {
	id: string;
	/** The display name, or the real name when none is set. */
	name: string;
	/** The real name when it differs from the display name. */
	realName: string | null;
	avatar: string | null;
	isBot: boolean;
	/** The job title on their Slack profile. */
	title: string | null;
	/** Their IANA time zone, for the local time on their card. */
	timezone: string | null;
	presence: "active" | "away" | null;
	inChannel: boolean;
	/** The reader's own Slack identity, when their account is linked. */
	isReader: boolean;
	/** The person's own workspace, set only for someone from another organization. */
	team: { id: string; name: string; icon: string | null } | null;
	/** Their workspace role, which heads their card. */
	role: "primary_owner" | "owner" | "admin" | null;
}

/** A legacy app attachment: the colored bar with title, text, fields and footer. */
export interface SlackAttachmentView {
	color: string | null;
	pretext: string | null;
	author: { name: string; icon: string | null; link: string | null } | null;
	title: string | null;
	titleLink: string | null;
	text: string | null;
	fields: { title: string; value: string; short: boolean }[];
	image: string | null;
	footer: string | null;
	footerIcon: string | null;
	ts: string | null;
	/** Block Kit inside the attachment, drawn after its text. */
	blocks: SlackBlockView[];
	/** An app's unfurl card (Slack "work object"): a linked record with its key fields. */
	unfurl: {
		app: string;
		icon: string | null;
		title: string;
		subtitle: string | null;
		url: string | null;
		fields: { label: string; value: SlackRichElementView[] }[];
	} | null;
	/** A pasted link's preview: the site, its title and description, and its image. */
	link: {
		site: string | null;
		icon: string | null;
		title: string | null;
		text: string | null;
		url: string;
		image: string | null;
	} | null;
	/** Legacy attachment buttons; only ones that link somewhere can work outside Slack. */
	buttons: SlackButtonView[];
}

export interface SlackFileView {
	id: string;
	name: string;
	permalink: string | null;
	/** Slack's short type, like `png` or `pdf`. */
	type: string | null;
	size: number | null;
	/** An image's thumbnail through the API, which holds the token Slack wants. */
	image: { url: string; width: number | null; height: number | null } | null;
}

export interface SlackButtonView {
	text: string;
	url: string | null;
	style: "primary" | "danger" | null;
}

/** One run of rich text, as Slack's rich_text block spells it. */
export type SlackInlineView =
	| {
			kind: "text";
			text: string;
			bold?: boolean;
			italic?: boolean;
			strike?: boolean;
			code?: boolean;
	  }
	| {
			kind: "link";
			url: string;
			text: string | null;
			bold?: boolean;
			italic?: boolean;
			code?: boolean;
	  }
	| { kind: "user"; id: string }
	| { kind: "channel"; id: string }
	| { kind: "usergroup"; id: string }
	| { kind: "broadcast"; range: string }
	| { kind: "emoji"; name: string; unicode: string | null }
	| { kind: "date"; text: string };

export type SlackRichElementView =
	| { kind: "section"; inline: SlackInlineView[] }
	| {
			kind: "list";
			ordered: boolean;
			indent: number;
			items: SlackInlineView[][];
	  }
	| { kind: "preformatted"; inline: SlackInlineView[] }
	| { kind: "quote"; inline: SlackInlineView[] };

/** The Block Kit pieces a message is drawn from; anything else is left out. */
export type SlackBlockView =
	| { type: "rich_text"; elements: SlackRichElementView[] }
	| { type: "header"; text: string }
	| {
			type: "section";
			text: string | null;
			fields: string[];
			accessory: string | null;
	  }
	| {
			type: "context";
			elements: (
				| { kind: "text"; text: string }
				| { kind: "image"; url: string; alt: string }
			)[];
	  }
	| { type: "divider" }
	| { type: "image"; url: string; alt: string; title: string | null }
	| {
			type: "actions";
			buttons: SlackButtonView[];
	  };

export interface SlackMessageView {
	ts: string;
	user: SlackPersonView;
	/** Slack mrkdwn, rendered by the client. */
	text: string;
	edited: boolean;
	/** A thread reply that was also posted to the channel. */
	broadcast: boolean;
	/** Slack lists the first people who reacted, as user ids, and the full count. */
	reactions: { name: string; count: number; mine: boolean; users: string[] }[];
	files: SlackFileView[];
	/** A thread root that was deleted after people replied: Slack keeps it as a placeholder. */
	deleted: boolean;
	attachments: SlackAttachmentView[];
	blocks: SlackBlockView[];
	permalink: string | null;
}

/**
 * A thread rendered as Slack renders it: every message with its author and
 * reactions, the people who can be mentioned in a reply, and the workspace's
 * custom emoji so `:name:` resolves to the same image it does in Slack.
 */
export interface SlackThreadView {
	kind: "slack.thread";
	channel: { id: string; name: string };
	permalink: string | null;
	messages: SlackMessageView[];
	members: SlackPersonView[];
	/** Every Slack user id the thread can mention, to the name Slack shows for it. */
	names: Record<string, string>;
	/** Channel id to name, without the `#`: the ones the thread mentions and the ones a reply can. */
	channels: Record<string, string>;
	/** User-group id to its handle, without the `@`. */
	groups: Record<string, string>;
	emoji: Record<string, string>;
	/** Replies post as the reader through their own Slack account; without one the card can only be read. */
	readerConnected: boolean;
	/** The agent's proposed reply, pre-filled in the composer. */
	draft: string | null;
}

/** A place a message can go: a channel the reader is in, one person, or a group of people. */
export interface SlackConversationView {
	id: string;
	kind: "channel" | "private" | "dm" | "group";
	/** A channel's name without the `#`; for a DM or group, the people's names. */
	name: string;
	/** Null where Slack does not say, as in the picker's list. */
	members: number | null;
	/** Shared with another organization through Slack Connect. */
	external: boolean;
}

/** What the Slack composer needs to draw and send mentions, channels and emoji. */
export interface SlackComposeContextView {
	members: SlackPersonView[];
	names: Record<string, string>;
	channels: Record<string, string>;
	groups: Record<string, string>;
	emoji: Record<string, string>;
}

export interface SlackPostView {
	kind: "slack.message";
	workspace: string;
	reader: SlackPersonView;
	target: SlackConversationView | null;
	/** The people of a DM or group target. */
	recipients: SlackPersonView[];
	/** Channels the reader is in, for the picker; people come from `compose.members`. */
	destinations: SlackConversationView[];
	compose: SlackComposeContextView;
	draft: string;
	/** ISO time the agent proposes to send at; null sends now. */
	postAt: string | null;
	/** The agent proposed a time that has passed. */
	stale: boolean;
	/** The reader's IANA time zone in Slack. */
	timezone: string;
	/** How many people `@channel` or `@here` notifies in the target, the number Slack's own warning shows. */
	notifies: number | null;
	/** User-group id to how many people a mention of it notifies. */
	groupSizes: Record<string, number>;
}

export interface SlackInviteeView {
	person: SlackPersonView;
	guest: boolean;
	alreadyMember: boolean;
}

export interface SlackChannelView {
	kind: "slack.channel";
	workspace: string;
	mode: "invite" | "create" | "connect";
	/** The channel people are added to; null when the card creates one. */
	channel: (SlackConversationView & { url: string | null }) | null;
	proposed: { name: string; private: boolean };
	invitees: SlackInviteeView[];
	/** Addresses of people outside the workspace, for a Slack Connect invitation. */
	emails: string[];
	/** Everyone the reader can add, for the picker. */
	directory: SlackPersonView[];
	/** The Superset app sends Slack Connect invitations, and can only from a channel it is in. */
	appInChannel: boolean;
}

export interface SlackReminderView {
	kind: "slack.reminder";
	workspace: string;
	reader: SlackPersonView;
	text: string;
	/** ISO time. */
	time: string | null;
	/** The agent proposed a time that has passed. */
	stale: boolean;
	timezone: string;
}

export interface SlackStatusView {
	kind: "slack.status";
	workspace: string;
	reader: SlackPersonView;
	mode: "status" | "pause";
	current: {
		text: string;
		emoji: string;
		/** ISO time the status clears itself; null when it does not. */
		until: string | null;
		/** ISO time notifications resume; null when they are not paused. */
		pausedUntil: string | null;
	};
	proposed: {
		text: string;
		emoji: string;
		until: string | null;
		pause: boolean;
		/** ISO time, for the pause mode. */
		pauseUntil: string | null;
	};
	/** The agent proposed an end time that has passed. */
	stale: boolean;
	timezone: string;
	emoji: Record<string, string>;
}

export interface SlackCanvasView {
	kind: "slack.canvas";
	workspace: string;
	canvas: { id: string; title: string; url: string | null };
	change: "replace" | "insert_after" | "append" | "delete";
	/** Slack's id for the section the change is about; the apply action sends it back with `before`. */
	section: string | null;
	/** The section the change is about, as markdown; null for an append. */
	before: string | null;
	/** The section holds something markdown cannot say, such as a mention or a file, so it cannot be replaced from here. */
	lossy: boolean;
	/** The agent's markdown for it. */
	after: string;
	/** The whole canvas as markdown, for context around the change. */
	content: string;
	/** Slack's edit time for the canvas; the apply action sends it back. */
	version: number;
	editable: boolean;
}

export interface SlackRequestView {
	kind: "slack.request";
	workspace: string;
	channel: { id: string; name: string; external: boolean };
	permalink: string | null;
	message: SlackMessageView;
	/** What approving does beyond the reply: add someone to a channel. */
	grant: {
		person: SlackPersonView;
		guest: boolean;
		channel: SlackConversationView;
		alreadyMember: boolean;
	} | null;
	/** The message has buttons of its own app or workflow, which only Slack can press. */
	ownButtons: boolean;
	approveReply: string;
	denyReply: string;
	compose: SlackComposeContextView;
}

/** A product-shaped view a card can carry beyond fields; the client picks the renderer by `kind`. */
export interface GmailAddress {
	name: string | null;
	email: string;
}

export interface GmailAttachmentView {
	/** The MIME part, stable across fetches where Gmail's attachment ids are not. */
	partId: string;
	filename: string;
	mimeType: string;
	size: number;
	/** A short-lived link through the API, which holds the reader's Google token. */
	url: string;
	/** On Gmail's blocked-file list: shown, never downloadable. */
	blocked: boolean;
}

export interface GmailMessageView {
	id: string;
	from: GmailAddress;
	to: GmailAddress[];
	cc: GmailAddress[];
	/** Only on messages the reader sent. */
	bcc: GmailAddress[];
	/** ISO time Gmail received it. */
	date: string;
	snippet: string;
	unread: boolean;
	starred: boolean;
	/** The sender's HTML with `cid:` images pointed at signed links; null for a plain-text email. */
	html: string | null;
	/** The HTML was cut short, as Gmail clips a long message; the rest is in Gmail. */
	clipped: boolean;
	text: string | null;
	attachments: GmailAttachmentView[];
}

export interface GmailLabelView {
	id: string;
	name: string;
	/** Gmail's own colors for a user label; system labels have none. */
	color: { background: string; text: string } | null;
}

export interface GmailRecipients {
	to: GmailAddress[];
	cc: GmailAddress[];
}

/**
 * An email the agent wants the reader to send: a reply in an existing thread,
 * drawn as Gmail draws the thread, or a new message drawn as Gmail's compose
 * window. Sending goes out as the reader through their own Google account.
 */
export interface GmailEmailView {
	kind: "gmail.email";
	mode: "reply" | "compose";
	/** `photo` is the reader's Superset photo, shown on their own messages. */
	account: { email: string; photo: string | null };
	/** The addresses the reader may send as, with their Gmail signatures; From offers a choice when there are several. */
	sendAs: {
		email: string;
		name: string | null;
		isDefault: boolean;
		signature: string;
	}[];
	/** False when the connection predates the send scope; the card then offers to reconnect. */
	canSend: boolean;
	/** The agent's draft was sent or deleted since; the thread shows with no reply box. */
	draftGone: boolean;
	/** When the reader scheduled the draft to go out, or null. */
	scheduledAt: string | null;
	thread: {
		id: string;
		subject: string;
		labels: GmailLabelView[];
		messages: GmailMessageView[];
		/** Who a reply and a reply-all go to, worked out the way Gmail does. */
		reply: GmailRecipients;
		replyAll: GmailRecipients;
	} | null;
	draft: {
		to: GmailAddress[];
		cc: GmailAddress[];
		bcc: GmailAddress[];
		subject: string;
		body: string;
		/** The draft's own HTML body, when it was written in HTML; images already proxied. */
		html: string | null;
		replyAll: boolean;
		/** The address it goes out from. */
		from: string;
		/** Files on the agent's draft; they go out with the email. */
		attachments: GmailAttachmentView[];
	};
}

export interface SupersetPerson {
	id: string;
	name: string;
	image: string | null;
}

export interface SupersetPullRequestView {
	repo: string;
	number: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	/** Null when the PR came from the workspace's host, which reports the diff on its own. */
	additions: number | null;
	deletions: number | null;
	changedFiles: number | null;
	checksStatus: "none" | "pending" | "success" | "failure";
	checks: {
		name: string;
		status: "success" | "failure" | "pending" | "skipped" | "cancelled";
		url: string | null;
	}[];
	reviewDecision: string | null;
}

/** A workspace as the sidebar shows it: where it runs, what its agent is doing, its PR and who is in it. */
export interface SupersetWorkspaceView {
	id: string;
	location: "cloud" | "local";
	name: string;
	branch: string | null;
	repo: string | null;
	/** Cloud only: provisioning, ready, failed, deleted. */
	status: CloudWorkspaceRow["status"] | null;
	/** Cloud only: working, review, permission, failed. */
	agentStatus: CloudWorkspaceRow["agentStatus"];
	agentStatusAt: string | null;
	createdAt: string;
	createdBy: SupersetPerson | null;
	host: { id: string; name: string } | null;
	presence: (SupersetPerson & { lastSeenAt: string })[];
	pullRequest: SupersetPullRequestView | null;
	/** Lines changed against the base branch: the host's git status, or the PR's stats for a cloud workspace. */
	changes: { additions: number; deletions: number; files: number } | null;
}

export interface AgentFinishedView {
	kind: "superset.agent_finished";
	workspace: SupersetWorkspaceView;
}

export interface AgentNeedsView {
	kind: "superset.agent_needs";
	need: "credential" | "tool" | "question";
	workspace: SupersetWorkspaceView | null;
	/** credential: the service and the scope asked for. */
	service: { id: string; label: string } | null;
	scope: string | null;
	/** tool: the tool the agent wants to run. */
	tool: string | null;
	/** question: the ask question in the same document that this card answers. */
	questionId: string | null;
}

export interface ReviewCommentView {
	id: string;
	author: { login: string; avatarUrl: string | null };
	body: string;
	createdAt: string;
	url: string;
}

export interface ReviewThreadView {
	id: string;
	path: string;
	line: number | null;
	outdated: boolean;
	comments: ReviewCommentView[];
}

export interface PrReviewView {
	kind: "superset.pr_review";
	workspace: SupersetWorkspaceView;
	pullRequest: SupersetPullRequestView;
	/** Review threads still open. */
	threads: ReviewThreadView[];
}

export interface TaskAssignedView {
	kind: "superset.task_assigned";
	task: {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		priority: string;
		status: { name: string; color: string; type: string };
		assignee: SupersetPerson | null;
		creator: SupersetPerson | null;
		branch: string | null;
		dueDate: string | null;
		labels: { name: string; color: string | null }[];
	};
	workspaces: SupersetWorkspaceView[];
}

export interface AutomationFailedView {
	kind: "superset.automation_failed";
	automation: {
		id: string;
		name: string;
		agent: string;
		target: { kind: "cloud" | "host"; name: string | null };
	};
	run: {
		id: string;
		title: string | null;
		status: string;
		error: string | null;
		errorCode: string | null;
		createdAt: string;
		scheduledFor: string | null;
		session: AutomationRunSession | null;
	};
	/** Runs after this one, newest first, so the reader sees whether it has recovered. */
	later: {
		id: string;
		status: string;
		createdAt: string;
		session: AutomationRunSession | null;
	}[];
}

/** Where a run's agent ran, as the runs list opens it. */
export type AutomationRunSession =
	| { location: "local"; workspaceId: string; terminalId: string | null }
	| { location: "cloud"; workspaceId: string };

export type CalendarResponse =
	| "accepted"
	| "declined"
	| "tentative"
	| "needsAction";

/** A guest on a Google Calendar event, as the guest list shows them. */
export interface CalendarGuestView {
	email: string;
	/** The name Google has for them; null shows the address. */
	name: string | null;
	self: boolean;
	organizer: boolean;
	optional: boolean;
	response: CalendarResponse;
	/** The note they answered with. */
	comment: string | null;
	/** Set for the reader only: their Superset photo. */
	photo: string | null;
}

/** Start and end as ISO instants; an all-day span runs midnight to midnight in the calendar's time zone. */
export interface CalendarSpan {
	start: string;
	end: string;
}

export interface CalendarEventView extends CalendarSpan {
	id: string;
	title: string;
	allDay: boolean;
	/** IANA zone the reader's calendar shows times in. */
	timeZone: string;
	location: string | null;
	/** Plain text; Google's markup is stripped. */
	description: string | null;
	/** The Meet or other video link. */
	meetUrl: string | null;
	/** The event in Google Calendar. */
	url: string;
	recurring: boolean;
	cancelled: boolean;
	organizer: { email: string; name: string | null; self: boolean };
	guests: CalendarGuestView[];
}

/** Something already on the reader's calendar, for conflicts and the slot picker's grid. */
export interface CalendarBusyView extends CalendarSpan {
	id: string;
	title: string;
	allDay: boolean;
	/** The reader's own answer to it; null for events they made. */
	response: CalendarResponse | null;
}

/** An invitation the reader has to answer. */
export interface CalendarInviteView {
	kind: "google_calendar.invite";
	account: { email: string; photo: string | null };
	event: CalendarEventView;
	/** The reader's current answer. */
	response: CalendarResponse;
	/** What on the reader's calendar overlaps the event. */
	conflicts: CalendarBusyView[];
	/** The reader's calendar over `window`, for proposing another time. */
	busy: CalendarBusyView[];
	window: CalendarSpan;
	/** The note the agent drafted to go with the answer. */
	note: string;
	/** False when the reader is not a guest, or the event is cancelled. */
	canRespond: boolean;
	/** False when Gmail can't send for the reader, so a proposal would not reach the organizer by email. */
	canEmailNote: boolean;
}

/** Someone asked to meet: open times from the reader's calendar, and the reply offering them. */
export interface CalendarFindTimeView {
	kind: "google_calendar.find_time";
	account: { email: string; photo: string | null };
	/** Where the ask came from. */
	ask: {
		source: "gmail" | "slack";
		from: string;
		/** The email's subject; null for Slack. */
		subject: string | null;
		snippet: string;
		url: string | null;
		/** Who the reply reaches: the email's reply-all recipients, or the Slack channel. */
		replyTo: string[];
		/** The last message the card saw; `offer` sends it back so a reply never goes to people who joined since. */
		version: string;
	};
	title: string;
	minutes: number;
	/** Who the event would invite. `inThread` is false for someone the ask's thread does not include, null when the source cannot tell. */
	guests: { email: string; name: string | null; inThread: boolean | null }[];
	timeZone: string;
	window: CalendarSpan;
	busy: CalendarBusyView[];
	/** When each guest is busy, for the ones whose calendars Google shares; no titles. */
	guestsBusy: { email: string; busy: CalendarSpan[] }[];
	/** Open times in working hours, soonest first. */
	slots: CalendarSpan[];
	/** The drafted reply; the picked times are listed under it. */
	reply: string;
	canReply: boolean;
}

/** An event the reader owns that the agent wants moved or cancelled. */
export interface CalendarChangeView {
	kind: "google_calendar.change";
	account: { email: string; photo: string | null };
	event: CalendarEventView;
	change: "reschedule" | "cancel";
	/** The time the agent suggests moving it to. */
	proposal: CalendarSpan | null;
	/** What overlaps the proposal on the reader's calendar. */
	conflicts: CalendarBusyView[];
	busy: CalendarBusyView[];
	window: CalendarSpan;
	/** The note to guests the agent drafted. */
	note: string;
	canChange: boolean;
	/** False when Gmail can't send for the reader, so the note would not reach the guests. */
	canEmailNote: boolean;
}

export interface LinearPersonView {
	id: string;
	name: string;
	/** What a mention is written with: `@handle` in a comment's markdown. */
	handle: string;
	avatar: string | null;
	/** An app or agent user, which Linear lists apart from people. */
	app: boolean;
}

export type LinearStateType =
	| "triage"
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled"
	| "duplicate";

export interface LinearStateView {
	id: string;
	name: string;
	type: LinearStateType;
	color: string;
}

export interface LinearLabelView {
	id: string;
	name: string;
	color: string;
	/** The label group it belongs to; an issue takes one label of a group at most. */
	group: string | null;
}

export interface LinearCycleView {
	id: string;
	number: number;
	name: string | null;
	startsAt: string;
	endsAt: string;
}

export interface LinearProjectView {
	id: string;
	name: string;
	color: string;
	/** False for a project of the workspace that this issue's team is not part of. */
	inTeam: boolean;
}

/** The properties of an issue that a card can change, each as the id Linear knows it by. */
export interface LinearFieldsView {
	state: string;
	/** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
	priority: number;
	assignee: string | null;
	labels: string[];
	cycle: string | null;
	project: string | null;
	estimate: number | null;
}

/** What each property picker offers, for the issue's team. */
export interface LinearOptionsView {
	/** In Linear's order; triage and duplicate statuses are left out, because each has its own action. */
	states: LinearStateView[];
	members: LinearPersonView[];
	labels: LinearLabelView[];
	cycles: LinearCycleView[];
	projects: LinearProjectView[];
	/** The team's estimate scale; empty when the team does not estimate. */
	estimates: { value: number; label: string }[];
}

export interface LinearIssueView {
	id: string;
	identifier: string;
	title: string;
	/** Markdown, as Linear stores it; empty where a card shows the issue without its text. */
	description: string;
	url: string;
	team: { id: string; key: string; name: string };
	state: LinearStateView;
	creator: LinearPersonView | null;
	createdAt: string;
	fields: LinearFieldsView;
	/** Changes with every edit; an action sends it back so it never writes over an edit the reader has not seen. */
	version: string;
}

interface LinearAccountView {
	/** The Linear workspace. */
	workspace: string;
	viewer: LinearPersonView;
}

/** An issue waiting in a team's triage: accept it with its properties set, decline it, mark it a duplicate, or snooze it. */
export interface LinearTriageView {
	kind: "linear.triage";
	account: LinearAccountView;
	issue: LinearIssueView;
	options: LinearOptionsView;
	/** The properties the agent suggests, as dashed chips the reader applies or ignores. */
	suggested: Partial<LinearFieldsView>;
	/** The issue the agent thinks this one repeats. */
	duplicateOf: LinearIssueView | null;
	/** The drafted comment. */
	comment: string;
	snoozedUntil: string | null;
	/** The team requires a priority before an issue leaves triage. */
	priorityRequired: boolean;
	/** The status an accepted issue starts in unless the reader picks another. */
	defaultState: string | null;
}

/** An issue with changes the agent proposes, shown against what Linear holds. */
export interface LinearEditView {
	kind: "linear.edit";
	account: LinearAccountView;
	issue: LinearIssueView;
	options: LinearOptionsView;
	proposed: {
		title: string | null;
		description: string | null;
		fields: Partial<LinearFieldsView>;
	};
}

export interface LinearReactionView {
	emoji: string;
	count: number;
	/** The reader's own reaction of this emoji, to take back. */
	mine: string | null;
	names: string[];
}

export interface LinearCommentView {
	id: string;
	/** Markdown. */
	body: string;
	author: LinearPersonView | null;
	createdAt: string;
	edited: boolean;
	reactions: LinearReactionView[];
}

/** One comment thread of an issue, with a reply. */
export interface LinearThreadView {
	kind: "linear.thread";
	account: LinearAccountView;
	issue: LinearIssueView;
	/** Who a reply can mention. */
	mentionable: LinearPersonView[];
	root: LinearCommentView;
	replies: LinearCommentView[];
	/** The drafted reply. */
	draft: string;
	/** The newest comment the view holds; `reply` sends it back so a reply never lands under comments the reader has not seen. */
	version: string;
}

/** Several issues of one team, closed or moved together. */
export interface LinearBulkView {
	kind: "linear.bulk";
	account: LinearAccountView;
	team: { id: string; key: string; name: string };
	issues: LinearIssueView[];
	options: LinearOptionsView;
	/** What the agent proposes for all of them; its labels are added to each issue's own. */
	proposed: Partial<LinearFieldsView>;
	/** The drafted comment, posted on each issue. */
	comment: string;
}

/** A new Linear issue the agent drafted: its words, the properties it suggests, and what the team's pickers offer. */
export interface LinearDraftView {
	account: LinearAccountView;
	team: { id: string; key: string; name: string };
	title: string;
	description: string;
	fields: Partial<LinearFieldsView>;
	options: LinearOptionsView;
}

/** One write a handoff already made, from an earlier run that did not finish. */
export interface HandoffLandedView {
	text: string;
	url: string | null;
}

/** A bug reported in a Slack thread, drafted as a Linear issue; filing it answers the thread with the link. */
export interface HandoffBugReportView {
	kind: "handoff.bug_report";
	thread: SlackThreadView;
	issue: LinearDraftView;
	/** The drafted reply; the issue's link is added after it. */
	reply: string;
	/** False when the reader cannot answer the thread as themselves, so only the issue can be filed. */
	canReply: boolean;
	replyUnavailable: string | null;
	filed: HandoffLandedView | null;
	replied: HandoffLandedView | null;
	/** The clauses of the confirm; `{title}` stands for the title the reader leaves in the draft. */
	plan: { file: string; reply: string };
}

export type RoutedDestinationView =
	| {
			kind: "gmail";
			to: string[];
			subject: string;
			body: string;
			/** The reader's address the draft is made in; null when Gmail is not connected. */
			from: string | null;
	  }
	| { kind: "linear"; draft: LinearDraftView }
	| {
			kind: "slack";
			target: SlackConversationView;
			recipients: SlackPersonView[];
			text: string;
	  };

/** One line of a checklist and where it goes when it is checked. */
export interface RoutedItemView {
	id: string;
	text: string;
	/** Who the meeting gave it to, in the agent's words. */
	owner: string | null;
	/** Null when the destination could not be read; `unavailable` says why. */
	destination: RoutedDestinationView | null;
	unavailable: string | null;
	done: HandoffLandedView | null;
	/** Its clause of the confirm; `{to}` stands for the recipients and `{title}` for the title the reader leaves in it. */
	plan: string;
}

/** Action items from a meeting, each routed to a Gmail draft, a Linear issue or a Slack message. */
export interface HandoffFollowUpsView {
	kind: "handoff.follow_ups";
	source: "granola" | "circleback" | "notes";
	meeting: { title: string; url: string | null; heldAt: string | null };
	items: RoutedItemView[];
	/** For the Slack items' composer; null when none goes to Slack. */
	compose: SlackComposeContextView | null;
}

export interface SentryPersonView {
	id: string;
	name: string;
	email: string | null;
}

/** A Sentry issue with what can be done about it: its status, who has it, a Linear issue for it, an agent to fix it. */
export interface SentryIssueView {
	kind: "sentry.issue";
	organization: string;
	issue: {
		id: string;
		shortId: string;
		title: string;
		culprit: string | null;
		level: string;
		status: "unresolved" | "resolved" | "ignored";
		events: string;
		users: number;
		firstSeen: string;
		lastSeen: string;
		url: string;
		project: string;
		assignee: SentryPersonView | null;
		/** The error's type, message, file and function, where Sentry has them. */
		error: {
			type: string | null;
			value: string | null;
			filename: string | null;
			function: string | null;
		};
	};
	/** The organization's members, for the assignee picker. */
	members: SentryPersonView[];
	/** The drafted Linear issue; null when the agent proposed none or it could not be read. */
	linear: LinearDraftView | null;
	linearUnavailable: string | null;
	filed: HandoffLandedView | null;
	/** The note on the Sentry issue that links the Linear one. */
	noted: HandoffLandedView | null;
	/** The clauses of the confirm for filing; `{title}` stands for the title the reader leaves in the draft. */
	plan: { file: string; note: string };
	fix: AgentFixView;
}

export interface GithubPersonView {
	login: string;
	avatarUrl: string | null;
}

/** The pull request a GitHub card is about, as its header shows it. */
export interface GithubPullView {
	repo: string;
	number: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	author: GithubPersonView | null;
	head: string;
	base: string;
	sha: string;
}

/** What an agent started from a card is asked to do. */
export interface AgentFixView {
	slug: string;
	title: string;
	prompt: string;
}

export interface GithubFailedJobView {
	id: number;
	name: string;
	url: string;
	/** The step that failed; null when GitHub names none. */
	step: { number: number; name: string } | null;
	/** GitHub's own error lines for the job, in order. */
	errors: string[];
	/** The end of the log up to the first error. Empty when the log could not be read. */
	log: string;
	annotations: { path: string; line: number | null; message: string }[];
}

/** Checks that failed on a pull request's head, with the failing step and the end of its log. */
export interface GithubCiFailedView {
	kind: "github.ci_failed";
	pull: GithubPullView;
	/** Actions runs with failed jobs, named as GitHub names them: "CI #482". */
	runs: {
		id: number;
		name: string;
		attempt: number;
		url: string;
		/** GitHub refuses a re-run while the run is going. */
		running: boolean;
		jobs: GithubFailedJobView[];
	}[];
	/** Failing checks and commit statuses that are not Actions jobs, which the card cannot re-run. */
	others: { name: string; url: string | null }[];
	/** Failed jobs the card left out of `runs`. */
	omitted: number;
	total: number;
	failing: number;
	pending: number;
	fix: AgentFixView;
}

/** A pull request branch that is behind its base or conflicts with it. */
export interface GithubBranchView {
	kind: "github.branch";
	pull: GithubPullView;
	/** `computing` while GitHub has not finished checking the branch. */
	state: "behind" | "conflicts" | "current" | "computing";
	behindBy: number;
	aheadBy: number;
	/** The newest base commits the branch lacks. */
	missing: { sha: string; message: string; author: string | null }[];
	/** The confirm for each way to update. */
	plan: { merge: string; rebase: string };
	fix: AgentFixView;
}

export interface GithubEnvironmentView {
	id: number;
	name: string;
	url: string | null;
	/** Minutes GitHub waits before it deploys, after approval. */
	waitTimer: number;
	canApprove: boolean;
	reviewers: {
		kind: "user" | "team";
		name: string;
		avatarUrl: string | null;
	}[];
}

/** A workflow run held at an environment that needs a reviewer. */
export interface GithubDeploymentView {
	kind: "github.deployment";
	repo: string;
	run: {
		id: number;
		/** The workflow and run number, as GitHub names a run: "Deploy #482". */
		name: string;
		title: string;
		url: string;
		branch: string | null;
		sha: string;
		event: string;
		actor: GithubPersonView | null;
		status: string;
	};
	environments: GithubEnvironmentView[];
	/** The confirms; `{environments}` stands for the names the reader left checked, joined by ", ". */
	plan: { approve: string; reject: string };
}

/** A release to cut: the tag, the commit it points to, and the drafted notes. */
export interface GithubReleaseView {
	kind: "github.release";
	repo: string;
	tag: string;
	/** False when publishing creates the tag. */
	tagExists: boolean;
	/** The branch a new tag is made on; the tag itself when it exists. */
	target: string;
	/** The commit the release points to. */
	sha: string;
	name: string;
	notes: string;
	prerelease: boolean;
	/** GitHub marks the release as the repository's latest. A pre-release never is. */
	latest: boolean;
	/** A release GitHub already has for this tag, which the card will not make a second time. */
	existing: { url: string; draft: boolean } | null;
	previous: { tag: string; url: string } | null;
	/** The newest commits since the previous release; `total` may be more than are listed. */
	commits: { sha: string; message: string; author: string | null }[];
	total: number;
	compareUrl: string | null;
	/** The confirms; `{name}` stands for the title the reader leaves. After it comes `prerelease` for a pre-release, or `latest` for a published release that becomes the latest. */
	plan: {
		publish: string;
		draft: string;
		latest: string;
		prerelease: string;
		/** The confirm for replacing notes that are already drafted; null when generating needs none. */
		generate: string | null;
	};
}

export interface GithubLabelView {
	name: string;
	color: string;
	description: string | null;
}

/** An issue to triage: its labels and assignees, the agent's suggestions, and a duplicate to close it against. */
export interface GithubIssueView {
	kind: "github.issue";
	repo: string;
	issue: {
		number: number;
		title: string;
		body: string;
		url: string;
		state: "open" | "closed";
		author: GithubPersonView | null;
		createdAt: string;
		comments: number;
		labels: GithubLabelView[];
		assignees: GithubPersonView[];
	};
	options: { labels: GithubLabelView[]; assignees: GithubPersonView[] };
	/** What the agent proposes, already checked against the repository. */
	suggested: { labels: string[]; assignees: string[] };
	duplicate: {
		number: number;
		title: string;
		url: string;
		state: "open" | "closed";
	} | null;
	/** The parts of the confirm for a change, which names only what changes: `lead`, then the clauses that apply in this order joined by "; ", then "?". `{names}` stands for the names joined by ", ". */
	plan: {
		lead: string;
		addLabels: string;
		removeLabels: string;
		assign: string;
		unassign: string;
	};
}

/** An amount in the currency's smallest unit, as Stripe holds it. */
export interface StripeMoney {
	amount: number;
	/** Lowercase ISO code. */
	currency: string;
}

export interface StripeCardView {
	brand: string;
	last4: string;
	/** Month and four-digit year the card expires, where Stripe gives them. */
	expMonth?: number;
	expYear?: number;
}

export interface StripeChargeView {
	id: string;
	amount: number;
	refunded: number;
	currency: string;
	status: "succeeded" | "pending" | "failed";
	created: string;
	description: string | null;
	card: StripeCardView | null;
	disputed: boolean;
	url: string;
}

export interface StripeSubscriptionView {
	id: string;
	status: string;
	product: string;
	price: StripeMoney & { interval: string; intervalCount: number };
	quantity: number;
	items: number;
	/** A usage-based item, whose amount is not in `price`. */
	metered: boolean;
	currentPeriodStart: string;
	currentPeriodEnd: string;
	cancelAtPeriodEnd: boolean;
	cancelAt: string | null;
	trialEnd: string | null;
	/** Payment collection is paused; `resumesAt` is null when it has no end. */
	paused: { resumesAt: string | null } | null;
	discounts: string[];
	url: string;
}

/** The header every Stripe card shares: who the customer is and what they have paid. */
export interface StripeCustomerView {
	id: string;
	name: string | null;
	email: string | null;
	created: string;
	url: string;
	card: StripeCardView | null;
	/** Paid, less refunds, over the charges the card read. */
	spent: StripeMoney;
	/** The customer has more charges than the card read, so `spent` is a floor. */
	spentPartial: boolean;
	/** The customer's credit balance; positive is credit they hold. */
	credit: StripeMoney;
	delinquent: boolean;
	subscriptions: StripeSubscriptionView[];
	/** Newest first. */
	charges: StripeChargeView[];
}

interface StripeAccountView {
	name: string | null;
	/** False for test mode or a sandbox, which the card labels. */
	live: boolean;
	/** Why nothing can be written from here, when that is so. */
	writesOff: string | null;
}

/** The email a request came in by, and the drafted reply to it. */
export interface StripeEmailView {
	from: string;
	subject: string | null;
	snippet: string;
	url: string;
	replyTo: string[];
	/** The last message the card saw; a reply sends it back. */
	version: string;
	draft: string;
	canReply: boolean;
	/** The thread includes the customer's address in Stripe. */
	fromCustomer: boolean;
}

export type StripeRefundReason =
	| "duplicate"
	| "fraudulent"
	| "requested_by_customer"
	| "other";

export interface StripeRefundView {
	kind: "stripe.refund";
	account: StripeAccountView;
	customer: StripeCustomerView | null;
	charge: StripeChargeView;
	/** What is left to refund. */
	refundable: number;
	proposed: {
		amount: number;
		reason: StripeRefundReason | null;
		/** The subscription the agent suggests cancelling with the refund. */
		cancel: string | null;
	};
	email: StripeEmailView | null;
}

export interface StripeSubscriptionChangeView {
	kind: "stripe.subscription";
	account: StripeAccountView;
	customer: StripeCustomerView;
	subscription: StripeSubscriptionView;
	change: "cancel" | "pause";
	proposed: {
		when: "now" | "period_end";
		refund: "none" | "prorated" | "last_payment";
		resumesAt: string | null;
		behavior: "keep_as_draft" | "mark_uncollectible" | "void";
	};
	/** What cancelling now would give back: the unused part of the period, and the whole last payment. */
	preview: {
		/** Unix seconds the proration was worked out for; the cancel action sends it back. */
		prorationDate: number;
		prorated: StripeMoney;
		lastPayment:
			| (StripeMoney & { charge: string; card: StripeCardView | null })
			| null;
	};
}

export interface StripeCouponView {
	id: string;
	name: string;
	percentOff: number | null;
	amountOff: StripeMoney | null;
	duration: "once" | "repeating" | "forever";
	months: number | null;
}

export interface StripeAdjustView {
	kind: "stripe.adjust";
	account: StripeAccountView;
	customer: StripeCustomerView;
	adjust: "coupon" | "credit" | "trial";
	/** The subscription a coupon or a trial applies to. */
	subscription: StripeSubscriptionView | null;
	coupons: StripeCouponView[];
	proposed: {
		coupon: string | null;
		credit: StripeMoney | null;
		/** A debit raises what the customer owes; a credit lowers it. */
		direction: "credit" | "debit";
		note: string;
		trialEnd: string | null;
	};
}

export interface StripeInvoiceView {
	id: string;
	number: string | null;
	status: "draft" | "open" | "paid" | "uncollectible" | "void";
	amountDue: number;
	amountPaid: number;
	amountRemaining: number;
	total: number;
	currency: string;
	created: string;
	dueDate: string | null;
	collection: "charge_automatically" | "send_invoice";
	lines: { description: string; amount: number }[];
	attempts: number;
	nextAttempt: string | null;
	/** Why the last payment failed, in Stripe's words. */
	lastError: string | null;
	hostedUrl: string | null;
	url: string;
}

export interface StripeFailedPaymentView {
	kind: "stripe.failed_payment";
	account: StripeAccountView;
	customer: StripeCustomerView;
	invoice: StripeInvoiceView;
	/** The payment method a retry charges; null when Stripe holds none the card can name. */
	charged: StripeCardView | null;
	/** The drafted email with the link to pay or update the card. */
	email: {
		to: string | null;
		subject: string;
		draft: string;
		canSend: boolean;
	};
}

export interface StripeEvidenceView {
	product_description: string;
	customer_name: string;
	customer_email_address: string;
	billing_address: string;
	service_date: string;
	access_activity_log: string;
	uncategorized_text: string;
}

export interface StripeDisputeView {
	kind: "stripe.dispute";
	account: StripeAccountView;
	customer: StripeCustomerView | null;
	dispute: {
		id: string;
		amount: number;
		currency: string;
		reason: string;
		status: string;
		dueBy: string | null;
		pastDue: boolean;
		submissions: number;
		created: string;
		url: string;
		/** An inquiry: the bank asks before a dispute, and no money has moved yet. */
		inquiry: boolean;
	};
	charge: StripeChargeView;
	/** What Stripe holds, with the agent's drafts where Stripe has nothing. */
	evidence: StripeEvidenceView;
	/** The fields the agent drafted, so the card can mark them. */
	drafted: (keyof StripeEvidenceView)[];
}

export interface StripeInvoiceActionView {
	kind: "stripe.invoice";
	account: StripeAccountView;
	customer: StripeCustomerView;
	invoice: StripeInvoiceView;
	/** The address Stripe sends this invoice to. */
	to: string | null;
}

export type CardView =
	| SlackThreadView
	| SlackPostView
	| SlackChannelView
	| SlackReminderView
	| SlackStatusView
	| SlackCanvasView
	| SlackRequestView
	| HandoffBugReportView
	| HandoffFollowUpsView
	| SentryIssueView
	| GmailEmailView
	| AgentFinishedView
	| AgentNeedsView
	| PrReviewView
	| TaskAssignedView
	| AutomationFailedView
	| CalendarInviteView
	| CalendarFindTimeView
	| CalendarChangeView
	| LinearTriageView
	| LinearEditView
	| LinearThreadView
	| LinearBulkView
	| StripeRefundView
	| StripeSubscriptionChangeView
	| StripeAdjustView
	| StripeFailedPaymentView
	| StripeDisputeView
	| StripeInvoiceActionView
	| GithubCiFailedView
	| GithubBranchView
	| GithubDeploymentView
	| GithubReleaseView
	| GithubIssueView;

export interface ResolvedCard {
	type: string;
	brand: CardBrand | null;
	state: CardState;
	title: string;
	subtitle?: string;
	status?: { tone: CardTone; text: string };
	fields: CardField[];
	notice?: { tone: CardTone; text: string };
	body?: string;
	view?: CardView;
	actions: CardActionView[];
	/** How the reader gets from a degraded state to a working one. */
	connect?: { label: string; href: string };
	/** The card's subject in its own app, when it has a web address. */
	source?: string;
}

export interface CardContext {
	readerId: string;
	organizationId: string;
	/** The inbox card this block sits on; absent outside one (previews, tests). */
	card?: {
		id: string;
		agentSessionId: string;
		workspaceId: string | null;
		hostId: string | null;
		/** An agent is blocked in `superset inbox wait` on this card right now. */
		waiting: boolean;
		/** Superset pushed this card itself; no agent wrote it. */
		fromSuperset: boolean;
	};
}

export interface ActionResult {
	/** What the agent receives back through `wait`, alongside action id and refs. */
	outcome: Record<string, unknown>;
	/** Optional replacement facts so the card can re-render without a second fetch. */
	notice?: { tone: CardTone; text: string };
	/** Whether this action settles the card. Filled in from the definition. */
	terminal: boolean;
	/** Identifiers the action learned that the card should resolve with from now on, merged into its refs. */
	refs?: Record<string, string | number | boolean>;
}

/** A run can keep a terminal action open when only part of it landed. */
export type RunResult = Omit<ActionResult, "terminal"> & { terminal?: false };

export interface CardAction<Refs, Data> {
	label: (data: Data) => string;
	style: CardActionView["style"];
	role: CardActionRole;
	/** False when the action has nothing to do with this card, such as Approve on a question: it is left out entirely. */
	applies?: (data: Data) => boolean;
	/** `true` to offer it, or a sentence explaining why the reader cannot. */
	available?: (data: Data, ctx: CardContext) => true | string;
	confirm?: (data: Data) => string;
	/** A confirm that depends on what the reader chose. The view gives the client its parts; the client builds the same sentence, shows it, and sends it back. */
	confirmFor?: (
		data: Data,
		raw: CardInput | undefined,
		ctx: CardContext,
	) => string | undefined;
	input?: string;
	/** False for an action that leaves the decision open, like a comment. Default true. */
	terminal?: boolean;
	run: (args: RunArgs<Refs, Data>) => Promise<RunResult>;
}

/** What a reader sends with an action: words typed into a box, or a structured value a block builds. */
export type CardInput = string | Record<string, unknown>;

interface RunArgs<Refs, Data> {
	refs: Refs;
	data: Data;
	ctx: CardContext;
	input?: string;
	raw?: CardInput;
}

/** An action whose input is structured: `schema` reads it before `run` sees it. */
export function withInput<Refs, Data, Input>(
	schema: z.ZodType<Input>,
	run: (
		args: Omit<RunArgs<Refs, Data>, "input" | "raw"> & { input: Input },
	) => Promise<RunResult>,
	describe: (error: z.ZodError) => string = () =>
		"That input could not be read",
): CardAction<Refs, Data>["run"] {
	return ({ raw, input: _text, ...args }) => {
		const parsed = schema.safeParse(raw);
		if (!parsed.success)
			throw new CardUnavailable("error", describe(parsed.error));
		return run({ ...args, input: parsed.data });
	};
}

/** `ask`: work waits on the reader's decision. `update`: something happened that they may want to look at. `finished`: an agent's turn ended, the one update a reader hides on its own. */
export type CardTier = "ask" | "update" | "finished";

export interface CardDefinition<Refs, Data> {
	type: string;
	/** Default `ask`. */
	tier?: CardTier;
	/** What the card is called when it cannot resolve, e.g. "GitHub pull request". */
	label: string;
	/** The short imperative the panel shows beside the mark, e.g. "Approve refund". */
	ask: string;
	brand: CardBrand | null;
	/** Only Superset places this card; one an agent wrote renders unavailable. */
	systemOnly?: true;
	/** False when a card with these refs waits on nothing of its own, such as one whose question is asked beside it. Default: it has an action that settles it. */
	takesDecision?: (refs: Refs) => boolean;
	/** The ask for these refs, when it differs from the card's usual one. */
	askFor?: (refs: Refs) => string;
	refs: z.ZodType<Refs>;
	/**
	 * Fetch with the reader's credentials and return facts. Throw a
	 * CardUnavailable to render one of the degraded states instead.
	 */
	resolve: (args: { refs: Refs; ctx: CardContext }) => Promise<{
		title: string;
		subtitle?: string;
		status?: ResolvedCard["status"];
		fields: CardField[];
		body?: string;
		view?: CardView;
		data: Data;
	}>;
	actions: Record<string, CardAction<Refs, Data>>;
}

export const CHANGED_SINCE_CONFIRM =
	"This changed since you looked. Read it again before you confirm";

/**
 * A card with its generics closed over: the registry and the router only ever
 * see wire types (unknown refs in, a ResolvedCard out), so nothing outside the
 * definition file needs to know what a card's refs or data look like.
 */
export interface RegisteredCard {
	type: string;
	tier: CardTier;
	brand: CardBrand | null;
	ask: string;
	askFor: (rawRefs: unknown) => string;
	/** Whether a block of this card is one the reader settles, so the inbox card waits for it. */
	takesDecision: (rawRefs: unknown) => boolean;
	resolve: (rawRefs: unknown, ctx: CardContext) => Promise<ResolvedCard>;
	act: (
		rawRefs: unknown,
		actionId: string,
		ctx: CardContext,
		input: CardInput | undefined,
		confirmed?: string,
	) => Promise<{ result: ActionResult; card: ResolvedCard }>;
}

export class CardUnavailable extends Error {
	constructor(
		readonly state: Exclude<CardState, "ok">,
		readonly text: string,
		readonly connect?: ResolvedCard["connect"],
	) {
		super(text);
	}
}

function degraded(
	def: { type: string; label: string; brand: CardBrand | null },
	state: Exclude<CardState, "ok">,
	text: string,
	connect?: ResolvedCard["connect"],
): ResolvedCard {
	return {
		type: def.type,
		brand: state === "no_connector" ? null : def.brand,
		state,
		title: def.label,
		fields: [],
		notice: { tone: state === "error" ? "bad" : "neutral", text },
		actions: [],
		connect,
	};
}

export function defineCard<Refs, Data>(
	def: CardDefinition<Refs, Data>,
): RegisteredCard {
	const parseRefs = (rawRefs: unknown): Refs | null => {
		const parsed = def.refs.safeParse(rawRefs);
		return parsed.success ? parsed.data : null;
	};

	const render = async (
		refs: Refs,
		ctx: CardContext,
	): Promise<ResolvedCard> => {
		const resolved = await def.resolve({ refs, ctx });
		const actions = Object.entries(def.actions)
			.filter(([, action]) => action.applies?.(resolved.data) ?? true)
			.map(([id, action]) => {
				const availability = action.available?.(resolved.data, ctx) ?? true;
				return {
					id,
					label: action.label(resolved.data),
					style: action.style,
					role: action.role,
					...(availability === true ? {} : { disabled: availability }),
					...(action.confirm ? { confirm: action.confirm(resolved.data) } : {}),
					...(action.input ? { input: action.input } : {}),
				};
			});
		return {
			type: def.type,
			brand: def.brand,
			state: "ok",
			title: resolved.title,
			subtitle: resolved.subtitle,
			status: resolved.status,
			fields: resolved.fields,
			body: resolved.body,
			view: resolved.view,
			actions,
			source: cardSource(resolved.fields, resolved.view),
		};
	};

	const placedByAgent = (ctx: CardContext) =>
		def.systemOnly === true && ctx.card?.fromSuperset !== true;

	const resolve: RegisteredCard["resolve"] = async (rawRefs, ctx) => {
		if (placedByAgent(ctx)) {
			return degraded(def, "no_access", "Only Superset places this card");
		}
		const refs = parseRefs(rawRefs);
		if (refs === null) {
			return degraded(def, "error", "The agent passed malformed identifiers");
		}
		try {
			return await render(refs, ctx);
		} catch (error) {
			if (error instanceof CardUnavailable) {
				return degraded(def, error.state, error.text, error.connect);
			}
			return degraded(
				def,
				"error",
				error instanceof Error
					? error.message
					: "The integration did not answer",
			);
		}
	};

	const act: RegisteredCard["act"] = async (
		rawRefs,
		actionId,
		ctx,
		input,
		confirmed,
	) => {
		if (placedByAgent(ctx)) {
			throw new CardUnavailable("no_access", "Only Superset places this card");
		}
		const action = def.actions[actionId];
		if (!action) {
			throw new CardUnavailable(
				"error",
				`${def.type} has no action ${actionId}`,
			);
		}
		const refs = parseRefs(rawRefs);
		if (refs === null) {
			throw new CardUnavailable(
				"error",
				"The agent passed malformed identifiers",
			);
		}
		const resolved = await def.resolve({ refs, ctx });
		if (!(action.applies?.(resolved.data) ?? true)) {
			throw new CardUnavailable("no_access", "That action does not apply here");
		}
		const availability = action.available?.(resolved.data, ctx) ?? true;
		if (availability !== true) {
			throw new CardUnavailable("no_access", availability);
		}
		const expected =
			action.confirm?.(resolved.data) ??
			action.confirmFor?.(resolved.data, input, ctx);
		if (expected !== undefined && expected !== confirmed) {
			throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
		}
		const ran = await action.run({
			refs,
			data: resolved.data,
			ctx,
			input: typeof input === "string" ? input : undefined,
			raw: input,
		});
		const result = {
			...ran,
			terminal: ran.terminal ?? action.terminal !== false,
		};
		const card = await resolve(
			ran.refs ? { ...(rawRefs as object), ...ran.refs } : rawRefs,
			ctx,
		);
		return {
			result,
			card: result.notice ? { ...card, notice: result.notice } : card,
		};
	};

	return {
		type: def.type,
		tier: def.tier ?? "ask",
		brand: def.brand,
		ask: def.ask,
		askFor: (rawRefs) => {
			const refs = parseRefs(rawRefs);
			return (refs !== null && def.askFor?.(refs)) || def.ask;
		},
		takesDecision: (rawRefs) => {
			const settles = Object.values(def.actions).some(
				(action) => action.terminal !== false,
			);
			const refs = parseRefs(rawRefs);
			return settles && (refs === null || def.takesDecision?.(refs) !== false);
		},
		resolve,
		act,
	};
}
