const NAMES = [
	"Pixel",
	"Patch",
	"Ticket",
	"Lint",
	"Merge",
	"Grep",
	"Diff",
	"Cron",
	"Stash",
	"Bisect",
	"Rebase",
	"Fixture",
];

export function randomDevName(random: () => number = Math.random): string {
	return NAMES[Math.floor(random() * NAMES.length)] ?? "Pixel";
}
