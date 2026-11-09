import { z } from "zod";
import { BRAND } from "../brand";
import { COMPANY } from "../constants";

export const CARD_STAT_IDS = [
	"prs",
	"tokens",
	"agents",
	"model",
	"streak",
	"tier",
	"cost",
] as const;
const text = z.string().min(1).max(100);
const stat = z
	.object({ id: z.enum(CARD_STAT_IDS), label: text, value: text })
	.strict();
export const usageCardSchema = z
	.object({
		version: z.literal(1),
		period: text,
		stats: z.array(stat).min(1).max(7),
		breakdown: z
			.object({
				label: text,
				columns: z
					.array(
						z
							.object({ id: z.enum(["prs", "tokens", "cost"]), label: text })
							.strict(),
					)
					.min(1)
					.max(3),
				rows: z
					.array(
						z
							.object({ name: text, values: z.array(text).min(1).max(3) })
							.strict(),
					)
					.max(5),
			})
			.strict()
			.optional(),
	})
	.strict()
	.superRefine((card, ctx) => {
		if (
			new Set(card.stats.map((item) => item.id)).size !== card.stats.length ||
			(card.breakdown &&
				(new Set(card.breakdown.columns.map((item) => item.id)).size !==
					card.breakdown.columns.length ||
					card.breakdown.columns.some(
						(column) => !card.stats.some((item) => item.id === column.id),
					) ||
					card.breakdown.rows.some(
						(row) => row.values.length !== card.breakdown?.columns.length,
					)))
		) {
			ctx.addIssue({ code: "custom", message: "Invalid card columns" });
		}
	});
export type UsageCard = z.infer<typeof usageCardSchema>;
export type CardStatId = (typeof CARD_STAT_IDS)[number];

const MAX_CARD_LENGTH = 8000;

export function encodeUsageCard(card: UsageCard): string {
	const bytes = new TextEncoder().encode(
		JSON.stringify(usageCardSchema.parse(card)),
	);
	const encoded = btoa(
		Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
	)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
	if (encoded.length > MAX_CARD_LENGTH) throw new Error("Card too large");
	return encoded;
}

export function decodeUsageCard(
	encoded: string | null | undefined,
): UsageCard | null {
	if (!encoded || encoded.length > MAX_CARD_LENGTH || !/^[\w-]+$/.test(encoded))
		return null;
	try {
		const bytes = Uint8Array.from(
			atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
			(char) => char.charCodeAt(0),
		);
		return usageCardSchema.parse(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
		);
	} catch {
		return null;
	}
}

function escapeXml(value: string): string {
	return value.replace(
		/[<>&"']/g,
		(char) =>
			({
				"<": "&lt;",
				">": "&gt;",
				"&": "&amp;",
				'"': "&quot;",
				"'": "&apos;",
			})[char] ?? char,
	);
}

function svgText(
	value: string,
	x: number,
	y: number,
	size: number,
	fill: string,
	weight = 400,
): string {
	const maxLength = Math.floor(260 / (size * 0.55));
	const display =
		value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
	return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}">${escapeXml(display)}</text>`;
}

export function renderUsageCardSvg(input: UsageCard): string {
	const card = usageCardSchema.parse(input);
	const stats = card.stats
		.map((item, index) => {
			const x = 64 + (index % 4) * 280;
			const y = 270 + Math.floor(index / 4) * 128;
			return (
				svgText(item.label, x, y, 19, "#a8adb9") +
				svgText(
					item.value,
					x,
					y + 53,
					item.id === "model" || item.id === "tier" ? 27 : 44,
					"#f7f8fa",
					600,
				)
			);
		})
		.join("");
	const breakdown = card.breakdown;
	const rows =
		breakdown?.rows
			.map((row, index) => {
				const y = 620 + index * 38;
				return (
					svgText(row.name, 64, y, 21, "#e5e7eb", 500) +
					row.values
						.map((value, col) =>
							svgText(value, 410 + col * 245, y, 21, "#e5e7eb"),
						)
						.join("")
				);
			})
			.join("") ?? "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
	<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#171b2b"/><stop offset="1" stop-color="#090b11"/></linearGradient><radialGradient id="glow"><stop stop-color="#b8fa57" stop-opacity=".15"/><stop offset="1" stop-color="#b8fa57" stop-opacity="0"/></radialGradient></defs>
	<rect width="1200" height="900" rx="28" fill="url(#bg)"/><circle cx="1100" cy="40" r="500" fill="url(#glow)"/>
	<g font-family="Arial, sans-serif"><text x="64" y="86" fill="#c8fc7b" font-size="24" font-weight="700">${escapeXml(BRAND.NAME)} / WRAPPED</text>
	<text x="64" y="164" fill="#ffffff" font-size="54" font-weight="700">${escapeXml(card.period)}</text>
	<path d="M64 212H1136" stroke="#ffffff" stroke-opacity=".12"/>${stats}
	${breakdown ? svgText(breakdown.label, 64, 539, 20, "#c8fc7b", 600) + breakdown.columns.map((col, i) => svgText(col.label, 410 + i * 245, 577, 17, "#a8adb9")).join("") : ""}
	${rows}<path d="M64 839H1136" stroke="#ffffff" stroke-opacity=".12"/><text x="64" y="872" fill="#a8adb9" font-size="18">${escapeXml(new URL(COMPANY.MARKETING_URL).hostname)}</text><text x="970" y="872" fill="#c8fc7b" font-size="18">${escapeXml(BRAND.NAME)}</text></g></svg>`;
}

export function usageCardDataUrl(card: UsageCard): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderUsageCardSvg(card))}`;
}

export function usageCardAlt(card: UsageCard): string {
	return `${BRAND.NAME} Wrapped: ${card.period}. ${card.stats.map((stat) => `${stat.label}: ${stat.value}`).join("; ")}`;
}
