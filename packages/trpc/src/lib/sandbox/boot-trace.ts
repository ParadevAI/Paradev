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
