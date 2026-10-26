import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupI18n } from "@lingui/core";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";

const examples = {
	cs: [
		[1, "1 obnovení dostupné"],
		[3, "3 obnovení dostupná"],
		[5, "5 obnovení dostupných"],
	],
	pl: [
		[1, "1 odnowienie dostępne"],
		[3, "3 odnowienia dostępne"],
		[12, "12 odnowień dostępnych"],
	],
	ru: [
		[1, "Доступен 1 сброс"],
		[3, "Доступно 3 сброса"],
		[12, "Доступно 12 сбросов"],
		[21, "Доступен 21 сброс"],
	],
} as const;

for (const [locale, cases] of Object.entries(examples)) {
	test(`${locale} renders both reset count messages with its cardinal plural forms`, () => {
		const catalog = readFileSync(
			join(import.meta.dir, "../locales", locale, "messages.po"),
			"utf8",
		);
		for (const name of ["0", "count"]) {
			const id = `{${name}, plural, one {# reset available} other {# resets available}}`;
			const entry = catalog
				.split("\n\n")
				.find((item) => item.includes(`msgid ${JSON.stringify(id)}`));
			expect(entry).toBeDefined();
			const line = entry
				?.split("\n")
				.find((item) => item.startsWith("msgstr "));
			const translation: string = JSON.parse(line?.slice(7) ?? '""');
			const i18n = setupI18n({
				locale,
				messages: { [locale]: { [id]: compileMessageOrThrow(translation) } },
			});
			for (const [count, expected] of cases)
				expect(i18n._(id, { [name]: count })).toBe(expected);
		}
	});
}
