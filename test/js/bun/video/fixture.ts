export function integers(...values: number[]) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeUInt32BE(value, index * 4));
  return bytes;
}
function box(type: string, ...parts: Uint8Array[]) {
  const body = Buffer.concat(parts);
  return Buffer.concat([integers(body.length + 8), Buffer.from(type), body]);
}
function full(type: string, ...parts: Uint8Array[]) {
  return box(type, integers(0), ...parts);
}

// Container/timing fixture only. Its opaque access units are deliberately not a decoder vector.
export function mp4() {
  const ftyp = box("ftyp", Buffer.from("isom"), integers(0), Buffer.from("isomavc1"));
  const units = [Buffer.alloc(16, 1), Buffer.alloc(16, 2), Buffer.alloc(16, 3)];
  const mdat = box("mdat", ...units);
  const matrix = integers(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
  const mvhd = full(
    "mvhd",
    integers(0, 0, 24000, 3003, 0x10000),
    Buffer.from([1, 0, 0, 0]),
    Buffer.alloc(8),
    matrix,
    Buffer.alloc(24),
    integers(2),
  );
  const tkhd = box(
    "tkhd",
    integers(7, 0, 0, 1, 0, 3003),
    Buffer.alloc(8),
    Buffer.alloc(8),
    matrix,
    integers(64 << 16, 48 << 16),
  );
  const mdhd = full("mdhd", integers(0, 0, 24000, 3003), Buffer.from([0x55, 0xc4, 0, 0]));
  const hdlr = full("hdlr", integers(0), Buffer.from("vide"), Buffer.alloc(12), Buffer.from("Video\0"));
  const sample = Buffer.alloc(78);
  sample.writeUInt16BE(1, 6);
  sample.writeUInt16BE(64, 24);
  sample.writeUInt16BE(48, 26);
  sample.writeUInt32BE(0x480000, 28);
  sample.writeUInt32BE(0x480000, 32);
  sample.writeUInt16BE(1, 40);
  sample.writeUInt16BE(24, 74);
  sample.writeUInt16BE(0xffff, 76);
  const avcc = box("avcC", Buffer.from([1, 0x42, 0, 0x1e, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0, 0x1e, 1, 0, 2, 0x68, 0xce]));
  const stbl = box(
    "stbl",
    full("stsd", integers(1), box("avc1", sample, avcc)),
    full("stts", integers(1, 3, 1001)),
    full("stsc", integers(1, 1, 3, 1)),
    full("stsz", integers(16, 3)),
    full("stco", integers(1, ftyp.length + 8)),
    full("stss", integers(1, 1)),
  );
  const dinf = box("dinf", full("dref", integers(1), box("url ", integers(1))));
  const minf = box("minf", box("vmhd", integers(1), Buffer.alloc(8)), dinf, stbl);
  return Buffer.concat([ftyp, mdat, box("moov", mvhd, box("trak", tkhd, box("mdia", mdhd, hdlr, minf)))]);
}
