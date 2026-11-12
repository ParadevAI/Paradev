import { expect, test } from "bun:test";
import { hasAnalyticsOptOut } from "./browser";

test("bridge follows default/accepted and existing saved or SDK opt-out without an Accept prerequisite", () => {
	const local = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	const doc = Object.getOwnPropertyDescriptor(globalThis, "document");
	const values = new Map<string, string>();
	let cookies = "";
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: { getItem: (key: string) => values.get(key) ?? null },
	});
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			get cookie() {
				return cookies;
			},
		},
	});
	try {
		expect(hasAnalyticsOptOut("choice", "project")).toBe(false);
		values.set("choice", "accepted");
		expect(hasAnalyticsOptOut("choice", "project")).toBe(false);
		values.set("__ph_opt_in_out_project", "0");
		expect(hasAnalyticsOptOut("choice", "project")).toBe(true);
		values.set("__ph_opt_in_out_project", "1");
		values.set("choice", "declined");
		expect(hasAnalyticsOptOut("choice", "project")).toBe(true);
		values.clear();
		cookies = "__ph_opt_in_out_project=0";
		expect(hasAnalyticsOptOut("choice", "project")).toBe(true);
		cookies = "";
		values.set("__ph_opt_in_out_other_project", "0");
		expect(hasAnalyticsOptOut("choice", "project")).toBe(false);
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get() {
				throw new Error("blocked");
			},
		});
		expect(hasAnalyticsOptOut("choice", "project")).toBe(true);
	} finally {
		if (local) Object.defineProperty(globalThis, "localStorage", local);
		else Reflect.deleteProperty(globalThis, "localStorage");
		if (doc) Object.defineProperty(globalThis, "document", doc);
		else Reflect.deleteProperty(globalThis, "document");
	}
});
