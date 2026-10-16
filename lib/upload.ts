/**
 * Helpers for media uploads (shared by the client and the API).
 */

import { requireApiSuccess } from "@/lib/api-client";
import { getFileSize } from "@/lib/utils/file";

// Files are sent base64-encoded in a JSON body (about a third larger than the file), and
// hosting platforms cap request bodies (e.g. 6 MB for Netlify functions). Can be adjusted
// with NEXT_PUBLIC_MAX_UPLOAD_MB.
const MAX_UPLOAD_BYTES = (Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 4) * 1024 * 1024;

const getTooLargeMessage = (name: string, size: number) => (
  `"${name}" is ${getFileSize(size)}, uploads are limited to ${getFileSize(MAX_UPLOAD_BYTES)}. Resize or compress it and try again.`
);

// Get an error message if a file is too large to be uploaded.
const getUploadSizeError = (file: { name: string; size: number }) => (
  file.size > MAX_UPLOAD_BYTES ? getTooLargeMessage(file.name, file.size) : null
);

// Get the size (in bytes) of base64-encoded content.
const getBase64Size = (content: string) => {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return Math.floor((content.length * 3) / 4) - padding;
};

// Read the response of an upload, with a readable error when the request was too large
// (the hosting platform may reject it before it reaches the API, without a JSON body).
const readUploadResponse = async <T = any>(response: Response, file: { name: string; size: number }) => {
  if (response.status === 413) {
    throw new Error(
      file.size > MAX_UPLOAD_BYTES
        ? getTooLargeMessage(file.name, file.size)
        : `"${file.name}" (${getFileSize(file.size)}) is too large for the server to accept. Resize or compress it and try again.`,
    );
  }
  return requireApiSuccess<T>(response, `Failed to upload "${file.name}"`);
};

export {
  MAX_UPLOAD_BYTES,
  getUploadSizeError,
  getBase64Size,
  readUploadResponse,
};
