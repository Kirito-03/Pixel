export function artworkLayout(frame: { width: number; height: number }, image: { width: number; height: number }, position?: string) {
  if (frame.width <= 0 || frame.height <= 0 || image.width <= 0 || image.height <= 0) return null;
  const portrait = image.width / image.height < 1.15;
  if (portrait && frame.width >= 768) {
    // A portrait is artwork beside the synopsis, never a panoramic background.
    const scale = Math.min(frame.height * 0.96 / image.height, frame.width * 0.36 / image.width, 1.5);
    const width = image.width * scale;
    const height = image.height * scale;
    return { width, height, left: frame.width - width - Math.max(24, (frame.width - 1120) / 2), top: (frame.height - height) / 2 };
  }
  const requestedScale = Math.max(frame.width / image.width, frame.height / image.height);
  const scale = Math.min(requestedScale, portrait ? 1.5 : 1.35);
  const width = image.width * scale;
  const height = image.height * scale;
  const focal = position?.match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  const x = focal ? Math.min(100, Number(focal[1])) / 100 : 0.5;
  const y = focal ? Math.min(100, Number(focal[2])) / 100 : portrait ? 0 : 0.35;
  return { width, height, left: (frame.width - width) * x, top: (frame.height - height) * (height < frame.height ? 0.5 : y) };
}
