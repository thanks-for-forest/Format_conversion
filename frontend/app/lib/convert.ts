// 本地转换引擎：浏览器 Canvas 解码/编码，文件不上传。
// 路由判定：源格式浏览器可解码 + 目标格式 Canvas 可编码 + 体积在阈值内 → 本地。

const LOCAL_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
};

// 本地转换体积阈值：超过走服务端，避免大图占满标签页内存
export const LOCAL_MAX_BYTES = 25 * 1024 * 1024;

// 浏览器原生可解码的图片格式
const DECODABLE_EXTS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];

export function canConvertLocally(
  sourceExt: string,
  targetExt: string,
  fileSize: number
): boolean {
  return (
    DECODABLE_EXTS.includes(sourceExt) &&
    targetExt in LOCAL_MIME &&
    fileSize <= LOCAL_MAX_BYTES
  );
}

export async function convertLocally(
  file: File,
  targetExt: string
): Promise<Blob> {
  const mime = LOCAL_MIME[targetExt];
  if (!mime) {
    throw new Error("目标格式不支持本地转换");
  }
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 不可用");
  }
  if (targetExt === "jpg") {
    // JPEG 无 Alpha 通道：白底压平，避免透明区变黑
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: mime, quality: 85 });
}