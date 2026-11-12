import { expect, test } from "bun:test";
import {
	cleanGithubAuthReturnUrl,
	clearGithubAuthReturn,
	consumeGithubAuthReturn,
	markGithubAuthReturn,
} from "./github-auth-return";

function withBrowser(run: () => void) {
	const originals = new Map(
		["sessionStorage", "location"].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	);
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key),
		},
	});
	Object.defineProperty(globalThis, "location", {
		configurable: true,
		value: new URL("https://app.superset.sh/sign-in"),
	});
	try {
		run();
	} finally {
		for (const [key, original] of originals) {
			if (original) Object.defineProperty(globalThis, key, original);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
}

test("GitHub auth context requires its callback nonce, expires and is one-use", () => {
	withBrowser(() => {
		expect(consumeGithubAuthReturn()).toBeUndefined();
		const callback = markGithubAuthReturn("https://app.superset.sh/?keep=1");
		expect(consumeGithubAuthReturn(callback)).toBe(callback);
		expect(consumeGithubAuthReturn(callback)).toBeUndefined();
		const expired = markGithubAuthReturn("/");
		expect(
			consumeGithubAuthReturn(expired, Date.now() + 600001),
		).toBeUndefined();
		const failed = markGithubAuthReturn("/");
		clearGithubAuthReturn();
		expect(consumeGithubAuthReturn(failed)).toBeUndefined();
		expect(cleanGithubAuthReturnUrl(callback)).toBe(
			"https://app.superset.sh/?keep=1",
		);
	});
});
test("abandoned OAuth does not suppress a subsequent genuine GitHub visit", () => {
	withBrowser(() => {
		const callback = markGithubAuthReturn("/");
		expect(consumeGithubAuthReturn("https://app.superset.sh/")).toBeUndefined();
		const wrongNonce = new URL(callback);
		wrongNonce.searchParams.set("_github_auth_return", "other");
		expect(consumeGithubAuthReturn(wrongNonce.href)).toBeUndefined();
		const wrongRoute = new URL(callback);
		wrongRoute.pathname = "/sign-up";
		expect(consumeGithubAuthReturn(wrongRoute.href)).toBeUndefined();
		expect(consumeGithubAuthReturn(callback)).toBe(callback);
	});
});
test("external trusted callbacks retain their existing URL", () => {
	withBrowser(() => {
		const callback = "https://api.superset.sh/auth/desktop?state=keep";
		expect(markGithubAuthReturn(callback)).toBe(callback);
		expect(consumeGithubAuthReturn(callback)).toBeUndefined();
	});
});
