package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:web/dist
var webAssets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Set web assets for the web server
	app.SetWebAssets(&webAssets)

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "twitch-overlay",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour:  &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:         app.startup,
		OnShutdown:        app.shutdown,
		DisableResize:     false,
		Frameless:         false,
		MinWidth:          400,
		MinHeight:         400,
		AlwaysOnTop:       false,
		HideWindowOnClose: false,
		StartHidden:       true, // ウィンドウを隠した状態で起動
		// UI状態復元関連の設定
		EnableDefaultContextMenu: false,
		EnableFraudulentWebsiteDetection: false,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
