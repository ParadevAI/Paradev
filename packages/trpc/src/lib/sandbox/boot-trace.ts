import * as Sentry from "@sentry/core";
import type { CloudWorkspaceBootPhase } from "@superset/db/schema";
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

/** One phase per stamp, running to the next stamp; the last runs to the answer. */
export function bootPhases({
	stamps,
	answeredAt,
}: HostAnswer): CloudWorkspaceBootPhase[] {
	return stamps.map((stamp, index) => {
		// The answer is on our clock, which can trail the box's a little.
		const end = Math.max(stamp.at, stamps[index + 1]?.at ?? answeredAt);
		return { name: stamp.phase, at: stamp.at, ms: end - stamp.at };
	});
}

/** The box's boot as spans under the active one, at the times the box stamped. */
export function recordBootSpans(phases: CloudWorkspaceBootPhase[]): void {
	const first = phases[0];
	const last = phases.at(-1);
	if (!first || !last) return;
	const boot = Sentry.startInactiveSpan({
		name: "box boot",
		op: "sandbox.boot",
		startTime: first.at,
	});
	phases.forEach((phase, index) => {
		Sentry.startInactiveSpan({
			name: `${phase.name} → ${phases[index + 1]?.name ?? "host answered"}`,
			op: "sandbox.boot",
			startTime: phase.at,
			parentSpan: boot,
		}).end(phase.at + phase.ms);
	});
	boot.end(last.at + last.ms);
}
