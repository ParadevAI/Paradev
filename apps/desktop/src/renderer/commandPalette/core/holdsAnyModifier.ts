export function holdsAnyModifier(event: KeyboardEvent): boolean {
	return event.metaKey || event.ctrlKey || event.altKey;
}
