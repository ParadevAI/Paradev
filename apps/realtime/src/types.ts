import type { AgentSessionHub } from "./agent-session-hub";
import type { OrgHub } from "./org-hub";
import type { PageHub } from "./page-hub";
import type { UserHub } from "./user-hub";
import type { WorkspaceHub } from "./workspace-hub";

export interface RealtimeEnv {
	NEXT_PUBLIC_API_URL: string;
	NUDGE_SECRET: string;
	/** Signs agent session tickets: read ones minted by the API, write ones by the agent worker. */
	AGENT_SESSION_SECRET: string;
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN?: string;
	USERCONTENT_URL: string;
	OrgHub: DurableObjectNamespace<OrgHub>;
	PageHub: DurableObjectNamespace<PageHub>;
	WorkspaceHub: DurableObjectNamespace<WorkspaceHub>;
	UserHub: DurableObjectNamespace<UserHub>;
	AgentSessionHub: DurableObjectNamespace<AgentSessionHub>;
	PRIVATE: R2Bucket;
	GUEST_PRESENCE_BY_IP: RateLimit;
	GUEST_PRESENCE_BY_PAGE: RateLimit;
	WORKSPACE_PRESENCE_BY_USER: RateLimit;
}
