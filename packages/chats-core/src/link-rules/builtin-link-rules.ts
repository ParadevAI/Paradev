import type { LinkRule } from "./link-rules.ts";

/** GitHub's own pages, which sit where an owner would: `github.com/settings/tokens` names no repository. */
const GITHUB_PAGES = [
	"settings",
	"orgs",
	"organizations",
	"notifications",
	"pulls",
	"issues",
	"marketplace",
	"explore",
	"topics",
	"search",
	"sponsors",
	"login",
	"new",
	"codespaces",
	"features",
	"about",
];
const NOT_A_PAGE = { owner: GITHUB_PAGES };
/** Notion ends a page's slug with its 32-character id; Linear a project's with a 12-character one. */
const NOTION_ID = /-?[0-9a-f]{32}$/i;
const LINEAR_PROJECT_ID = /-[0-9a-f]{12}$/i;
/** Superset's page slugs end with a short random tag ("…-options-o075t4"). */
const PAGE_TAG = /-(?=[a-z0-9]*\d)[a-z0-9]{6}$/;

const words = (slug: string) => {
	const text = slug.replace(/[-_]+/g, " ").trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
};
const digits = (id: string) => /^\d+$/.test(id);

/** The apps Dev knows, each with the hosts it lives on and what its addresses say; an app with no pattern for an address gets its own name. */
export const BUILTIN_LINK_RULES: readonly LinkRule[] = [
	{
		app: "gmail",
		hosts: ["mail.google.com"],
		patterns: [{ path: "/**", label: "Email" }],
	},
	{ app: "google-calendar", hosts: ["calendar.google.com"], patterns: [] },
	{
		app: "linear",
		hosts: ["linear.app"],
		patterns: [
			{ path: "/:team/issue/:key/**", label: "{key|upper}" },
			{
				path: "/:team/project/:slug/**",
				label: ({ slug }) =>
					words(slug!.replace(LINEAR_PROJECT_ID, "")) || null,
			},
		],
	},
	{
		app: "github",
		hosts: ["github.com", "gist.github.com"],
		patterns: [
			{
				path: "/:owner/:repo/pull/:id/**",
				label: ({ owner, repo, id }) =>
					digits(id!) ? `${owner}/${repo}#${id}` : null,
				not: NOT_A_PAGE,
			},
			{
				path: "/:owner/:repo/issues/:id/**",
				label: ({ owner, repo, id }) =>
					digits(id!) ? `${owner}/${repo}#${id}` : null,
				not: NOT_A_PAGE,
			},
			{
				path: "/:owner/:repo/commit/:id/**",
				label: ({ repo, id }) => `${repo}@${id!.slice(0, 7)}`,
				not: NOT_A_PAGE,
			},
			{
				path: "/:owner/:repo/blob/:ref/**",
				label: (_, rest) => rest.at(-1) ?? null,
				not: NOT_A_PAGE,
			},
			{
				path: "/:owner/:repo/tree/:ref/**",
				label: (_, rest) => rest.at(-1) ?? null,
				not: NOT_A_PAGE,
			},
			{ path: "/:owner/:repo", label: "{owner}/{repo}", not: NOT_A_PAGE },
			{ path: "/:owner", label: "{owner}", not: NOT_A_PAGE },
		],
	},
	{
		app: "slack",
		hosts: ["*.slack.com"],
		patterns: [{ path: "/archives/**", label: "Slack message" }],
	},
	{
		app: "notion",
		hosts: ["*.notion.so", "*.notion.site"],
		patterns: [
			{
				path: "/**",
				label: (_, rest) =>
					words(rest.at(-1)?.replace(NOTION_ID, "") ?? "") || null,
			},
		],
	},
	{
		app: "sentry",
		hosts: ["*.sentry.io"],
		patterns: [
			{
				path: "/**",
				label: (_, rest) => {
					const id = rest[rest.indexOf("issues") + 1];
					return rest.includes("issues") && id && digits(id)
						? `Issue ${id}`
						: null;
				},
			},
		],
	},
	{ app: "posthog", hosts: ["*.posthog.com"], patterns: [] },
	{
		app: "vercel",
		hosts: ["vercel.com"],
		patterns: [{ path: "/:team/:project/**", label: "{project}" }],
	},
	{ app: "stripe", hosts: ["*.stripe.com"], patterns: [] },
	{ app: "neon", hosts: ["*.neon.tech", "*.neon.com"], patterns: [] },
	{ app: "ynab", hosts: ["*.ynab.com"], patterns: [] },
	{ app: "granola", hosts: ["*.granola.ai", "*.granola.so"], patterns: [] },
	{ app: "superhuman", hosts: ["*.superhuman.com"], patterns: [] },
	{ app: "circleback", hosts: ["*.circleback.ai"], patterns: [] },
	{ app: "typefully", hosts: ["*.typefully.com"], patterns: [] },
	{
		app: "superset",
		hosts: ["*.superset.sh"],
		patterns: [
			{
				path: "/page/:slug/**",
				label: ({ slug }) => words(slug!.replace(PAGE_TAG, "")),
			},
			{ path: "/tasks/:id/**", label: "{id|upper}" },
			{ path: "/workspaces/:id/**", label: "Workspace {id|short}" },
		],
		// The desktop app's address for a workspace, which Superset's CLI prints beside the web one.
		rewrites: [
			{
				from: "superset://v2-workspace/:id",
				to: "https://app.superset.sh/workspaces/:id",
			},
		],
	},
	{ app: "autumn", hosts: ["*.useautumn.com"], patterns: [] },
	{ app: "exa", hosts: ["*.exa.ai"], patterns: [] },
];
