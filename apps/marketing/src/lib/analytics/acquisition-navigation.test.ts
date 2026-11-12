import { expect, test } from "bun:test";
import {
	continueAcquisitionNavigation,
	handleAcquisitionLink,
} from "./acquisition-navigation";

function activation(overrides: Record<string, unknown> = {}) {
	return {
		type: "click",
		button: 0,
		defaultPrevented: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		...overrides,
	};
}
function link(overrides: Record<string, unknown> = {}) {
	return {
		href: "https://app.superset.sh/sign-up?redirect=%2Fworkspace",
		target: "",
		hasAttribute: () => false,
		...overrides,
	};
}

for (const kind of ["same-tab", "_blank", "ctrl", "meta", "middle", "shift"]) {
	test(`actual app-link activation waits for lineage: ${kind}`, async () => {
		const lineage = deferred();
		const event = activation({
			ctrlKey: kind === "ctrl",
			metaKey: kind === "meta",
			shiftKey: kind === "shift",
			...(kind === "middle" ? { type: "auxclick", button: 1 } : {}),
		});
		const anchor = link({ target: kind === "_blank" ? "_blank" : "" });
		const tab = {
			opener: {} as unknown,
			location: { href: "about:blank" },
			closed: false,
		};
		let assigned = "";
		let opened = 0;
		const navigation = handleAcquisitionLink(
			event,
			anchor,
			"https://app.superset.sh",
			{
				prepare: () => lineage.promise,
				assign: (href) => {
					assigned = href;
				},
				open: () => {
					opened++;
					return tab as unknown as Window;
				},
			},
		);
		expect(event.defaultPrevented).toBe(true);
		expect(assigned).toBe("");
		expect(tab.location.href).toBe("about:blank");
		expect(opened).toBe(kind === "same-tab" ? 0 : 1);
		if (opened) expect(tab.opener).toBeNull();
		lineage.resolve();
		await navigation;
		expect(kind === "same-tab" ? assigned : tab.location.href).toBe(
			anchor.href,
		);
	});
}

for (const [event, anchor] of [
	[activation({ defaultPrevented: true }), link()],
	[activation({ altKey: true }), link()],
	[activation({ button: 2 }), link()],
	[activation(), link({ hasAttribute: () => true })],
	[activation(), link({ href: "https://github.com/ParadevAI/Paradev" })],
	[activation(), link({ href: "https://paradev.com/download/dmg" })],
	[activation(), link({ target: "named-window" })],
] as const) {
	test(`unrelated or already-handled link is not intercepted: ${JSON.stringify([event, anchor])}`, () => {
		let prepared = false;
		expect(
			handleAcquisitionLink(event, anchor, "https://app.superset.sh", {
				prepare: async () => {
					prepared = true;
				},
				assign: () => {},
				open: () => null,
			}),
		).toBeUndefined();
		expect(prepared).toBe(false);
	});
}

test("blocked popup preserves the browser default instead of losing the link", () => {
	const event = activation();
	handleAcquisitionLink(
		event,
		link({ target: "_blank" }),
		"https://app.superset.sh",
		{ prepare: async () => {}, assign: () => {}, open: () => null },
	);
	expect(event.defaultPrevented).toBe(false);
});

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("outgoing navigation waits for the source-bearing lineage response", async () => {
	const lineage = deferred();
	let navigated = false;
	const navigation = continueAcquisitionNavigation(
		() => lineage.promise,
		() => {
			navigated = true;
		},
	);
	await Promise.resolve();
	expect(navigated).toBe(false);
	lineage.resolve();
	await navigation;
	expect(navigated).toBe(true);
});

test("lineage failure still continues authentication", async () => {
	let navigated = false;
	await continueAcquisitionNavigation(
		async () => {
			throw new Error("offline");
		},
		() => {
			navigated = true;
		},
	);
	expect(navigated).toBe(true);
});

test("the total wait is bounded even if the lineage queue never finishes", async () => {
	let navigated = false;
	await continueAcquisitionNavigation(
		() => new Promise(() => {}),
		() => {
			navigated = true;
		},
		0,
	);
	expect(navigated).toBe(true);
});
