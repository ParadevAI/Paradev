#!/usr/bin/env bun
/**
 * Writes the Android toolbar icons in lib/navigation/toolbar-icons/ and the
 * Compose menu and sheet icons in lib/menu-icons/ as vector drawables, from
 * Google's Material Symbols (Apache 2.0). A `Stack.Toolbar` item or a Compose
 * `Icon` on Android takes only an image source, not an SF Symbol.
 *
 *   bun scripts/generate-toolbar-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolbarIconName } from "../lib/navigation/toolbarIcon.types";

// `fill1` for an "on" state, as the iOS side uses a `.fill` symbol there.
const MATERIAL_SYMBOL: Record<ToolbarIconName, string> = {
	add: "add",
	close: "close",
	comments: "forum",
	commentMode: "center_focus_weak",
	commentModeOn: "center_focus_strong/fill1",
	confirm: "check",
	expand: "open_in_full",
	filter: "filter_list",
	filterActive: "filter_alt/fill1",
	fix: "build",
	jumpToFile: "find_in_page",
	link: "link",
	mic: "mic/fill1",
	micOff: "mic_off/fill1",
	more: "more_horiz",
	overflow: "more_horiz",
	search: "search",
	send: "send",
	sessions: "stacks",
	share: "ios_share",
	stop: "stop",
	submit: "check",
	voice: "graphic_eq",
	voiceSettings: "tune",
};

const MENU_SYMBOL: Record<string, string> = {
	camera: "photo_camera",
	close: "close",
	copy: "content_copy",
	delete: "delete",
	edit: "edit",
	files: "folder",
	fileComment: "add_comment",
	photos: "photo_library",
	viewFile: "description",
};

const SIZE = 960;
const scriptDir = dirname(fileURLToPath(import.meta.url));

// How many numbers each command takes, and which of them are y coordinates.
const ARITY: Record<string, { count: number; ys: number[] }> = {
	M: { count: 2, ys: [1] },
	L: { count: 2, ys: [1] },
	T: { count: 2, ys: [1] },
	H: { count: 1, ys: [] },
	V: { count: 1, ys: [0] },
	C: { count: 6, ys: [1, 3, 5] },
	S: { count: 4, ys: [1, 3] },
	Q: { count: 4, ys: [1, 3] },
	A: { count: 7, ys: [6] },
	Z: { count: 0, ys: [] },
};

/**
 * Material Symbols draw in a `0 -960 960 960` viewBox. The parser `@expo/ui`
 * uses for a Metro-served drawable reads paths only, not a translating group,
 * so the absolute y coordinates are moved into `0 0 960 960` here.
 */
function shiftIntoViewport(d: string): string {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
	const out: string[] = [];
	let command = "";
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index] as string;
		if (/[a-zA-Z]/.test(token)) {
			command = token;
			out.push(token);
			index += 1;
			if (command.toUpperCase() === "Z") continue;
		}
		const arity = ARITY[command.toUpperCase()];
		if (!arity) throw new Error(`unsupported path command ${command}`);
		// A path's first moveto is absolute even when written as `m`.
		const absolute =
			command === command.toUpperCase() ||
			(command === "m" && out.length === 1);
		const values = tokens
			.slice(index, index + arity.count)
			.map((value, position) =>
				absolute && arity.ys.includes(position)
					? Number(value) + SIZE
					: Number(value),
			);
		out.push(values.join(" "));
		index += arity.count;
		// Extra pairs after a moveto are linetos.
		if (command === "M") command = "L";
		if (command === "m") command = "l";
	}
	return out.join(" ");
}

async function fetchPaths(symbol: string): Promise<string[]> {
	const [name, style = "default"] = symbol.split("/");
	const url = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${name}/${style}/24px.svg`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${symbol}: ${response.status} ${url}`);
	const svg = await response.text();
	return [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) =>
		shiftIntoViewport(match[1] as string),
	);
}

function vectorDrawable(paths: string[]): string {
	return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="${SIZE}"
    android:viewportHeight="${SIZE}">
${paths.map((d) => `  <path android:fillColor="#FFFFFFFF" android:pathData="${d}"/>`).join("\n")}
</vector>
`;
}

for (const [dir, symbols] of [
	["../lib/navigation/toolbar-icons", MATERIAL_SYMBOL],
	["../lib/menu-icons", MENU_SYMBOL],
] as const) {
	const outDir = join(scriptDir, dir);
	mkdirSync(outDir, { recursive: true });
	for (const [name, symbol] of Object.entries(symbols)) {
		writeFileSync(
			join(outDir, `${name}.xml`),
			vectorDrawable(await fetchPaths(symbol)),
		);
	}
	console.log(`Wrote ${Object.keys(symbols).length} icons to ${outDir}`);
}
