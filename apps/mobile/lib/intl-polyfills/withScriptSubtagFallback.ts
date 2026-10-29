type Locales = string | readonly string[];

interface IntlFormatConstructor {
	new (locales?: Locales, options?: object): object;
	supportedLocalesOf(locales: Locales, options?: object): string[];
	prototype: object;
}

/**
 * Hermes on Android lists `zh-Hans-CN` but not `zh-CN`, and its lookup does
 * not add the script subtag, so `zh-CN` and `zh-TW` silently format as
 * `en-US`. This passes the native constructor the maximized tag (`zh-CN` ->
 * `zh-Hans-CN`) for any tag it does not support as written.
 */
export function withScriptSubtagFallback<T extends IntlFormatConstructor>(
	Native: T,
): T {
	const resolve = (locales: Locales | undefined) => {
		if (locales === undefined) return undefined;
		return (typeof locales === "string" ? [locales] : [...locales]).map(
			(tag) =>
				Native.supportedLocalesOf([tag]).length > 0
					? tag
					: new Intl.Locale(tag).maximize().toString(),
		);
	};

	function Fallback(locales?: Locales, options?: object) {
		return new Native(resolve(locales), options);
	}
	Fallback.prototype = Native.prototype;
	Fallback.supportedLocalesOf = (locales: Locales, options?: object) => {
		const requested = typeof locales === "string" ? [locales] : [...locales];
		const resolved = resolve(requested) ?? [];
		return requested.filter(
			(_, index) =>
				Native.supportedLocalesOf([resolved[index] as string], options).length >
				0,
		);
	};
	return Fallback as unknown as T;
}
