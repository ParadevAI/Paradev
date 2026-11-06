export const DEV_AVATAR_SHAPES = {
	pebble:
		"M50 8C74 8 92 24 92 50C92 76 74 92 50 92C26 92 8 78 8 52C8 26 26 8 50 8Z",
	gumdrop:
		"M50 4C70 4 80 30 80 60C80 86 72 94 50 94C28 94 20 86 20 60C20 30 30 4 50 4Z",
	block:
		"M26 12H74C84 12 88 16 88 26V74C88 84 84 88 74 88H26C16 88 12 84 12 74V26C12 16 16 12 26 12Z",
	bean: "M22 30C30 10 58 6 70 20C78 30 70 40 80 48C96 60 90 88 64 92C40 96 14 86 10 62C8 50 16 40 22 30Z",
	ghost:
		"M50 8C74 8 88 26 88 50V90L78 82L68 90L58 82L50 90L42 82L32 90L22 82L12 90V50C12 26 26 8 50 8Z",
	tri: "M50 10C56 10 60 14 64 22L90 72C96 84 90 90 78 90H22C10 90 4 84 10 72L36 22C40 14 44 10 50 10Z",
	cloud:
		"M28 40C26 24 40 14 52 18C60 8 80 12 82 30C94 34 96 52 88 60C94 74 82 90 66 86C58 94 38 94 30 86C14 88 6 74 12 62C4 54 10 40 28 40Z",
	drop: "M50 6C62 26 88 40 88 64C88 82 72 94 50 94C28 94 12 82 12 64C12 40 38 26 50 6Z",
	flower:
		"M50 10C60 10 64 20 68 24C76 20 88 24 88 36C88 44 82 48 82 52C88 58 90 70 82 78C74 86 64 82 58 82C54 90 46 92 40 88C34 84 34 80 30 80C20 84 10 78 10 66C10 58 16 54 18 50C12 44 10 32 18 26C26 20 34 24 38 22C40 14 44 10 50 10Z",
	mochi:
		"M50 22C78 22 94 34 94 56C94 78 78 88 50 88C22 88 6 78 6 56C6 34 22 22 50 22Z",
} as const;

export type DevAvatarShape = keyof typeof DEV_AVATAR_SHAPES;
export const DEV_AVATAR_SHAPE_NAMES = Object.keys(
	DEV_AVATAR_SHAPES,
) as DevAvatarShape[];

export const DEV_AVATAR_EYES = ["dots", "ovals", "pills", "happy"] as const;
export type DevAvatarEyes = (typeof DEV_AVATAR_EYES)[number];

export const DEV_AVATAR_COLORS = [
	"#c7c9d6",
	"#7aa7ff",
	"#5cc8a8",
	"#f2c14e",
	"#f08a5d",
	"#e8657a",
	"#b98cf2",
	"#8fd06b",
	"#7fd3e8",
	"#e9a3d2",
] as const;

export interface DevAvatar {
	shape: DevAvatarShape;
	eyes: DevAvatarEyes;
	color: string;
}

export function isDevAvatar(value: unknown): value is DevAvatar {
	if (!value || typeof value !== "object") return false;
	const { shape, eyes, color } = value as Record<string, unknown>;
	return (
		typeof shape === "string" &&
		shape in DEV_AVATAR_SHAPES &&
		DEV_AVATAR_EYES.includes(eyes as DevAvatarEyes) &&
		DEV_AVATAR_COLORS.includes(color as (typeof DEV_AVATAR_COLORS)[number])
	);
}

function pick<T>(items: readonly T[], random: () => number): T {
	return items[Math.floor(random() * items.length)] as T;
}

export function randomDevAvatar(random: () => number = Math.random): DevAvatar {
	return {
		shape: pick(DEV_AVATAR_SHAPE_NAMES, random),
		eyes: pick(DEV_AVATAR_EYES, random),
		color: pick(DEV_AVATAR_COLORS, random),
	};
}
