import { useEffect, useState } from "react";
import { useMermaidRenderer } from "../../providers/MermaidRendererProvider";
import type { MermaidDiagramState, MermaidRenderer } from "../../types";

type Outcome = Extract<MermaidDiagramState, { status: "ready" | "error" }>;
type Entry = { promise: Promise<Outcome>; outcome: Outcome | null };

const MAX_CACHED = 40;
const caches = new WeakMap<MermaidRenderer, Map<string, Entry>>();

function cacheFor(renderer: MermaidRenderer): Map<string, Entry> {
	let cache = caches.get(renderer);
	if (!cache) {
		cache = new Map();
		caches.set(renderer, cache);
	}
	return cache;
}

const IDLE: MermaidDiagramState = { status: "idle" };
const RENDERING: MermaidDiagramState = { status: "rendering" };

function errorMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).trim();
}

function draw(renderer: MermaidRenderer, source: string): Entry {
	const cache = cacheFor(renderer);
	const cached = cache.get(source);
	if (cached) {
		cache.delete(source);
		cache.set(source, cached);
		return cached;
	}
	const entry: Entry = {
		promise: renderer(source).then(
			(svg): Outcome => ({ status: "ready", svg }),
			(error: unknown): Outcome => ({
				status: "error",
				error: errorMessage(error),
			}),
		),
		outcome: null,
	};
	void entry.promise.then((outcome) => {
		entry.outcome = outcome;
	});
	cache.set(source, entry);
	if (cache.size > MAX_CACHED) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return entry;
}

/**
 * Draws `source` with the current renderer. A finished drawing is kept per
 * renderer and source, so a block that remounts shows it at once.
 */
export function useMermaidDiagram(source: string | null): MermaidDiagramState {
	const renderer = useMermaidRenderer();
	const [settled, setSettled] = useState<{
		renderer: MermaidRenderer;
		source: string;
		outcome: Outcome;
	} | null>(null);

	useEffect(() => {
		if (source === null) return;
		const entry = draw(renderer, source);
		let cancelled = false;
		void entry.promise.then((outcome) => {
			if (!cancelled) setSettled({ renderer, source, outcome });
		});
		return () => {
			cancelled = true;
		};
	}, [source, renderer]);

	if (source === null) return IDLE;
	if (settled?.source === source && settled.renderer === renderer) {
		return settled.outcome;
	}
	return cacheFor(renderer).get(source)?.outcome ?? RENDERING;
}
