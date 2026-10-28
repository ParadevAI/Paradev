export interface PressArticle {
	outlet: string;
	/** Outlet's site icon, saved under public/media/press. */
	icon: string;
	/** The article's own preview image, saved under public/media/press/previews. */
	image?: string;
	title: string;
	/** BCP 47 language of the title, so it's announced correctly on every locale. */
	titleLang: string;
	url: string;
	/** Publication date, YYYY-MM-DD. */
	date: string;
}

/** Newest first. Titles are the outlet's own, in the language it published in. */
export const PRESS_ARTICLES: PressArticle[] = [
	{
		outlet: "THE BRIDGE",
		icon: "/media/press/the-bridge.png",
		image: "/media/press/previews/the-bridge.jpg",
		title:
			"日本の開発者は1.3万人超え、Claude CodeやCodexを数百並列で動かす「Paradev」（旧Superset）1,150万ドルを調達",
		url: "https://thebridge.jp/2026/10/paradev-superset-yc-parallel-coding-agents-seed-funding",
		titleLang: "ja",
		date: "2026-10-27",
	},
	{
		outlet: "Founderland",
		icon: "/media/press/founderland.png",
		image: "/media/press/previews/founderland.jpg",
		title: "Paradev raises $11.5M to run coding agents in parallel",
		url: "https://www.founderland.ai/articles/paradev-raises-115m-to-run-coding-agents-in-parallel-mvqwfak4",
		titleLang: "en",
		date: "2026-10-27",
	},
	{
		outlet: "Union Square Ventures",
		icon: "/media/press/usv.png",
		image: "/media/press/previews/usv.jpg",
		title: "Paradev",
		url: "https://www.usv.com/writing/paradev",
		titleLang: "en",
		date: "2026-10-26",
	},
	{
		outlet: "Agentic Weekly",
		icon: "/media/press/agentic-weekly.png",
		image: "/media/press/previews/agentic-weekly.jpg",
		title:
			"Superset is now Paradev: parallel coding-agent app ships desktop v2.0.0 and an $11.5M seed",
		url: "https://theagenticweekly.com/news/superset-renamed-paradev-desktop-2-0-seed",
		titleLang: "en",
		date: "2026-10-26",
	},
	{
		outlet: "MakeUseOf",
		icon: "/media/press/makeuseof.png",
		image: "/media/press/previews/makeuseof.jpg",
		title:
			"I stopped running one coding agent at a time after trying this weird new IDE",
		url: "https://www.makeuseof.com/stopped-running-one-coding-agent-trying-weird-new-ide/",
		titleLang: "en",
		date: "2026-09-30",
	},
	{
		outlet: "TechCrunch",
		icon: "/media/press/techcrunch.png",
		image: "/media/press/previews/techcrunch.jpg",
		title: "The 11 standout startups from YC's Demo Day, according to VCs",
		url: "https://techcrunch.com/2026/06/18/the-11-standout-startups-from-ycs-demo-day-according-to-vcs/",
		titleLang: "en",
		date: "2026-06-18",
	},
	{
		outlet: "Contentedge",
		icon: "/media/press/contentedge.svg",
		title: "Superset Is Turning AI Coding From Single-Player to Multiplayer",
		url: "https://www.contentedge.com/blog/superset-parallel-ai-coding-agents",
		titleLang: "en",
		date: "2026-06-12",
	},
	{
		outlet: "The Silicon Valley Post",
		icon: "/media/press/svpost.png",
		image: "/media/press/previews/svpost.jpg",
		title: "The Top DevTech Startups in YC P26",
		url: "https://svpost.com/articles/top-devtech-startups-yc-p26/",
		titleLang: "en",
		date: "2026-06-10",
	},
	{
		outlet: "The Agent Times",
		icon: "/media/press/the-agent-times.svg",
		image: "/media/press/previews/the-agent-times.jpg",
		title: "Superset Builds an IDE Where We Run in Parallel, Not in Sidebar",
		url: "https://theagenttimes.com/articles/superset-builds-an-ide-where-we-run-in-parallel-not-in-sideb-1f6714fd",
		titleLang: "en",
		date: "2026-05-23",
	},
];
