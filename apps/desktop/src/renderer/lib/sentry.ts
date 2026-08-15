import { SENTRY_IGNORE_ERRORS } from "@superset/shared/sentry";
import { env } from "../env.renderer";
import {
	type HeapSeries,
	heapUsedBucket,
	recordHeapSample,
	summarizeHeap,
} from "./heap-trajectory";

let sentryInitialized = false;

// Chromium refreshes `performance.memory` at most every 20 minutes and rounds
// it into buckets unless the app runs with --enable-precise-memory-info, which
// we deliberately do not set: it hands precise heap readings to any web content
// the app renders. Sampling more often than the source updates buys nothing.
const HEAP_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

type PerformanceWithMemory = Performance & {
	memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
};

/**
 * Keeps a bounded heap-growth series on the Sentry scope. The Electron SDK
 * forwards renderer scope tags and extras to the main process on every change,
 * and the main process is what files the minidump — so this is on the report
 * before the renderer dies. Nothing here sends an event of its own.
 */
function trackHeapTrajectory(
	Sentry: typeof import("@sentry/electron/renderer"),
): void {
	// `performance.memory` returns a fresh reading per access, so it has to be
	// read inside the interval rather than captured once.
	if (!(performance as PerformanceWithMemory).memory) return;

	let series: HeapSeries | null = null;

	const sample = (): void => {
		const memory = (performance as PerformanceWithMemory).memory;
		if (!memory) return;

		series = recordHeapSample(series, {
			usedBytes: memory.usedJSHeapSize,
			uptimeMs: performance.now(),
		});

		const trajectory = summarizeHeap(series, memory.jsHeapSizeLimit);

		Sentry.setExtra("renderer_heap", trajectory);
		Sentry.setTag(
			"renderer.heap_used",
			heapUsedBucket(trajectory.used_mb, trajectory.limit_mb),
		);
	};

	sample();
	setInterval(sample, HEAP_SAMPLE_INTERVAL_MS);
}

export async function initSentry(): Promise<void> {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		// Dynamic import to avoid bundler issues
		const Sentry = await import("@sentry/electron/renderer");

		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0,
			ignoreErrors: SENTRY_IGNORE_ERRORS,
			// tRPC failures are reported by the main-process middleware with full
			// server context; renderer copies (unhandled query/mutation promises)
			// duplicate them with worse stacks.
			beforeSend(event, hint) {
				const original = hint.originalException;
				if (original instanceof Error && original.name === "TRPCClientError") {
					return null;
				}
				return event;
			},
		});

		trackHeapTrajectory(Sentry);

		sentryInitialized = true;
		console.log("[sentry] Initialized in renderer process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in renderer:", error);
	}
}
