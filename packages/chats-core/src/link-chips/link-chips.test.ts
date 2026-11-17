import { describe, expect, test } from "bun:test";
import { linkChip } from "./link-chips.ts";

const label = (href: string) => linkChip(href)?.label ?? null;

describe("linkChip", () => {
	test("names what a known app's address points at", () => {
		expect(
			label(
				"https://linear.app/superset-sh/issue/super-3353/redesign-environment-settings",
			),
		).toBe("SUPER-3353");
		expect(
			label(
				"https://linear.app/acme/project/conductor-shutdown-0a1b2c3d4e5f/overview",
			),
		).toBe("Conductor shutdown");
		expect(label("https://github.com/ParadevAI/dev/pull/35")).toBe(
			"ParadevAI/dev#35",
		);
		expect(
			label("https://github.com/ParadevAI/dev/issues/7#issuecomment-1"),
		).toBe("ParadevAI/dev#7");
		expect(label("https://github.com/ParadevAI/dev")).toBe("ParadevAI/dev");
		expect(
			label(
				"https://github.com/ParadevAI/dev/blob/main/apps/client/src/App.tsx",
			),
		).toBe("App.tsx");
		expect(label("https://github.com/ParadevAI/dev/tree/main")).toBe("GitHub");
		expect(label("https://github.com/ParadevAI/dev/blob/main")).toBe("GitHub");
		expect(
			label(
				"https://www.notion.so/acme/Launch-plan-0123456789abcdef0123456789abcdef",
			),
		).toBe("Launch plan");
		expect(label("https://acme.sentry.io/issues/4242/?project=1")).toBe(
			"Issue 4242",
		);
		expect(
			label(
				"https://app.superset.sh/page/talking-about-an-event-options-o075t4",
			),
		).toBe("Talking about an event options");
		expect(
			label(
				"https://app.superset.sh/workspaces/700b5fb0-f0f2-4c14-af83-ab629befd08a",
			),
		).toBe("Workspace 700b5fb0");
		expect(label("https://mail.google.com/mail/u/0/#inbox/FMfcg")).toBe(
			"Email",
		);
	});

	test("falls back to the app's name, and carries its mark", () => {
		expect(linkChip("https://github.com/ParadevAI/dev/actions")).toMatchObject({
			app: "github",
			label: "GitHub",
		});
		expect(linkChip("https://calendar.google.com/calendar/r")).toMatchObject({
			app: "google-calendar",
			label: "Google Calendar",
		});
		expect(linkChip("https://linear.app/acme")?.mark.file).toBe("linear");
		expect(linkChip("https://github.com/settings/tokens")?.label).toBe(
			"GitHub",
		);
	});

	test("other links, and anything that isn't a web address, make no chip", () => {
		expect(linkChip("https://example.com/a")).toBeNull();
		expect(linkChip("mailto:a@b.c")).toBeNull();
		expect(linkChip("not a url")).toBeNull();
		expect(linkChip("https://user:pw@github.com/a/b")).toBeNull();
	});
});
