/** An MP3 (or any audio the browser can decode) as raw 16-bit mono PCM at 24 kHz, the format the rest of the app works in. */
export async function decodeToPcm24k(data: ArrayBuffer): Promise<Uint8Array> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(data.slice(0));
    const frames = Math.max(1, Math.ceil(decoded.duration * 24000));
    const off = new OfflineAudioContext(1, frames, 24000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    const f = rendered.getChannelData(0);
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const v = Math.max(-1, Math.min(1, f[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return new Uint8Array(out.buffer);
  } finally {
    void ctx.close().catch(() => {});
  }
}
