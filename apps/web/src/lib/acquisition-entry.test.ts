import { expect, test } from "bun:test";
import { acquisitionEntry } from "./acquisition-entry";

test("desktop success performs first-party roundtrip even with an existing login", () => {
	const source = new URL(
		"https://app.superset.sh/auth/desktop/success?desktop_state=opaque&desktop_protocol=superset&desktop_local_callback=http%3A%2F%2F127.0.0.1%3A40123%2Fauth%2Fcallback",
	);
	const target = required(acquisitionEntry(source, new Headers()));
	expect(target.pathname).toBe("/api/acquisition/begin");
	expect(target.searchParams.get("returnTo")).toBe(
		source.pathname + source.search,
	);
});
test("both auth entries bridge, but completed entries, prefetch and unrelated pages do not", () => {
	for (const path of ["/sign-in", "/sign-up"])
		expect(
			acquisitionEntry(new URL(path, "https://app.superset.sh"), new Headers()),
		).not.toBeNull();
	for (const path of ["/sign-in?_acq=1", "/sign-up?_acq=1", "/"])
		expect(
			acquisitionEntry(new URL(path, "https://app.superset.sh"), new Headers()),
		).toBeNull();
	expect(
		acquisitionEntry(
			new URL("https://app.superset.sh/sign-up"),
			new Headers({ "next-router-prefetch": "1" }),
		),
	).toBeNull();
});

function required<T>(value: T): NonNullable<T> {
	if (value === null || value === undefined)
		throw new Error("Missing fixture value");
	return value as NonNullable<T>;
}
