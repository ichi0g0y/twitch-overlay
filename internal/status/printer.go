package status

import (
	"sync"
	"github.com/nantokaworks/twitch-overlay/internal/broadcast"
)

// PrinterStatusChangeCallback is called when printer connection status changes
type PrinterStatusChangeCallback func(connected bool)

var (
	mu                sync.RWMutex
	printerConnected  bool
	printerCallbacks  []PrinterStatusChangeCallback
)

// SetPrinterConnected sets the printer connection status
func SetPrinterConnected(connected bool) {
	mu.Lock()
	previousStatus := printerConnected
	printerConnected = connected
	callbacks := make([]PrinterStatusChangeCallback, len(printerCallbacks))
	copy(callbacks, printerCallbacks)
	mu.Unlock()

	// 状態が変更された場合はSSEで通知
	if previousStatus != connected {
		eventType := "printer_disconnected"
		if connected {
			eventType = "printer_connected"
		}

		broadcast.Send(map[string]interface{}{
			"type": eventType,
			"data": map[string]interface{}{
				"connected": connected,
			},
		})

		// コールバックを実行
		for _, callback := range callbacks {
			if callback != nil {
				callback(connected)
			}
		}
	}
}

// IsPrinterConnected returns the printer connection status
func IsPrinterConnected() bool {
	mu.RLock()
	defer mu.RUnlock()
	return printerConnected
}

// RegisterPrinterStatusChangeCallback registers a callback for printer status changes
func RegisterPrinterStatusChangeCallback(callback PrinterStatusChangeCallback) {
	mu.Lock()
	defer mu.Unlock()
	printerCallbacks = append(printerCallbacks, callback)
}