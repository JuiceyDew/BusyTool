import type { Channel, IpcMap } from '../shared/ipc'

declare global {
  interface Window {
    api: {
      invoke<K extends Channel>(channel: K, payload: IpcMap[K]['req']): Promise<IpcMap[K]['res']>
    }
  }
}

export {}
