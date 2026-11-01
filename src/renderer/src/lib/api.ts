import type { Channel, IpcMap } from '@shared/ipc'

/** Strip Electron's "Error invoking remote method 'x': Error: " wrapper. */
function cleanMessage(raw: string): string {
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim()
}

export async function call<K extends Channel>(
  channel: K,
  payload: IpcMap[K]['req']
): Promise<IpcMap[K]['res']> {
  try {
    return await window.api.invoke(channel, payload)
  } catch (err) {
    const message = err instanceof Error ? cleanMessage(err.message) : String(err)
    throw new Error(message || 'Something went wrong.')
  }
}
