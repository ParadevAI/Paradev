export interface PressArticle {
	outlet: string;
	title: string;
	url: string;
	/** Publication date, YYYY-MM-DD. */
	date: string;
}

/** Newest first. Titles are the outlet's own, in the language it published in. */
export const PRESS_ARTICLES: PressArticle[] = [
	{
		outlet: "THE BRIDGE",
		title:
			"日本の開発者は1.3万人超え、Claude CodeやCodexを数百並列で動かす「Paradev」（旧Superset）1,150万ドルを調達",
		url: "https://thebridge.jp/2026/10/paradev-superset-yc-parallel-coding-agents-seed-funding",
		date: "2026-10-27",
	},
	{
		outlet: "Founderland",
		title: "Paradev raises $11.5M to run coding agents in parallel",
		url: "https://www.founderland.ai/articles/paradev-raises-115m-to-run-coding-agents-in-parallel-mvqwfak4",
		date: "2026-10-27",
	},
	{
		outlet: "Union Square Ventures",
		title: "Paradev",
		url: "https://www.usv.com/writing/paradev",
		date: "2026-10-26",
	},
	{
		outlet: "Agentic Weekly",
		title: "Superset is now Paradev: desktop v2.0.0",
		url: "https://theagenticweekly.com/news/superset-renamed-paradev-desktop-2-0-seed",
		date: "2026-10-26",
	},
	{
		outlet: "MakeUseOf",
		title:
			"I stopped running one coding agent at a time after trying this weird new IDE",
		url: "https://www.makeuseof.com/stopped-running-one-coding-agent-trying-weird-new-ide/",
		date: "2026-09-30",
	},
	{
		outlet: "TechCrunch",
		title: "The 11 standout startups from YC's Demo Day, according to VCs",
		url: "https://techcrunch.com/2026/06/18/the-11-standout-startups-from-ycs-demo-day-according-to-vcs/",
		date: "2026-06-18",
	},
	{
		outlet: "Contentedge",
		title: "Superset Is Turning AI Coding From Single-Player to Multiplayer",
		url: "https://www.contentedge.com/blog/superset-parallel-ai-coding-agents",
		date: "2026-06-12",
	},
	{
		outlet: "The Silicon Valley Post",
		title: "The Top DevTech Startups in YC P26",
		url: "https://svpost.com/articles/top-devtech-startups-yc-p26/",
		date: "2026-06-10",
	},
	{
		outlet: "The Agent Times",
		title: "Superset Builds an IDE Where We Run in Parallel, Not in Sidebar",
		url: "https://theagenttimes.com/articles/superset-builds-an-ide-where-we-run-in-parallel-not-in-sideb-1f6714fd",
		date: "2026-05-23",
	},
];
