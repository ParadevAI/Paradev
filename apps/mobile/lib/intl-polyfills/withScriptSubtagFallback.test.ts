import { describe, expect, test } from "bun:test";
import { withScriptSubtagFallback } from "./withScriptSubtagFallback";

// Android Hermes's support list, as measured on API 33: script-qualified
// Chinese tags only.
const ANDROID_SUPPORTED = new Set(["en", "pt-BR", "zh-Hans-CN", "zh-Hant-TW"]);

class AndroidLikeFormat {
	readonly locale: string;
	constructor(locales?: string | readonly string[]) {
		const tags = typeof locales === "string" ? [locales] : (locales ?? []);
		this.locale = tags.find((tag) => ANDROID_SUPPORTED.has(tag)) ?? "en-US";
	}
	static supportedLocalesOf(locales: string | readonly string[]): string[] {
		const tags = typeof locales === "string" ? [locales] : locales;
		return tags.filter((tag) => ANDROID_SUPPORTED.has(tag));
	}
}

describe("withScriptSubtagFallback", () => {
	const Format = withScriptSubtagFallback(AndroidLikeFormat);

	test("formats region-only Chinese tags in Chinese, not en-US", () => {
		expect(new Format("zh-CN").locale).toBe("zh-Hans-CN");
		expect(new Format(["zh-TW"]).locale).toBe("zh-Hant-TW");
	});

	test("passes supported tags through unchanged", () => {
		expect(new Format("pt-BR").locale).toBe("pt-BR");
		expect(new Format().locale).toBe("en-US");
	});

	test("reports the requested tags as supported", () => {
		expect(Format.supportedLocalesOf(["zh-CN", "zh-TW", "xx"])).toEqual([
			"zh-CN",
			"zh-TW",
		]);
	});
});
