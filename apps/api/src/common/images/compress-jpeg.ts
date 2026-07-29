import sharp from 'sharp';
import { TIME_CLOCK_PHOTO_MAX_BYTES } from '@gas-erp/shared';

/**
 * Reduz JPEG para caber em TIME_CLOCK_PHOTO_MAX_BYTES.
 * Se já estiver abaixo do limite, devolve o buffer original.
 */
export async function compressJpegToMaxBytes(
  input: Buffer,
  maxBytes = TIME_CLOCK_PHOTO_MAX_BYTES,
): Promise<Buffer> {
  if (input.length <= maxBytes) return input;

  const attempts: Array<{ width: number; quality: number }> = [
    { width: 960, quality: 70 },
    { width: 720, quality: 60 },
    { width: 640, quality: 55 },
    { width: 560, quality: 50 },
    { width: 480, quality: 45 },
    { width: 400, quality: 40 },
  ];

  let last: Buffer = input;
  for (const attempt of attempts) {
    last = await sharp(input)
      .rotate()
      .resize({ width: attempt.width, withoutEnlargement: true })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();
    if (last.length <= maxBytes) return last;
  }

  return last;
}
