package output

import (
	"strings"
	"time"

	"git.massivebox.net/massivebox/go-catprinter"
)

func shouldRetryDarwinDeviceInit(err error) bool {
	if err == nil {
		return false
	}
	// go-ble/cbgo sometimes returns ManagerStateUnknown (have=0) briefly after startup.
	// Retrying avoids flaky "scan failed" right after launch.
	msg := err.Error()
	return strings.Contains(msg, "central manager has invalid state") && strings.Contains(msg, "have=0")
}

func newCatPrinterClientWithRetry() (*catprinter.Client, error) {
	var lastErr error

	// Retry a bit on macOS while the CentralManager state is still "unknown".
	for attempt := 0; attempt < 6; attempt++ {
		c, err := catprinter.NewClient()
		if err == nil {
			return c, nil
		}
		lastErr = err

		if shouldRetryDarwinDeviceInit(err) {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		break
	}

	return nil, wrapBluetoothInitError(lastErr)
}

