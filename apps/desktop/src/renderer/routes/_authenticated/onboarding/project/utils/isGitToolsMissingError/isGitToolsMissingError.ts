// Apple's /usr/bin/git stub prints one of these instead of running git when
// no developer tools are installed.
const APPLE_GIT_STUB_PATTERN =
	/^xcode-select: (?:.*no developer tools were found|Failed to locate 'git')/im;
// host-service's GIT_TOOLS_MISSING_MESSAGE for the same refusal.
const HOST_GIT_TOOLS_MISSING_PATTERN =
	/Command Line Tools aren't installed on this Mac/;

export function isGitToolsMissingError(rawMessage: string): boolean {
	return (
		APPLE_GIT_STUB_PATTERN.test(rawMessage) ||
		HOST_GIT_TOOLS_MISSING_PATTERN.test(rawMessage)
	);
}
