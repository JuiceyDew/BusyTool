import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './db'
import { databaseFile, resolveDataDir } from './dataDir'
import { registerIpc } from './ipc'

app.setName('BusyTool')

let mainWindow: BrowserWindow | null = null
let db: DatabaseSync | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    const dataDir = resolveDataDir()
    const file = databaseFile(dataDir)
    db = openDatabase(file)

    registerIpc(db, {
      getWindow: () => mainWindow,
      dataPath: file,
      dataDir
    })

    mainWindow = createWindow()
    const window = mainWindow
    window.on('closed', () => {
      mainWindow = null
    })

    if (process.env.BUSYTOOL_SMOKE) {
      const { runSmoke } = await import('./smoke')
      await runSmoke({ db, win: window, dataDir })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  db?.close()
  db = null
  if (process.platform !== 'darwin') app.quit()
})

function createWindow(): BrowserWindow {
  const iconPath = join(__dirname, '../../build/icon.png')
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#fafafa',
    title: 'BusyTool',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
