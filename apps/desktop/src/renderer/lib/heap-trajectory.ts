// A renderer killed by heap exhaustion dies inside the allocator, so the
// minidump carries no first-party frames and no history: it shows the heap
// full, never how it got there. Chromium's own v8-oom crash keys already give
// the sizes at the moment of death, and only for V8 heap-limit aborts — a
// PartitionAlloc abort emits none of them. What no crash report can contain is
// the shape of the climb, which is what separates a steady leak from a session
// that sat flat for days and then ran away. These samples are kept on the
// Sentry scope so whichever abort happens carries that shape with it.

const MAX_HISTORY = 24;
const INITIAL_STRIDE_MINUTES = 5;
const BYTES_PER_MB = 1024 * 1024;

export type HeapSample = {
	minutes: number;
	usedMb: number;
};

export type HeapReading = {
	usedBytes: number;
	uptimeMs: number;
};

export type HeapSeries = {
	latest: HeapSample;
	peakMb: number;
	history: HeapSample[];
	strideMinutes: number;
};

export type HeapTrajectory = {
	used_mb: number;
	limit_mb: number;
	peak_mb: number;
	uptime_minutes: number;
	growth_mb_per_hour: number;
	history: string;
};

/**
 * Folds a reading into the series. The latest value and the peak track every
 * reading; the history keeps at most `MAX_HISTORY` points, halving its
 * resolution and doubling its interval each time it fills. Sessions run for
 * days, so the history has to stay evenly spread over the whole session rather
 * than drop its start — the start is what dates the growth.
 */
export function recordHeapSample(
	series: HeapSeries | null,
	reading: HeapReading,
): HeapSeries {
	const sample: HeapSample = {
		minutes: Math.round(reading.uptimeMs / 60_000),
		usedMb: Math.round(reading.usedBytes / BYTES_PER_MB),
	};

	if (!series) {
		return {
			latest: sample,
			peakMb: sample.usedMb,
			history: [sample],
			strideMinutes: INITIAL_STRIDE_MINUTES,
		};
	}

	const updated: HeapSeries = {
		...series,
		latest: sample,
		peakMb: Math.max(series.peakMb, sample.usedMb),
	};

	const newest = series.history[series.history.length - 1];
	if (newest && sample.minutes - newest.minutes < series.strideMinutes) {
		return updated;
	}

	const history = [...series.history, sample];
	if (history.length <= MAX_HISTORY) return { ...updated, history };

	return {
		...updated,
		history: history.filter((_, index) => index % 2 === 0),
		strideMinutes: series.strideMinutes * 2,
	};
}

/**
 * `history` is the retained series, oldest first, as `usedMb@uptimeMinutes`. It
 * stops one stride short of the crash; `used_mb` at `uptime_minutes` is the
 * live tail.
 */
export function summarizeHeap(
	series: HeapSeries,
	limitBytes: number,
): HeapTrajectory {
	const first = series.history[0] ?? series.latest;
	const elapsedHours = (series.latest.minutes - first.minutes) / 60;

	return {
		used_mb: series.latest.usedMb,
		limit_mb: Math.round(limitBytes / BYTES_PER_MB),
		peak_mb: series.peakMb,
		uptime_minutes: series.latest.minutes,
		growth_mb_per_hour:
			elapsedHours > 0
				? Math.round((series.latest.usedMb - first.usedMb) / elapsedHours)
				: 0,
		history: series.history
			.map((sample) => `${sample.usedMb}@${sample.minutes}`)
			.join(" "),
	};
}

/** Decile bucket, so the tag stays searchable without exploding cardinality. */
export function heapUsedBucket(usedMb: number, limitMb: number): string {
	if (limitMb <= 0) return "unknown";
	const decile = Math.min(9, Math.floor((usedMb / limitMb) * 10));
	return `${decile * 10}-${decile * 10 + 10}%`;
}
