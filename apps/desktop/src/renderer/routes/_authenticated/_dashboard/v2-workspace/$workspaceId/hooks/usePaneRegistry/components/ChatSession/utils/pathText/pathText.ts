const MAX_PATH_TEXT_LENGTH = 240;
const LOCATION_SUFFIX = /(?::\d+(?::\d+)?|#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)$/;
const FILE_NAME = /^[\w%@+().-]+$/;
const EXTENSIONLESS_FILE_NAME = /^(dockerfile|makefile|gemfile|license)$/i;
const EXTENSION = /^[a-z][a-z0-9+-]{0,11}$/i;
const NON_FILE_SCHEME = /^(?!file:\/\/)[a-z][a-z0-9+.-]*:\/\//i;

export function stripLocation(text: string): string {
	return text.replace(LOCATION_SUFFIX, "");
}

export function pathFileName(text: string): string | null {
	const value = text.trim();
	if (!value || value.length > MAX_PATH_TEXT_LENGTH || /\s/.test(value)) {
		return null;
	}
	const fileName = stripLocation(value).split(/[/\\]/).filter(Boolean).at(-1);
	if (!fileName || !FILE_NAME.test(fileName)) return null;
	if (EXTENSIONLESS_FILE_NAME.test(fileName)) return fileName;
	const dot = fileName.lastIndexOf(".");
	if (dot <= 0) return null;
	return EXTENSION.test(fileName.slice(dot + 1)) ? fileName : null;
}

export function isLocalPathText(text: string): boolean {
	return !NON_FILE_SCHEME.test(text.trim());
}
