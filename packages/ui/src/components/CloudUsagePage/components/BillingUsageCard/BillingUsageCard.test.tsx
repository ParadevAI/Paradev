import { describe, expect, it } from "bun:test";
import { I18nProvider } from "@lingui/react";
import { i18n, initI18n } from "@superset/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { overviewArgs } from "../../fixtures";
import { BillingUsageCard } from "./BillingUsageCard";

initI18n("en");

describe("BillingUsageCard", () => {
	it("shows the usage figures without the usage pages: no link, the same card", () => {
		const { period } = overviewArgs("northwind");
		const html = renderToStaticMarkup(
			<I18nProvider i18n={i18n}>
				<BillingUsageCard period={period} link={false} />
			</I18nProvider>,
		);
		expect(html).toContain("used");
		expect(html).toContain("Included with");
		expect(html).not.toContain("Cloud usage");
	});
});
