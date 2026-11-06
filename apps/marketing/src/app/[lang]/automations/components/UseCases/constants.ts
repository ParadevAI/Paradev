import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const USE_CASES: {
	path: string;
	name: MessageDescriptor;
	outcome: MessageDescriptor;
}[] = [
	{
		path: "/recipes/sentry-triage",
		name: msg({ message: "Launch watch" }),
		outcome: msg({
			message:
				"Fixes each new Sentry error, with a daily run for any it missed.",
		}),
	},
	{
		path: "/recipes/review-requested-prs",
		name: msg({ message: "PR review" }),
		outcome: msg({
			message:
				"Runs the tests and reviews each pull request you're asked to review.",
		}),
	},
	{
		path: "/recipes/nightly-audit",
		name: msg({ message: "Nightly audit" }),
		outcome: msg({
			message:
				"Applies safe dependency updates every night and lists the rest.",
		}),
	},
	{
		path: "/recipes/slack-bug-reports",
		name: msg({ message: "Bug reports" }),
		outcome: msg({
			message: "Tries a fix for each bug someone posts in #bugs.",
		}),
	},
];
