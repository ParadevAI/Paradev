import type { LinkAction } from "../types";
import type { FolderLinkAction } from "./folderPolicy";

/**
 * File and folder paths in agent output (terminal, chat) open on a plain
 * click, unless the user bound plain click to another action.
 */
export const FILE_LINK_PLAIN_DEFAULT: LinkAction = "pane";
export const FOLDER_LINK_PLAIN_DEFAULT: FolderLinkAction = "reveal";
