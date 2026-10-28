import { useEffect, useMemo, useState } from "react";
import { useMermaidRenderer } from "../../providers/MermaidRendererProvider";
import type { MermaidDiagramState, MermaidTheme } from "../../types";
import { mermaidThemeConfig } from "../../utils/mermaidThemeConfig";

type Outcome = Extract<MermaidDiagramState, { status: "ready" | "error" }>;
type Entry = { promise: Promise<Outcome>; outcome: Outcome | null };

const MAX_CACHED = 40;
const cache = new Map<string, Entry>();

const IDLE: MermaidDiagramState = { status: "idle" };
const RENDERING: MermaidDiagramState = { status: "rendering" };

/** Mermaid explains a parse error over several lines; the first one names it. */
function errorLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0]?.trim().replace(/:$/, "") ?? "";
}

function draw(key: string, run: () => Promise<string>): Entry {
	const cached = cache.get(key);
	if (cached) {
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}
	const entry: Entry = {
		promise: run().then(
			(svg): Outcome => ({ status: "ready", svg }),
			(error: unknown): Outcome => ({
				status: "error",
				error: errorLine(error),
			}),
		),
		outcome: null,
	};
	void entry.promise.then((outcome) => {
		entry.outcome = outcome;
	});
	cache.set(key, entry);
	if (cache.size > MAX_CACHED) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return entry;
}

/**
 * Draws `source` with the current renderer. A finished drawing is kept per
 * source and theme, so a block that remounts shows it at once.
 */
export function useMermaidDiagram(
	source: string | null,
	theme: MermaidTheme,
): MermaidDiagramState {
	const renderer = useMermaidRenderer();
	const config = useMemo(() => mermaidThemeConfig(theme), [theme]);
	const key = useMemo(
		() => (source === null ? null : `${JSON.stringify(config)}\u0000${source}`),
		[config, source],
	);
	const [settled, setSettled] = useState<{
		key: string;
		outcome: Outcome;
	} | null>(null);

	useEffect(() => {
		if (key === null || source === null) return;
		const entry = draw(key, () => renderer(source, config));
		let cancelled = false;
		void entry.promise.then((outcome) => {
			if (!cancelled) setSettled({ key, outcome });
		});
		return () => {
			cancelled = true;
		};
	}, [key, source, config, renderer]);

	if (key === null) return IDLE;
	if (settled?.key === key) return settled.outcome;
	return cache.get(key)?.outcome ?? RENDERING;
}
