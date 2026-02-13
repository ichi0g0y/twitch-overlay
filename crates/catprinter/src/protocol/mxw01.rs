//! MXW01 series printer protocol implementation.
//!
//! Magic bytes: 0x22, 0x21
//! Uses a different command structure from GB series.
//! Characteristics: AE01 (Control), AE02 (Notify), AE03 (Data).

use super::PrinterProtocol;

/// MXW01 magic bytes.
const MAGIC: [u8; 2] = [0x22, 0x21];

/// BLE service UUID for MXW01 printers.
const SERVICE_UUID: uuid::Uuid = uuid::Uuid::from_u128(0x0000_ae30_0000_1000_8000_00805f9b34fb);

/// Control characteristic (AE01) - used for commands.
const CHAR_CONTROL: uuid::Uuid = uuid::Uuid::from_u128(0x0000_ae01_0000_1000_8000_00805f9b34fb);

/// Notify characteristic (AE02) - used for device responses.
pub const CHAR_NOTIFY: uuid::Uuid = uuid::Uuid::from_u128(0x0000_ae02_0000_1000_8000_00805f9b34fb);

/// Data characteristic (AE03) - used for bulk data transfer.
pub const CHAR_DATA: uuid::Uuid = uuid::Uuid::from_u128(0x0000_ae03_0000_1000_8000_00805f9b34fb);

// -- MXW01 Command IDs --
const CMD_INIT: u8 = 0x01;
const CMD_PRINT: u8 = 0x02;
const CMD_FEED: u8 = 0x03;
const CMD_STATUS: u8 = 0x04;
const CMD_FINISH: u8 = 0x05;

/// Build an MXW01 command frame: MAGIC + cmd + length(2 LE) + payload + checksum.
fn build_mxw01_command(cmd: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len() as u16;
    let mut buf = Vec::with_capacity(6 + payload.len());
    buf.extend_from_slice(&MAGIC);
    buf.push(cmd);
    buf.push((len & 0xff) as u8);
    buf.push((len >> 8) as u8);
    buf.extend_from_slice(payload);
    // Simple XOR checksum over all preceding bytes
    let checksum = buf.iter().fold(0u8, |acc, &b| acc ^ b);
    buf.push(checksum);
    buf
}

/// Pack 8 pixels into one byte (MSB first, MXW01 convention).
fn byte_encode_msb(row: &[u8]) -> Vec<u8> {
    row.chunks(8)
        .map(|chunk| {
            let mut byte_val: u8 = 0;
            for (i, &px) in chunk.iter().enumerate() {
                if px != 0 {
                    byte_val |= 1 << (7 - i);
                }
            }
            byte_val
        })
        .collect()
}

/// MXW01 series protocol implementation.
#[derive(Debug, Clone, Default)]
pub struct Mxw01Protocol;

impl Mxw01Protocol {
    pub fn new() -> Self {
        Self
    }
}

impl PrinterProtocol for Mxw01Protocol {
    fn name(&self) -> &str {
        "MXW01"
    }

    fn service_uuid(&self) -> uuid::Uuid {
        SERVICE_UUID
    }

    fn tx_characteristic(&self) -> uuid::Uuid {
        CHAR_CONTROL
    }

    fn build_init_sequence(&self) -> Vec<Vec<u8>> {
        vec![
            build_mxw01_command(CMD_STATUS, &[]),
            build_mxw01_command(CMD_INIT, &[0x01]), // initialize with mode 1
        ]
    }

    fn build_print_command(&self, row_data: &[u8]) -> Vec<u8> {
        build_mxw01_command(CMD_PRINT, row_data)
    }

    fn build_feed_command(&self, lines: u16) -> Vec<u8> {
        let payload = [(lines & 0xff) as u8, (lines >> 8) as u8];
        build_mxw01_command(CMD_FEED, &payload)
    }

    fn build_finish_sequence(&self) -> Vec<Vec<u8>> {
        vec![
            build_mxw01_command(CMD_FEED, &[0x05, 0x00]), // feed 5 lines
            build_mxw01_command(CMD_FINISH, &[]),
            build_mxw01_command(CMD_STATUS, &[]),
        ]
    }

    fn encode_row(&self, row: &[u8], _width: u16) -> Vec<u8> {
        let encoded = byte_encode_msb(row);
        build_mxw01_command(CMD_PRINT, &encoded)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mxw01_command_magic() {
        let cmd = build_mxw01_command(CMD_STATUS, &[]);
        assert_eq!(cmd[0], 0x22);
        assert_eq!(cmd[1], 0x21);
    }

    #[test]
    fn test_mxw01_command_checksum() {
        let cmd = build_mxw01_command(CMD_STATUS, &[]);
        let len = cmd.len();
        // XOR of all bytes except last should equal the last byte
        let expected: u8 = cmd[..len - 1].iter().fold(0u8, |acc, &b| acc ^ b);
        assert_eq!(cmd[len - 1], expected);
    }

    #[test]
    fn test_byte_encode_msb_all_black() {
        let row = vec![1u8; 8];
        let encoded = byte_encode_msb(&row);
        assert_eq!(encoded, vec![0xff]);
    }

    #[test]
    fn test_byte_encode_msb_all_white() {
        let row = vec![0u8; 8];
        let encoded = byte_encode_msb(&row);
        assert_eq!(encoded, vec![0x00]);
    }

    #[test]
    fn test_byte_encode_msb_first_pixel_black() {
        let mut row = vec![0u8; 8];
        row[0] = 1;
        let encoded = byte_encode_msb(&row);
        assert_eq!(encoded, vec![0x80]); // MSB = first pixel
    }

    #[test]
    fn test_mxw01_protocol_name() {
        let proto = Mxw01Protocol::new();
        assert_eq!(proto.name(), "MXW01");
    }
}
