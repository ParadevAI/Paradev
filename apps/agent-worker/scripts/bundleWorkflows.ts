import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundleWorkflowCode } from "@temporalio/worker";

const { code } = await bundleWorkflowCode({
	workflowsPath: fileURLToPath(
		new URL("../src/workflows/index.ts", import.meta.url),
	),
});
mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/workflow-bundle.js", import.meta.url), code);
