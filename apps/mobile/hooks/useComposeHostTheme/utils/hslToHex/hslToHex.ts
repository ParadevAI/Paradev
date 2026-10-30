/** `hsl(H S% L%)` from `THEME` as the `#RRGGBB` a Compose host takes. */
export function hslToHex(hsl: string): `#${string}` {
	const match = hsl.match(/^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/);
	if (!match) throw new Error(`Not an hsl() color: ${hsl}`);
	const [h, s, l] = match.slice(1).map(Number) as [number, number, number];
	const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
	const channel = (n: number) => {
		const k = (n + h / 30) % 12;
		const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(value * 255)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
}
