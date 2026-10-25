import { describe, expect, test } from "bun:test";
import { NextRequest, NextResponse } from "next/server";
import {
	BOOTSTRAP_DISTINCT_ID_COOKIE,
	HEADLINE_VARIANT_COOKIE,
	type HeadlineVariant,
	POSTHOG_PERSISTENCE_COOKIE,
} from "./hero-headline";
import { assignHeadlineVariant } from "./hero-headline-assignment";

const MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function assign({
	url = "https://superset.sh/",
	userAgent = MAC,
	cookies = {} as Record<string, string>,
	isProductionHost = true,
	flags = { "known-visitor": "army" } as Record<string, HeadlineVariant>,
	ready = true,
} = {}) {
	const request = new NextRequest(url, {
		headers: {
			"user-agent": userAgent,
			cookie: Object.entries(cookies)
				.map(([name, value]) => `${name}=${value}`)
				.join("; "),
		},
	});
	const response = NextResponse.next();
	const evaluated: string[] = [];
	await assignHeadlineVariant(request, response, {
		isProductionHost,
		evaluate: async (distinctId) => {
			evaluated.push(distinctId);
			return ready ? (flags[distinctId] ?? "ide") : undefined;
		},
	});
	return {
		evaluated,
		cleared: response.headers.get("set-cookie")?.includes("Max-Age=0") ?? false,
		variant: response.cookies.get(HEADLINE_VARIANT_COOKIE)?.value,
		bootstrapId: response.cookies.get(BOOTSTRAP_DISTINCT_ID_COOKIE)?.value,
	};
}

const posthogCookie = (distinctId: string) =>
	encodeURIComponent(JSON.stringify({ distinct_id: distinctId }));

describe("hero headline assignment", () => {
	test("evaluates the flag for the visitor PostHog already knows", async () => {
		expect(
			await assign({
				cookies: {
					[POSTHOG_PERSISTENCE_COOKIE]: posthogCookie("known-visitor"),
				},
			}),
		).toMatchObject({
			evaluated: ["known-visitor"],
			variant: "army",
			bootstrapId: undefined,
		});
	});

	test("reads a PostHog cookie whose values hold encoded characters", async () => {
		const cookie = encodeURIComponent(
			JSON.stringify({
				distinct_id: "known-visitor",
				$initial_current_url: "https://superset.sh/?q=%22agents%22",
			}),
		);
		expect(
			(await assign({ cookies: { [POSTHOG_PERSISTENCE_COOKIE]: cookie } }))
				.evaluated,
		).toEqual(["known-visitor"]);
	});

	test("a new visitor keeps one id across visits for PostHog to adopt", async () => {
		const first = await assign();
		expect(first.bootstrapId).toBeString();
		expect(first.evaluated).toEqual([first.bootstrapId ?? ""]);
		const again = await assign({
			cookies: { [BOOTSTRAP_DISTINCT_ID_COOKIE]: first.bootstrapId ?? "" },
		});
		expect(again.evaluated).toEqual(first.evaluated);
	});

	test("without flag definitions yet, new visitors are not enrolled and enrolled ones keep their arm", async () => {
		expect(await assign({ ready: false })).toMatchObject({
			variant: undefined,
			bootstrapId: undefined,
		});
		expect(
			await assign({
				ready: false,
				cookies: {
					[POSTHOG_PERSISTENCE_COOKIE]: posthogCookie("known-visitor"),
					[HEADLINE_VARIANT_COOKIE]: "army",
				},
			}),
		).toMatchObject({ cleared: false, variant: undefined });
	});

	test("visitors off Mac or off the production host are not enrolled", async () => {
		const windows = await assign({ userAgent: WINDOWS });
		expect(windows).toMatchObject({ evaluated: [], variant: undefined });
		expect((await assign({ isProductionHost: false })).variant).toBeUndefined();
		expect(
			(
				await assign({
					url: "http://localhost:3002/?hero-headline-preview=army",
					isProductionHost: false,
				})
			).variant,
		).toBe("army");
	});
});
