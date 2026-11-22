/**
 * Upload type checks (ADR-0012). The declared MIME type must be on the allow-list AND match the
 * file's leading bytes, so a renamed executable cannot be stored as a "PDF".
 */
import { DOCUMENT_MIME_TYPES } from '@nova/shared';

/** The fields NOVA reads from a multer memory-storage file. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const OOXML = new Set<string>([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const TEXT = new Set<string>(['text/plain', 'text/markdown', 'text/csv']);

const startsWith = (b: Buffer, bytes: number[]) => bytes.every((v, i) => b[i] === v);

/** Browsers often send markdown as octet-stream or text/plain; infer from the extension. */
export function normaliseMime(file: UploadedFile): string {
  const ext = file.originalname.toLowerCase().split('.').pop();
  if (
    ext === 'md' &&
    (file.mimetype === 'application/octet-stream' || file.mimetype === 'text/plain')
  )
    return 'text/markdown';
  if (ext === 'csv' && file.mimetype === 'application/vnd.ms-excel') return 'text/csv';
  return file.mimetype;
}

/** File extensions accepted for each allowed type, so `payroll.bat` cannot pass as text. */
const EXTENSIONS: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'text/plain': ['txt', 'text', 'log'],
  'text/markdown': ['md', 'markdown'],
  'text/csv': ['csv'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

/** Returns a reason the file is rejected, or null when it is acceptable. */
export function rejectReason(file: UploadedFile, mime: string): string | null {
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)) {
    return 'This file type is not allowed. Upload PDF, images, text, CSV or Office documents.';
  }
  const ext = file.originalname.toLowerCase().split('.').pop() ?? '';
  if (!EXTENSIONS[mime]?.includes(ext)) {
    return 'The file name extension does not match its type.';
  }
  const b = file.buffer;
  if (b.length === 0) return 'The file is empty.';
  if (mime === 'application/pdf' && !startsWith(b, [0x25, 0x50, 0x44, 0x46])) return mismatch;
  if (mime === 'image/png' && !startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return mismatch;
  if (mime === 'image/jpeg' && !startsWith(b, [0xff, 0xd8, 0xff])) return mismatch;
  if (
    mime === 'image/webp' &&
    !(
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP'
    )
  )
    return mismatch;
  if (OOXML.has(mime) && !startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return mismatch;
  if (TEXT.has(mime)) {
    if (b.includes(0)) return mismatch;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch {
      return 'Text files must be UTF-8.';
    }
  }
  return null;
}

const mismatch = 'The file contents do not match its type.';

/** A safe display filename: no paths, no control characters, bounded length. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '_').trim();
  return (cleaned || 'file').slice(0, 160);
}
