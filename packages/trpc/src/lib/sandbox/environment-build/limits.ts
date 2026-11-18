/** The longest a build may run, from its start to its new golden. */
export const BUILD_LIMIT_MS = 30 * 60 * 1000;
export const BUILD_POLL_MS = 5_000;
export const BUILD_LIMIT_MESSAGE = `The build ran for more than ${BUILD_LIMIT_MS / 60_000} minutes and was stopped`;
