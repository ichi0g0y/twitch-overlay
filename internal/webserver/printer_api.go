package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type BluetoothDevice struct {
	MACAddress     string    `json:"mac_address"`
	Name           string    `json:"name,omitempty"`
	SignalStrength int       `json:"signal_strength,omitempty"`
	LastSeen       time.Time `json:"last_seen"`
}

type ScanResponse struct {
	Devices []BluetoothDevice `json:"devices"`
	Status  string            `json:"status"`
	Message string            `json:"message,omitempty"`
}

type TestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// handlePrinterScan プリンターデバイスのスキャンを実行
func handlePrinterScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Starting printer scan")

	// プリンタースキャンを実行
	c, err := output.SetupBluetoothClient()
	if err != nil {
		logger.Error("Failed to setup scanner", zap.Error(err))
		http.Error(w, "Failed to setup scanner", http.StatusInternalServerError)
		return
	}
	defer c.Stop()

	// デバッグログを有効にする（find-faxと同じ設定）
	c.Debug.Log = true

	// 10秒間スキャン
	c.Timeout = 10 * time.Second
	devices, err := c.ScanDevices("")

	response := ScanResponse{
		Devices: []BluetoothDevice{},
		Status:  "success",
	}

	if err != nil {
		logger.Error("Device scan failed", zap.Error(err))
		response.Status = "error"
		response.Message = err.Error()
	} else {
		logger.Info("Device scan completed", zap.Int("device_count", len(devices)))
		for mac, name := range devices {
			device := BluetoothDevice{
				MACAddress: mac,
				Name:       string(name),
				LastSeen:   time.Now(),
			}
			response.Devices = append(response.Devices, device)
			logger.Debug("Found device", zap.String("mac", mac), zap.String("name", string(name)))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handlePrinterTest 指定されたプリンターの接続テスト（WebSocket対応）
func handlePrinterTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		MACAddress   string `json:"mac_address"`
		PrinterType  string `json:"printer_type"`
		PrinterName  string `json:"printer_name"`
		UseWebSocket bool   `json:"use_websocket"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// プリンタータイプの確認
	if req.PrinterType == "" {
		req.PrinterType = "bluetooth" // デフォルトはBluetooth（後方互換性）
	}

	// 必要なパラメータチェック
	if req.PrinterType == "bluetooth" {
		if req.MACAddress == "" {
			http.Error(w, "MAC address is required for Bluetooth printer", http.StatusBadRequest)
			return
		}
	} else if req.PrinterType == "usb" {
		if req.PrinterName == "" {
			http.Error(w, "Printer name is required for USB printer", http.StatusBadRequest)
			return
		}
	} else {
		http.Error(w, "Invalid printer type", http.StatusBadRequest)
		return
	}

	// WebSocketの場合はアップグレード
	if req.UseWebSocket {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logger.Error("Failed to upgrade to WebSocket", zap.Error(err))
			return
		}
		defer conn.Close()

		// 進捗を送信する関数
		sendProgress := func(step string, status string, detail string) {
			progress := map[string]interface{}{
				"step":      step,
				"status":    status,
				"detail":    detail,
				"timestamp": time.Now(),
			}
			conn.WriteJSON(progress)
		}

		var testErr error

		if req.PrinterType == "bluetooth" {
			sendProgress("setup", "starting", "Bluetoothプリンターセットアップを開始...")
			logger.Info("Testing Bluetooth printer connection via WebSocket", zap.String("mac_address", req.MACAddress))

			// Bluetoothプリンター接続テスト
			c, err := output.SetupBluetoothClient()
			if err != nil {
				sendProgress("setup", "error", fmt.Sprintf("セットアップ失敗: %v", err))
				logger.Error("Failed to setup Bluetooth printer", zap.Error(err))
				testErr = err
			} else {
				sendProgress("setup", "completed", "セットアップ完了")
				sendProgress("connect", "starting", fmt.Sprintf("アドレス %s に接続中...", req.MACAddress))

				testErr = output.ConnectBluetoothPrinter(c, req.MACAddress)

				if testErr != nil {
					sendProgress("connect", "error", fmt.Sprintf("接続失敗: %v", testErr))
					logger.Error("Bluetooth printer connection test failed", zap.String("mac_address", req.MACAddress), zap.Error(testErr))
				} else {
					sendProgress("connect", "completed", "接続成功！")
					logger.Info("Bluetooth printer connection test successful", zap.String("mac_address", req.MACAddress))
					sendProgress("test", "info", "接続テストが完了しました。設定から「印刷テスト」を実行できます。")
				}
			}
		} else if req.PrinterType == "usb" {
			sendProgress("setup", "starting", "USBプリンター確認を開始...")
			logger.Info("Testing USB printer connection via WebSocket", zap.String("printer_name", req.PrinterName))

			// USBプリンター存在確認
			printers, err := output.GetSystemPrinters()
			if err != nil {
				sendProgress("setup", "error", fmt.Sprintf("システムプリンター取得失敗: %v", err))
				logger.Error("Failed to get system printers", zap.Error(err))
				testErr = err
			} else {
				sendProgress("setup", "completed", "システムプリンター一覧取得完了")
				sendProgress("connect", "starting", fmt.Sprintf("プリンター %s を確認中...", req.PrinterName))

				// プリンター名が一覧に存在するか確認
				found := false
				for _, p := range printers {
					if p.Name == req.PrinterName {
						found = true
						sendProgress("connect", "completed", fmt.Sprintf("プリンター %s が見つかりました！（状態: %s）", p.Name, p.Status))
						logger.Info("USB printer found", zap.String("printer_name", req.PrinterName), zap.String("status", p.Status))
						sendProgress("test", "info", "プリンターが正常に認識されています。設定から「印刷テスト」を実行できます。")
						break
					}
				}

				if !found {
					testErr = fmt.Errorf("printer '%s' not found in system", req.PrinterName)
					sendProgress("connect", "error", fmt.Sprintf("プリンター %s が見つかりません", req.PrinterName))
					logger.Error("USB printer not found", zap.String("printer_name", req.PrinterName))
				}
			}
		}

		// 最終結果
		finalResult := map[string]interface{}{
			"success": testErr == nil,
			"message": func() string {
				if testErr == nil {
					return "接続テスト成功"
				}
				return testErr.Error()
			}(),
			"completed": true,
		}
		conn.WriteJSON(finalResult)
		
	} else {
		// 通常のHTTPレスポンス（後方互換性のため）
		var testErr error
		var message string

		if req.PrinterType == "bluetooth" {
			logger.Info("Testing Bluetooth printer connection", zap.String("mac_address", req.MACAddress))

			// Bluetoothプリンター接続テスト
			c, err := output.SetupBluetoothClient()
			if err != nil {
				logger.Error("Failed to setup Bluetooth printer", zap.Error(err))
				testErr = err
				message = fmt.Sprintf("Failed to setup printer: %v", err)
			} else {
				testErr = output.ConnectBluetoothPrinter(c, req.MACAddress)

				if testErr != nil {
					logger.Error("Bluetooth printer connection test failed", zap.String("mac_address", req.MACAddress), zap.Error(testErr))
					message = testErr.Error()
				} else {
					logger.Info("Bluetooth printer connection test successful", zap.String("mac_address", req.MACAddress))
					message = "Connection successful"
				}
			}
		} else if req.PrinterType == "usb" {
			logger.Info("Testing USB printer connection", zap.String("printer_name", req.PrinterName))

			// USBプリンター存在確認
			printers, err := output.GetSystemPrinters()
			if err != nil {
				logger.Error("Failed to get system printers", zap.Error(err))
				testErr = err
				message = fmt.Sprintf("Failed to get system printers: %v", err)
			} else {
				// プリンター名が一覧に存在するか確認
				found := false
				for _, p := range printers {
					if p.Name == req.PrinterName {
						found = true
						logger.Info("USB printer found", zap.String("printer_name", req.PrinterName), zap.String("status", p.Status))
						message = fmt.Sprintf("Printer found: %s (status: %s)", p.Name, p.Status)
						break
					}
				}

				if !found {
					testErr = fmt.Errorf("printer '%s' not found in system", req.PrinterName)
					logger.Error("USB printer not found", zap.String("printer_name", req.PrinterName))
					message = testErr.Error()
				}
			}
		}

		response := TestResponse{
			Success: testErr == nil,
			Message: message,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			logger.Error("Failed to encode response", zap.Error(err))
			http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		}
	}
}

// handlePrinterStatus プリンターの現在の状態を取得
func handlePrinterStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get dry-run mode from environment
	dryRunMode := env.Value.DryRunMode
	
	// Get printer address
	printerAddress := ""
	if env.Value.PrinterAddress != nil {
		printerAddress = *env.Value.PrinterAddress
	}

	// Get printer type and USB printer name
	printerType := env.Value.PrinterType
	usbPrinterName := env.Value.USBPrinterName

	// Get printer connection status
	isConnected := false
	switch printerType {
	case "bluetooth":
		isConnected = output.IsBluetoothConnected()
	case "usb":
		isConnected = output.IsUSBPrinterAvailable(usbPrinterName)
	}

	// プリンター設定済みかどうか
	configured := false
	if printerType == "bluetooth" && printerAddress != "" {
		configured = true
	} else if printerType == "usb" && usbPrinterName != "" {
		configured = true
	}

	response := map[string]interface{}{
		"connected":        isConnected,
		"dry_run_mode":     dryRunMode,
		"printer_address":  printerAddress,
		"printer_type":     printerType,
		"usb_printer_name": usbPrinterName,
		"configured":       configured,
		"print_queue":      output.GetPrintQueueSize(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSystemPrinters システムプリンター一覧を取得
func handleSystemPrinters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Getting system printers")

	printers, err := output.GetSystemPrinters()
	if err != nil {
		logger.Error("Failed to get system printers", zap.Error(err))
		http.Error(w, "Failed to get system printers", http.StatusInternalServerError)
		return
	}

	logger.Info("System printers retrieved", zap.Int("count", len(printers)))

	response := map[string]interface{}{
		"printers": printers,
		"count":    len(printers),
		"status":   "success",
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.Error("Failed to encode response", zap.Error(err))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}
