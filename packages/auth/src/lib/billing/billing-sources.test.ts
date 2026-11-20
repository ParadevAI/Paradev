import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../../..");
const reviewedProjectionReaders = new Set([
	"packages/auth/src/server.ts",
	"packages/auth/src/lib/load-custom-session-data.ts",
	"packages/auth/src/seed-dev.ts",
	"packages/trpc/src/lib/account-purge/purgeAccount.ts",
	"apps/api/src/app/api/support/lookup/route.ts",
	"apps/api/src/app/api/integrations/stripe/jobs/notify-slack/route.ts",
	"apps/api/src/app/api/integrations/stripe/jobs/cancellation-feedback/route.ts",
]);

test("application billing reads stay behind the auth billing boundary", async () => {
	const violations: string[] = [];
	const files = new Bun.Glob("{apps,packages}/*/src/**/*.{ts,tsx}");
	for await (const file of files.scan({ cwd: root })) {
		if (
			file.includes(".test.") ||
			file.includes(".node-test.") ||
			file.startsWith("packages/db/") ||
			file.startsWith("packages/auth/src/lib/billing/") ||
			reviewedProjectionReaders.has(file)
		)
			continue;
		const source = await Bun.file(resolve(root, file)).text();
		if (
			/import\s*\{[^}]*\bsubscriptions\b[^}]*\}\s*from\s*["']@superset\/db\/schema/.test(
				source,
			) ||
			/query\.subscriptions\b|\b(?:FROM|JOIN)\s+(?:auth\.)?subscriptions\b/.test(
				source,
			)
		)
			violations.push(file);
	}
	expect(violations).toEqual([]);
});
