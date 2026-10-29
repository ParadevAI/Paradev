import { TestWorkflowEnvironment } from "@temporalio/testing";

const port = Number(process.env.TEMPORAL_DEV_PORT ?? 7233);
const uiPort = Number(process.env.TEMPORAL_DEV_UI_PORT ?? 8233);

const env = await TestWorkflowEnvironment.createLocal({
	server: { ip: "127.0.0.1", port, ui: true, uiPort },
});
console.log(
	`Temporal dev server on 127.0.0.1:${port}, UI http://127.0.0.1:${uiPort}`,
);

const keepAlive = setInterval(() => {}, 60_000);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		clearInterval(keepAlive);
		void env.teardown().then(() => process.exit(0));
	});
}
