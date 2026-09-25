import type * as PdfJs from "pdfjs-dist";

// Loaded the first time a PDF is previewed, never at startup: the library is
// a separate chunk, and parsing runs in its own worker off the UI thread.
// One worker for the whole session: each document is parsed in it and then
// freed, rather than starting (and re-downloading) a worker per preview.
let library: Promise<{ pdfjs: typeof PdfJs; worker: PdfJs.PDFWorker }> | null = null;
function loadPdfJs() {
    return (library ??= Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, workerUrl]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
        return { pdfjs, worker: new pdfjs.PDFWorker() };
    }));
}

const rendered = new Map<string, string | null>();
const RENDER_LIMIT = 30;

/**
 * The first page of a PDF as a PNG data URL, sized to fit `box` (CSS pixels)
 * at the screen's density. Null when the file can't be read or parsed.
 * `version` (the file's modified time) keeps an edited PDF from showing a
 * stale page.
 */
export async function renderPdfFirstPage(path: string, box: { width: number; height: number }, version = 0): Promise<string | null> {
    const key = `${path}|${version}`;
    if (rendered.has(key)) return rendered.get(key)!;

    let result: string | null = null;
    const bytes = await window.file.readPdf(path);
    if (bytes) {
        const { pdfjs, worker } = await loadPdfJs();
        const task = pdfjs.getDocument({ data: bytes, worker });
        const doc = await task.promise.catch(() => null);
        if (doc) {
            try {
                const page = await doc.getPage(1);
                const natural = page.getViewport({ scale: 1 });
                const scale = Math.min(box.width / natural.width, box.height / natural.height) * window.devicePixelRatio;
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement("canvas");
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvas, viewport }).promise;
                result = canvas.toDataURL("image/png");
            } catch {
                result = null;
            }
        }
        // Frees the parsed document; the shared worker stays up for the next one.
        await task.destroy();
    }

    if (rendered.size >= RENDER_LIMIT) rendered.delete(rendered.keys().next().value!);
    rendered.set(key, result);
    return result;
}
