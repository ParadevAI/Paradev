import type { RouterDev, RouterMessage } from "../../../channelRouter";
import { type EvalCase, type EvalKind, m } from "../evalCase";

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
