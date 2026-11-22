import { deleteSandbox } from "../vercel";
import { isProductionDeployment } from "./deployment";
import { goldensToDelete } from "./policy";
import { markGoldenDeleted, undeletedGoldens } from "./store";

/** Deletes the goldens the environment no longer keeps for restore. */
export async function pruneGoldens(
	environment: { id: string; sourceRef: string },
	label: string,
): Promise<void> {
	if (!isProductionDeployment()) {
		console.log(
			`[environment-build] ${label}: not a production deployment, so no old golden is deleted`,
		);
		return;
	}
	const stale = goldensToDelete(
		await undeletedGoldens(environment.id),
		environment.sourceRef,
	);
	for (const golden of stale) {
		try {
			await deleteSandbox(golden.goldenRef);
			await markGoldenDeleted(golden.id);
		} catch (error) {
			console.error(
				`[environment-build] could not delete old golden ${golden.goldenRef} of ${environment.id}`,
				error,
			);
		}
	}
}
