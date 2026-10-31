// Apple's /usr/bin/git stub prints one of these instead of running git when
// no developer tools are installed.
const APPLE_GIT_STUB_PATTERN =
	/^xcode-select: (?:.*no developer tools were found|Failed to locate 'git')/im;

export function isGitToolsMissingError(rawMessage: string): boolean {
	return APPLE_GIT_STUB_PATTERN.test(rawMessage);
}
