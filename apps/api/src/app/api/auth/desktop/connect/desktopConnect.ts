import { withDomainMove } from "@superset/shared/domain-move";
import { NextResponse } from "next/server";
import { isDesktopProtocol } from "./desktopProtocol";

export async function desktopConnect(
	request: Request,
	options: {
		webUrl: string;
		enabled?: string;
		lookup: Parameters<typeof withDomainMove>[0]["lookup"];
		signInSocial: (input: {
			body: {
				provider: "google" | "github";
				callbackURL: string;
				errorCallbackURL: string;
			};
			asResponse: true;
		}) => Promise<Response>;
	},
) {
	const url = new URL(request.url);
	const provider = url.searchParams.get("provider");
	const state = url.searchParams.get("state");
	const protocol = url.searchParams.get("protocol");
	const localCallback = url.searchParams.get("local_callback");

	if (!provider || !state) {
		return new Response("Missing provider or state", { status: 400 });
	}

	if (provider !== "google" && provider !== "github") {
		return new Response("Invalid provider", { status: 400 });
	}

	if (protocol && !isDesktopProtocol(protocol)) {
		return new Response("Invalid protocol", { status: 400 });
	}

	const successUrl = new URL(`${options.webUrl}/auth/desktop/success`);
	successUrl.searchParams.set("desktop_state", state);
	if (protocol) {
		successUrl.searchParams.set("desktop_protocol", protocol);
	}
	if (localCallback) {
		try {
			const callbackUrl = new URL(localCallback);
			const isLoopback =
				callbackUrl.protocol === "http:" &&
				(callbackUrl.hostname === "127.0.0.1" ||
					callbackUrl.hostname === "localhost");
			if (isLoopback && callbackUrl.pathname === "/auth/callback") {
				successUrl.searchParams.set(
					"desktop_local_callback",
					callbackUrl.toString(),
				);
			}
		} catch {
			// Ignore invalid callback URLs and continue with deep-link flow.
		}
	}

	return withDomainMove({
		request,
		enabled: options.enabled,
		surface: "desktop",
		lookup: options.lookup,
		fallback: async () => {
			const result = await options.signInSocial({
				body: {
					provider,
					callbackURL: successUrl.toString(),
					errorCallbackURL: `${options.webUrl}/auth/desktop/success`,
				},
				asResponse: true,
			});

			const cookies = result.headers.getSetCookie();
			const body = (await result.json()) as {
				url?: string;
				redirect?: boolean;
			};

			if (!body.url) {
				return new Response(
					`Failed to initiate OAuth: ${JSON.stringify(body)}`,
					{
						status: 500,
					},
				);
			}

			const response = NextResponse.redirect(body.url);
			for (const cookie of cookies) {
				response.headers.append("set-cookie", cookie);
			}

			return response;
		},
	});
}
