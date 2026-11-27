/**
 * Reads the text out of a resume file in the browser, so the file itself never has to be uploaded to read it.
 * TXT is read directly, PDF with unpdf (pdf.js), DOCX with mammoth. Scanned PDFs and photos contain no text
 * and come back empty: there is no OCR.
 */
export class ExtractError extends Error {}

const MAX_CHARS = 60_000;

/** Collapses the odd spacing that PDF and DOCX extraction leaves behind. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  let text = "";
  try {
    if (name.endsWith(".txt")) {
      text = await file.text();
    } else if (name.endsWith(".pdf")) {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } else if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const out = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = out.value;
    } else {
      throw new ExtractError("Unsupported file type.");
    }
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError("This file could not be opened. It may be damaged or password protected.");
  }
  return tidy(text).slice(0, MAX_CHARS);
}
