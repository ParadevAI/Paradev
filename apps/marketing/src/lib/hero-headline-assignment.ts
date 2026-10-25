import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
	BOOTSTRAP_DISTINCT_ID_COOKIE,
	HEADLINE_VARIANT_COOKIE,
	HEADLINE_VARIANT_PREVIEW_PARAM,
	type HeadlineVariant,
	isHeadlineVariant,
	POSTHOG_PERSISTENCE_COOKIE,
} from "./hero-headline";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type EvaluateVariant = (
	distinctId: string,
) => Promise<HeadlineVariant | null | undefined>;

function isMacDesktop(userAgent: string): boolean {
	return (
		/macintosh|mac os x/i.test(userAgent) &&
		!/android|iphone|ipad|ipod|mobile|tablet/i.test(userAgent)
	);
}

function posthogDistinctId(request: NextRequest): string | null {
	const raw = request.cookies.get(POSTHOG_PERSISTENCE_COOKIE)?.value;
	if (!raw) return null;
	try {
		const { distinct_id } = JSON.parse(raw);
		return typeof distinct_id === "string" && distinct_id ? distinct_id : null;
	} catch {
		return null;
	}
}

async function chooseVariant(
	request: NextRequest,
	response: NextResponse,
	isProductionHost: boolean,
	evaluate: EvaluateVariant,
): Promise<HeadlineVariant | null | undefined> {
	if (!isProductionHost) {
		const preview = request.nextUrl.searchParams.get(
			HEADLINE_VARIANT_PREVIEW_PARAM,
		);
		return isHeadlineVariant(preview) ? preview : null;
	}
	if (!isMacDesktop(request.headers.get("user-agent") ?? "")) return null;

	const known = posthogDistinctId(request);
	if (known) {
		if (request.cookies.has(BOOTSTRAP_DISTINCT_ID_COOKIE)) {
			response.cookies.delete(BOOTSTRAP_DISTINCT_ID_COOKIE);
		}
		return evaluate(known);
	}
	const distinctId =
		request.cookies.get(BOOTSTRAP_DISTINCT_ID_COOKIE)?.value || randomUUID();
	const variant = await evaluate(distinctId);
	if (variant) {
		response.cookies.set(BOOTSTRAP_DISTINCT_ID_COOKIE, distinctId, {
			path: "/",
			maxAge: ONE_YEAR_SECONDS,
			sameSite: "lax",
			secure: true,
		});
	}
	return variant;
}

/** Visitors left out see control and are not enrolled. */
export async function assignHeadlineVariant(
	request: NextRequest,
	response: NextResponse,
	{
		isProductionHost,
		evaluate,
	}: { isProductionHost: boolean; evaluate: EvaluateVariant },
): Promise<void> {
	const variant = await chooseVariant(
		request,
		response,
		isProductionHost,
		evaluate,
	);
	if (variant === undefined) return;
	if (!variant) {
		if (request.cookies.has(HEADLINE_VARIANT_COOKIE)) {
			response.cookies.delete(HEADLINE_VARIANT_COOKIE);
		}
		return;
	}
	response.cookies.set(HEADLINE_VARIANT_COOKIE, variant, {
		path: "/",
		maxAge: ONE_YEAR_SECONDS,
		sameSite: "lax",
		secure: isProductionHost,
	});
}
