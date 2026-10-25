import type { OrgHub } from "./org-hub";
import type { PageHub } from "./page-hub";
import type { WorkspaceHub } from "./workspace-hub";

export interface RealtimeEnv {
	NEXT_PUBLIC_API_URL: string;
	NUDGE_SECRET: string;
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN?: string;
	USERCONTENT_URL: string;
	OrgHub: DurableObjectNamespace<OrgHub>;
	PageHub: DurableObjectNamespace<PageHub>;
	WorkspaceHub: DurableObjectNamespace<WorkspaceHub>;
	PRIVATE: R2Bucket;
	GUEST_PRESENCE_BY_IP: RateLimit;
	GUEST_PRESENCE_BY_PAGE: RateLimit;
	WORKSPACE_PRESENCE_BY_USER: RateLimit;
}
