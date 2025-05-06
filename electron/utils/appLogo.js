import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import ws from 'windows-shortcuts';

/**
 * Resolve .lnk to its target if needed
 */
function resolveLnk(filePath) {
    return new Promise((resolve, reject) => {
        ws.query(filePath, (err, options) => {
            if (err || !options?.target) return reject(err || new Error('No target'));
            resolve(options.target);
        });
    });
}

/**
 * Get base64 icon using Electron's app.getFileIcon (works for all file types)
 */
export async function getFileIconBase64(filePath, size = 64) {
    try {
        if (!fs.existsSync(filePath)) return null;

        let resolvedPath = filePath;

        if (path.extname(filePath).toLowerCase() === '.lnk') {
            try {
                resolvedPath = await resolveLnk(filePath);
                if (!fs.existsSync(resolvedPath)) return null;
            } catch (err) {
                console.warn(`Could not resolve .lnk file: ${filePath}`);
                return null;
            }
        }

        const icon = await app.getFileIcon(resolvedPath, { size: 'normal' }); // 'small', 'normal', 'large'
        if (!icon || icon.isEmpty()) return null;

        const resized = icon.resize({ width: size, height: size });
        return resized.toDataURL();
    } catch (err) {
        console.error('Failed to get icon:', err);
        return null;
    }
}
