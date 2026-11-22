export interface Testimonial {
	id: string;
	content: string;
	originalContent?: string;
	author: string;
	handle: string;
	role?: string;
	avatar: string;
	url: string;
}

export const TESTIMONIALS: Testimonial[] = [
	{
		id: "blader",
		content:
			"paradev is my daily driver and the daily driver of most of our team at cfo.ai\n\ncannot recommend this product and team more highly",
		author: "Siqi Chen",
		handle: "@blader",
		role: "CEO at cfo.ai, ex-Sandbox VR and Zynga",
		avatar: "https://unavatar.io/twitter/blader",
		url: "https://x.com/blader/status/2114774838867071426",
	},
	{
		id: "t_blom",
		content:
			"If you're running parallel AI agents, you need to check out @superset_sh",
		author: "Tom Blomfield",
		handle: "@t_blom",
		role: "Anthropic and Y Combinator, co-founder of Monzo",
		avatar: "https://unavatar.io/twitter/t_blom",
		url: "https://x.com/t_blom/status/2059375239411429476",
	},
	{
		id: "abhiaiyer",
		content:
			"Just realized that I have done all my work in @superset_sh since Dec 26.",
		author: "Abhi Aiyer",
		handle: "@abhiaiyer",
		role: "Co-founder & CTO at Mastra",
		avatar: "https://unavatar.io/twitter/abhiaiyer",
		url: "https://x.com/abhiaiyer/status/2013782002332283180",
	},
	{
		id: "gregpr07",
		content:
			"Damn @superset_sh is really cool. You should try it.\n\nworktrees are a breeze\ncmd + t auto opens Claude Code\nyou can view git changes within itself\nclosing a laptop doesn't kill the sessions",
		author: "Gregor Zunic",
		handle: "@gregpr07",
		role: "Co-founder & CTO at Browser Use",
		avatar: "https://unavatar.io/twitter/gregpr07",
		url: "https://x.com/gregpr07/status/2013038355630432742",
	},
	{
		id: "Aytunc",
		content: "I love Superset @ParadevAI",
		author: "Aytunc Yildizli",
		handle: "@Aytunc",
		role: "Chief Growth Officer at 0G Labs, ex-CEO of Avalanche Foundation",
		avatar: "https://unavatar.io/twitter/Aytunc",
		url: "https://x.com/Aytunc/status/2118672760721350849",
	},
	{
		id: "juristr",
		content:
			"I've been using @superset_sh since the very beginning, and it's still my heavy daily driver.\n(If you didn't try yet, you should!)",
		author: "Juri Strumpflohner",
		handle: "@juristr",
		role: "Developer tooling at Nx",
		avatar: "https://unavatar.io/twitter/juristr",
		url: "https://x.com/juristr/status/2067608048156176749",
	},
	{
		id: "mamagnus00",
		content:
			"When you have feature requests for a product, you should just send them prompts for their coding agent.\n\nThis makes @superset_sh move at light-speed.",
		author: "Magnus Müller",
		handle: "@mamagnus00",
		role: "Co-founder & CEO at Browser Use",
		avatar: "https://unavatar.io/twitter/mamagnus00",
		url: "https://x.com/mamagnus00/status/2031056118827667756",
	},
	{
		id: "zachdive",
		content:
			"if you're not using @superset_sh, you're getting left behind in 2026",
		author: "Zach Dive",
		handle: "@zachdive",
		role: "CEO at Adam (YC W25), ex-Adept",
		avatar: "https://unavatar.io/twitter/zachdive",
		url: "https://x.com/zachdive/status/2014038312508424597",
	},
	{
		id: "MrJamesHenry",
		content:
			"Conductor is closed source, superset is open and therefore forkable and inspectable in terms of what it’s doing with all your critically important LLM interactions - that difference is huge for me",
		author: "James Henry",
		handle: "@MrJamesHenry",
		role: "Director of Engineering at Nx, creator of typescript-eslint",
		avatar: "https://unavatar.io/twitter/MrJamesHenry",
		url: "https://x.com/MrJamesHenry/status/2031662137475825924",
	},
	{
		id: "TimSuchanek",
		content:
			"One of the things I most love about @superset_sh is being able to upgrade while you have sessions running",
		author: "Tim Suchanek",
		handle: "@TimSuchanek",
		role: "Founder at Expand AI, co-founder of Stellate",
		avatar: "https://unavatar.io/twitter/TimSuchanek",
		url: "https://x.com/TimSuchanek/status/2052939547168919995",
	},
	{
		id: "fcoury",
		content:
			"If you prefer a more GUI-oriented approach to multiple agents in parallel, it seems like @superset_sh is doing a tremendous job.",
		author: "Felipe Coury",
		handle: "@fcoury",
		role: "Codex at OpenAI",
		avatar: "https://unavatar.io/twitter/fcoury",
		url: "https://x.com/fcoury/status/2010477904472281220",
	},
	{
		id: "ericclemmons",
		content:
			"Was using Warp, but now @superset_sh has become my primary terminal",
		author: "Eric Clemmons",
		handle: "@ericclemmons",
		role: "Principal Engineer at Cloudflare",
		avatar: "https://unavatar.io/twitter/ericclemmons",
		url: "https://x.com/ericclemmons/status/2013413118467056004",
	},
	{
		id: "therealdajayi",
		content:
			"i started using @superset_sh aggressively in april and my daily github contributions have literally 5x'd.",
		author: "Daniel Ajayi",
		handle: "@therealdajayi",
		role: "Co-founder at Sorce (YC F25)",
		avatar: "https://unavatar.io/twitter/therealdajayi",
		url: "https://x.com/therealdajayi/status/2046423153791180844",
	},
	{
		id: "arnaud_breton",
		content:
			"Have you tried @superset_sh? It’s been my daily drivers for months now, and the team behind it is just 5 stars",
		author: "Arnaud Breton",
		handle: "@arnaud_breton",
		role: "Co-founder at Tolmo (YC P26), ex-Datadog",
		avatar: "/images/testimonials/arnaud_breton.jpg",
		url: "https://x.com/arnaud_breton/status/2068824841826849183",
	},
	{
		id: "jamesfong",
		content:
			"3 products that have broken into my forever home. And that's not an easy feat for me: @circlebackai, @aquavoice, and @superset_sh\n\nProduct and utility are A+",
		author: "James Fong",
		handle: "@jamesfong",
		role: "Operating Partner at Pioneer Fund",
		avatar: "https://unavatar.io/twitter/jamesfong",
		url: "https://x.com/jamesfong/status/2094789574476410952",
	},
	{
		id: "chrislaupama",
		content:
			"Oh snap @superset_sh is soooooo damn good!\n\nNow THIS is the experience I've been wanting for CLI agents!",
		author: "Chris Laupama",
		handle: "@chrislaupama",
		role: "TS Lead at Webflow",
		avatar: "https://unavatar.io/twitter/chrislaupama",
		url: "https://x.com/chrislaupama/status/2011148329443607037",
	},
	{
		id: "jalcowastaken",
		content:
			"Started using @superset_sh today… Insanely polished and beautiful. Think I’ve found a new daily driver. Kudos guys!",
		author: "Justin Levine",
		handle: "@jalcowastaken",
		role: "Engineer at Mastra",
		avatar: "https://unavatar.io/twitter/jalcowastaken",
		url: "https://x.com/jalcowastaken/status/2095973731013218692",
	},
	{
		id: "charlielamb",
		content:
			"@superset_sh is just miles ahead of anything else I've used. Easily work on many projects at once with multiple work trees in each project.",
		author: "Charlie Lamb",
		handle: "@charlielamb",
		role: "Founding Engineer at Autumn (YC S25)",
		avatar: "https://unavatar.io/twitter/charlielamb",
		url: "https://x.com/charlielamb/status/2034049860144685496",
	},
	{
		id: "eliasstravik",
		content:
			"just started using remote desktop instead of ssh just to be able to use @superset_sh on my mac mini from my macbook pro\n\ngenerational product in the making, mark my words",
		author: "Elias Stråvik",
		handle: "@eliasstravik",
		role: "Building open source software for GTM teams",
		avatar: "https://unavatar.io/twitter/eliasstravik",
		url: "https://x.com/eliasstravik/status/2020580091449708978",
	},
	{
		id: "pulkit_gupta2",
		content:
			"after spending the entire day exploring pretty much every alternative out there, moving over to @ParadevAI.",
		author: "Pulkit Gupta",
		handle: "@pulkit_gupta2",
		role: "CTO at Tsenta (YC S26)",
		avatar: "https://unavatar.io/twitter/pulkit_gupta2",
		url: "https://x.com/pulkit_gupta2/status/2118355150591123752",
	},
	{
		id: "jokull",
		content:
			"Really enjoying Paradev (formerly Superset) - i'm using the super-agent pattern to manage workspaces and parallelizing work",
		author: "Jökull Solberg",
		handle: "@jokull",
		role: "Co-founder at Trip to Japan",
		avatar: "https://unavatar.io/twitter/jokull",
		url: "https://x.com/jokull/status/2117186742566686924",
	},
	{
		id: "AIC_Hugo",
		content:
			"The biggest productivity hack for coding agents is boring: git worktrees\n\n@ParadevAI gives every task its own worktree, branch and terminal, so my agents run in parallel and never touch each other's files\n\nThat's how I got to 496 PRs in October, about 16 a day",
		author: "Hugo Sequier",
		handle: "@AIC_Hugo",
		role: "Founder at State Method, AI engineer",
		avatar: "https://unavatar.io/twitter/AIC_Hugo",
		url: "https://x.com/AIC_Hugo/status/2120442223137595499",
	},
	{
		id: "luk_designer",
		content:
			"@ParadevAI is such a good open-source alternative to Conductor. Honestly, I even prefer it.",
		author: "Luk",
		handle: "@luk_designer",
		role: "Senior Product Designer & Design Engineer",
		avatar: "https://unavatar.io/twitter/luk_designer",
		url: "https://x.com/luk_designer/status/2118644562952433908",
	},
	{
		id: "ivenvd",
		content:
			"Tested various GUI tools for git worktree and agents - Conductor, Vibe Kanban, Agentastic, Crystal, FleetCode, Emdash, Sculptor - but Superset suits my taste the best",
		originalContent:
			"试了各种 GUI 的 git worktree + agent 工具，Conductor、Vibe Kanban、Agentastic、Crystal、FleetCode、Emdash、Sculptor，还是 Superset 最合我的胃口",
		author: "Iven",
		handle: "@ivenvd",
		role: "ex-Engineering Lead at Zhihu",
		avatar: "https://unavatar.io/twitter/ivenvd",
		url: "https://x.com/ivenvd/status/2011738469610242559",
	},
];
