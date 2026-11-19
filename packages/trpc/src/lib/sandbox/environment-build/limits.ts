/** The longest a build may run, from its start to its new golden. */
export const BUILD_LIMIT_MS = 10 * 60 * 1000;
export const BUILD_POLL_MS = 5_000;
export const BUILD_LIMIT_MESSAGE = `The build ran for more than ${BUILD_LIMIT_MS / 60_000} minutes and was stopped`;

/** Past the build limit, so only a build whose workflow died is stale. */
export const STALE_BUILD_MS = 20 * 60 * 1000;

/** Goldens kept per environment: the active one and the newest ones before it. */
export const KEPT_GOLDENS = 3;

/** Manual builds an environment may start in any rolling hour; daily builds are not counted. */
export const MANUAL_BUILDS_PER_HOUR = 3;
export const MANUAL_BUILD_WINDOW_MS = 60 * 60 * 1000;
