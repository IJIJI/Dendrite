import { isDocument, type PlaygroundDocument } from "./document";

//? Permalink codec: PlaygroundDocument ↔ URL-fragment payload. Deflate-compressed
// base64url via the native Compression/DecompressionStream APIs - no dependency, async.
// Framework-free; the future editor reuses it. main.ts owns the preset-id-vs-payload
// dispatch; this module only codes documents.

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(payload: string): Uint8Array {
  const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
  // toBase64Url strips the "=" padding (URL hygiene). atob's forgiving-base64 decode
  // accepts unpadded input, but restoring it costs one line and removes the doubt.
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

/** Document → fragment payload (the part after `#`). */
export async function encodeDocument(doc: PlaygroundDocument): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  return toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
}

/** Fragment payload → document, or null on any malformed input (fail soft). */
export async function decodePayload(payload: string): Promise<PlaygroundDocument | null> {
  try {
    const bytes = await pipe(fromBase64Url(payload), new DecompressionStream("deflate-raw"));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
