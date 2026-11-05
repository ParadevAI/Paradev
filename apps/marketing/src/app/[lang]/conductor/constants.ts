import { COMPANY } from "@superset/shared/constants";

export const CONDUCTOR_ANNOUNCEMENT_URL =
	"https://www.conductor.build/announcement";
export const MIGRATE_LOCAL_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor`;
export const MIGRATE_CLOUD_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor-cloud`;
export const COMPARE_PATH = "/compare/superset-vs-conductor";

interface TextLink {
	label: string;
	href: string;
}

interface TimelineEntry {
	date: string;
	dateTime: string;
	title: string;
	detail: string;
	urgent?: boolean;
}

export const TIMELINE: TimelineEntry[] = [
	{
		date: "Nov 4, 2026",
		dateTime: "2026-11-04",
		title: "Conductor joins Meta",
		detail: "The Conductor team announces it is joining Meta.",
	},
	{
		date: "Nov 13, 2026",
		dateTime: "2026-11-13",
		title: "Conductor Cloud goes read-only",
		detail:
			"You can still read chats and export data, but you cannot send messages to agents.",
		urgent: true,
	},
	{
		date: "Nov 20, 2026",
		dateTime: "2026-11-20",
		title: "Conductor Cloud shuts down",
		detail:
			"Conductor begins to delete cloud data. Push branches and export chats before this date.",
		urgent: true,
	},
	{
		date: "Early 2027",
		dateTime: "2027",
		title: "The Mac app winds down",
		detail:
			"The local Conductor app keeps working until then, so local work can move at your own pace.",
	},
];

interface MigrationStep {
	title: string;
	detail: string;
	link?: TextLink;
	optional?: boolean;
}

export const MIGRATION_STEPS: MigrationStep[] = [
	{
		title: "Install Paradev",
		detail:
			"Download the desktop app for macOS. A Linux AppImage is available as an experimental build.",
	},
	{
		title: "Sign in",
		detail:
			"Create an account or sign in. The Free plan covers one user with local workspaces.",
	},
	{
		title: "Add your repos and worktrees",
		detail:
			"Add the same repository folders Conductor used. Paradev finds Conductor's worktrees and imports them in place, with their branches and uncommitted changes. Nothing is copied or moved.",
		link: { label: "Migration guide", href: MIGRATE_LOCAL_URL },
	},
	{
		title: "Pick your agents",
		detail:
			"Claude Code, Codex, Cursor Agent, and OpenCode run on the subscriptions and keys you already have. Add any other CLI as a custom agent.",
		link: {
			label: "Supported agents",
			href: `${COMPANY.DOCS_URL}/supported-agents`,
		},
	},
	{
		title: "Add cloud workspaces",
		detail:
			"Coming from Conductor Cloud? Push your branches, then continue on your Mac or in a Paradev cloud workspace on the Team or Ultra plan.",
		link: { label: "Conductor Cloud guide", href: MIGRATE_CLOUD_URL },
		optional: true,
	},
];

interface ComparisonRow {
	label: string;
	paradev: string;
	conductor: string;
	beta?: boolean;
	unpricedParadev?: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
	{
		label: "Status",
		paradev: "Available and open to new users",
		conductor:
			"Joining Meta. Cloud shuts down Nov 20, 2026. The Mac app winds down in early 2027",
	},
	{
		label: "Workspace model",
		paradev: "One Git worktree and branch per task",
		conductor: "One Git worktree and branch per task",
	},
	{
		label: "Agents",
		paradev:
			"Claude Code, Codex, Cursor Agent, OpenCode, Gemini, Copilot, Amp, and any CLI agent you add",
		conductor: "Claude Code, Codex, Cursor, OpenCode",
	},
	{
		label: "Cloud workspaces",
		paradev: "On Team and Ultra plans",
		conductor: "Read-only Nov 13, shut down Nov 20, 2026",
		beta: true,
	},
	{
		label: "Review",
		paradev:
			"Changes pane to commit, push, and open PRs; checks and review threads",
		conductor: "Diffs, checks, pull requests",
	},
	{
		label: "Scheduled runs",
		paradev: "Automations on your machine, a host, or the cloud",
		conductor: "Routines, which end with Conductor Cloud",
	},
	{
		label: "Phone",
		paradev: "iPhone and iPad app on paid plans",
		conductor: "iOS app for cloud workspaces, which shut down Nov 20",
	},
	{
		label: "Programmatic control",
		paradev: "CLI, TypeScript SDK, and MCP server",
		conductor: "API and MCP server",
	},
	{
		label: "Desktop platforms",
		paradev: "macOS; Linux (experimental). No Windows yet",
		conductor: "macOS",
	},
	{
		label: "Pricing",
		paradev:
			"Free for one user; Pro {{price:pro}} per user/month; Team {{price:team}} per user/month",
		unpricedParadev: "Free for one user; paid Pro, Team, and Ultra plans",
		conductor: "No longer on sale",
	},
];

export const TRANSFERS: string[] = [
	"Your repositories, worktrees, and branches, imported in place",
	"Uncommitted changes in those worktrees",
	"Your agent subscriptions and API keys",
	"Setup, run, and archive scripts, after you convert conductor.json to .paradev/config.json",
	"Claude Code sessions: run claude --resume in an imported workspace (Claude Code deletes sessions older than 30 days by default)",
];

export const DOES_NOT_TRANSFER: string[] = [
	"Conductor's chat history. No tool, Paradev included, can import it. Export it from Conductor under Settings → Account → Export data",
	"Unpushed work in Conductor Cloud. Commit and push every branch before November 20",
	"Git-ignored files in cloud workspaces, such as .env files. Copy them out yourself",
	"CONDUCTOR_PORT. Paradev detects the ports each workspace listens on instead of assigning them",
];

interface FaqItem {
	id: string;
	question: string;
	answer: string;
	unpricedAnswer?: string;
	link?: TextLink;
}

export const FAQ_ITEMS: FaqItem[] = [
	{
		id: "open-source",
		question: "Is Paradev open source?",
		answer:
			"Yes. Paradev (formerly Superset) is open source under the MIT License, and the code is on GitHub.",
		link: { label: "View on GitHub", href: COMPANY.GITHUB_URL },
	},
	{
		id: "model-calls",
		question: "Do you proxy my model calls?",
		answer:
			"No. Agents use your own subscriptions and keys, and the provider bills you directly. On your own machine, agents call their providers without Paradev in between. In cloud workspaces, no key is copied into the sandbox: agents see a placeholder, and Paradev adds your sign-in to their outgoing requests.",
		link: {
			label: "Cloud credentials",
			href: `${COMPANY.DOCS_URL}/cloud-workspaces#credentials`,
		},
	},
	{
		id: "windows",
		question: "Does Paradev run on Windows?",
		answer:
			"Not yet. The desktop app runs on macOS, and Linux is available as an experimental AppImage. On Windows, you can join the waitlist from the download button.",
	},
	{
		id: "pricing",
		question: "How much does Paradev cost?",
		answer:
			"Paradev is free for one user with local workspaces. Pro is {{price:pro}} per user/month, or {{price:pro:yearly}} billed yearly, and adds remote access, automations, and the mobile app. Team is {{price:team}} per user/month, or {{price:team:yearly}} billed yearly, and adds cloud workspaces (beta). Agent-provider usage is billed separately by the provider.",
		unpricedAnswer:
			"Paradev is free for one user with local workspaces. Paid plans are priced per user per month: Pro adds remote access, automations, and the mobile app, and Team adds cloud workspaces (beta). Agent-provider usage is billed separately by the provider.",
		link: { label: "See pricing", href: "/pricing" },
	},
	{
		id: "team",
		question: "Can my team share workspaces?",
		answer:
			"Yes, on paid plans. Members of a Paradev organization can work on the hosts you grant them access to, and cloud environments are visible to the whole organization by default.",
		link: { label: "Cloud workspaces", href: "/cloud" },
	},
	{
		id: "cloud-data",
		question: "What happens to my Conductor Cloud data?",
		answer:
			"Conductor Cloud goes read-only on November 13, 2026, and Conductor begins to delete cloud data after it shuts down on November 20. Paradev cannot reach or import that data. Before then, push every branch, copy out any Git-ignored files you need, and export your chats from Conductor. You can also transfer a cloud workspace to your Mac in Conductor, then import it into Paradev.",
		link: { label: "Conductor Cloud guide", href: MIGRATE_CLOUD_URL },
	},
];
