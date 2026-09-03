/**
 * Pre-built file readers for the mention resolver.
 * Kept in its own module so it can be imported without dragging in the
 * window/dom-typed electron-api when used from a Node-only context.
 */

import { isElectron } from "./electron-api";
import type { FileReader } from "./mentions";

/** Read a file via the Electron preload bridge. Returns null on the web. */
export const electronFileReader: FileReader = async (path) => {
  if (!isElectron()) return null;
  try {
    const res = await window.api!.fs.readFile(path);
    return { content: res.content, size: res.size };
  } catch {
    return null;
  }
};
