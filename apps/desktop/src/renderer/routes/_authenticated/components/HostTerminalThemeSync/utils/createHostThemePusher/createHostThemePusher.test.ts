import { expect, test } from "bun:test";
import { createHostThemePusher } from "./createHostThemePusher";

function recordingPusher(
	send: (hostUrl: string, theme: string) => Promise<unknown> = async () => {},
) {
	const sent: Array<[string, string]> = [];
	const failed: string[] = [];
	const pusher = createHostThemePusher<string>({
		send: (hostUrl, theme) => {
			sent.push([hostUrl, theme]);
			return send(hostUrl, theme);
		},
		onError: (hostUrl) => failed.push(hostUrl),
	});
	return { pusher, sent, failed };
}

test("every connected host receives the theme, and a failure on one host does not stop the others", async () => {
	const { pusher, sent, failed } = recordingPusher(async (hostUrl) => {
		if (hostUrl === "a") throw new Error("procedure not found");
	});

	await pusher.sync(["a", "b"], "light");
	expect(sent).toEqual([
		["a", "light"],
		["b", "light"],
	]);
	expect(failed).toEqual(["a"]);

	await pusher.sync(["a", "b"], "dark");
	expect(sent.slice(2)).toEqual([
		["a", "dark"],
		["b", "dark"],
	]);
});

test("pushes to one host stay in order", async () => {
	let releaseFirst = () => {};
	const firstPush = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const { pusher, sent } = recordingPusher((_hostUrl, theme) =>
		theme === "light" ? firstPush : Promise.resolve(),
	);

	const first = pusher.sync(["a"], "light");
	const second = pusher.sync(["a"], "dark");
	await Promise.resolve();
	expect(sent).toEqual([["a", "light"]]);

	releaseFirst();
	await Promise.all([first, second]);
	expect(sent).toEqual([
		["a", "light"],
		["a", "dark"],
	]);
});

test("a host gets the theme again only when the theme changes or the host reconnects", async () => {
	const { pusher, sent } = recordingPusher();

	await pusher.sync(["a", "b"], "light");
	await pusher.sync(["a", "b"], "light");
	await pusher.sync(["a"], "light");
	expect(sent).toHaveLength(2);

	await pusher.sync(["a", "b"], "light");
	expect(sent.slice(2)).toEqual([["b", "light"]]);

	await pusher.sync(["a", "b"], "dark");
	expect(sent.slice(3)).toEqual([
		["a", "dark"],
		["b", "dark"],
	]);
});

test("a failed push is retried on the next sync with the same theme; a successful one is not re-sent", async () => {
	let unreachable = true;
	const { pusher, sent, failed } = recordingPusher(async (hostUrl) => {
		if (unreachable && hostUrl === "a") throw new Error("host unreachable");
	});

	await pusher.sync(["a", "b"], "light");
	expect(failed).toEqual(["a"]);

	unreachable = false;
	await pusher.sync(["a", "b"], "light");
	expect(sent.slice(2)).toEqual([["a", "light"]]);

	await pusher.sync(["a", "b"], "light");
	expect(sent).toHaveLength(3);
	expect(failed).toEqual(["a"]);
});
