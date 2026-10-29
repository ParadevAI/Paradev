// The Google Play listing. Text comes from store.config.js (the App Store
// listing) so the two stores say the same thing; only Play's own fields live
// here. Pushed by scripts/play-listing.ts. The Data safety, content rating and
// app access answers have no API: enter them in Play Console from this file.

const apple = require("./store.config.js").apple;
const appStore = apple.info["en-US"];

const shortDescription =
	"Start, follow and review your coding agents from your phone.";

// The App Store review notes argue against Apple's guidelines; Play reviewers
// need only the access steps.
const appAccessInstructions = [
	"On the sign-in screen tap 'Sign in with email' and use the demo account above.",
	"Home lists workspaces and sessions. Open a session to read the agent transcript, chat with it, view the files it changed, and open the terminal.",
	"Settings is reachable from the organization name in the top-left; account deletion is under Danger Zone.",
	"Free accounts see a screen explaining Pro is required; the demo account's organization has Pro.",
].join("\n");

module.exports = {
	packageName: "sh.superset.mobile",
	defaultLanguage: "en-US",
	listings: {
		"en-US": {
			title: appStore.title,
			shortDescription,
			fullDescription: appStore.description,
		},
	},
	details: {
		contactEmail: apple.review.email,
		contactWebsite: appStore.supportUrl,
		contactPhone: apple.review.phone,
	},
	images: {
		icon: "store/android/icon-512.png",
		featureGraphic: "store/android/feature-graphic.png",
		phoneScreenshots: "store/android/phone",
	},

	// Play Console > Policy > App content. Entered by hand.
	privacyPolicyUrl: appStore.privacyPolicyUrl,
	appCategory: "Productivity",
	appAccess: {
		restricted: true,
		username: process.env.APP_REVIEW_EMAIL ?? "",
		password: process.env.APP_REVIEW_PASSWORD ?? "",
		instructions: appAccessInstructions,
	},
	ads: false,
	targetAudience: "18 and over",
	contentRating: {
		category: "Utility, Productivity, Communication, or Other",
		violence: false,
		sexualContent: false,
		language: false,
		controlledSubstances: false,
		gambling: false,
		// Users chat with their own AI agents and teammates' sessions.
		userInteraction: true,
		sharesLocation: false,
		digitalPurchases: false,
	},
	// What lib/posthog, lib/sentry, auth, attachments and voice send.
	dataSafety: {
		encryptedInTransit: true,
		accountDeletionInApp: true,
		accountDeletionUrl: "https://paradev.com/privacy",
		collected: [
			{
				type: "Personal info: Name, Email address, User IDs",
				purposes: ["App functionality", "Account management", "Analytics"],
				shared: false,
				optional: false,
			},
			{
				type: "App activity: App interactions, Other user-generated content",
				purposes: ["App functionality", "Analytics"],
				shared: false,
				optional: false,
				note: "PostHog events and session replay; messages sent to agents",
			},
			{
				type: "Photos and videos: Photos",
				purposes: ["App functionality"],
				shared: false,
				optional: true,
				note: "Only images the user attaches to a message",
			},
			{
				type: "Audio: Voice or sound recordings",
				purposes: ["App functionality"],
				shared: true,
				optional: true,
				note: "Voice mode streams microphone audio to OpenAI's Realtime API; not stored by us",
			},
			{
				type: "App info and performance: Crash logs, Diagnostics",
				purposes: ["Analytics"],
				shared: false,
				optional: false,
				note: "Sentry, sendDefaultPii off",
			},
			{
				type: "Device or other IDs",
				purposes: ["Analytics"],
				shared: false,
				optional: false,
				note: "PostHog anonymous and device IDs",
			},
		],
	},
};
