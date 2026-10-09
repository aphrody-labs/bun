//! Raw DEFLATE (RFC 1951) decoder for the VSIX (zip) and cabinet (MSZIP) payloads. Output is
//! appended to `out`, and back-references may reach into what `out` already holds: MSZIP blocks
//! use the previous blocks of their folder as history.

const MAX_BITS: usize = 15;
const FAST_BITS: u32 = 10;

const LEN_BASE: [u16; 29] = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA: [u8; 29] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE: [u16; 30] = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577,
];
const DIST_EXTRA: [u8; 30] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER: [usize; 19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

struct Huffman {
    /// Indexed by the next FAST_BITS input bits: `symbol << 4 | length`, 0 when the code is longer.
    fast: Vec<u16>,
    count: [u16; MAX_BITS + 1],
    symbol: Vec<u16>,
}

impl Huffman {
    fn new(lengths: &[u8]) -> Result<Huffman, String> {
        let mut count = [0u16; MAX_BITS + 1];
        for &len in lengths {
            count[len as usize] += 1;
        }
        count[0] = 0;
        let mut left: i32 = 1;
        for len in 1..=MAX_BITS {
            left <<= 1;
            left -= count[len] as i32;
            if left < 0 {
                return Err("invalid deflate data: over-subscribed code".into());
            }
        }
        let mut offs = [0u16; MAX_BITS + 2];
        for len in 1..=MAX_BITS {
            offs[len + 1] = offs[len] + count[len];
        }
        let mut symbol = vec![0u16; lengths.len()];
        for (sym, &len) in lengths.iter().enumerate() {
            if len != 0 {
                symbol[offs[len as usize] as usize] = sym as u16;
                offs[len as usize] += 1;
            }
        }
        let mut fast = vec![0u16; 1 << FAST_BITS];
        let mut next = [0u32; MAX_BITS + 2];
        let mut code = 0u32;
        for len in 1..=MAX_BITS {
            code = (code + count[len - 1] as u32) << 1;
            next[len] = code;
        }
        for (sym, &len) in lengths.iter().enumerate() {
            let len = len as u32;
            if len == 0 || len > FAST_BITS {
                if len != 0 {
                    next[len as usize] += 1;
                }
                continue;
            }
            let code = next[len as usize];
            next[len as usize] += 1;
            let mut reversed = 0u32;
            for bit in 0..len {
                reversed |= ((code >> bit) & 1) << (len - 1 - bit);
            }
            let mut i = reversed;
            while i < (1 << FAST_BITS) {
                fast[i as usize] = ((sym as u16) << 4) | len as u16;
                i += 1 << len;
            }
        }
        Ok(Huffman { fast, count, symbol })
    }
}

struct Bits<'a> {
    input: &'a [u8],
    pos: usize,
    buf: u64,
    count: u32,
    /// Zero bits supplied past the end of the input.
    overrun: u32,
}

impl Bits<'_> {
    #[inline]
    fn refill(&mut self) {
        while self.count <= 56 {
            if self.pos < self.input.len() {
                self.buf |= (self.input[self.pos] as u64) << self.count;
                self.pos += 1;
            } else {
                self.overrun += 8;
            }
            self.count += 8;
        }
    }

    #[inline]
    fn take(&mut self, n: u32) -> Result<u32, String> {
        if n == 0 {
            return Ok(0);
        }
        if self.count < n {
            self.refill();
        }
        let value = (self.buf & ((1u64 << n) - 1)) as u32;
        self.buf >>= n;
        self.count -= n;
        self.check()?;
        Ok(value)
    }

    #[inline]
    fn check(&self) -> Result<(), String> {
        if self.overrun > self.count {
            return Err("invalid deflate data: truncated".into());
        }
        Ok(())
    }

    #[inline]
    fn decode(&mut self, h: &Huffman) -> Result<u16, String> {
        if self.count < MAX_BITS as u32 {
            self.refill();
        }
        let entry = h.fast[(self.buf & ((1 << FAST_BITS) - 1)) as usize];
        if entry != 0 {
            let len = (entry & 15) as u32;
            self.buf >>= len;
            self.count -= len;
            self.check()?;
            return Ok(entry >> 4);
        }
        let (mut code, mut first, mut index) = (0i32, 0i32, 0i32);
        for len in 1..=MAX_BITS {
            code |= (self.buf & 1) as i32;
            self.buf >>= 1;
            self.count -= 1;
            let count = h.count[len] as i32;
            if code - count < first {
                self.check()?;
                return Ok(h.symbol[(index + (code - first)) as usize]);
            }
            index += count;
            first += count;
            first <<= 1;
            code <<= 1;
        }
        Err("invalid deflate data: bad code".into())
    }

    /// Drops the bits up to the next byte boundary and hands the buffered bytes back.
    fn align(&mut self) {
        let drop = self.count % 8;
        self.buf >>= drop;
        self.count -= drop;
        let buffered = (self.count / 8) as usize;
        let real = buffered.saturating_sub((self.overrun / 8) as usize);
        self.pos -= real;
        self.buf = 0;
        self.count = 0;
        self.overrun = 0;
    }
}

fn fixed_tables() -> (Huffman, Huffman) {
    let mut lengths = [0u8; 288];
    lengths[..144].fill(8);
    lengths[144..256].fill(9);
    lengths[256..280].fill(7);
    lengths[280..].fill(8);
    (Huffman::new(&lengths).unwrap(), Huffman::new(&[5u8; 30]).unwrap())
}

fn dynamic_tables(bits: &mut Bits) -> Result<(Huffman, Huffman), String> {
    let nlen = bits.take(5)? as usize + 257;
    let ndist = bits.take(5)? as usize + 1;
    let ncode = bits.take(4)? as usize + 4;
    if nlen > 286 || ndist > 30 {
        return Err("invalid deflate data: bad counts".into());
    }
    let mut clens = [0u8; 19];
    for &i in &CLEN_ORDER[..ncode] {
        clens[i] = bits.take(3)? as u8;
    }
    let clen = Huffman::new(&clens)?;
    let mut lengths = vec![0u8; nlen + ndist];
    let mut i = 0;
    while i < nlen + ndist {
        let sym = bits.decode(&clen)?;
        let (value, repeat) = match sym {
            0..=15 => {
                lengths[i] = sym as u8;
                i += 1;
                continue;
            }
            16 => {
                if i == 0 {
                    return Err("invalid deflate data: repeat with no length".into());
                }
                (lengths[i - 1], 3 + bits.take(2)? as usize)
            }
            17 => (0, 3 + bits.take(3)? as usize),
            _ => (0, 11 + bits.take(7)? as usize),
        };
        if i + repeat > nlen + ndist {
            return Err("invalid deflate data: too many lengths".into());
        }
        lengths[i..i + repeat].fill(value);
        i += repeat;
    }
    if lengths[256] == 0 {
        return Err("invalid deflate data: no end-of-block code".into());
    }
    Ok((Huffman::new(&lengths[..nlen])?, Huffman::new(&lengths[nlen..])?))
}

/// Decodes one complete DEFLATE stream from `input`, appending to `out`; returns the number of
/// input bytes consumed.
pub fn inflate(input: &[u8], out: &mut Vec<u8>) -> Result<usize, String> {
    let mut bits = Bits { input, pos: 0, buf: 0, count: 0, overrun: 0 };
    loop {
        let last = bits.take(1)?;
        match bits.take(2)? {
            0 => {
                bits.align();
                let at = bits.pos;
                if at + 4 > input.len() {
                    return Err("invalid deflate data: truncated stored block".into());
                }
                let len = u16::from_le_bytes([input[at], input[at + 1]]) as usize;
                let nlen = u16::from_le_bytes([input[at + 2], input[at + 3]]) as usize;
                if len != !nlen & 0xffff || at + 4 + len > input.len() {
                    return Err("invalid deflate data: bad stored block".into());
                }
                out.extend_from_slice(&input[at + 4..at + 4 + len]);
                bits.pos = at + 4 + len;
            }
            kind @ (1 | 2) => {
                let (lit, dist) = if kind == 1 { fixed_tables() } else { dynamic_tables(&mut bits)? };
                loop {
                    let sym = bits.decode(&lit)? as usize;
                    if sym < 256 {
                        out.push(sym as u8);
                        continue;
                    }
                    if sym == 256 {
                        break;
                    }
                    let sym = sym - 257;
                    if sym >= 29 {
                        return Err("invalid deflate data: bad length symbol".into());
                    }
                    let len = LEN_BASE[sym] as usize + bits.take(LEN_EXTRA[sym] as u32)? as usize;
                    let dsym = bits.decode(&dist)? as usize;
                    if dsym >= 30 {
                        return Err("invalid deflate data: bad distance symbol".into());
                    }
                    let distance = DIST_BASE[dsym] as usize + bits.take(DIST_EXTRA[dsym] as u32)? as usize;
                    if distance > out.len() {
                        return Err("invalid deflate data: distance too far back".into());
                    }
                    let start = out.len() - distance;
                    if distance >= len {
                        out.extend_from_within(start..start + len);
                    } else {
                        out.reserve(len);
                        for i in 0..len {
                            let byte = out[start + i];
                            out.push(byte);
                        }
                    }
                }
            }
            _ => return Err("invalid deflate data: reserved block type".into()),
        }
        if last == 1 {
            break;
        }
    }
    bits.align();
    Ok(bits.pos)
}

#[cfg(test)]
pub(crate) fn stored(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let chunks: Vec<&[u8]> = if data.is_empty() { vec![&[][..]] } else { data.chunks(65535).collect() };
    for (i, chunk) in chunks.iter().enumerate() {
        out.push(if i + 1 == chunks.len() { 1 } else { 0 });
        let len = chunk.len() as u16;
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&(!len).to_le_bytes());
        out.extend_from_slice(chunk);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_blocks() {
        let data: Vec<u8> = (0..70000u32).map(|i| (i * 7) as u8).collect();
        let mut out = Vec::new();
        let encoded = stored(&data);
        assert_eq!(inflate(&encoded, &mut out).unwrap(), encoded.len());
        assert_eq!(out, data);
    }

    #[test]
    fn fixed_and_dynamic_blocks() {
        // zlib.deflateRawSync("hello hello hello hello\n") (fixed Huffman, one back-reference).
        let fixed = [0xcb, 0x48, 0xcd, 0xc9, 0xc9, 0x57, 0xc8, 0x40, 0x27, 0xb9, 0x00];
        let mut out = Vec::new();
        assert_eq!(inflate(&fixed, &mut out).unwrap(), fixed.len());
        assert_eq!(out, b"hello hello hello hello\n");
        // zlib.deflateRawSync of 64 lines "line <n> of the deflate test\n" (dynamic Huffman).
        let dynamic = include_bytes!("testdata/dynamic.deflate");
        let mut out = Vec::new();
        assert_eq!(inflate(dynamic, &mut out).unwrap(), dynamic.len());
        let expected: String = (0..64).map(|n| format!("line {n} of the deflate test\n")).collect();
        assert_eq!(out, expected.as_bytes());
    }

    #[test]
    fn history_spans_calls() {
        let mut out = b"abcabc".to_vec();
        // Fixed block: a length-6 copy at distance 6, then end of block.
        let mut bits: Vec<bool> = vec![true, true, false];
        let mut push = |code: u32, len: u32, msb_first: bool| {
            for i in 0..len {
                let bit = if msb_first { (code >> (len - 1 - i)) & 1 } else { (code >> i) & 1 };
                bits.push(bit == 1);
            }
        };
        push(0b0000100, 7, true); // length symbol 260 → length 6
        push(0b00101, 5, true); // distance symbol 5 → 7..8, 1 extra bit
        push(1, 1, false); // extra bit 1 → distance 8
        push(0, 7, true); // end of block
        let mut bytes = vec![0u8; bits.len().div_ceil(8)];
        for (i, bit) in bits.iter().enumerate() {
            if *bit {
                bytes[i / 8] |= 1 << (i % 8);
            }
        }
        out.splice(0..0, b"xy".iter().copied());
        inflate(&bytes, &mut out).unwrap();
        assert_eq!(out, b"xyabcabcxyabca");
    }
}
