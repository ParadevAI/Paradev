import type { PostHog } from "posthog-js";

import { canTrack } from "./consent";

type PosthogCallback = (posthog: PostHog) => void;
type Properties = Record<string, unknown>;
type AnonymousPosthog = Pick<PostHog, "capture" | "captureException">;
type Target = { posthog: PostHog } | { anonymous: AnonymousPosthog };

const PERSONAL_KEYS = new Set([
	"email",
	"name",
	"first_name",
	"last_name",
	"full_name",
	"phone",
	"company",
	"message",
	"distinct_id",
	"user_id",
	"$set",
	"$set_once",
	"$unset",
	"$groups",
	"$anon_distinct_id",
	"$device_id",
	"$session_id",
	"$ip",
]);
const EMAIL_PATTERN = /\S+@\S+\.\S+/;
const MAX_QUEUED = 100;

/** Keeps primitive values only, without personal keys or anything that looks like an email. */
export function anonymousProperties(properties?: Properties): Properties {
	const kept: Properties = {};
	for (const [key, value] of Object.entries(properties ?? {})) {
		if (PERSONAL_KEYS.has(key.toLowerCase())) continue;
		if (typeof value === "string" && !EMAIL_PATTERN.test(value)) {
			kept[key] = value;
		} else if (typeof value === "number" || typeof value === "boolean") {
			kept[key] = value;
		}
	}
	return kept;
}

/** Queues calls until posthog-js loads. Without consent only the capture calls reach PostHog, with anonymousProperties(). */
export function createPosthogQueue() {
	let target: Target | null = null;
	const queue: ((target: Target) => void)[] = [];

	function run(entry: (target: Target) => void) {
		if (target) entry(target);
		else if (queue.length < MAX_QUEUED) queue.push(entry);
	}

	function flush(next: Target) {
		target = next;
		for (const entry of queue.splice(0)) entry(next);
	}

	return {
		withPosthog(callback: PosthogCallback): void {
			if (!target && !canTrack()) return;
			run((current) => {
				if ("posthog" in current) callback(current.posthog);
			});
		},
		capture(event: string, properties?: Properties): void {
			run((current) => {
				if ("posthog" in current) current.posthog.capture(event, properties);
				else current.anonymous.capture(event, anonymousProperties(properties));
			});
		},
		captureException(error: unknown, properties?: Properties): void {
			run((current) => {
				if ("posthog" in current)
					current.posthog.captureException(error, properties);
				else
					current.anonymous.captureException(
						error,
						anonymousProperties(properties),
					);
			});
		},
		/** Sends only on the cookieless instance, for data the full instance collects itself. */
		captureCookieless(event: string, properties?: Properties): void {
			run((current) => {
				if ("anonymous" in current)
					current.anonymous.capture(event, anonymousProperties(properties));
			});
		},
		setPosthogInstance(posthog: PostHog): void {
			flush({ posthog });
		},
		setAnonymousPosthog(anonymous: AnonymousPosthog): void {
			flush({ anonymous });
		},
	};
}

export const {
	withPosthog,
	capture,
	captureException,
	captureCookieless,
	setPosthogInstance,
	setAnonymousPosthog,
} = createPosthogQueue();
