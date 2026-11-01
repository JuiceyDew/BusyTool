import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deterministic data location: BUSYTOOL_DATA_DIR, else <appData>/BusyTool.
 * Also points Electron's own userData there so the whole app state is one folder.
 */
export function resolveDataDir(): string {
  const dir = process.env.BUSYTOOL_DATA_DIR ?? join(app.getPath('appData'), 'BusyTool')
  mkdirSync(dir, { recursive: true })
  app.setPath('userData', dir)
  return dir
}

export function databaseFile(dataDir: string): string {
  return join(dataDir, 'busytool.db')
}
