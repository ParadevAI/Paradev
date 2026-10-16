interface LegacyRedirect {
	source: string;
	destination: string;
	permanent: true;
}

// Indexed URLs that 404 today, mapped to their closest live page.
export const LEGACY_PAGE_REDIRECTS: Record<string, string> = {
	"/blog/parallel-agents-guide": "/blog/parallel-coding-agents-guide",
	"/blog/terminal-daemon-deep-dick": "/blog/terminal-daemon-deep-dive",
	"/compare/agentic-ide-for-ai-agents": "/compare/best-agentic-ide",
	"/compare/base-ai-agents": "/compare/best-coding-agents",
	"/compare/berdr-alternative": "/compare/herdr-alternative",
	"/compare/best-agent-environment":
		"/compare/best-agent-development-environment",
	"/compare/best-agent-management-tools-2026":
		"/compare/best-agent-development-environment",
	"/compare/best-agent-terminal": "/compare/best-terminal-for-ai-coding",
	"/compare/best-agentic-ides": "/compare/best-agentic-ide",
	"/compare/best-ai-agent-agents-2026": "/compare/best-coding-agents",
	"/compare/best-ai-agent-orchestration-platforms-2026": "/agent-orchestration",
	"/compare/best-ai-agents": "/compare/best-coding-agents",
	"/compare/best-ai-agents-2026": "/compare/best-coding-agents",
	"/compare/best-ai-coding": "/compare/best-ai-coding-agents-2026",
	"/compare/best-ai-coding-2026": "/compare/best-ai-coding-agents-2026",
	"/compare/best-ai-coding-agents": "/compare/best-coding-agents",
	"/compare/best-ai-coding-agents-for-your-ide":
		"/compare/best-ide-for-ai-agents",
	"/compare/best-ai-coding-environment":
		"/compare/best-agent-development-environment",
	"/compare/best-ai-coding-tools-2026": "/compare/best-ai-coding-agents-2026",
	"/compare/best-ai-for-agents": "/compare/best-coding-agents",
	"/compare/best-ai-ide-for-ai-agents": "/compare/best-ide-for-ai-agents",
	"/compare/best-editor-for-ai-agents": "/compare/best-ide-for-ai-agents",
	"/compare/best-ent-ai-coding": "/compare/best-ai-coding-agents-2026",
	"/compare/best-for-ai-coding": "/compare/best-ai-coding-agents-2026",
	"/compare/best-ide-for-ai-coding-agents": "/compare/best-ide-for-ai-agents",
	"/compare/best-terminal-ai-coding": "/compare/best-terminal-for-ai-coding",
	"/compare/best-terminal-ai-coding-agents":
		"/compare/best-terminal-for-ai-coding",
	"/compare/best-terminal-ai-coding-dark-mode":
		"/compare/best-terminal-for-ai-coding",
	"/compare/best-terminal-for-agent-coding":
		"/compare/best-terminal-for-ai-coding",
	"/compare/best-terminal-for-agentic-coding":
		"/compare/best-terminal-for-ai-coding",
	"/compare/best-terminal-for-ai-coding-agents":
		"/compare/best-terminal-for-ai-coding",
	"/compare/claude-code-type-codex": "/compare/claude-code-vs-codex",
	"/compare/con": "/compare",
	"/compare/conductor-vss-cursor": "/compare/conductor-vs-cursor",
	"/compare/git-worktrees-for-ai-coding-agents-the-parallel-workflow":
		"/compare/git-worktrees-for-ai-agents",
	"/compare/herder-alternative": "/compare/herdr-alternative",
	"/compare/multiple-open-code-agents-parallel":
		"/compare/multiple-opencode-agents-parallel",
	"/compare/orca-v-conductor": "/compare/orca-vs-conductor",
	"/compare/pca": "/compare",
	"/compare/superset": "/compare",
	"/compare/superset-alternative": "/compare",
	"/compare/superset-orca": "/compare/superset-vs-orca",
	"/compare/superset-v-orca": "/compare/superset-vs-orca",
	"/compare/superset-v-paseo": "/compare/superset-vs-paseo",
	"/compare/superset-v-warp": "/compare/superset-vs-warp",
	"/compare/superset-vs-superset": "/compare",
	"/compare/t3-code": "/compare/t3-code-alternative",
	"/compare/what-is-new": "/changelog",
	"/marketplace/themes/catppuccin-latte": "/marketplace/themes",
	"/marketplace/themes/solarized-light": "/marketplace/themes",
};

// Marketing paths whose page moved to the docs site, mapped to the docs path.
export const LEGACY_DOCS_REDIRECTS: Record<string, string> = {
	"/cli/getting-started": "/cli/getting-started",
};

export function buildLegacyRedirects({
	locales,
	docsUrl,
}: {
	locales: readonly string[];
	docsUrl: string;
}): LegacyRedirect[] {
	const localePrefix = `/:lang(${locales.filter((locale) => locale !== "en").join("|")})`;
	const pages = Object.entries(LEGACY_PAGE_REDIRECTS).flatMap(
		([source, destination]): LegacyRedirect[] => [
			{ source: `/:lang(en)?${source}`, destination, permanent: true },
			{
				source: `${localePrefix}${source}`,
				destination: `/:lang${destination}`,
				permanent: true,
			},
		],
	);
	const docs = Object.entries(LEGACY_DOCS_REDIRECTS).map(
		([source, destination]): LegacyRedirect => ({
			source: `/:lang(${locales.join("|")})?${source}`,
			destination: `${docsUrl}${destination}`,
			permanent: true,
		}),
	);
	return [...pages, ...docs];
}
