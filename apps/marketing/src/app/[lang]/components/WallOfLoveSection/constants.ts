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
		role: "Founder at cfo.ai, investor in Paradev",
		avatar: "https://unavatar.io/twitter/blader",
		url: "https://x.com/blader/status/2114774838867071426",
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
		id: "t_blom",
		content:
			"If you're running parallel AI agents, you need to check out @superset_sh",
		author: "Tom Blomfield",
		handle: "@t_blom",
		role: "Y Combinator, co-founder of Monzo",
		avatar: "https://unavatar.io/twitter/t_blom",
		url: "https://x.com/t_blom/status/2059375239411429476",
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
		id: "AIC_Hugo",
		content:
			"The biggest productivity hack for coding agents is boring: git worktrees\n\n@ParadevAI gives every task its own worktree, branch and terminal, so my agents run in parallel and never touch each other's files\n\nThat's how I got to 496 PRs in October, about 16 a day",
		author: "Hugo",
		handle: "@AIC_Hugo",
		role: "Data Scientist & AI Engineer",
		avatar: "https://unavatar.io/twitter/AIC_Hugo",
		url: "https://x.com/AIC_Hugo/status/2120442223137595499",
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
		id: "luk_designer",
		content:
			"@ParadevAI is such a good open-source alternative to Conductor. Honestly, I even prefer it.",
		author: "Luk",
		handle: "@luk_designer",
		role: "Senior Product Designer",
		avatar: "https://unavatar.io/twitter/luk_designer",
		url: "https://x.com/luk_designer/status/2118644562952433908",
	},
	{
		id: "LeosReal",
		content:
			"hasn't been a day i haven't used superset since onboarding\n\ncomplete paradigm shift on how i use ai to code",
		author: "Leo",
		handle: "@LeosReal",
		role: "Co-founder & CTO at Outlit",
		avatar: "https://unavatar.io/twitter/LeosReal",
		url: "https://x.com/LeosReal/status/2027306293858586745",
	},
	{
		id: "ro10072000",
		content:
			"congrats guys!! been on superset since april and honestly haven't opened cursor, claude desktop or warp since. best code editor @ParadevAI",
		author: "Rohith",
		handle: "@ro10072000",
		role: "Full-stack Engineer",
		avatar: "https://unavatar.io/twitter/ro10072000",
		url: "https://x.com/ro10072000/status/2114821356865155398",
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
		id: "eliasstravik",
		content:
			"just started using remote desktop instead of ssh just to be able to use @superset_sh on my mac mini from my macbook pro\n\ngenerational product in the making, mark my words",
		author: "Elias Ståvik",
		handle: "@eliasstravik",
		role: "Founder at Cleanroom",
		avatar: "https://unavatar.io/twitter/eliasstravik",
		url: "https://x.com/eliasstravik/status/2020580091449708978",
	},
	{
		id: "ivenvd",
		content:
			"Tested various GUI tools for git worktree and agents - Conductor, Vibe Kanban, Agentastic, Crystal, FleetCode, Emdash, Sculptor - but Superset suits my taste the best",
		originalContent:
			"试了各种 GUI 的 git worktree + agent 工具，Conductor、Vibe Kanban、Agentastic、Crystal、FleetCode、Emdash、Sculptor，还是 Superset 最合我的胃口",
		author: "Iven",
		handle: "@ivenvd",
		role: "Engineer at Paraflow",
		avatar: "https://unavatar.io/twitter/ivenvd",
		url: "https://x.com/ivenvd/status/2011738469610242559",
	},
];
