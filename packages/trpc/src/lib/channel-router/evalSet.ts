import type { RouterDev, RouterMessage } from "./channelRouter";

export type EvalKind =
	| "chatter"
	| "direct"
	| "multi"
	| "ambiguous"
	| "followup"
	| "passing-mention"
	| "sarcasm";

export interface EvalCase {
	id: string;
	kind: EvalKind;
	channelName: string;
	devs: RouterDev[];
	recent: RouterMessage[];
	message: RouterMessage;
	expected: string[];
}

const ada: RouterDev = {
	id: "ada",
	name: "Ada",
	description: "Backend and infra; fixes bugs, writes migrations",
};
const milo: RouterDev = {
	id: "milo",
	name: "Milo",
	description: "Frontend and design polish",
};
const rex: RouterDev = {
	id: "rex",
	name: "Rex",
	description: "On-call; triages incidents, reads logs and alerts",
};
const nova: RouterDev = {
	id: "nova",
	name: "Nova",
	description: "Data and analytics; writes SQL, builds dashboards",
};
const quill: RouterDev = {
	id: "quill",
	name: "Quill",
	description: "Writing; drafts docs, changelogs, and blog posts",
};
const sage: RouterDev = {
	id: "sage",
	name: "Sage",
	description: "Customer support; drafts ticket replies, looks up accounts",
};

const channels = {
	platform: { channelName: "eng-platform", devs: [ada, rex] },
	web: { channelName: "web", devs: [milo, ada] },
	growth: { channelName: "growth", devs: [nova, quill] },
	support: { channelName: "support", devs: [sage, rex, quill] },
};

type ChannelKey = keyof typeof channels;

function m(authorName: string, body: string): RouterMessage {
	return { authorName, body };
}

function c(input: {
	id: string;
	kind: EvalKind;
	channel: ChannelKey;
	recent?: RouterMessage[];
	message: RouterMessage;
	expected: string[];
}): EvalCase {
	return {
		id: input.id,
		kind: input.kind,
		...channels[input.channel],
		recent: input.recent ?? [],
		message: input.message,
		expected: input.expected,
	};
}

export const evalSet: EvalCase[] = [
	// eng-platform: Ada (backend), Rex (on-call)
	c({
		id: "p-chat-lunch",
		kind: "chatter",
		channel: "platform",
		message: m("Sam", "anyone want to grab lunch at 12:30?"),
		expected: [],
	}),
	c({
		id: "p-chat-standup",
		kind: "chatter",
		channel: "platform",
		message: m("Priya", "running 5 min late to standup, start without me"),
		expected: [],
	}),
	c({
		id: "p-chat-opinion",
		kind: "chatter",
		channel: "platform",
		message: m(
			"Jordan",
			"honestly I think we should move off Redis entirely next quarter, it's been more trouble than it's worth",
		),
		expected: [],
	}),
	c({
		id: "p-chat-reply-human",
		kind: "chatter",
		channel: "platform",
		recent: [m("Sam", "Priya did you get a chance to review my PR?")],
		message: m("Priya", "yep, left a couple comments, looks good otherwise"),
		expected: [],
	}),
	c({
		id: "p-chat-human-ask",
		kind: "chatter",
		channel: "platform",
		message: m("Theo", "Sam can you send me the link to the design doc?"),
		expected: [],
	}),
	c({
		id: "p-chat-thanks",
		kind: "chatter",
		channel: "platform",
		recent: [m("Ada", "Pushed the fix for the connection pool leak.")],
		message: m("Sam", "thanks!"),
		expected: [],
	}),
	c({
		id: "p-chat-deploy-announce",
		kind: "chatter",
		channel: "platform",
		message: m(
			"Jordan",
			"heads up, I'm deploying the API in 10 minutes, expect a short blip",
		),
		expected: [],
	}),
	c({
		id: "p-chat-ooo",
		kind: "chatter",
		channel: "platform",
		message: m("Lena", "I'm out Friday, Theo is covering my reviews"),
		expected: [],
	}),
	c({
		id: "p-direct-migration",
		kind: "direct",
		channel: "platform",
		message: m(
			"Sam",
			"can someone write a migration to add a nullable archived_at column to projects?",
		),
		expected: ["ada"],
	}),
	c({
		id: "p-direct-bug",
		kind: "direct",
		channel: "platform",
		message: m(
			"Priya",
			"the /v1/tasks endpoint returns 500 when the title has an emoji, could this get fixed?",
		),
		expected: ["ada"],
	}),
	c({
		id: "p-direct-incident",
		kind: "direct",
		channel: "platform",
		message: m(
			"Jordan",
			"PagerDuty just fired for elevated 5xx on the API, can someone triage?",
		),
		expected: ["rex"],
	}),
	c({
		id: "p-direct-logs",
		kind: "direct",
		channel: "platform",
		message: m(
			"Theo",
			"need someone to dig through the logs and figure out why the worker keeps restarting every hour",
		),
		expected: ["rex"],
	}),
	c({
		id: "p-direct-index",
		kind: "direct",
		channel: "platform",
		message: m(
			"Lena",
			"the users query is doing a seq scan, please add an index on users.email",
		),
		expected: ["ada"],
	}),
	c({
		id: "p-multi-incident-fix",
		kind: "multi",
		channel: "platform",
		message: m(
			"Sam",
			"checkout is down: need someone to triage the alerts and someone to ship a backend fix for the null pointer in payments",
		),
		expected: ["ada", "rex"],
	}),
	c({
		id: "p-multi-both",
		kind: "multi",
		channel: "platform",
		message: m(
			"Priya",
			"Ada and Rex, can you two look at the queue backlog together? Rex check the alerts, Ada fix the consumer",
		),
		expected: ["ada", "rex"],
	}),
	c({
		id: "p-passing-ada",
		kind: "passing-mention",
		channel: "platform",
		message: m("Jordan", "Ada fixed this yesterday, nice"),
		expected: [],
	}),
	c({
		id: "p-passing-rex",
		kind: "passing-mention",
		channel: "platform",
		message: m(
			"Theo",
			"Rex's incident summary from last night was really thorough, worth a read",
		),
		expected: [],
	}),
	c({
		id: "p-passing-compare",
		kind: "passing-mention",
		channel: "platform",
		message: m(
			"Lena",
			"I like how Ada structures migrations, we should copy that style in the billing service",
		),
		expected: [],
	}),
	c({
		id: "p-sarcasm-db",
		kind: "sarcasm",
		channel: "platform",
		message: m(
			"Sam",
			"oh great, the database is down again, what a wonderful way to start Monday",
		),
		expected: [],
	}),
	c({
		id: "p-sarcasm-ci",
		kind: "sarcasm",
		channel: "platform",
		message: m(
			"Priya",
			"love that CI takes 40 minutes now. truly living the dream",
		),
		expected: [],
	}),
	c({
		id: "p-followup-yes",
		kind: "followup",
		channel: "platform",
		recent: [
			m("Sam", "the nightly export job failed again"),
			m(
				"Ada",
				"I can add a retry with backoff to the export job. Want me to open a PR?",
			),
		],
		message: m("Sam", "yes please"),
		expected: ["ada"],
	}),
	c({
		id: "p-followup-rex-more",
		kind: "followup",
		channel: "platform",
		recent: [
			m("Jordan", "Rex, what caused the spike at 3am?"),
			m(
				"Rex",
				"A cron job hammered the search index; CPU hit 100% for 8 minutes.",
			),
		],
		message: m(
			"Jordan",
			"which cron job exactly? and did it happen the night before too?",
		),
		expected: ["rex"],
	}),
	c({
		id: "p-followup-human-thread",
		kind: "followup",
		channel: "platform",
		recent: [
			m("Ada", "I opened PR #412 with the pool size fix."),
			m("Sam", "Theo did you see Ada's PR?"),
		],
		message: m("Theo", "yeah I'll review it after lunch"),
		expected: [],
	}),
	c({
		id: "p-followup-ack",
		kind: "followup",
		channel: "platform",
		recent: [
			m("Priya", "can someone bump the worker memory limit to 2GB?"),
			m("Ada", "Done, the worker now runs with 2GB. Deployed to staging."),
		],
		message: m("Priya", "perfect, thank you"),
		expected: [],
	}),
	c({
		id: "p-ambig-thinking",
		kind: "ambiguous",
		channel: "platform",
		message: m(
			"Theo",
			"I wonder if we should shard the events table at some point",
		),
		expected: [],
	}),
	c({
		id: "p-ambig-anyone-know",
		kind: "ambiguous",
		channel: "platform",
		message: m(
			"Lena",
			"does anyone know what our Postgres max_connections is set to in prod?",
		),
		expected: ["ada"],
	}),
	c({
		id: "p-ambig-human-owner",
		kind: "ambiguous",
		channel: "platform",
		message: m(
			"Jordan",
			"I'm going to fix the flaky auth test myself this afternoon",
		),
		expected: [],
	}),
	// web: Milo (frontend), Ada (backend)
	c({
		id: "w-chat-figma",
		kind: "chatter",
		channel: "web",
		message: m(
			"Lena",
			"new Figma file is up for the settings redesign, take a look when you can",
		),
		expected: [],
	}),
	c({
		id: "w-chat-praise",
		kind: "chatter",
		channel: "web",
		message: m("Theo", "the new onboarding flow looks so good"),
		expected: [],
	}),
	c({
		id: "w-chat-debate",
		kind: "chatter",
		channel: "web",
		recent: [m("Sam", "I prefer the blue for the primary button")],
		message: m("Priya", "disagree, the green tested better last time"),
		expected: [],
	}),
	c({
		id: "w-chat-meeting",
		kind: "chatter",
		channel: "web",
		message: m("Jordan", "design review moved to Thursday 3pm"),
		expected: [],
	}),
	c({
		id: "w-chat-human-ask",
		kind: "chatter",
		channel: "web",
		message: m("Sam", "Lena when do you think the mobile mocks will be ready?"),
		expected: [],
	}),
	c({
		id: "w-chat-shipped",
		kind: "chatter",
		channel: "web",
		message: m("Priya", "just shipped dark mode to 10% of users 🎉"),
		expected: [],
	}),
	c({
		id: "w-direct-css",
		kind: "direct",
		channel: "web",
		message: m(
			"Lena",
			"the sidebar overlaps the header on mobile Safari, can someone fix the CSS?",
		),
		expected: ["milo"],
	}),
	c({
		id: "w-direct-polish",
		kind: "direct",
		channel: "web",
		message: m(
			"Jordan",
			"could we get the empty state on the projects page polished? spacing and the illustration feel off",
		),
		expected: ["milo"],
	}),
	c({
		id: "w-direct-api",
		kind: "direct",
		channel: "web",
		message: m(
			"Sam",
			"the settings page needs a new API endpoint that returns the user's notification preferences, can someone add it?",
		),
		expected: ["ada"],
	}),
	c({
		id: "w-direct-a11y",
		kind: "direct",
		channel: "web",
		message: m(
			"Theo",
			"please make the modal close button keyboard accessible, it doesn't take focus",
		),
		expected: ["milo"],
	}),
	c({
		id: "w-direct-slow-query",
		kind: "direct",
		channel: "web",
		message: m(
			"Priya",
			"the dashboard takes 8s to load because the stats endpoint is slow, can that be sped up on the server side?",
		),
		expected: ["ada"],
	}),
	c({
		id: "w-multi-feature",
		kind: "multi",
		channel: "web",
		message: m(
			"Lena",
			"we need a 'favorite project' feature: a star button in the project list and a backend field plus endpoint to store it",
		),
		expected: ["milo", "ada"],
	}),
	c({
		id: "w-multi-export",
		kind: "multi",
		channel: "web",
		message: m(
			"Sam",
			"for CSV export can someone build the export button UI and someone else build the server endpoint that generates the file?",
		),
		expected: ["milo", "ada"],
	}),
	c({
		id: "w-passing-milo",
		kind: "passing-mention",
		channel: "web",
		message: m("Jordan", "Milo's hover states on the cards are chef's kiss"),
		expected: [],
	}),
	c({
		id: "w-passing-ada",
		kind: "passing-mention",
		channel: "web",
		message: m(
			"Priya",
			"told the customer Ada already shipped the API change, they were happy",
		),
		expected: [],
	}),
	c({
		id: "w-passing-name-word",
		kind: "passing-mention",
		channel: "web",
		message: m("Theo", "Milo is the name of my cat btw, it's confusing"),
		expected: [],
	}),
	c({
		id: "w-sarcasm-safari",
		kind: "sarcasm",
		channel: "web",
		message: m("Lena", "Safari, never change. (please change)"),
		expected: [],
	}),
	c({
		id: "w-sarcasm-pixel",
		kind: "sarcasm",
		channel: "web",
		message: m(
			"Sam",
			"sure, let's spend another week moving that button 2 pixels to the left",
		),
		expected: [],
	}),
	c({
		id: "w-followup-milo-tweak",
		kind: "followup",
		channel: "web",
		recent: [
			m("Lena", "can someone make the toast notifications look less heavy?"),
			m(
				"Milo",
				"Lightened the shadow and reduced padding. Preview: /preview/toasts",
			),
		],
		message: m(
			"Lena",
			"better, can you also make the close icon a bit smaller?",
		),
		expected: ["milo"],
	}),
	c({
		id: "w-followup-human-discussion",
		kind: "followup",
		channel: "web",
		recent: [
			m("Milo", "Pushed the new color tokens to the design system."),
			m("Priya", "Sam what do you think of the new tokens?"),
		],
		message: m("Sam", "I like them, the grays are much warmer"),
		expected: [],
	}),
	c({
		id: "w-followup-it-broke",
		kind: "followup",
		channel: "web",
		recent: [m("Ada", "Shipped the new /preferences endpoint to staging.")],
		message: m("Theo", "it returns 401 for me on staging even when logged in"),
		expected: ["ada"],
	}),
	c({
		id: "w-ambig-should-we",
		kind: "ambiguous",
		channel: "web",
		message: m(
			"Jordan",
			"should we switch to a different charting library? curious what people think",
		),
		expected: [],
	}),
	c({
		id: "w-ambig-bug-report-vague",
		kind: "ambiguous",
		channel: "web",
		message: m("Priya", "the font looks weird on the pricing page"),
		expected: ["milo"],
	}),
	c({
		id: "w-ambig-human-doing",
		kind: "ambiguous",
		channel: "web",
		message: m(
			"Sam",
			"I'm refactoring the header component today, ping me if it conflicts",
		),
		expected: [],
	}),
	// growth: Nova (data), Quill (writing)
	c({
		id: "g-chat-campaign",
		kind: "chatter",
		channel: "growth",
		message: m(
			"Lena",
			"the newsletter went out this morning, open rate looks decent so far",
		),
		expected: [],
	}),
	c({
		id: "g-chat-conference",
		kind: "chatter",
		channel: "growth",
		message: m("Jordan", "who's going to the SaaStr meetup next week?"),
		expected: [],
	}),
	c({
		id: "g-chat-opinion",
		kind: "chatter",
		channel: "growth",
		message: m(
			"Priya",
			"I think our pricing page copy is too long, but that's a debate for Q1",
		),
		expected: [],
	}),
	c({
		id: "g-chat-reply",
		kind: "chatter",
		channel: "growth",
		recent: [
			m("Theo", "Sam are you presenting the funnel numbers at all-hands?"),
		],
		message: m("Sam", "yeah, I'll do 5 minutes on it"),
		expected: [],
	}),
	c({
		id: "g-chat-congrats",
		kind: "chatter",
		channel: "growth",
		message: m("Theo", "we hit 10k signups this month!! amazing work everyone"),
		expected: [],
	}),
	c({
		id: "g-direct-sql",
		kind: "direct",
		channel: "growth",
		message: m(
			"Sam",
			"can someone pull weekly active users by plan for the last 12 weeks?",
		),
		expected: ["nova"],
	}),
	c({
		id: "g-direct-dashboard",
		kind: "direct",
		channel: "growth",
		message: m(
			"Priya",
			"we need a dashboard tracking trial-to-paid conversion by acquisition channel",
		),
		expected: ["nova"],
	}),
	c({
		id: "g-direct-changelog",
		kind: "direct",
		channel: "growth",
		message: m(
			"Jordan",
			"could someone draft the changelog entry for the new team billing release?",
		),
		expected: ["quill"],
	}),
	c({
		id: "g-direct-blog",
		kind: "direct",
		channel: "growth",
		message: m(
			"Lena",
			"I need a first draft of a blog post announcing the Linear integration, ~600 words",
		),
		expected: ["quill"],
	}),
	c({
		id: "g-direct-churn",
		kind: "direct",
		channel: "growth",
		message: m(
			"Theo",
			"what was our churn rate last month for annual vs monthly plans?",
		),
		expected: ["nova"],
	}),
	c({
		id: "g-multi-report",
		kind: "multi",
		channel: "growth",
		message: m(
			"Sam",
			"for the investor update can someone pull MRR growth for Q3 and then write it up as a short paragraph?",
		),
		expected: ["nova", "quill"],
	}),
	c({
		id: "g-multi-launch",
		kind: "multi",
		channel: "growth",
		message: m(
			"Priya",
			"Nova can you get the adoption numbers for the API launch and Quill can you turn them into a launch recap post?",
		),
		expected: ["nova", "quill"],
	}),
	c({
		id: "g-passing-nova",
		kind: "passing-mention",
		channel: "growth",
		message: m(
			"Lena",
			"Nova's retention chart was the highlight of the board meeting",
		),
		expected: [],
	}),
	c({
		id: "g-passing-quill",
		kind: "passing-mention",
		channel: "growth",
		message: m(
			"Jordan",
			"the post Quill drafted got picked up by Hacker News, nice",
		),
		expected: [],
	}),
	c({
		id: "g-sarcasm-metrics",
		kind: "sarcasm",
		channel: "growth",
		message: m(
			"Theo",
			"wow, signups dropped 40% on a holiday weekend, who could have predicted that",
		),
		expected: [],
	}),
	c({
		id: "g-sarcasm-copy",
		kind: "sarcasm",
		channel: "growth",
		message: m(
			"Sam",
			"can't wait to read the 14th rewrite of the homepage tagline",
		),
		expected: [],
	}),
	c({
		id: "g-followup-nova-split",
		kind: "followup",
		channel: "growth",
		recent: [
			m("Priya", "can someone pull signups by country for September?"),
			m("Nova", "Here you go: US 41%, UK 12%, DE 9%, IN 8%, other 30%."),
		],
		message: m("Priya", "can you split the US number by state?"),
		expected: ["nova"],
	}),
	c({
		id: "g-followup-quill-shorter",
		kind: "followup",
		channel: "growth",
		recent: [
			m("Quill", "Draft of the release notes is in the doc, about 400 words."),
		],
		message: m("Lena", "make it shorter, under 150 words, and punchier"),
		expected: ["quill"],
	}),
	c({
		id: "g-followup-human",
		kind: "followup",
		channel: "growth",
		recent: [
			m("Nova", "Trial conversion was 14% in September, up from 11%."),
			m("Theo", "Sam that's higher than your forecast right?"),
		],
		message: m("Sam", "yeah by about two points, nice surprise"),
		expected: [],
	}),
	c({
		id: "g-ambig-curious",
		kind: "ambiguous",
		channel: "growth",
		message: m(
			"Jordan",
			"I'm curious how many people actually use the export feature",
		),
		expected: ["nova"],
	}),
	c({
		id: "g-ambig-self-writing",
		kind: "ambiguous",
		channel: "growth",
		message: m(
			"Lena",
			"I'm writing the case study with Acme this week, will share a draft Friday",
		),
		expected: [],
	}),
	c({
		id: "g-ambig-rhetorical",
		kind: "ambiguous",
		channel: "growth",
		message: m("Priya", "why do we even track bounce rate anymore lol"),
		expected: [],
	}),
	// support: Sage (support), Rex (on-call), Quill (writing)
	c({
		id: "s-chat-shift",
		kind: "chatter",
		channel: "support",
		message: m("Theo", "I'm taking the queue until 6, Lena takes over after"),
		expected: [],
	}),
	c({
		id: "s-chat-vent",
		kind: "chatter",
		channel: "support",
		message: m("Lena", "that last customer call was rough, need a coffee"),
		expected: [],
	}),
	c({
		id: "s-chat-human-handoff",
		kind: "chatter",
		channel: "support",
		message: m(
			"Sam",
			"Priya can you take the Acme ticket? you talked to them last week",
		),
		expected: [],
	}),
	c({
		id: "s-chat-stats",
		kind: "chatter",
		channel: "support",
		message: m("Jordan", "we closed 140 tickets this week, record!"),
		expected: [],
	}),
	c({
		id: "s-chat-reply",
		kind: "chatter",
		channel: "support",
		recent: [m("Lena", "Theo did the refund go through for that customer?")],
		message: m("Theo", "yes, confirmed in Stripe"),
		expected: [],
	}),
	c({
		id: "s-direct-reply",
		kind: "direct",
		channel: "support",
		message: m(
			"Lena",
			"can someone draft a reply to ticket #8812? the customer is asking how to transfer workspace ownership",
		),
		expected: ["sage"],
	}),
	c({
		id: "s-direct-lookup",
		kind: "direct",
		channel: "support",
		message: m(
			"Theo",
			"need someone to look up which plan jane@acme.com is on and when it renews",
		),
		expected: ["sage"],
	}),
	c({
		id: "s-direct-outage",
		kind: "direct",
		channel: "support",
		message: m(
			"Priya",
			"we're getting a flood of tickets saying login is broken, can someone check if there's an incident?",
		),
		expected: ["rex"],
	}),
	c({
		id: "s-direct-help-article",
		kind: "direct",
		channel: "support",
		message: m(
			"Jordan",
			"we keep getting the same SSO question, could someone write a help center article on setting up Okta?",
		),
		expected: ["quill"],
	}),
	c({
		id: "s-multi-outage-comms",
		kind: "multi",
		channel: "support",
		message: m(
			"Sam",
			"uploads are failing for everyone: someone please investigate the incident and someone draft a status page update for customers",
		),
		expected: ["rex", "quill"],
	}),
	c({
		id: "s-multi-ticket-and-logs",
		kind: "multi",
		channel: "support",
		message: m(
			"Lena",
			"customer on ticket #9001 says their webhooks stopped at 2pm. can someone check the logs for errors, and someone reply to them that we're looking into it?",
		),
		expected: ["rex", "sage"],
	}),
	c({
		id: "s-passing-sage",
		kind: "passing-mention",
		channel: "support",
		message: m("Theo", "the customer said Sage's answer was super clear, nice"),
		expected: [],
	}),
	c({
		id: "s-passing-rex",
		kind: "passing-mention",
		channel: "support",
		message: m("Priya", "Rex already caught that one, it was the CDN"),
		expected: [],
	}),
	c({
		id: "s-sarcasm-customer",
		kind: "sarcasm",
		channel: "support",
		message: m(
			"Jordan",
			"another customer who 'didn't change anything' and now everything is broken. shocking",
		),
		expected: [],
	}),
	c({
		id: "s-sarcasm-monday",
		kind: "sarcasm",
		channel: "support",
		message: m("Lena", "nothing like 60 unread tickets to say good morning"),
		expected: [],
	}),
	c({
		id: "s-followup-sage-tone",
		kind: "followup",
		channel: "support",
		recent: [
			m("Theo", "can someone draft a reply to the angry billing ticket #7711?"),
			m("Sage", "Draft: 'Hi Dana, I'm sorry about the double charge...'"),
		],
		message: m(
			"Theo",
			"good start, make it a bit more apologetic and mention the refund timeline",
		),
		expected: ["sage"],
	}),
	c({
		id: "s-followup-rex-still",
		kind: "followup",
		channel: "support",
		recent: [
			m("Priya", "is the login incident resolved?"),
			m(
				"Rex",
				"Yes, the auth provider recovered at 14:05. Error rate is back to baseline.",
			),
		],
		message: m(
			"Priya",
			"still seeing a few reports from EU customers, are they still affected?",
		),
		expected: ["rex"],
	}),
	c({
		id: "s-followup-human",
		kind: "followup",
		channel: "support",
		recent: [
			m("Sage", "Ticket #8812 is answered and closed."),
			m("Lena", "Sam can you double check the macro we used there?"),
		],
		message: m("Sam", "on it"),
		expected: [],
	}),
	c({
		id: "s-ambig-wondering",
		kind: "ambiguous",
		channel: "support",
		message: m(
			"Theo",
			"anyone else noticing more SSO tickets than usual lately?",
		),
		expected: [],
	}),
	c({
		id: "s-ambig-self",
		kind: "ambiguous",
		channel: "support",
		message: m(
			"Jordan",
			"I'll reply to the Globex escalation myself, it's sensitive",
		),
		expected: [],
	}),
	c({
		id: "s-ambig-fyi-error",
		kind: "ambiguous",
		channel: "support",
		message: m(
			"Lena",
			"fyi a customer just sent a screenshot of a 502 on the billing page",
		),
		expected: ["rex"],
	}),
];

const kai: RouterDev = {
	id: "kai",
	name: "Kai",
	description: "Mobile engineer; iOS and Android app bugs and releases",
};
const iris: RouterDev = {
	id: "iris",
	name: "Iris",
	description: "QA; writes and runs test plans, reproduces bugs",
};
const bo: RouterDev = {
	id: "bo",
	name: "Bo",
	description: "Sales ops; updates the CRM, preps account briefs",
};
const lux: RouterDev = {
	id: "lux",
	name: "Lux",
	description: "Security; reviews permissions, audits dependencies",
};
const mobile = { channelName: "mobile", devs: [kai, iris] };
const sales = { channelName: "sales", devs: [bo] };
const sec = { channelName: "eng", devs: [lux, kai, iris] };
let holdoutIndex = 0;
function h(
	channel: { channelName: string; devs: RouterDev[] },
	kind: EvalKind,
	body: string,
	expected: string[],
	recent: RouterMessage[] = [],
): EvalCase {
	return {
		id: `h${holdoutIndex++}`,
		kind,
		...channel,
		recent,
		message: m("Ana", body),
		expected,
	};
}

export const holdoutSet: EvalCase[] = [
	h(mobile, "chatter", "TestFlight build 214 is out, go wild", []),
	h(mobile, "chatter", "who's at the office tomorrow?", []),
	h(mobile, "chatter", "Ben nice job on the release notes", []),
	h(mobile, "chatter", "I think we should drop iOS 16 support next year", []),
	h(
		mobile,
		"direct",
		"the app crashes on launch on Android 12 Pixels, can someone take a look?",
		["kai"],
	),
	h(
		mobile,
		"direct",
		"can someone write a test plan for the new offline mode before we ship?",
		["iris"],
	),
	h(
		mobile,
		"direct",
		"please try to reproduce the login loop users report on the beta",
		["iris"],
	),
	h(
		mobile,
		"multi",
		"push notifications broke on iOS: someone fix it and someone else write regression tests for it",
		["kai", "iris"],
	),
	h(
		mobile,
		"passing-mention",
		"Kai shipped the widget last week and reviews went up",
		[],
	),
	h(
		mobile,
		"passing-mention",
		"Iris's test plan caught 3 bugs before release, love it",
		[],
	),
	h(mobile, "sarcasm", "App Store review rejected us again. what a joy", []),
	h(
		mobile,
		"followup",
		"yes go ahead",
		["kai"],
		[m("Kai", "I can bump the min SDK to 24 to fix the crash. Should I?")],
	),
	h(
		mobile,
		"followup",
		"cool, I'll merge it after lunch",
		[],
		[
			m("Kai", "Fix for the Android crash is in PR #88."),
			m("Ben", "Ana can you merge Kai's PR?"),
		],
	),
	h(mobile, "ambiguous", "the keyboard covers the input on the chat screen", [
		"kai",
	]),
	h(mobile, "ambiguous", "anyone tried the new Expo SDK yet?", []),
	h(sales, "chatter", "closed Globex!! 🎉", []),
	h(sales, "chatter", "pipeline review is at 4 today", []),
	h(
		sales,
		"direct",
		"can someone update the Acme opportunity to stage 3 in the CRM?",
		["bo"],
	),
	h(
		sales,
		"direct",
		"I need a one-page brief on Initech before my call tomorrow",
		["bo"],
	),
	h(
		sales,
		"passing-mention",
		"Bo's account brief made the call so much easier",
		[],
	),
	h(sales, "sarcasm", "love when the prospect ghosts after the third demo", []),
	h(sales, "ambiguous", "I'll update the CRM after my calls", []),
	h(sec, "chatter", "security training is due Friday, don't forget", []),
	h(sec, "chatter", "Mia can you approve my access request?", []),
	h(sec, "direct", "can someone audit our npm deps for the new lodash CVE?", [
		"lux",
	]),
	h(
		sec,
		"direct",
		"please review whether the new admin role grants too much access",
		["lux"],
	),
	h(
		sec,
		"direct",
		"the iOS app shows a blank screen after the last release, can someone fix it?",
		["kai"],
	),
	h(
		sec,
		"multi",
		"before release, someone run the regression suite and someone check the new permissions for holes",
		["iris", "lux"],
	),
	h(
		sec,
		"passing-mention",
		"Lux flagged that same CVE last month actually",
		[],
	),
	h(
		sec,
		"sarcasm",
		"great, another critical CVE on a Friday afternoon. perfect timing",
		[],
	),
	h(
		sec,
		"followup",
		"can you also check the transitive deps?",
		["lux"],
		[m("Lux", "No direct deps use the vulnerable lodash version.")],
	),
	h(
		sec,
		"ambiguous",
		"is 2FA mandatory for contractors? asking for a friend",
		[],
	),
];
