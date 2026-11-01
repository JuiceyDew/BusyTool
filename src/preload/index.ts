import { contextBridge, ipcRenderer } from 'electron'
import type { Channel, IpcMap } from '../shared/ipc'

const api = {
  invoke<K extends Channel>(channel: K, payload: IpcMap[K]['req']): Promise<IpcMap[K]['res']> {
    return ipcRenderer.invoke(channel, payload)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
