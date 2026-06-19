export type ZipFileInput = {
  path: string;
  content: string;
};

const zipUtf8Flag = 0x0800;
const zipStoreMethod = 0;
const crc32Table = createCrc32Table();

export function createZipArchive(files: ZipFileInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const fileName = Buffer.from(normalizeZipPath(file.path), "utf8");
    const data = Buffer.from(file.content, "utf8");
    const crc = crc32(data);
    const localHeader = createLocalFileHeader({ crc, compressedSize: data.length, fileName, uncompressedSize: data.length });
    const centralHeader = createCentralDirectoryHeader({
      crc,
      compressedSize: data.length,
      fileName,
      localHeaderOffset: offset,
      uncompressedSize: data.length
    });

    localParts.push(localHeader, fileName, data);
    centralParts.push(centralHeader, fileName);
    offset += localHeader.length + fileName.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = createEndOfCentralDirectory({
    centralDirectoryOffset: offset,
    centralDirectorySize: centralDirectory.length,
    entries: files.length
  });

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function createLocalFileHeader(input: {
  compressedSize: number;
  crc: number;
  fileName: Buffer;
  uncompressedSize: number;
}): Buffer {
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(zipUtf8Flag, 6);
  header.writeUInt16LE(zipStoreMethod, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(input.crc, 14);
  header.writeUInt32LE(input.compressedSize, 18);
  header.writeUInt32LE(input.uncompressedSize, 22);
  header.writeUInt16LE(input.fileName.length, 26);
  header.writeUInt16LE(0, 28);

  return header;
}

function createCentralDirectoryHeader(input: {
  compressedSize: number;
  crc: number;
  fileName: Buffer;
  localHeaderOffset: number;
  uncompressedSize: number;
}): Buffer {
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(zipUtf8Flag, 8);
  header.writeUInt16LE(zipStoreMethod, 10);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(input.crc, 16);
  header.writeUInt32LE(input.compressedSize, 20);
  header.writeUInt32LE(input.uncompressedSize, 24);
  header.writeUInt16LE(input.fileName.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(input.localHeaderOffset, 42);

  return header;
}

function createEndOfCentralDirectory(input: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entries: number;
}): Buffer {
  const header = Buffer.alloc(22);

  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(input.entries, 8);
  header.writeUInt16LE(input.entries, 10);
  header.writeUInt32LE(input.centralDirectorySize, 12);
  header.writeUInt32LE(input.centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);

  return header;
}

function normalizeZipPath(path: string): string {
  const safePath = path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");

  return safePath || "file.txt";
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
