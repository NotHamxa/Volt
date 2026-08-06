import { spawn } from 'child_process';

let ps = null;
let psReady = false;
let outputBuffer = '';
let pendingHwndResolve = null;
let lastForeignHwnd = null;
let ownHwnd = null;

export function initWindowFocusTracker() {
    ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoExit', '-Command', '-'], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
    });

    ps.stdout.on('data', (data) => {
        outputBuffer += data.toString();
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop();

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (!psReady) {
                if (trimmed === 'READY') psReady = true;
                continue;
            }

            if (pendingHwndResolve) {
                const hwnd = parseInt(trimmed, 10);
                if (!isNaN(hwnd) && hwnd > 0) {
                    pendingHwndResolve(hwnd);
                    pendingHwndResolve = null;
                }
            }
        }
    });

    ps.on('exit', () => {
        psReady = false;
        ps = null;
    });

    ps.stdin.write(`Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class VoltWin32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
}
"@
Write-Output "READY"
`);
}

// Volt's own hwnd, so a capture that lands a beat too late — after the window
// has already taken the foreground — doesn't record Volt as the app to go back
// to. The query runs in the PowerShell helper, so it's inherently racy against
// our own show().
export function setOwnWindowHandle(hwnd) {
    ownHwnd = hwnd;
}

export function captureForegroundWindow() {
    if (!psReady || !ps) return;
    pendingHwndResolve = (hwnd) => {
        if (hwnd !== ownHwnd) lastForeignHwnd = hwnd;
    };
    ps.stdin.write('[VoltWin32]::GetForegroundWindow()\n');
}

export function restoreForegroundWindow() {
    if (!psReady || !ps || !lastForeignHwnd) return;
    const hwnd = lastForeignHwnd;
    lastForeignHwnd = null;
    ps.stdin.write(`[VoltWin32]::AllowSetForegroundWindow(-1)\n`);
    ps.stdin.write(`[VoltWin32]::SetForegroundWindow([System.IntPtr]::new(${hwnd}))\n`);
}
