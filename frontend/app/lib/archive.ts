// 浏览器端压缩包引擎（切片 8）：零依赖，用原生 DecompressionStream 实现。
// - 打包：多文件 → ZIP（store 不压缩：图片/文档本身已压缩，且实现可靠）
// - 解压：ZIP（stored + deflate-raw）/ TAR.GZ → 文件条目列表
// 防护与后端同口径：条目 ≤1000、单条 ≤128MB、总量 ≤256MB、拒绝路径穿越。

const MAX_ENTRIES = 1000;
const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

// ===== CRC32（表驱动） =====

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ===== 小端读写 =====

function u16(v: Uint8Array, off: number): number {
  return v[off] | (v[off + 1] << 8);
}

function u32(v: Uint8Array, off: number): number {
  return (v[off] | (v[off + 1] << 8) | (v[off + 2] << 16) | v[off + 3] * 0x1000000) >>> 0;
}

function put16(buf: number[], value: number): void {
  buf.push(value & 0xff, (value >> 8) & 0xff);
}

function put32(buf: number[], value: number): void {
  buf.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
}

// ===== ZIP 打包（store 模式） =====

export function zipPack(entries: ArchiveEntry[]): Blob {
  if (entries.length > MAX_ENTRIES) throw new Error(`条目过多（上限 ${MAX_ENTRIES}）`);
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    if (data.length > MAX_ENTRY_BYTES) throw new Error(`单文件超限（128MB）`);
    if (data.length > MAX_TOTAL_BYTES) throw new Error(`总量超限（256MB）`);
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    // local file header
    put32(local, 0x04034b50);
    put16(local, 20); // version
    put16(local, 0x0800); // UTF-8 文件名
    put16(local, 0); // store
    put16(local, 0); // time
    put16(local, 0x21); // date（1980-01-01 合法值）
    put32(local, crc);
    put32(local, data.length);
    put32(local, data.length);
    put16(local, nameBytes.length);
    put16(local, 0);
    local.push(...nameBytes);
    for (const b of data) local.push(b);
    // central directory entry
    put32(central, 0x02014b50);
    put16(central, 20);
    put16(central, 20);
    put16(central, 0x0800);
    put16(central, 0);
    put16(central, 0);
    put16(central, 0x21);
    put32(central, crc);
    put32(central, data.length);
    put32(central, data.length);
    put16(central, nameBytes.length);
    put16(central, 0);
    put16(central, 0);
    put16(central, 0);
    put16(central, 0);
    put32(central, 0);
    put32(central, offset);
    central.push(...nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const eocd: number[] = [];
  put32(eocd, 0x06054b50);
  put16(eocd, 0);
  put16(eocd, 0);
  put16(eocd, entries.length);
  put16(eocd, entries.length);
  put32(eocd, central.length);
  put32(eocd, offset);
  put16(eocd, 0);
  return new Blob([new Uint8Array([...local, ...central, ...eocd])], {
    type: "application/zip",
  });
}

// ===== 通用解压防护 =====

function checkBounds(stats: { count: number; total: number }, name: string, size: number): void {
  if (stats.count++ > MAX_ENTRIES) throw new Error(`条目过多（上限 ${MAX_ENTRIES}）`);
  if (size > MAX_ENTRY_BYTES) throw new Error(`单文件超限（128MB）`);
  stats.total += size;
  if (stats.total > MAX_TOTAL_BYTES) throw new Error(`解压总量超限（256MB）`);
  if (name.includes("..")) throw new Error("压缩包含不安全的路径条目");
}

function safeBase(name: string): string {
  const norm = name.replace(/\\/g, "/").replace(/\/+$/, "");
  return norm.split("/").pop() || "file";
}

async function inflate(data: Uint8Array, format: "deflate-raw" | "gzip"): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ===== ZIP 解压（经 central directory，支持 stored / deflate） =====

export async function zipUnpack(data: Uint8Array): Promise<ArchiveEntry[]> {
  // 从尾部回扫 EOCD（注释最长 65535）
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--) {
    if (u32(data, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP 结构不完整");
  const count = u16(data, eocd + 10);
  let ptr = u32(data, eocd + 16);
  const stats = { count: 0, total: 0 };
  const entries: ArchiveEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (u32(data, ptr) !== 0x02014b50) throw new Error("ZIP 目录损坏");
    const method = u16(data, ptr + 10);
    const csize = u32(data, ptr + 20);
    const size = u32(data, ptr + 24);
    const nameLen = u16(data, ptr + 28);
    const extraLen = u16(data, ptr + 30);
    const commentLen = u16(data, ptr + 32);
    const localOff = u32(data, ptr + 42);
    const name = decoder.decode(data.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue; // 目录条目
    checkBounds(stats, name, size);
    // local header：nameLen/extraLen 可能与 central 不一致，须以 local 为准
    const lNameLen = u16(data, localOff + 26);
    const lExtraLen = u16(data, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = data.subarray(dataStart, dataStart + csize);
    const content =
      method === 0 ? raw : method === 8 ? await inflate(raw, "deflate-raw") : null;
    if (content === null) throw new Error(`不支持的压缩算法：${method}`);
    if (content.length !== size) throw new Error("解压后大小校验失败");
    entries.push({ name: safeBase(name), data: content });
  }
  return entries;
}

// ===== TAR.GZ 解压（gzip 全量解出 + 512 块解析） =====

export async function tarGzUnpack(data: Uint8Array): Promise<ArchiveEntry[]> {
  const tar = await inflate(data, "gzip");
  const stats = { count: 0, total: 0 };
  const entries: ArchiveEntry[] = [];
  const decoder = new TextDecoder();
  for (let off = 0; off + 512 <= tar.length; off += 512) {
    if (tar[off] === 0) break; // 结束块
    const sizeField = decoder.decode(tar.subarray(off + 124, off + 136)).trim();
    const size = parseInt(sizeField, 8) || 0;
    if (size === 0) continue; // 目录/空条目
    const typeFlag = String.fromCharCode(tar[off + 156]);
    if (typeFlag !== "0" && typeFlag !== "\0" && typeFlag !== "") continue; // 仅普通文件
    const name = decoder.decode(tar.subarray(off, off + 100)).replace(/\0.*$/, "");
    checkBounds(stats, name, size);
    entries.push({ name: safeBase(name), data: tar.slice(off + 512, off + 512 + size) });
    off += Math.ceil(size / 512) * 512; // 跳过数据块
  }
  return entries;
}

export function isZip(data: Uint8Array): boolean {
  return u32(data, 0) === 0x04034b50;
}

export function isGzip(data: Uint8Array): boolean {
  return data[0] === 0x1f && data[1] === 0x8b;
}
