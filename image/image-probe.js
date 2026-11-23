"use strict";

// Used by the content script and the background fallback. Keep the timeout
// active until the prefix has been read, including time spent waiting for chunks.
async function fetchImagePrefix(url, credentials, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  try {
    const response = await fetch(url, {
      cache: "force-cache",
      credentials,
      signal: controller.signal
    });
    if (!response.ok || response.status === 206 || !response.body) return null;

    reader = response.body.getReader();
    const prefix = new Uint8Array(512);
    let length = 0;
    while (length < prefix.length) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, prefix.length - length);
      prefix.set(chunk, length);
      length += chunk.length;
    }

    const contentType = response.headers.get("content-type");
    const contentLength = Number(response.headers.get("content-length"));
    return {
      contentType: contentType?.split(";")[0].trim().toLowerCase() || null,
      contentLength: Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : null,
      headerBytes: length ? prefix.subarray(0, length) : null
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    if (reader) {
      void reader.cancel().catch(() => {});
    } else {
      controller.abort();
    }
  }
}
