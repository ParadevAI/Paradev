import * as Sentry from "@sentry/core";
import { z } from "zod";

/** A phase of the box's boot: `at` is epoch ms on the box's own clock. */
export interface BootStamp {
	phase: string;
	at: number;
}

/** What host-service said the first time it answered: the current boot's stamps so far. */
export interface HostAnswer {
	stamps: BootStamp[];
	answeredAt: number;
}

const healthCheckBody = z.object({
	result: z.object({
		data: z.object({
			json: z.object({
				sandboxBoot: z.object({
					stamps: z.array(z.object({ phase: z.string(), at: z.number() })),
				}),
			}),
		}),
	}),
});

/** A host-service too old to report its boot answers with no stamps. */
export function bootStampsFrom(body: unknown): BootStamp[] {
	const parsed = healthCheckBody.safeParse(body);
	return parsed.success ? parsed.data.result.data.json.sandboxBoot.stamps : [];
}

/** The box's clock and ours can disagree; a boot this far before `since` is still counted. */
const CLOCK_SKEW_MS = 5_000;

/**
 * Whether the answer's boot began at or after `since`. A host-service that
 * outlived a boot command, which then started nothing, answers with an older
 * boot's stamps.
 */
export function bootBeganSince(answer: HostAnswer, since: number): boolean {
	const first = answer.stamps[0];
	return first !== undefined && first.at >= since - CLOCK_SKEW_MS;
}

export interface BootSegment {
	name: string;
	start: number;
	end: number;
}

/** One segment per stamp, running to the next stamp; the last runs to the answer. */
export function bootSegments({
	stamps,
	answeredAt,
}: HostAnswer): BootSegment[] {
	return stamps.map((stamp, index) => {
		const next = stamps[index + 1];
		return {
			name: `${stamp.phase} → ${next?.phase ?? "host answered"}`,
			start: stamp.at,
			// The answer is on our clock, which can trail the box's a little.
			end: Math.max(stamp.at, next?.at ?? answeredAt),
		};
	});
}

/** The box's boot as spans under the active one, at the times the box stamped. */
export function recordBootSpans(answer: HostAnswer): void {
	const segments = bootSegments(answer);
	const first = segments[0];
	const last = segments.at(-1);
	if (!first || !last) return;
	const boot = Sentry.startInactiveSpan({
		name: "box boot",
		op: "sandbox.boot",
		startTime: first.start,
	});
	for (const segment of segments) {
		Sentry.startInactiveSpan({
			name: segment.name,
			op: "sandbox.boot",
			startTime: segment.start,
			parentSpan: boot,
		}).end(segment.end);
	}
	boot.end(last.end);
}

/** One line of the box's boot log: `<epoch ms> <phase> [detail]`. */
interface BootLogLine {
	at: number;
	phase: string;
	detail: string;
}

/**
 * Where the box's latest boot stands, read from its boot log when
 * host-service does not answer and so cannot report it.
 *
 * - `booting`: a boot started and has not yet reached a phase after which
 *   waiting cannot help; host-service is still to come.
 * - `ended`: the latest boot refused, found no runtime, or saw host-service
 *   start (or give up) and the control plane still got no answer.
 * - `stale`: a boot started long ago and never finished; its runner is gone.
 * - `none`: no boot in the log at all.
 */
export interface BootProgress {
	state: "none" | "booting" | "ended" | "stale";
	startedAt?: number;
	last?: BootLogLine;
}

/** After one of these, the boot has nothing left to do that host-service waits on. */
const BOOT_ENDED_PHASES = new Set([
	"boot.refused",
	"host.missing",
	"host.ready",
	"host.timeout",
]);

/**
 * A boot this old with no end phase was cut off (its session stopped under
 * it) rather than slow: a box one bundle behind takes under a minute.
 */
export const BOOT_STALE_MS = 10 * 60 * 1000;

const BOOT_LOG_LINE = /^(\d{10,16}) (\S+)(?: (.*))?$/;

/** The latest boot's lines; everything before its `boot.start` belongs to earlier boots. */
function latestBootLines(log: string): BootLogLine[] {
	let lines: BootLogLine[] = [];
	for (const raw of log.split("\n")) {
		const match = BOOT_LOG_LINE.exec(raw.trimEnd());
		if (!match) continue;
		const line = {
			at: Number(match[1]),
			phase: match[2] ?? "",
			detail: match[3] ?? "",
		};
		if (line.phase === "boot.start") lines = [];
		lines.push(line);
	}
	return lines[0]?.phase === "boot.start" ? lines : [];
}

export function bootProgressFrom(log: string, now: number): BootProgress {
	const lines = latestBootLines(log);
	const first = lines[0];
	const last = lines.at(-1);
	if (!first || !last) return { state: "none" };
	const startedAt = first.at;
	if (lines.some((line) => BOOT_ENDED_PHASES.has(line.phase))) {
		return { state: "ended", startedAt, last };
	}
	if (now - startedAt > BOOT_STALE_MS + CLOCK_SKEW_MS) {
		return { state: "stale", startedAt, last };
	}
	return { state: "booting", startedAt, last };
}

/** One line for an error message: where the boot was and for how long. */
export function describeBootProgress(
	progress: BootProgress | null,
	now: number,
): string {
	if (!progress) return "boot log unreadable";
	if (progress.state === "none" || !progress.last) return "no boot in the log";
	const last = `${progress.last.phase}${progress.last.detail ? ` ${progress.last.detail}` : ""}`;
	const age =
		progress.startedAt === undefined
			? ""
			: `, started ${Math.round((now - progress.startedAt) / 1000)}s ago`;
	return `boot ${progress.state} at "${last.slice(0, 160)}"${age}`;
}
