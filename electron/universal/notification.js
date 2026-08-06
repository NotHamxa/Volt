import { BrowserWindow, screen, nativeTheme } from 'electron'
import Store from 'electron-store'
import path from 'path'
import { fileURLToPath } from 'url'

const store = new Store()

/**
 * The toast is a separate window with its own stylesheet, so it has to be
 * told which theme to draw. Mirrors src/theme.tsx: an explicit choice wins,
 * "system" follows the OS, and an unset preference means dark.
 */
function resolvedTheme() {
    const choice = store.get('theme')
    if (choice === 'light' || choice === 'dark') return choice
    if (choice === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    return 'dark'
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let notifWin = null
let hideTimer = null

const NOTIFICATION_DURATION = 3500
const WINDOW_WIDTH = 380
const WINDOW_HEIGHT = 72

export function createNotificationWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    notifWin = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        x: Math.round((width - WINDOW_WIDTH) / 2),
        y: height - WINDOW_HEIGHT - 32,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: false,
        hasShadow: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'notificationPreload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    notifWin.loadFile(path.join(__dirname, '../Assets/notification.html'))

    notifWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    notifWin.setAlwaysOnTop(true, 'screen-saver')

    screen.on('display-metrics-changed', repositionWindow)
    screen.on('display-added', repositionWindow)
    screen.on('display-removed', repositionWindow)
}

function repositionWindow() {
    if (!notifWin || notifWin.isDestroyed()) return
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    notifWin.setPosition(
        Math.round((width - WINDOW_WIDTH) / 2),
        height - WINDOW_HEIGHT - 32
    )
}

export function showNotification({ title, message = '', icon = '✦', duration = NOTIFICATION_DURATION }) {
    if (!notifWin || notifWin.isDestroyed()) {
        createNotificationWindow()
        notifWin.webContents.once('did-finish-load', () => {
            _sendNotification({ title, message, icon, duration })
        })
        return
    }

    _sendNotification({ title, message, icon, duration })
}

function _sendNotification({ title, message, icon, duration }) {
    if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
    }

    notifWin.webContents.send('notify', {
        title, message, icon, duration,
        isReset: notifWin.isVisible(),
        theme: resolvedTheme(),
    })
    notifWin.showInactive()

    hideTimer = setTimeout(() => {
        if (!notifWin || notifWin.isDestroyed()) return
        notifWin.webContents.send('notify-hide')

        setTimeout(() => {
            if (!notifWin || notifWin.isDestroyed()) return
            notifWin.hide()
        }, 400)

        hideTimer = null
    }, duration)
}

export function destroyNotificationWindow() {
    if (hideTimer) clearTimeout(hideTimer)
    if (notifWin && !notifWin.isDestroyed()) notifWin.destroy()
    notifWin = null
}