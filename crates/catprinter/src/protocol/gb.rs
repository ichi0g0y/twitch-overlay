//! GB series printer protocol implementation.
//!
//! Magic bytes: 0x51, 0x78
//! Service UUID: ae30 (macOS fallback: af30)
//! TX Characteristic UUID: ae01
//! Uses CRC8 checksum with a 256-byte lookup table.

use super::PrinterProtocol;

/// GB series protocol magic bytes.
const MAGIC: [u8; 2] = [0x51, 0x78];

/// BLE service UUID for GB printers (standard).
const SERVICE_UUID: uuid::Uuid = uuid::Uuid::from_u128(0x0000_ae30_0000_1000_8000_00805f9b34fb);

/// BLE service UUID fallback for macOS.
pub const SERVICE_UUID_MACOS: uuid::Uuid =
    uuid::Uuid::from_u128(0x0000_af30_0000_1000_8000_00805f9b34fb);

/// BLE TX characteristic UUID for writing print data.
const TX_CHARACTERISTIC: uuid::Uuid =
    uuid::Uuid::from_u128(0x0000_ae01_0000_1000_8000_00805f9b34fb);

// -- Command IDs --
const CMD_GET_DEV_STATE: u8 = 0xa3;
const CMD_SET_QUALITY: u8 = 0xa4;
const CMD_LATTICE: u8 = 0xa6;
const CMD_PRINT_ROW_BYTE: u8 = 0xa2;
const CMD_PRINT_ROW_RLE: u8 = 0xbf;
const CMD_FEED_SPEED: u8 = 0xbd;
const CMD_SET_ENERGY: u8 = 0xaf;
const CMD_APPLY_ENERGY: u8 = 0xbe;
const CMD_UPDATE_DEVICE: u8 = 0xa9;
const CMD_SET_PAPER: u8 = 0xa1;

/// CRC8 lookup table used for checksum calculation.
#[rustfmt::skip]
const CRC8_TABLE: [u8; 256] = [
    0,   7,  14,   9,  28,  27,  18,  21,  56,  63,  54,  49,  36,  35,  42,  45,
  112, 119, 126, 121, 108, 107,  98, 101,  72,  79,  70,  65,  84,  83,  90,  93,
  224, 231, 238, 233, 252, 251, 242, 245, 216, 223, 214, 209, 196, 195, 202, 205,
  144, 151, 158, 153, 140, 139, 130, 133, 168, 175, 166, 161, 180, 179, 186, 189,
  199, 192, 201, 206, 219, 220, 213, 210, 255, 248, 241, 246, 227, 228, 237, 234,
  183, 176, 185, 190, 171, 172, 165, 162, 143, 136, 129, 134, 147, 148, 157, 154,
   39,  32,  41,  46,  59,  60,  53,  50,  31,  24,  17,  22,   3,   4,  13,  10,
   87,  80,  89,  94,  75,  76,  69,  66, 111, 104,  97, 102, 115, 116, 125, 122,
  137, 142, 135, 128, 149, 146, 155, 156, 177, 182, 191, 184, 173, 170, 163, 164,
  249, 254, 247, 240, 229, 226, 235, 236, 193, 198, 207, 200, 221, 218, 211, 212,
  105, 110, 103,  96, 117, 114, 123, 124,  81,  86,  95,  88,  77,  74,  67,  68,
   25,  30,  23,  16,   5,   2,  11,  12,  33,  38,  47,  40,  61,  58,  51,  52,
   78,  73,  64,  71,  82,  85,  92,  91, 118, 113, 120, 127, 106, 109, 100,  99,
   62,  57,  48,  55,  34,  37,  44,  43,   6,   1,   8,  15,  26,  29,  20,  19,
  174, 169, 160, 167, 178, 181, 188, 187, 150, 145, 152, 159, 138, 141, 132, 131,
  222, 217, 208, 215, 194, 197, 204, 203, 230, 225, 232, 239, 250, 253, 244, 243,
];

/// Compute CRC8 checksum over a byte slice.
fn crc8(data: &[u8]) -> u8 {
    let mut crc: u8 = 0;
    for &b in data {
        crc = CRC8_TABLE[(crc ^ b) as usize];
    }
    crc
}

/// Build a raw GB command frame: MAGIC + cmd + 0x00 + len(2 LE) + payload + crc8 + 0xFF.
fn build_command(cmd: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len() as u16;
    let mut buf = Vec::with_capacity(8 + payload.len());
    buf.extend_from_slice(&MAGIC);
    buf.push(cmd);
    buf.push(0x00);
    buf.push((len & 0xff) as u8);
    buf.push((len >> 8) as u8);
    buf.extend_from_slice(payload);
    buf.push(crc8(payload));
    buf.push(0xff);
    buf
}

/// Run-length encode a single repetition segment.
fn rle_repetition(mut count: usize, val: u8) -> Vec<u8> {
    let mut out = Vec::new();
    while count > 0x7f {
        out.push(0x7f | (val << 7));
        count -= 0x7f;
    }
    if count > 0 {
        out.push((val << 7) | count as u8);
    }
    out
}

/// Run-length encode a pixel row (0=white, 1=black).
fn run_length_encode(row: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
    if row.is_empty() {
        return result;
    }
    let mut count: usize = 0;
    let mut last: u8 = 0xff; // sentinel
    for &val in row {
        if val == last {
            count += 1;
        } else {
            if last != 0xff {
                result.extend(rle_repetition(count, last));
            }
            count = 1;
            last = val;
        }
    }
    if count > 0 && last != 0xff {
        result.extend(rle_repetition(count, last));
    }
    result
}

/// Byte-encode a pixel row: pack 8 pixels per byte (LSB first).
fn byte_encode(row: &[u8]) -> Vec<u8> {
    row.chunks(8)
        .map(|chunk| {
            let mut byte_val: u8 = 0;
            for (bit, &px) in chunk.iter().enumerate() {
                if px != 0 {
                    byte_val |= 1 << bit;
                }
            }
            byte_val
        })
        .collect()
}

/// GB series protocol implementation.
#[derive(Debug, Clone, Default)]
pub struct GbProtocol {
    /// When true, use macOS fallback service UUID (af30).
    pub use_macos_uuid: bool,
}

impl GbProtocol {
    pub fn new() -> Self {
        Self { use_macos_uuid: cfg!(target_os = "macos") }
    }
}

impl PrinterProtocol for GbProtocol {
    fn name(&self) -> &str {
        "GB"
    }

    fn service_uuid(&self) -> uuid::Uuid {
        if self.use_macos_uuid { SERVICE_UUID_MACOS } else { SERVICE_UUID }
    }

    fn tx_characteristic(&self) -> uuid::Uuid {
        TX_CHARACTERISTIC
    }

    fn build_init_sequence(&self) -> Vec<Vec<u8>> {
        let lattice_start_data: &[u8] =
            &[0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c];
        vec![
            build_command(CMD_GET_DEV_STATE, &[0x00]),
            build_command(CMD_GET_DEV_STATE, &[0x00]),  // start printing
            build_command(CMD_SET_QUALITY, &[0x32]),     // 200 DPI
            build_command(CMD_FEED_SPEED, &[0x24]),      // slow speed
            build_command(CMD_SET_ENERGY, &[0xff, 0xdf]),// max energy
            build_command(CMD_APPLY_ENERGY, &[0x01]),
            build_command(CMD_UPDATE_DEVICE, &[0x00]),
            build_command(CMD_LATTICE, lattice_start_data),
        ]
    }

    fn build_print_command(&self, row_data: &[u8]) -> Vec<u8> {
        // row_data is already encoded (RLE or byte-encoded).
        // Determine format based on caller providing pre-encoded data.
        build_command(CMD_PRINT_ROW_BYTE, row_data)
    }

    fn build_feed_command(&self, lines: u16) -> Vec<u8> {
        build_command(CMD_FEED_SPEED, &[(lines & 0xff) as u8])
    }

    fn build_finish_sequence(&self) -> Vec<Vec<u8>> {
        let lattice_end_data: &[u8] =
            &[0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17];
        vec![
            build_command(CMD_LATTICE, lattice_end_data),
            build_command(CMD_FEED_SPEED, &[0x08]),      // final speed
            build_command(CMD_FEED_SPEED, &[0x05]),      // feed 5 lines
            build_command(CMD_SET_PAPER, &[0x30, 0x00]), // set paper x3
            build_command(CMD_SET_PAPER, &[0x30, 0x00]),
            build_command(CMD_SET_PAPER, &[0x30, 0x00]),
            build_command(CMD_GET_DEV_STATE, &[0x00]),
        ]
    }

    fn encode_row(&self, row: &[u8], width: u16) -> Vec<u8> {
        let byte_width = (width as usize) / 8;
        // Try RLE first; fall back to byte encoding if larger.
        let rle = run_length_encode(row);
        if rle.len() > byte_width {
            let encoded = byte_encode(row);
            build_command(CMD_PRINT_ROW_BYTE, &encoded)
        } else {
            build_command(CMD_PRINT_ROW_RLE, &rle)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crc8_empty() {
        assert_eq!(crc8(&[]), 0);
    }

    #[test]
    fn test_crc8_known_value() {
        // CRC8 of [0x32] should match Go checksumTable lookup
        assert_eq!(crc8(&[0x32]), CRC8_TABLE[0x32]);
    }

    #[test]
    fn test_build_command_structure() {
        let cmd = build_command(0xa3, &[0x00]);
        assert_eq!(cmd[0], 0x51); // magic[0]
        assert_eq!(cmd[1], 0x78); // magic[1]
        assert_eq!(cmd[2], 0xa3); // command
        assert_eq!(cmd[3], 0x00); // reserved
        assert_eq!(cmd[4], 0x01); // length low
        assert_eq!(cmd[5], 0x00); // length high
        assert_eq!(cmd[6], 0x00); // payload
        assert_eq!(cmd[8], 0xff); // terminator
    }

    #[test]
    fn test_byte_encode_all_black() {
        let row = vec![1u8; 8];
        let encoded = byte_encode(&row);
        assert_eq!(encoded, vec![0xff]);
    }

    #[test]
    fn test_byte_encode_all_white() {
        let row = vec![0u8; 8];
        let encoded = byte_encode(&row);
        assert_eq!(encoded, vec![0x00]);
    }

    #[test]
    fn test_rle_encode_uniform() {
        let row = vec![0u8; 16];
        let rle = run_length_encode(&row);
        assert_eq!(rle, vec![16u8]); // 0 << 7 | 16
    }

    #[test]
    fn test_gb_protocol_name() {
        let proto = GbProtocol::new();
        assert_eq!(proto.name(), "GB");
    }
}
