export interface Face {
	tile: string;
	shape: string;
	/** Path in a 100 by 100 box. */
	d: string;
	eyes: readonly [x1: number, y1: number, x2: number, y2: number];
}

const circle = (cx: number, cy: number, r: number) =>
	`M${cx - r} ${cy}a${r} ${r} 0 1 1 ${r * 2} 0a${r} ${r} 0 1 1 ${-r * 2} 0Z`;

const polygon = (...points: number[]) => {
	const pairs: string[] = [];
	for (let index = 0; index < points.length; index += 2) {
		pairs.push(`${points[index]} ${points[index + 1]}`);
	}
	return `M${pairs.join("L")}Z`;
};

const PETALS = Array.from({ length: 8 }, (_, index) => {
	const angle = (index * Math.PI) / 4;
	return circle(
		Math.round(50 + 21 * Math.cos(angle)),
		Math.round(50 + 21 * Math.sin(angle)),
		11,
	);
}).join("");

const YELLOW = "#F6CB47";
const SKY = "#7EC8FD";
const GREEN = "#82C776";
const PINK = "#FFA1CB";
const CORAL = "#FF7C61";
const PURPLE = "#6F51D6";
const LAVENDER = "#A597F5";
const BONE = "#EBE6E0";
const FOREST = "#37835F";
const NIGHT = "#17161F";

const BROWN = "#3B2000";
const NAVY = "#03265B";
const PINE = "#002B00";
const PLUM = "#4A0029";
const MAROON = "#520000";
const INDIGO = "#27155C";
const CHARCOAL = "#28231E";
const LILAC_PAPER = "#F2EFFF";
const MINT_PAPER = "#E2F7EC";

export const FACES: readonly Face[] = [
	{ tile: YELLOW, shape: BROWN, d: circle(50, 50, 32), eyes: [40, 50, 62, 44] },
	{
		tile: SKY,
		shape: NAVY,
		d: polygon(50, 12, 88, 50, 50, 88, 12, 50),
		eyes: [41, 60, 59, 60],
	},
	{
		tile: GREEN,
		shape: PINE,
		d: "M50 19H81V50A31 31 0 0 1 50 81H19V50A31 31 0 0 1 50 19Z",
		eyes: [40, 50, 59, 50],
	},
	{
		tile: PINK,
		shape: PLUM,
		d: `${circle(50, 40, 18)}${circle(35, 52, 12)}${circle(65, 52, 12)}M34 52H66A12 12 0 0 1 66 76H34A12 12 0 0 1 34 52Z`,
		eyes: [40, 55, 60, 55],
	},
	{
		tile: CORAL,
		shape: MAROON,
		d: "M50 19A31 31 0 0 1 50 81H19V50A31 31 0 0 1 50 19Z",
		eyes: [46, 54, 67, 48],
	},
	{
		tile: PURPLE,
		shape: LILAC_PAPER,
		d: polygon(18, 18, 82, 18, 82, 50, 50, 82, 18, 50),
		eyes: [41, 37, 59, 37],
	},
	{
		tile: LAVENDER,
		shape: INDIGO,
		d: "M19 20H81V50A31 31 0 0 1 19 50Z",
		eyes: [40, 42, 59, 42],
	},
	{
		tile: BONE,
		shape: CHARCOAL,
		d: "M19 81V50A31 31 0 0 1 81 50V81Z",
		eyes: [40, 64, 59, 58],
	},
	{
		tile: FOREST,
		shape: MINT_PAPER,
		d: "M19 19H50A31 31 0 0 1 50 81H19Z",
		eyes: [40, 50, 59, 50],
	},
	{
		tile: SKY,
		shape: NAVY,
		d: "M25 27H75A8 8 0 0 1 83 35V65A8 8 0 0 1 75 73H25A8 8 0 0 1 17 65V35A8 8 0 0 1 25 27Z",
		eyes: [56, 42, 73, 42],
	},
	{
		tile: FOREST,
		shape: MINT_PAPER,
		d: `${polygon(24, 24, 76, 24, 76, 76, 24, 76)}${polygon(50, 14, 86, 50, 50, 86, 14, 50)}`,
		eyes: [41, 55, 59, 55],
	},
	{
		tile: YELLOW,
		shape: BROWN,
		d: polygon(50, 16, 84, 41, 71, 80, 29, 80, 16, 41),
		eyes: [41, 56, 59, 56],
	},
	{
		tile: CORAL,
		shape: MAROON,
		d: `${circle(36, 52, 20)}${circle(64, 52, 20)}`,
		eyes: [47, 52, 65, 52],
	},
	{
		tile: GREEN,
		shape: PINE,
		d: `${circle(50, 36, 18)}${circle(36, 58, 18)}${circle(64, 58, 18)}`,
		eyes: [41, 58, 59, 58],
	},
	{
		tile: PINK,
		shape: PLUM,
		d: polygon(50, 14, 88, 82, 12, 82),
		eyes: [41, 68, 59, 68],
	},
	{
		tile: NIGHT,
		shape: YELLOW,
		d: `${polygon(37, 18, 63, 18, 63, 82, 37, 82)}${polygon(18, 37, 82, 37, 82, 63, 18, 63)}`,
		eyes: [46, 58, 62, 53],
	},
	{
		tile: LAVENDER,
		shape: INDIGO,
		d: "M19 19H50A31 31 0 0 1 50 81A31 31 0 0 1 19 50Z",
		eyes: [40, 52, 59, 52],
	},
	{
		tile: PURPLE,
		shape: LILAC_PAPER,
		d: `${circle(50, 50, 22)}${PETALS}`,
		eyes: [41, 50, 59, 50],
	},
];
