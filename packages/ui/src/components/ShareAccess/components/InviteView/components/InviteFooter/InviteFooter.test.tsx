import { describe, expect, it } from "bun:test";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InviteFooter } from "./InviteFooter";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

const render = (props: ComponentProps<typeof InviteFooter>) =>
	renderToStaticMarkup(
		<I18nProvider i18n={i18n}>
			<InviteFooter {...props} />
		</I18nProvider>,
	);

const monthly = { amount: 20, currency: "USD", interval: "month" } as const;

describe("InviteFooter", () => {
	it("shows the total seat cost when new people are staged on a paid plan", () => {
		const html = render({
			organizationName: "Acme",
			newPeople: 2,
			seatCost: monthly,
		});
		expect(html).toContain(
			"New people get an email invite to Acme and see this once they join, which adds 2 paid seats ($40/month).",
		);
	});

	it("says a seat is paid without an amount when the price is unknown", () => {
		const html = render({
			organizationName: "Acme",
			newPeople: 1,
			seatCost: null,
		});
		expect(html).toContain("which adds a paid seat for each.");
		expect(html).not.toContain("$");
	});

	it("hides the seat line when seats are not billed or no one new is staged", () => {
		const free = render({ organizationName: "Acme", newPeople: 1 });
		expect(free).not.toContain("paid seat");
		expect(free).toContain("New people get an email invite");
		expect(
			render({ organizationName: "Acme", newPeople: 0, seatCost: monthly }),
		).toBe("");
	});
});
