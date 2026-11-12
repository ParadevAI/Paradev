import { expect, test } from "bun:test";
import {
	clearGithubAuthReturn,
	consumeGithubAuthReturn,
	markGithubAuthReturn,
} from "./github-auth-return";

test("GitHub auth context is short-lived, one-use, and cleared after a failed start", () => {
	const original = Object.getOwnPropertyDescriptor(
		globalThis,
		"sessionStorage",
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
	try {
		expect(consumeGithubAuthReturn()).toBe(false);
		markGithubAuthReturn();
		expect(consumeGithubAuthReturn()).toBe(true);
		expect(consumeGithubAuthReturn()).toBe(false);
		markGithubAuthReturn();
		expect(consumeGithubAuthReturn(Date.now() + 600001)).toBe(false);
		markGithubAuthReturn();
		clearGithubAuthReturn();
		expect(consumeGithubAuthReturn()).toBe(false);
	} finally {
		if (original) Object.defineProperty(globalThis, "sessionStorage", original);
		else Reflect.deleteProperty(globalThis, "sessionStorage");
	}
});
