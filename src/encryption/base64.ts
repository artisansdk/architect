/**
 * Encodes bytes as standard (padded) base64.
 */
export function encode(data: Uint8Array): string {
    // A loop, not fromCharCode(...data): spreading large payloads overflows the call stack.
    let binary = ""
    for (const byte of data) binary += String.fromCharCode(byte)
    return btoa(binary)
}

/**
 * Decodes standard base64 to bytes. Throws on invalid input.
 */
export function decode(data: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
}
