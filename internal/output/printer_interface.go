package output

import "image"

// PrinterType はプリンターの種類を表す
type PrinterType string

const (
	PrinterTypeBluetooth PrinterType = "bluetooth"
	PrinterTypeUSB       PrinterType = "usb"
)

// PrinterBackend はプリンター実装の共通インターフェース
type PrinterBackend interface {
	// Connect はプリンターに接続する
	Connect() error

	// Print は画像を印刷する
	Print(img image.Image) error

	// Disconnect はプリンター接続を切断する
	Disconnect() error

	// Type はプリンター種類を返す
	Type() PrinterType

	// IsConnected は接続状態を返す
	IsConnected() bool
}

// PrinterConfig はプリンター設定
type PrinterConfig struct {
	Type PrinterType

	// Bluetooth固有
	BluetoothAddress string
	BestQuality      bool
	Dither           bool
	AutoRotate       bool
	BlackPoint       float32

	// USB固有
	USBPrinterName string

	// 共通
	RotatePrint bool
}
