export const ACCOUNT_COLORS = [
	"green",
	"blue",
	"violet",
	"pink",
	"orange",
	"teal",
	"red",
	"gold",
] as const;
export type AccountColorPreset = (typeof ACCOUNT_COLORS)[number];
export type AccountColor = AccountColorPreset | `#${string}`;
const PALETTE: Record<AccountColorPreset, [string, string]> = {
	green: ["#15803d", "#4ade80"],
	blue: ["#2563eb", "#60a5fa"],
	violet: ["#7c3aed", "#a78bfa"],
	pink: ["#be185d", "#f472b6"],
	orange: ["#c2410c", "#fb923c"],
	teal: ["#0f766e", "#2dd4bf"],
	red: ["#b91c1c", "#f87171"],
	gold: ["#a16207", "#facc15"],
};
export function isAccountColor(value: unknown): value is AccountColor {
	return (
		typeof value === "string" &&
		(Object.hasOwn(PALETTE, value) ||
			(value.length === 7 && /^#[0-9a-f]{6}$/i.test(value)))
	);
}

export function parseCustomAccountColor(
	text: string,
): `#${string}` | undefined {
	const hex = /^#?([0-9a-f]{6})$/i.exec(text.trim())?.[1];
	return hex ? `#${hex.toLowerCase()}` : undefined;
}

export function accountColor(
	value: string | null | undefined,
	dark: boolean,
): string | undefined {
	if (!isAccountColor(value)) return undefined;
	if (value.startsWith("#")) return value;
	return PALETTE[value as AccountColorPreset][dark ? 1 : 0];
}
