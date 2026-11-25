/** The longest an environment build may run, from its start to its new golden. */
export const BUILD_LIMIT_MINUTES = 10;

/**
 * Build failures the API stores as these fixed English sentences. Clients show
 * them translated, and any other build error (command output) as it is.
 */
export const BUILD_ERRORS = {
	stoppedUnexpectedly: "The build stopped unexpectedly",
	timeLimit: `The build ran for more than ${BUILD_LIMIT_MINUTES} minutes and was stopped`,
	environmentChanged:
		"The environment changed during the build; its current snapshot was kept",
	notRunning: "The build is no longer running",
} as const;
