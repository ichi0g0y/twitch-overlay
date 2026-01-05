package output

import (
	"fmt"
	"image"
	"time"

	"git.massivebox.net/massivebox/go-catprinter"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// BluetoothPrinter はBluetooth Cat プリンターの実装
type BluetoothPrinter struct {
	client    *catprinter.Client
	opts      *catprinter.PrinterOptions
	address   string
	connected bool
	config    PrinterConfig
}

// NewBluetoothPrinter は新しいBluetoothプリンターインスタンスを作成する
func NewBluetoothPrinter(config PrinterConfig) (*BluetoothPrinter, error) {
	if config.BluetoothAddress == "" {
		return nil, fmt.Errorf("bluetooth address is required")
	}

	return &BluetoothPrinter{
		address: config.BluetoothAddress,
		config:  config,
	}, nil
}

// Connect はプリンターに接続する
func (p *BluetoothPrinter) Connect() error {
	// 既存のクライアントがある場合は完全リセット
	if p.client != nil {
		logger.Info("Resetting printer client for new connection")
		if p.connected {
			p.client.Disconnect()
			p.connected = false
		}
		p.client.Stop()
		p.client = nil

		// Bluetoothリソースの解放を待つ
		time.Sleep(2000 * time.Millisecond)
	}

	// 新規クライアント作成
	logger.Info("Creating new printer client")
	instance, err := catprinter.NewClient()
	if err != nil {
		return fmt.Errorf("failed to create catprinter client: %w", err)
	}
	p.client = instance

	// プリンターオプション設定
	p.opts = catprinter.NewOptions().
		SetBestQuality(p.config.BestQuality).
		SetDither(p.config.Dither).
		SetAutoRotate(p.config.AutoRotate).
		SetBlackPoint(p.config.BlackPoint)

	// 接続実行
	logger.Info("Connecting to Bluetooth printer", zap.String("address", p.address))
	err = p.client.Connect(p.address)
	if err != nil {
		return fmt.Errorf("failed to connect to printer: %w", err)
	}

	// 接続安定待ち
	// BLE接続直後のパラメータネゴシエーション（MTU, Connection Interval等）完了を待つ
	logger.Info("Waiting for connection stabilization (1 second)...")
	time.Sleep(1000 * time.Millisecond)

	p.connected = true
	logger.Info("Successfully connected to Bluetooth printer")

	return nil
}

// Print は画像を印刷する
func (p *BluetoothPrinter) Print(img image.Image) error {
	if !p.connected || p.client == nil {
		return fmt.Errorf("printer not connected")
	}

	// 画像の回転処理
	finalImg := img
	if p.config.RotatePrint {
		logger.Info("Rotating image 180 degrees")
		finalImg = rotateImage180(img)
	}

	// 印刷実行
	logger.Info("Printing to Bluetooth printer")
	if err := p.client.Print(finalImg, p.opts, false); err != nil {
		return fmt.Errorf("failed to print: %w", err)
	}

	// 印刷後の待機時間（既存ロジック）
	// Cat printers are slow (~10mm/s).
	// Base 2s + 1s per 60 pixels for safety.
	height := finalImg.Bounds().Dy()
	waitSec := 2 + (height / 60)
	if waitSec < 3 {
		waitSec = 3
	}

	logger.Info("Print finished, waiting for stabilization",
		zap.Int("height_px", height),
		zap.Int("wait_seconds", waitSec))
	time.Sleep(time.Duration(waitSec) * time.Second)

	return nil
}

// Disconnect はプリンター接続を切断する
func (p *BluetoothPrinter) Disconnect() error {
	if p.client != nil {
		if p.connected {
			logger.Info("Disconnecting Bluetooth printer")
			p.client.Disconnect()
			p.connected = false
		}
		p.client.Stop()
		p.client = nil
	}
	return nil
}

// Type はプリンター種類を返す
func (p *BluetoothPrinter) Type() PrinterType {
	return PrinterTypeBluetooth
}

// IsConnected は接続状態を返す
func (p *BluetoothPrinter) IsConnected() bool {
	return p.connected
}
