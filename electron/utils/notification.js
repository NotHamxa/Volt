import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

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

    notifWin.loadFile(path.join(__dirname, '../assets/notification.html'))

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

    notifWin.webContents.send('notify', { title, message, icon, isReset: notifWin.isVisible(), duration })
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