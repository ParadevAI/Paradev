import { Client, neonConfig } from "@neondatabase/serverless";

const LOCAL_DATABASE_HOST = "db.localtest.me";

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		// The driver lets `?host=` or a backslash override the URL hostname, so
		// also check the host that the driver itself would connect to.
		return (
			new URL(databaseUrl).hostname === LOCAL_DATABASE_HOST &&
			new Client({ connectionString: databaseUrl }).host === LOCAL_DATABASE_HOST
		);
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	neonConfig.fetchEndpoint = (host, port) => `http://${host}:${port}/sql`;
	neonConfig.wsProxy = (host, port) => `${host}:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
