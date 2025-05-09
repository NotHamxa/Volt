import extractIcon from 'extract-file-icon';

export async function getFileIconBase64(filePath, size = 64) {
    try {
        const iconBuffer = extractIcon(filePath, size);
        if (!iconBuffer) throw new Error("No icon found for file");

        const base64 = iconBuffer.toString("base64");
        return `data:image/png;base64,${base64}`;
    } catch (err) {
        throw new Error(`Failed to extract icon: ${err.message}`);
    }
}


