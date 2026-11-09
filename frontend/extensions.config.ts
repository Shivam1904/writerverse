// Which extension the build plugs in (docs/system/code-layout.md, "Extensions").
// The app imports `@writerverse/extensions`; this file decides which module that is.
//
//   (unset) or none             -> src/extensions/none.ts (no extension)
//   WRITERVERSE_EXTENSIONS=path -> that module (relative to frontend/, or absolute)
//
// `@wv/...` points at src/, so extension code outside this tree can import the core.
// Used by vite.config.ts and vitest.config.ts, so the build and the tests agree.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(here, 'src')

export function extensionsEntry(value = process.env.WRITERVERSE_EXTENSIONS): string {
  if (!value || value === 'none') return path.join(src, 'extensions/none.ts')
  return path.resolve(here, value)
}

export const extensionAliases = [
  { find: /^@writerverse\/extensions$/, replacement: extensionsEntry() },
  { find: /^@wv\//, replacement: `${src}/` },
]
