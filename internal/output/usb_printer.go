package output

import (
	"fmt"
	"image"
	"image/png"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// USBPrinter はUSB接続プリンター（CUPS経由）の実装
type USBPrinter struct {
	printerName string
	config      PrinterConfig
	tempDir     string
}

// SystemPrinter はシステムプリンター情報
type SystemPrinter struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

// NewUSBPrinter は新しいUSBプリンターインスタンスを作成する
func NewUSBPrinter(config PrinterConfig) (*USBPrinter, error) {
	// プリンター名の検証
	if config.USBPrinterName == "" {
		return nil, fmt.Errorf("USB printer name is required")
	}

	// システムプリンターの存在確認
	if !isSystemPrinterAvailable(config.USBPrinterName) {
		return nil, fmt.Errorf("printer %s not found in system", config.USBPrinterName)
	}

	// 一時ファイル用ディレクトリ
	tempDir := filepath.Join(os.TempDir(), "twitch-overlay-print")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}

	logger.Info("USB printer initialized",
		zap.String("printer", config.USBPrinterName),
		zap.String("temp_dir", tempDir))

	return &USBPrinter{
		printerName: config.USBPrinterName,
		config:      config,
		tempDir:     tempDir,
	}, nil
}

// Connect はプリンターに接続する（USB/CUPSプリンターは常時接続不要）
func (p *USBPrinter) Connect() error {
	// プリンター存在確認のみ
	if !isSystemPrinterAvailable(p.printerName) {
		return fmt.Errorf("printer %s is not available", p.printerName)
	}
	logger.Info("USB printer connection check passed", zap.String("printer", p.printerName))
	return nil
}

// Print は画像を印刷する
func (p *USBPrinter) Print(img image.Image) error {
	// 1. プリンター存在確認
	if !isSystemPrinterAvailable(p.printerName) {
		return fmt.Errorf("printer %s is not available", p.printerName)
	}

	// 2. 一時ファイル作成
	tempFile := filepath.Join(p.tempDir, fmt.Sprintf("print_%d.png", time.Now().UnixNano()))

	// 3. 画像の回転処理
	finalImg := img
	if p.config.RotatePrint {
		logger.Info("Rotating image 180 degrees for USB printer")
		finalImg = rotateImage180(img)
	}

	// 4. PNG保存
	f, err := os.Create(tempFile)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer f.Close()
	defer os.Remove(tempFile) // 印刷後に一時ファイル削除

	if err := png.Encode(f, finalImg); err != nil {
		return fmt.Errorf("failed to encode image: %w", err)
	}
	f.Close()

	logger.Info("Image saved to temp file",
		zap.String("file", tempFile),
		zap.Int("width", finalImg.Bounds().Dx()),
		zap.Int("height", finalImg.Bounds().Dy()))

	// 5. lpr コマンドで印刷
	// 画像サイズに応じて動的に用紙サイズを指定
	imgWidth := finalImg.Bounds().Dx()
	imgHeight := finalImg.Bounds().Dy()

	// ピクセル → mm 変換（53mm幅に正規化）
	widthMM := 53
	heightMM := int(math.Ceil(float64(imgHeight) * 53.0 / float64(imgWidth)))

	logger.Info("Calculated paper size",
		zap.Int("width_mm", widthMM),
		zap.Int("height_mm", heightMM))

	cmd := exec.Command("lpr", "-P", p.printerName,
		"-o", fmt.Sprintf("media=Custom.%dx%dmm", widthMM, heightMM),
		tempFile)
	output, err := cmd.CombinedOutput()
	if err != nil {
		logger.Error("lpr command failed",
			zap.String("printer", p.printerName),
			zap.String("error", err.Error()),
			zap.String("output", string(output)))
		return fmt.Errorf("lpr failed: %w (output: %s)", err, string(output))
	}

	logger.Info("USB printer: print job sent successfully",
		zap.String("printer", p.printerName),
		zap.String("file", tempFile))

	return nil
}

// Disconnect はプリンター接続を切断する（USB/CUPSプリンターは切断不要）
func (p *USBPrinter) Disconnect() error {
	// USB/CUPSプリンターは切断不要
	return nil
}

// Type はプリンター種類を返す
func (p *USBPrinter) Type() PrinterType {
	return PrinterTypeUSB
}

// IsConnected は接続状態を返す
func (p *USBPrinter) IsConnected() bool {
	// システムプリンターの状態確認
	return isSystemPrinterAvailable(p.printerName)
}

// IsUSBPrinterAvailable はシステムプリンターの存在確認（外部用）
func IsUSBPrinterAvailable(name string) bool {
	if name == "" {
		return false
	}
	return isSystemPrinterAvailable(name)
}

// isSystemPrinterAvailable はシステムプリンターの存在確認
func isSystemPrinterAvailable(name string) bool {
	cmd := exec.Command("lpstat", "-p", name)
	err := cmd.Run()
	return err == nil
}

// GetSystemPrinters はシステムに登録されているプリンター一覧を取得
func GetSystemPrinters() ([]SystemPrinter, error) {
	cmd := exec.Command("lpstat", "-p")
	output, err := cmd.Output()
	if err != nil {
		logger.Error("lpstat command failed", zap.Error(err))
		return nil, fmt.Errorf("lpstat failed: %w", err)
	}

	// "printer NAME is idle." のような行をパース
	var printers []SystemPrinter
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "printer ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				printerName := parts[1]
				status := "unknown"
				if len(parts) >= 4 {
					status = strings.Join(parts[2:], " ")
				}
				printers = append(printers, SystemPrinter{
					Name:   printerName,
					Status: status,
				})
			}
		}
	}

	logger.Info("System printers retrieved", zap.Int("count", len(printers)))
	return printers, nil
}
