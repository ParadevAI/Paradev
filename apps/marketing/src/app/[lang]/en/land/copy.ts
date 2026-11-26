import { COMPANY } from "@superset/shared/constants";

export interface FeatureOverlay {
	id: "parallel-execution" | "cli-sdk";
	title: string;
	description: string;
}
export interface LandingCopy {
	lead: string;
	emphasis: string;
	description?: string;
	indexable?: boolean;
	subheadline?: string;
	badge?: { label: string; href: string };
	feature?: FeatureOverlay;
}
export const landingCopy = {
	"claude-code-parallel-sessions": {
		lead: "Run Claude Code",
		emphasis: "Sessions Side by Side",
		feature: {
			id: "parallel-execution",
			title: "Track your sessions in one window",
			description:
				"Each task gets its own Git worktree. See what’s running and open the diff for a task that’s ready for review.",
		},
	},
	"claude-code-worktrees": {
		lead: "Skip Manual Worktree Setup",
		emphasis: "for Claude Code",
		feature: {
			id: "cli-sdk",
			title: "Start a task from your terminal",
			description:
				"Start a local task on a new branch. Paradev creates the Git worktree and opens a terminal for Claude Code.",
		},
	},
	"codex-cli-worktrees": {
		lead: "Run Codex CLI Tasks",
		emphasis: "in Separate Worktrees",
		feature: {
			id: "parallel-execution",
			title: "Switch tasks without stashing",
			description:
				"Paradev creates a Git worktree for each task. Review one Codex diff while another task keeps running on its own branch.",
		},
	},
	"black-friday": {
		indexable: true,
		lead: "Black Friday:",
		emphasis: "90 Days of Pro, Free",
		description:
			"Paradev is open source. For Black Friday, enter BFCM2026 at checkout to get 90 days of Pro free.",
		subheadline:
			"The open-source workspace for Claude Code, Codex, and any agent. Enter BFCM2026 at checkout.",
		badge: {
			label: "Paradev is open source (MIT)",
			href: COMPANY.GITHUB_URL,
		},
	},
} satisfies Record<string, LandingCopy>;
