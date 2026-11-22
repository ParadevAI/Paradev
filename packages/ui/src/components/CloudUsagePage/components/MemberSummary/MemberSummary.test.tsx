import { describe, expect, it } from "bun:test";
import { I18nProvider } from "@lingui/react";
import { i18n, initI18n } from "@superset/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberSummary } from "./MemberSummary";

initI18n("en");

const total = {
	workspaces: null,
	boots: 3,
	failedBoots: 0,
	hours: 2,
	gbHours: 8,
	usageUsd: 1.2,
};

const html = (workspaces: number | null) =>
	renderToStaticMarkup(
		<I18nProvider i18n={i18n}>
			<MemberSummary total={total} workspaces={workspaces} isPeriod />
		</I18nProvider>,
	);

describe("MemberSummary", () => {
	it("counts the workspaces it is given, not the by-day total's, and leaves the count out until it is known", () => {
		expect(html(2)).toContain("in 2 workspaces this period");
		expect(html(null)).not.toContain("workspace");
		expect(html(null)).toContain("used by you");
	});
});
