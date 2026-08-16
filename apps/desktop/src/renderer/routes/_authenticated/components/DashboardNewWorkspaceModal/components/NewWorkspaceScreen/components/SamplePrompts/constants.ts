export interface SamplePrompt {
	id: string;
	/** Short row label shown in the UI, and the card title. */
	label: string;
	/** Card-only supporting line; the row layout shows the label alone. */
	description: string;
	/** Full instruction inserted into the composer on click. */
	prompt: string;
}

export const SAMPLE_PROMPTS: SamplePrompt[] = [
	{
		id: "set-up-project",
		label: "Set up this project for Superset",
		description:
			"Write setup and teardown scripts so every new workspace starts ready to run.",
		prompt: `Set up this repository to work well with Superset workspaces. Read https://docs.superset.sh/setup-teardown-scripts and create a .superset/config.json with: setup commands that install dependencies and copy untracked files (like .env) from "$SUPERSET_ROOT_PATH" into new workspaces, teardown commands that stop anything setup starts, and a run command that launches the dev server. If parallel workspaces would collide on dev-server ports, make the scripts pick a free port per workspace (see https://docs.superset.sh/ports). When you're done, summarize what you configured and how to use it.`,
	},
	{
		id: "explain-repo",
		label: "Explain to me how this repository works",
		description:
			"Get an architecture tour: entry points, how to run it, what to read first.",
		prompt:
			"Explain how this repository works: the overall architecture, the main entry points, how to run it locally, and what I should read first to get productive. Keep it practical and concrete.",
	},
	{
		id: "fix-small-bug",
		label: "Find and fix a small bug",
		description:
			"Pick a low-risk papercut, fix it, and explain how it was verified.",
		prompt:
			"Find a small, low-risk bug or papercut in this codebase and fix it. Keep the change minimal, explain what the bug was, and describe how you verified the fix.",
	},
	{
		id: "improve-agent-docs",
		label: "Improve the agent instructions",
		description:
			"Audit AGENTS.md / CLAUDE.md against the codebase and fill the gaps.",
		prompt:
			"Review this repository's agent instruction files (AGENTS.md, CLAUDE.md, or similar). Compare them against how the codebase actually works today: commands, structure, conventions. Fix anything stale, and add the few things a coding agent most often needs and can't easily discover. Create the file if none exists. Keep it concise.",
	},
	{
		id: "add-missing-tests",
		label: "Add tests where they're missing",
		description:
			"Find recently changed code with weak coverage and test it properly.",
		prompt:
			"Look at recently changed or complex code in this repository that lacks test coverage. Pick the highest-risk gap, write focused tests for it following the project's existing test conventions, and make sure they pass. Explain what you covered and why it mattered most.",
	},
	{
		id: "clean-up-todos",
		label: "Knock out some TODOs",
		description: "Find stale TODO/FIXME comments and resolve the quick ones.",
		prompt:
			"Search this codebase for TODO and FIXME comments. Triage them: resolve the ones that are quick and low-risk, delete the ones that are obsolete, and list the ones that need a real project. Keep each fix minimal and explain what you did.",
	},
];

/**
 * Fisher-Yates over a copy — the pool is bigger than either layout shows, so
 * a fixed slice would leave the tail prompts permanently unreachable.
 */
export function shuffledSamplePrompts(): SamplePrompt[] {
	const prompts = [...SAMPLE_PROMPTS];
	for (let i = prompts.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[prompts[i], prompts[j]] = [
			prompts[j] as SamplePrompt,
			prompts[i] as SamplePrompt,
		];
	}
	return prompts;
}

/**
 * Composer ghost text: one is picked per screen-open so the empty state
 * suggests a concrete next action instead of a static question.
 */
export const PROMPT_PLACEHOLDERS: string[] = [
	"What do you want to do?",
	"Find a small bug and fix it…",
	"Add tests for the riskiest untested code…",
	"Explain how this repository works…",
	"Track down that flaky test…",
	"Upgrade a dependency and fix what breaks…",
	"Clean up stale TODOs…",
	"Write docs for the part everyone asks about…",
];
