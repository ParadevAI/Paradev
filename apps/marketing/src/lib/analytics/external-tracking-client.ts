export const EXTERNAL_TRACKING_ID = "tk_7cd75fb5e34042539263f0d7e1a98b57";
export const EXTERNAL_TRACKING_ENDPOINT =
	"https://backend.leadconnectorhq.com/external-tracking/events";

export type ExternalTrackingForm =
	| "contact"
	| "enterprise"
	| "windows-linux-waitlist"
	| "ios-waitlist"
	| "android-waitlist";

export interface TrackingPage {
	url: string;
	path: string;
	title: string;
	referrer: string;
	userAgent: string;
}

export interface ExternalTrackingContext {
	sessionId: string;
	contactId?: string;
	userId?: string;
	deviceType?: "desktop" | "mobile" | "tablet";
}

type TrackingEvent = TrackingPage & {
	type: string;
	timestamp: number;
	properties?: Record<string, unknown>;
	[key: string]: unknown;
};

const IDLE_MS = 30 * 60 * 1000;

export function createExternalTrackingClient({
	transport,
	hasDeclined,
	readPage,
	now = Date.now,
	isVisible,
}: {
	transport: (event: TrackingEvent) => Promise<unknown>;
	hasDeclined: () => boolean;
	readPage: () => TrackingPage;
	now?: () => number;
	isVisible: () => boolean;
}) {
	let context: ExternalTrackingContext | undefined;
	let page: TrackingPage | undefined;
	let startedAt = 0;
	let accountedAt = 0;
	let lastActivityAt = 0;
	let activeTimeMs = 0;
	let visible = false;
	let flushed = false;
	const pendingForms: TrackingEvent[] = [];

	function send(event: TrackingEvent) {
		if (hasDeclined() || !context) return;
		void Promise.resolve()
			.then(() => {
				if (hasDeclined()) return;
				return transport({
					...event,
					trackingId: EXTERNAL_TRACKING_ID,
					sessionId: context?.sessionId,
					contactId: context?.contactId,
					userId: context?.userId,
					properties: {
						...event.properties,
						sessionId: context?.sessionId,
						deviceType: context?.deviceType,
					},
				});
			})
			.catch((error) =>
				console.warn("Could not send external tracking event", error),
			);
	}

	function account() {
		const time = now();
		if (visible && !flushed) {
			activeTimeMs += Math.max(
				0,
				Math.min(time, lastActivityAt + IDLE_MS) - accountedAt,
			);
		}
		accountedAt = time;
	}

	function flush() {
		if (!page || flushed) return;
		account();
		flushed = true;
		send({
			...page,
			type: "external_page_time_spent",
			timestamp: now(),
			properties: {
				sessionStart: startedAt,
				sessionEnd: now(),
				timeSpentMs: Math.round(activeTimeMs),
			},
		});
	}

	function navigate() {
		if (!context) return;
		const next = readPage();
		if (page?.url === next.url && !flushed) return;
		const referrer = page?.url ?? next.referrer;
		flush();
		page = { ...next, referrer };
		startedAt = accountedAt = lastActivityAt = now();
		activeTimeMs = 0;
		visible = isVisible();
		flushed = false;
		send({ ...page, type: "external_script_page_view", timestamp: now() });
	}

	return {
		initialize(identity: ExternalTrackingContext) {
			if (context || hasDeclined()) return;
			context = {
				sessionId: identity.sessionId,
				contactId: identity.contactId,
				userId: identity.userId,
				deviceType: identity.deviceType,
			};
			navigate();
			for (const event of pendingForms.splice(0)) send(event);
		},
		navigate,
		flush,
		activity() {
			account();
			lastActivityAt = now();
		},
		visibilityChanged() {
			account();
			visible = isVisible();
			if (visible) lastActivityAt = now();
		},
		submit(formId: ExternalTrackingForm, email: string) {
			if (hasDeclined()) return;
			const event: TrackingEvent = {
				...readPage(),
				type: "external_form_submission",
				timestamp: now(),
				formId,
				formData: { email },
				formLabels: { email: "Email" },
				formFieldMetadata: [
					{
						formField: "email",
						label: "Email",
						inputType: "email",
						required: true,
					},
				],
			};
			if (context) send(event);
			else if (pendingForms.length < 20) pendingForms.push(event);
		},
	};
}
