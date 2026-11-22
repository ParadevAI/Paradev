import { describe, expect, it } from "bun:test";
import { I18nProvider } from "@lingui/react";
import { i18n, initI18n } from "@superset/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { tinyUsageCardArgs } from "../../fixtures";
import { AllowanceCard } from "./AllowanceCard";

initI18n("en");

describe("AllowanceCard", () => {
	it("shows usage under a cent as <$0.01, not $0.00", () => {
		const html = renderToStaticMarkup(
			<I18nProvider i18n={i18n}>
				<AllowanceCard {...tinyUsageCardArgs()} billing={null} />
			</I18nProvider>,
		);
		expect(html).toContain("&lt;$0.01 used");
		expect(html).not.toContain("$0.00");
	});
});
