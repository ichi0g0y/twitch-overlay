package main

import (
	"context"
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:web/dist
var webAssets embed.FS

func main() {
	// Create an instance of the app structure
	appInstance := NewApp()

	// Set web assets for the web server
	appInstance.SetWebAssets(&webAssets)

	// Create a new Wails application
	app := application.New(application.Options{
		Name:        "twitch-overlay",
		Description: "Twitch overlay application with thermal printer support",
		Services: []application.Service{
			application.NewService(appInstance),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Store app reference for later use (notification windows, etc)
	appInstance.wailsApp = app

	// Create main window (Settings screen)
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Twitch Overlay Settings",
		Width:            1024,
		Height:           768,
		MinWidth:         400,
		MinHeight:        400,
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})

	// Store mainWindow reference
	appInstance.mainWindow = mainWindow

	// Call startup logic with a context
	ctx := context.Background()
	appInstance.startup(ctx)

	// Run the application
	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}
