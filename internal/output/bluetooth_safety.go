package output

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

func isRunningInAppBundleDarwin() bool {
	if runtime.GOOS != "darwin" {
		return false
	}
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	// When launched as a proper macOS app (via LaunchServices), the executable lives under:
	//   Something.app/Contents/MacOS/<exe>
	// BLE access from a plain CLI process can SIGABRT if usage descriptions aren't available.
	return strings.Contains(exe, ".app/Contents/MacOS/")
}

// ensureBluetoothSafeToUse prevents macOS-specific abort traps when CoreBluetooth is touched
// from a non-bundled CLI process (missing Info.plist usage descriptions).
//
// Returning an error here keeps the server alive and surfaces a useful message to the WebUI.
func ensureBluetoothSafeToUse() error {
	if runtime.GOOS != "darwin" {
		return nil
	}
	if isRunningInAppBundleDarwin() {
		return nil
	}
	return fmt.Errorf("macOSのBluetooth機能は .app から起動しないと abort trap で落ちることがあるだす（`task dev` で起動するだす）")
}

func wrapBluetoothInitError(err error) error {
	if err == nil {
		return nil
	}
	// Improve the common go-ble error message on macOS.
	if runtime.GOOS == "darwin" && strings.Contains(err.Error(), "central manager has invalid state") {
		return fmt.Errorf("%w (macOS: Bluetoothがオンか、システム設定 > プライバシーとセキュリティ > Bluetooth でこのアプリを許可するだす)", err)
	}
	return err
}

