function bytesToBase64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** 큰 캡처는 폭 1100px JPEG로 줄인다(긴 쿠팡 캡처의 글씨는 유지). 실패하면 원본 그대로. */
export async function prepareImage(file: File): Promise<{ mediaType: string; base64: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1100 / bmp.width, 7800 / bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('no blob');
    return { mediaType: 'image/jpeg', base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  } catch {
    return { mediaType: file.type || 'image/png', base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
  }
}
