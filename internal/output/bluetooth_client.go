package output

import (
	"fmt"
	"strings"
	"time"

	"git.massivebox.net/massivebox/go-catprinter"
	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/status"
	"go.uber.org/zap"
)

var latestPrinter *catprinter.Client
var opts *catprinter.PrinterOptions
var isConnected bool
var isReconnecting bool
var hasInitialPrintBeenDone bool

func SetupBluetoothClient() (*catprinter.Client, error) {
	if err := ensureBluetoothSafeToUse(); err != nil {
		return nil, err
	}

	// 既存のクライアントがある場合は完全リセット（真のKeepAliveのため）
	if latestPrinter != nil {
		logger.Info("Resetting printer client for proper keep-alive")

		// 既存の接続を切断
		if isConnected {
			logger.Info("Disconnecting existing connection for keep-alive")
			latestPrinter.Disconnect()
			isConnected = false
			// KeepAlive再接続中はステータスを変更しない（緑インジケーターを維持）
			// 再接続フラグが立っている場合のみステータス更新をスキップ
			if !isReconnecting {
				logger.Info("Not in reconnecting state, updating printer status to disconnected")
				status.SetPrinterConnected(false)
			} else {
				logger.Info("KeepAlive reconnection in progress, maintaining connected status (green indicator)")
			}
		}

		// BLEデバイスを完全に解放
		logger.Info("Releasing BLE device")
		latestPrinter.Stop()
		latestPrinter = nil

		// Bluetoothリソースの解放を待つ
		// Note: この待機時間により、BLEデバイスが完全に解放される
		// 500ms -> 2000msに延長して、OS側のキャッシュクリアなどを確実に待つ
		time.Sleep(2000 * time.Millisecond)
	} else {
		// 新規接続の場合は再接続フラグをクリア
		isReconnecting = false
	}

	// 新規クライアント作成
	logger.Info("Creating new printer client")
	instance, err := newCatPrinterClientWithRetry()
	if err != nil {
		return nil, err
	}
	latestPrinter = instance
	return instance, nil
}

func ConnectBluetoothPrinter(c *catprinter.Client, address string) error {
	if c == nil {
		return nil
	}

	// Skip if already connected (and not reconnecting)
	if isConnected && !isReconnecting {
		return nil
	}

	// DRY-RUNモードでも実際のプリンターに接続
	if env.Value.DryRunMode {
		logger.Info("Connecting to printer in DRY-RUN mode", zap.String("address", address))
	} else {
		logger.Info("Connecting to printer", zap.String("address", address))
	}

	err := c.Connect(address)
	if err != nil {
		// 接続失敗時のステータス更新
		// 再接続中の場合は、一時的なエラーの可能性があるためステータスを更新しない
		// （オーバーレイ表示への影響を最小化）
		if !isReconnecting {
			status.SetPrinterConnected(false)
		}
		isConnected = false
		// エラー時も再接続フラグをクリア
		isReconnecting = false
		return err
	}

	logger.Info("Successfully connected to printer, waiting for stabilization...", zap.String("address", address))

	// 接続安定待ち
	// BLE接続直後のパラメータネゴシエーション（MTU, Connection Interval等）完了を待つ
	logger.Info("Waiting 1s for connection stabilization...")
	time.Sleep(1000 * time.Millisecond)

	isConnected = true

	// 再接続が完了したらフラグをクリア
	isReconnecting = false

	// 常にステータスを更新（再接続完了時も含む）
	status.SetPrinterConnected(true)

	return nil
}

func SetupBluetoothOptions(bestQuality, dither, autoRotate bool, blackPoint float32) error {
	// Set up the printer options
	opts = catprinter.NewOptions().
		SetBestQuality(bestQuality).
		SetDither(dither).
		SetAutoRotate(autoRotate).
		SetBlackPoint(float32(blackPoint))

	return nil
}

// StopBluetoothClient gracefully disconnects the Bluetooth printer and releases BLE device
func StopBluetoothClient() {
	if latestPrinter != nil {
		if isConnected {
			latestPrinter.Disconnect()
			isConnected = false
			status.SetPrinterConnected(false)
		}
		// Stop()を呼ぶとBLEデバイスも解放される
		latestPrinter.Stop()
		latestPrinter = nil
		isReconnecting = false // 再接続フラグもクリア
		logger.Info("Printer client stopped and BLE device released")
	}
}

// MarkInitialPrintDone marks that the initial print has been completed
func MarkBluetoothInitialPrintDone() {
	hasInitialPrintBeenDone = true
}

// IsBluetoothConnected returns whether the Bluetooth printer is connected
func IsBluetoothConnected() bool {
	return isConnected
}

// HasBluetoothInitialPrintBeenDone returns whether the initial print has been done
func HasBluetoothInitialPrintBeenDone() bool {
	return hasInitialPrintBeenDone
}

// GetLatestBluetoothPrinter returns the current printer client
func GetLatestBluetoothPrinter() *catprinter.Client {
	return latestPrinter
}

// IsBluetoothReconnecting returns whether the printer is in reconnection process
func IsBluetoothReconnecting() bool {
	return isReconnecting
}

// SetBluetoothReconnecting sets the reconnection flag
func SetBluetoothReconnecting(reconnecting bool) {
	isReconnecting = reconnecting
}

// EnsureBluetoothConnection ensures a Bluetooth client is connected for keep-alive usage.
func EnsureBluetoothConnection(address string) error {
	if address == "" {
		return fmt.Errorf("bluetooth address is required")
	}
	if latestPrinter == nil {
		client, err := SetupBluetoothClient()
		if err != nil {
			return err
		}
		return ConnectBluetoothPrinter(client, address)
	}
	return ConnectBluetoothPrinter(latestPrinter, address)
}

// RefreshBluetoothConnection performs a keep-alive reconnect using the existing client.
func RefreshBluetoothConnection(address string) error {
	if address == "" {
		return fmt.Errorf("bluetooth address is required")
	}

	if latestPrinter == nil {
		return EnsureBluetoothConnection(address)
	}

	SetBluetoothReconnecting(true)
	if isConnected {
		latestPrinter.Disconnect()
		isConnected = false
	}

	time.Sleep(500 * time.Millisecond)

	if err := ConnectBluetoothPrinter(latestPrinter, address); err != nil {
		if shouldForceBluetoothReset(err) {
			StopBluetoothClient()
			client, resetErr := SetupBluetoothClient()
			if resetErr != nil {
				return resetErr
			}
			return ConnectBluetoothPrinter(client, address)
		}
		return err
	}

	return nil
}

func shouldForceBluetoothReset(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already exists") ||
		strings.Contains(msg, "connection canceled") ||
		strings.Contains(msg, "can't dial") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "bluetooth")
}

// SetupBluetoothScannerClient creates a new client for scanning without affecting existing connection
func SetupBluetoothScannerClient() (*catprinter.Client, error) {
	logger.Info("Creating scanner client (independent from main connection)")

	if err := ensureBluetoothSafeToUse(); err != nil {
		return nil, err
	}

	// 新規クライアント作成（既存の接続に影響しない）
	instance, err := newCatPrinterClientWithRetry()
	if err != nil {
		return nil, err
	}

	// グローバル変数を更新しない（独立したクライアント）
	return instance, nil
}

// ReconnectPrinter forces a complete reconnection to the printer
func ReconnectBluetoothPrinter(address string) error {
	logger.Info("Starting forced printer reconnection", zap.String("address", address))

	// まず既存の接続を完全に切断
	if latestPrinter != nil {
		logger.Info("Disconnecting existing printer")
		if isConnected {
			latestPrinter.Disconnect()
			isConnected = false
		}
		latestPrinter.Stop()
		latestPrinter = nil

		// Bluetoothリソースの解放を待つ
		// 500ms -> 2000msに延長
		time.Sleep(2000 * time.Millisecond)
	}

	// 接続状態をクリア
	isConnected = false
	isReconnecting = false
	status.SetPrinterConnected(false)

	// 新規クライアント作成
	logger.Info("Creating new printer client for reconnection")
	if err := ensureBluetoothSafeToUse(); err != nil {
		return err
	}
	client, err := newCatPrinterClientWithRetry()
	if err != nil {
		logger.Error("Failed to create new client", zap.Error(err))
		return err
	}

	latestPrinter = client

	// プリンターオプションは後で SetupBluetoothOptions で設定される

	// 接続を実行
	logger.Info("Connecting to printer", zap.String("address", address))
	err = client.Connect(address)
	if err != nil {
		logger.Error("Failed to connect", zap.Error(err))
		status.SetPrinterConnected(false)
		return err
	}

	logger.Info("Successfully reconnected to printer, waiting for stabilization...", zap.String("address", address))

	// 接続安定待ち
	time.Sleep(1000 * time.Millisecond)

	isConnected = true
	status.SetPrinterConnected(true)

	return nil
}
