// Dynamic so the demo-account credentials never enter the repo: they come from
// APP_REVIEW_EMAIL / APP_REVIEW_PASSWORD in the root .env (or the shell).
// Optionally set APP_REVIEW_VIDEO_URL to a short screen recording of the
// sign-in and review flow; reviewers reliably follow a video where they skim text.
// Submission checklist and what to do on rejection or delay: see RELEASE.md.

const path = require("node:path");
require("dotenv").config({
	path: path.resolve(__dirname, "../../.env"),
	quiet: true,
});

const reviewVideoUrl = process.env.APP_REVIEW_VIDEO_URL ?? "";
const voiceVideoUrl = process.env.APP_REVIEW_VOICE_VIDEO_URL ?? "";

// App Review reads these notes under time pressure, so they lead with what the
// app is (a remote client, nothing runs on the device) and then address the
// guidelines a reviewer is most likely to check, each under a short heading.
const reviewNotes = [
	"PLEASE SIGN IN WITH THE DEMO ACCOUNT BELOW ('Sign in with email'). Sign in with Apple, GitHub, or Google creates a new free account, which shows only an informational screen.",
	"",
	"WHAT THE APP IS",
	"Paradev Mobile is the companion app for Paradev (formerly Superset, https://paradev.com), a desktop tool where developers run AI coding agents on their own computers or in Paradev cloud workspaces. The phone app is a remote client for those sessions, in the same class as an SSH or remote desktop client: it shows agent progress, lets the user chat with an agent, review file diffs, and type into a terminal session that is running on the user's own machine. The app does not download, install, or execute any user or project code on the device: it renders data streamed from the user's host and sends keystrokes back to the remote session.",
	"",
	"HOW TO REVIEW",
	"1. On the sign-in screen tap 'Sign in with email' and use the demo account below (no two-factor prompt; the account belongs to an organization that already has a workspace with sample agent sessions, so nothing needs to be installed to see the full app).",
	"2. Home lists workspaces and sessions. Open a session to read the agent transcript, chat with it, view the files it changed, and open the terminal.",
	"3. Settings is reachable from the organization name in the top-left; account deletion is there under Danger Zone.",
	reviewVideoUrl
		? `A two-minute walkthrough of these steps: ${reviewVideoUrl}`
		: null,
	"",
	"GUIDELINES WE EXPECT YOU TO CHECK",
	"Payments (3.1): As we said in our November 6 reply, this version removes every link to our website from the app. There are no purchase options, links, or calls to action for buying outside the app, on any storefront. Paradev is sold to organizations, per seat, for their engineering teams (3.1.3(c) Enterprise Services); individuals use the free plan. A plan bought by the organization unlocks Paradev Mobile for its members, who sign in with their work account.",
	`Background audio (2.5.4): Voice mode is a live spoken conversation with the user's coding agent, and it keeps running while the phone is locked or the app is in the background.${voiceVideoUrl ? ` Screen recording on a physical device: ${voiceVideoUrl}` : ""}`,
	"Sign-in (4.8): Sign in with Apple is offered alongside GitHub, Google, and email. Any of them creates a free account instantly, which lands on the Pro-required screen described above; the demo account is the one with a paid workspace.",
	"Account deletion (5.1.1 v): Settings > Danger Zone > Delete account, in-app, no email or web visit required.",
	"Code execution (2.5.2): No user or project code is downloaded or executed on the device. The terminal tab renders output streamed from the user's own session and sends keystrokes to it; the agents themselves run on the user's computer or in their cloud workspace.",
	"Originality (4.3): This is the official mobile client for Paradev, our own product, built and operated by Superset Inc. It is not a template, a repackaged app, or a wrapper around another vendor's tool: it talks to our own API (api.superset.sh) and to the Paradev host agent that our desktop app installs (plus crash and usage reporting through Sentry and PostHog, declared in App Privacy), and the bundle identifier (sh.superset.mobile) matches our domain. The full source of this app is public in our repository at https://github.com/paradevai/paradev (apps/mobile, 13,000+ stars), alongside the desktop app it pairs with, which has been downloaded millions of times. Other apps in this category are phone front-ends for a third-party CLI; Paradev Mobile only works with Paradev accounts, workspaces, and hosts.",
	"Permissions: Photos and camera are used only to attach images to chat messages. The microphone is used to dictate a message (transcribed on the device, with speech recognition if iOS asks for it) and for voice mode. Each prompt appears the first time the feature is used and the app works without any of them.",
	"",
	"Questions: support@paradev.com, or call the contact above; we respond within the hour during US business hours.",
]
	.filter((line) => line !== null)
	.join("\n");

module.exports = {
	configVersion: 0,
	apple: {
		version: "1.2.2",
		copyright: "2026 Superset Inc.",
		categories: ["DEVELOPER_TOOLS", "PRODUCTIVITY"],
		info: {
			"en-US": {
				title: "Paradev: 100+ Coding Agents",
				subtitle: "Manage AI agents on the go",
				promoText:
					"Your agents keep working when you leave your desk. Start a task, follow it live, and review the diff from your phone.",
				description: [
					"Paradev (formerly Superset) runs many coding agents in parallel, each in its own workspace on your computer or in the cloud. This app keeps every one of them within reach, so you can start tasks, follow every session, and review and merge the work from your phone.",
					"",
					"RUN MANY AGENTS AT ONCE",
					"Give every task its own agent, branch, and workspace, so agents work side by side without touching your main branch. Start a new one here: pick a project, an agent, and a model, and send the task.",
					"",
					"FOLLOW EVERY SESSION LIVE",
					"Watch each agent's messages and commands as they happen. See at a glance which sessions are working, which need your approval, and which are done.",
					"",
					"TALK TO YOUR AGENTS",
					"Answer a question or send the next instruction while the agent works. Dictate when typing is a chore, attach a photo or a screenshot, or switch to voice mode and talk it through.",
					"",
					"REVIEW AND MERGE",
					"Read every changed file with syntax highlighting, comment on any line, and send your review to the agent in one step. When the pull request's checks are green, merge it from your phone.",
					"",
					"THE REAL TERMINAL",
					"Open a session's terminal to read the raw output or type a command. It runs on your computer or cloud workspace; nothing runs on your phone.",
					"",
					"GET STARTED",
					"Install Paradev on your computer from paradev.com and sign in here with the same account. Your machines and cloud workspaces appear with their sessions. Paradev Mobile is included with Paradev Pro for organizations.",
					"",
					"ALSO IN THE APP",
					"• Works with Claude Code, Codex, Gemini CLI, Cursor Agent, GitHub Copilot, OpenCode, Amp, and more",
					"• Search and filter sessions by status, project, or teammate",
					"• Share a workspace with a teammate",
					"• Read and comment on the pages your agents publish",
					"• Available in 18 languages",
					"",
					"Paradev is not affiliated with the makers of the agents named above.",
				].join("\n"),
				keywords: [
					"code review",
					"pull request",
					"diff",
					"terminal",
					"git",
					"developer",
					"programming",
					"remote",
					"vibe coding",
					"llm",
					"assistant",
				],
				marketingUrl: "https://paradev.com",
				supportUrl: "https://paradev.com",
				privacyPolicyUrl: "https://paradev.com/privacy",
			},
		},
		review: {
			firstName: "Satya",
			lastName: "Patel",
			email: "support@paradev.com",
			phone: "+1 949 836 1199",
			demoRequired: true,
			demoUsername: process.env.APP_REVIEW_EMAIL ?? "",
			demoPassword: process.env.APP_REVIEW_PASSWORD ?? "",
			notes: reviewNotes,
		},
	},
};
