/**
 * The width Electron's Windows/Linux window-controls overlay takes on the
 * right, from the titlebar-area environment variables. It is 0 on macOS and
 * when the controls sit on the left.
 */
export const WINDOW_CONTROLS_INSET_WIDTH =
	"(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))";
