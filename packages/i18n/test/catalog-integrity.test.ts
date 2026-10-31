import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "../src/locales";

// A translation may reword anything except the parts the runtime substitutes:
// `{placeholders}`, `<0>…</0>` tag markers, and the ICU plural/select shape.
// `compile --strict` only checks that an entry exists, so a dropped `{name}`
// would ship silently in one locale.

const LOCALES_DIR = join(import.meta.dir, "../locales");
const SOURCE_LOCALE = "en";

type Entry = { msgid: string; msgstr: string };

const unquote = (s: string) =>
	s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");

// PO strings may continue over several quoted lines.
function parsePo(text: string): Entry[] {
	const lines = text.split("\n");
	const inner = (l: string) =>
		unquote(l.slice(l.indexOf('"') + 1, l.lastIndexOf('"')));
	const entries: Entry[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i]?.startsWith("msgid ")) continue;
		let msgid = inner(lines[i] as string);
		let j = i + 1;
		while (lines[j]?.startsWith('"')) msgid += inner(lines[j++] as string);
		if (!lines[j]?.startsWith("msgstr ")) continue;
		let msgstr = inner(lines[j] as string);
		j++;
		while (lines[j]?.startsWith('"')) msgstr += inner(lines[j++] as string);
		if (msgid) entries.push({ msgid, msgstr });
		i = j - 1;
	}
	return entries;
}

const stripIcu = (t: string) =>
	t.replace(
		/\{\s*\w+\s*,\s*(plural|select|selectordinal)\b[\s\S]*?\}\s*\}/g,
		"",
	);
const placeholders = (t: string) =>
	new Set([...stripIcu(t).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]));
const tags = (t: string) =>
	[...t.matchAll(/<\/?(\d+)\/?>/g)]
		.map((m) => m[0])
		.sort()
		.join();
const icu = (t: string) =>
	[...t.matchAll(/\{\s*(\w+)\s*,\s*(plural|select|selectordinal)\b/g)]
		.map((m) => `${m[1]}:${m[2]}`)
		.sort()
		.join();

const ICU_HEAD = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\b/y;

// Balanced, unlike stripIcu: a branch ending in `{name}}` must not end the block.
function outsideIcu(t: string): string {
	let out = "";
	let i = 0;
	while (i < t.length) {
		ICU_HEAD.lastIndex = i;
		if (!ICU_HEAD.test(t)) {
			out += t[i++];
			continue;
		}
		for (let depth = 0; i < t.length; i++) {
			if (t[i] === "{") depth++;
			else if (t[i] === "}" && --depth === 0) break;
		}
		i++;
	}
	return out;
}

const strayBraces = (t: string) =>
	/[{}]/.test(outsideIcu(t).replace(/\{[A-Za-z0-9_]+\}/g, ""));

function integrityError(source: string, translation: string): string | null {
	for (const name of placeholders(source)) {
		if (!placeholders(translation).has(name)) return `missing {${name}}`;
	}
	if (tags(source) !== tags(translation)) return "tag markers differ";
	if (icu(source) !== icu(translation)) return "ICU structure differs";
	if (strayBraces(translation) && !strayBraces(source))
		return "braces the source does not have";
	return null;
}

const readCatalog = (locale: string) =>
	parsePo(readFileSync(join(LOCALES_DIR, locale, "messages.po"), "utf8"));

// An explicit-id message keeps its English in the source catalog's msgstr.
const english = new Map(
	readCatalog(SOURCE_LOCALE).map((entry) => [
		entry.msgid,
		entry.msgstr || entry.msgid,
	]),
);
const sourceText = (msgid: string) => english.get(msgid) ?? msgid;

describe("catalog integrity", () => {
	for (const locale of SUPPORTED_LOCALES) {
		if (locale === SOURCE_LOCALE) continue;
		test(`${locale} keeps placeholders, tags, and ICU shape`, () => {
			const broken = readCatalog(locale)
				.filter((entry) => entry.msgstr !== "")
				.flatMap((entry) => {
					const problem = integrityError(sourceText(entry.msgid), entry.msgstr);
					return problem
						? [`${JSON.stringify(entry.msgid.slice(0, 70))}: ${problem}`]
						: [];
				});
			expect(broken).toEqual([]);
		});
	}

	test("rejects a dict dump and a dropped placeholder behind an explicit id", () => {
		expect(
			integrityError(
				"Hello {name}",
				'{"en": "Hello {name}", "fr": "Bonjour {name}"}',
			),
		).toBe("braces the source does not have");
		expect(
			integrityError(
				sourceText("serverError.plugins.marketplaceBuiltinRemove"),
				"Вбудований, тому його не можна видалити",
			),
		).toBe("missing {name}");
		expect(
			outsideIcu("a {count, plural, one {# in {name}} other {# in {name}}} b"),
		).toBe("a  b");
	});
});
