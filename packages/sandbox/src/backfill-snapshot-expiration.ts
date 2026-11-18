/**
 * Sets `snapshotExpiration: 0` on workspace boxes made before new boxes got
 * it, so Vercel stops expiring their snapshots and the retention reaper
 * decides instead. It changes the default for snapshots taken from then on:
 * a box's current snapshot keeps the expiry it was taken with, so a box only
 * stops expiring after its next stop. Wakes nothing. Dry run by default.
 *
 *   bun run backfill-snapshot-expiration            lists what it would change
 *   bun run backfill-snapshot-expiration --apply    changes them, 2 a second
 *
 * Needs VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID.
 */
import { Sandbox } from "@vercel/sandbox";
import { missingCredentials } from "./inventory";

export interface BackfillBox {
	name: string;
	snapshotExpiration: number | undefined;
}

export interface BackfillHost {
	listWorkspaceBoxes(): Promise<BackfillBox[]>;
	neverExpire(name: string): Promise<void>;
	sleep(ms: number): Promise<void>;
}

export async function backfillSnapshotExpiration(args: {
	host: BackfillHost;
	apply: boolean;
	perSecond: number;
	log: (line: string) => void;
}): Promise<{
	listed: number;
	pending: number;
	updated: number;
	failed: number;
}> {
	const boxes = await args.host.listWorkspaceBoxes();
	const pending = boxes.filter((box) => box.snapshotExpiration !== 0);
	args.log(`${boxes.length} workspace boxes, ${pending.length} still expire`);
	let updated = 0;
	let failed = 0;
	if (!args.apply) {
		for (const box of pending) {
			args.log(
				`would set ${box.name} (now ${box.snapshotExpiration ?? "default"})`,
			);
		}
		if (pending.length) args.log("dry run: pass --apply to change them");
		return { listed: boxes.length, pending: pending.length, updated, failed };
	}
	for (const [index, box] of pending.entries()) {
		if (index > 0) await args.host.sleep(1000 / args.perSecond);
		try {
			await args.host.neverExpire(box.name);
			updated++;
		} catch (error) {
			failed++;
			args.log(`::warning::could not update ${box.name}: ${error}`);
		}
	}
	args.log(`updated ${updated}, failed ${failed}`);
	return { listed: boxes.length, pending: pending.length, updated, failed };
}

if (import.meta.main) {
	const missing = missingCredentials(process.env);
	if (missing.length > 0) {
		console.error(
			`backfill needs real Vercel sandbox credentials; missing or placeholder: ${missing.join(", ")}`,
		);
		process.exit(64);
	}
	const credentials = {
		token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
		teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
		projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
	};
	const { failed } = await backfillSnapshotExpiration({
		host: {
			async listWorkspaceBoxes() {
				const boxes: BackfillBox[] = [];
				for await (const box of await Sandbox.list({
					...credentials,
					tags: { kind: "workspace" },
				})) {
					boxes.push({
						name: box.name,
						snapshotExpiration: box.snapshotExpiration,
					});
				}
				return boxes;
			},
			async neverExpire(name) {
				const box = await Sandbox.get({ ...credentials, name, resume: false });
				await box.update({ snapshotExpiration: 0 });
			},
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		},
		apply: process.argv.includes("--apply"),
		perSecond: 2,
		log: console.log,
	});
	process.exit(failed ? 1 : 0);
}
