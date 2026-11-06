import {
	decodeUsageCard,
	renderUsageCardSvg,
} from "@superset/shared/usage-card";
import { ImageResponse } from "next/og";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const card = decodeUsageCard(url.searchParams.get("card"));
	if (!card) return new Response("Invalid usage card", { status: 400 });
	return new ImageResponse(
		// biome-ignore lint/performance/noImgElement: ImageResponse requires an image primitive.
		<img
			src={`data:image/svg+xml;base64,${Buffer.from(renderUsageCardSvg(card)).toString("base64")}`}
			width={1200}
			height={900}
			alt=""
		/>,
		{
			width: 1200,
			height: 900,
			headers: {
				"Cache-Control": "public, max-age=3600",
				"X-Robots-Tag": "noindex",
				...(url.searchParams.get("download") === "1"
					? {
							"Content-Disposition":
								'attachment; filename="paradev-wrapped.png"',
						}
					: {}),
			},
		},
	);
}
