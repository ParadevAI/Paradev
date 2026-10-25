import { expect, mock, test } from "bun:test";
import { getBlogPosts } from "@/lib/blog";

mock.module("server-only", () => ({}));
mock.module("@/app/[lang]/utils/leaderboardClient", () => ({
	leaderboardClient: {},
}));
function family(
	key: string,
	seatPrice: number,
	gbMinutesPerSeat: number | null,
	environments: number | null,
) {
	return {
		family: key,
		name: key[0]?.toUpperCase() + key.slice(1),
		displayOrder: seatPrice,
		monthly: { id: key, name: key, interval: "month", seatPrice },
		yearly: null,
		legacy: [],
		gbMinutesPerSeat,
		overagePerGbHour: 0.06,
		pack: gbMinutesPerSeat ? { gbMinutes: 1000, price: 1 } : null,
		environments,
	};
}
mock.module("@/app/[lang]/pricing/utils/fetchPlanCatalog", () => ({
	fetchPlanCatalog: async () => [
		family("pro", 20, null, null),
		family("team", 60, 72000, 5),
		family("ultra", 200, 240000, 10),
	],
}));
const { GET } = await import("./route");

test("blog Markdown preserves publication dates alongside recorded updates", async () => {
	const posts = getBlogPosts();
	const updated = posts.find(
		(post) => post.lastUpdated && post.lastUpdated !== post.date,
	);
	const original = posts.find((post) => !post.lastUpdated);
	if (!updated || !original)
		throw new Error("Expected updated and original blog articles");

	for (const post of [updated, original]) {
		const response = await GET(
			new Request(`https://superset.sh/md/blog/${post.slug}`),
			{
				params: Promise.resolve({ lang: "en", path: ["blog", post.slug] }),
			},
		);
		const body = await response.text();
		expect(response.status).toBe(200);
		expect(body).toContain(`\nDate: ${post.date}\n`);
		expect(body).toContain(`last-updated: ${post.lastUpdated ?? post.date}\n`);
		if (post.lastUpdated) {
			expect(body).toContain(`\nLast updated: ${post.lastUpdated}\n`);
		} else {
			expect(body).not.toContain("\nLast updated:");
		}
	}
});

test("pricing Markdown compares the cloud rows from the catalog", async () => {
	const response = await GET(
		new Request("https://superset.sh/md/page/pricing"),
		{ params: Promise.resolve({ lang: "en", path: ["page", "pricing"] }) },
	);
	const body = await response.text();
	expect(response.status).toBe(200);
	expect(body).toContain("### Cloud workspaces (Beta)\n");
	expect(body).toContain("| | Free | Pro | Team | Ultra | Enterprise |");
	expect(body).toContain(
		"| Cloud GB-hours per seat each month | No | No | 1,200 | 4,000 | Custom |\n| Cloud environments | No | No | 5 | 10 | Custom |\n| GB-hours past the pool | No | No | $0.06 per GB-hour | $0.06 per GB-hour | Custom |\n| Extra GB-hours, bought as needed | No | No | $0.06 per GB-hour | $0.06 per GB-hour | Custom |",
	);
});
