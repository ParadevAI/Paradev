// Generated from the internal product roadmap (Notion → .github/prompts/update-roadmap.md).
// Only items marked Public in Notion appear here; descriptions are the public copy, not internal notes.
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type RoadmapCategory =
	| "Agents"
	| "Desktop"
	| "Platform"
	| "Mobile"
	| "Integrations";

export type RoadmapStatus = "now" | "next" | "later" | "shipped";

interface RoadmapItemBase {
	id: string;
	title: MessageDescriptor;
	description: MessageDescriptor;
	category: RoadmapCategory;
}

interface ActiveRoadmapItem extends RoadmapItemBase {
	status: "now" | "next" | "later";
}

interface ShippedRoadmapItem extends RoadmapItemBase {
	status: "shipped";
	shippedDate: string;
	/** Screenshot from the matching changelog entry, when one exists. */
	image?: string;
	/** Link to the changelog entry covering the ship. */
	href?: string;
	/** GitHub PR URL, for ships not (yet) covered by a changelog entry. */
	pr?: string;
}

export type RoadmapItem = ActiveRoadmapItem | ShippedRoadmapItem;

export const CATEGORIES: RoadmapCategory[] = [
	"Agents",
	"Desktop",
	"Platform",
	"Mobile",
	"Integrations",
];

export const CATEGORY_LABELS: Record<RoadmapCategory, MessageDescriptor> = {
	Agents: msg({ message: "Agents" }),
	Desktop: msg({
		message: "Desktop",
	}),
	Platform: msg({
		message: "Platform",
	}),
	Mobile: msg({ message: "Mobile" }),
	Integrations: msg({
		message: "Integrations",
	}),
};

export const STATUS_LABELS: Record<RoadmapStatus, MessageDescriptor> = {
	now: msg({ message: "In Progress" }),
	next: msg({ message: "Up Next" }),
	later: msg({ message: "Exploring", context: "roadmap" }),
	shipped: msg({
		message: "Recently Shipped",
	}),
};

export const STATUS_DESCRIPTIONS: Record<RoadmapStatus, MessageDescriptor> = {
	now: msg({
		message: "Being built right now.",
	}),
	next: msg({
		message: "Committed, starting soon.",
	}),
	later: msg({
		message: "On our radar. Order and scope may change.",
	}),
	shipped: msg({
		message: "Live in the app.",
	}),
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	// ── Now ──────────────────────────────────────────
	{
		id: "mcp-manager",
		title: msg({
			message: "MCP manager",
		}),
		description: msg({
			message:
				"Install, authorize, and scope MCP servers across all your workspaces from one place, with centralized OAuth.",
		}),
		category: "Integrations",
		status: "now",
	},
	{
		id: "agent-memory",
		title: msg({
			message: "Per-repo agent memory",
		}),
		description: msg({
			message:
				"Agents remember what they learn about your codebase, so every new session starts warm.",
		}),
		category: "Agents",
		status: "next",
	},
	{
		id: "superset-teams",
		title: msg({
			message: "Superset Teams",
		}),
		description: msg({
			message:
				"Shared settings and simpler membership for teams that work in Superset together.",
		}),
		category: "Platform",
		status: "next",
	},
	{
		id: "team-activity-feed",
		title: msg({
			message: "Team activity feed",
		}),
		description: msg({
			message:
				"See what your teammates' agents are working on, shipping, and blocked on.",
		}),
		category: "Platform",
		status: "next",
	},
	{
		id: "plugin-marketplace",
		title: msg({
			message: "Plugin marketplace",
		}),
		description: msg({
			message:
				"Browse and install skills, MCP servers, and agent configs shared by the community.",
		}),
		category: "Integrations",
		status: "next",
	},
	{
		id: "chat-v3",
		title: msg({
			message: "Next-generation chat",
		}),
		description: msg({
			message:
				"A rebuilt chat surface for driving agents: richer tool output, smoother steering, faster everything.",
		}),
		category: "Agents",
		status: "now",
	},
	{
		id: "cloud-sandboxes",
		title: msg({
			message: "Cloud sandboxes",
		}),
		description: msg({
			message:
				"Machine-unbound cloud workspaces that spin up in seconds and can be shared with teammates.",
		}),
		category: "Platform",
		status: "now",
	},
	{
		id: "ios-simulator-pane",
		title: msg({
			message: "iOS simulator pane",
		}),
		description: msg({
			message:
				"Run an iOS simulator in a workspace pane so you and your agents can test mobile apps.",
		}),
		category: "Desktop",
		status: "now",
	},

	// ── Later ────────────────────────────────────────
	{
		id: "improved-diff-viewer",
		title: msg({
			message: "Improved diff viewer",
		}),
		description: msg({
			message:
				"A faster, clearer diff experience for reviewing what your agents changed.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Sep 2026",
		href: "/changelog/2026-09-06-changes-pane-ship-flow-image-diffs",
		image: "/changelog/2026-09-06-media-diff.png",
	},
	{
		id: "project-wide-search",
		title: msg({
			message: "Project-wide search",
		}),
		description: msg({
			message:
				"Search across file contents and across all your workspaces at once.",
		}),
		category: "Desktop",
		status: "later",
	},
	{
		id: "autonomous-ticket-to-pr",
		title: msg({
			message: "Autonomous ticket-to-PR pipeline",
		}),
		description: msg({
			message:
				"File a ticket, get back a verified, merge-ready PR, with screenshots or a screencast as proof the change works.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "orchestration-chat",
		title: msg({
			message: "Orchestration chat",
		}),
		description: msg({
			message:
				"One chat that plans a task, fans out parallel agents across worktrees, and brings the results back together.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "self-verification",
		title: msg({
			message: "Agent self-verification",
		}),
		description: msg({
			message:
				"Agents load their own preview, drive the UI, and attach screenshot proof before marking work ready for review.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "session-snapshots",
		title: msg({
			message: "Session snapshots & revert",
		}),
		description: msg({
			message:
				"Roll back an agent session to any checkpoint, conversation and file changes together.",
		}),
		category: "Desktop",
		status: "later",
	},
	{
		id: "attention-queue",
		title: msg({
			message: "Attention queue",
		}),
		description: msg({
			message:
				"Always know which agent needs you, with notifications that deep-link straight to the blocked agent.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		href: "/changelog/2026-08-16-workspaces-triage-editable-markdown",
		image: "/changelog/2026-08-16-workspaces-triage.png",
	},
	{
		id: "sdk-api",
		title: msg({
			message: "SDK & public API",
		}),
		description: msg({
			message:
				"Drive workspaces, agents, and sessions programmatically from scripts, CI, or your own tools.",
		}),
		category: "Platform",
		status: "later",
	},
	{
		id: "sso",
		title: msg({
			message: "SSO (SAML / OIDC)",
		}),
		description: msg({
			message: "Single sign-on for organizations, self-serve configurable.",
		}),
		category: "Platform",
		status: "later",
	},

	// ── Shipped ──────────────────────────────────────
	{
		id: "automations",
		title: msg({
			message: "Automations & event triggers",
		}),
		description: msg({
			message:
				"Scheduled and event-triggered agents (cron, GitHub, Slack, Linear, Sentry, Notion, Microsoft Teams, webhooks) with ready-made templates.",
		}),
		category: "Agents",
		status: "shipped",
		shippedDate: "Oct 2026",
		image: "/changelog/2026-10-04-automation-history.png",
		href: "/changelog/2026-10-04-automation-history-linear-tasks",
	},
	{
		id: "work-from-tickets",
		title: msg({
			message: "Work from tickets",
		}),
		description: msg({
			message:
				"Start workspaces straight from Linear or GitHub issues in the Tasks view, with an agent already working on each one.",
		}),
		category: "Integrations",
		status: "shipped",
		shippedDate: "Oct 2026",
		image: "/changelog/2026-10-04-linear-board.png",
		href: "/changelog/2026-10-04-automation-history-linear-tasks",
	},
	{
		id: "ios-app",
		title: msg({
			message: "iOS app",
		}),
		description: msg({
			message:
				"Monitor, steer, and unblock your agents from your iPhone or iPad.",
		}),
		category: "Mobile",
		status: "shipped",
		shippedDate: "Oct 2026",
		image: "/images/blog/superset-mobile/hero.png",
		href: "/changelog/2026-09-28-file-editing-instant-workspaces",
	},
	{
		id: "in-app-pr-merge",
		title: msg({
			message: "In-app PR merge",
		}),
		description: msg({
			message:
				"Merge pull requests without leaving Superset, plus a round of chat fixes and polish.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-23-pull-requests-split.png",
		href: "/changelog/2026-08-23-pull-requests-multi-window-design-mode",
	},
	{
		id: "native-pr-reviews",
		title: msg({
			message: "Native PR reviews",
		}),
		description: msg({
			message:
				"Review pull requests inside Superset: diff pane, agent-assisted review, act on comments directly.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-09-13-pr-comments.png",
		href: "/changelog/2026-09-13-pull-request-pane-subagents-new-agents",
	},
	{
		id: "embedded-browser",
		title: msg({
			message: "Embedded browser improvements",
		}),
		description: msg({
			message:
				"A better in-app browser: preview your changes and click any element to send it to the agent as context.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		href: "/changelog/2026-08-23-pull-requests-multi-window-design-mode",
	},
	{
		id: "onboarding",
		title: msg({
			message: "Smoother onboarding",
		}),
		description: msg({
			message:
				"A faster path from install to your first agent run, with a guided first workspace.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
	},
	{
		id: "offline-local-first",
		title: msg({
			message: "Offline / local-first mode",
		}),
		description: msg({
			message:
				"The full core loop (import a repo, run an agent, review the diff) now works signed out and offline.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		pr: "https://github.com/superset-sh/superset/pull/5731",
	},
	{
		id: "stability-pass",
		title: msg({
			message: "Stability improvements",
		}),
		description: msg({
			message:
				"A focused burn-down of crashes, hangs, and reconnect failures across the app.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
	},
];
