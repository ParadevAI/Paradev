/** The longest a build may run, from its start to its new golden. */
export const BUILD_LIMIT_MS = 10 * 60 * 1000;
export const BUILD_POLL_MS = 5_000;
export const BUILD_LIMIT_MESSAGE = `The build ran for more than ${BUILD_LIMIT_MS / 60_000} minutes and was stopped`;

/** Past the build limit, so only a build whose workflow died is stale. */
export const STALE_BUILD_MS = 20 * 60 * 1000;

/** Caps on goldens rebuilt from the image because their disk holds agent CLIs. */
export const FRESH_REBUILDS_AT_ONCE = 10;
export const FRESH_REBUILDS_PER_HOUR = 40;
/** How long a daily build waits for a fresh slot before it forks as before. */
export const FRESH_REBUILD_WAIT_MS = 60 * 60 * 1000;
export const FRESH_REBUILD_POLL_MS = 30_000;
