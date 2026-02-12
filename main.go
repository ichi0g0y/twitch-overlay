package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:web/dist all:frontend/dist
var webAssets embed.FS

// spaHandler creates a custom HTTP handler that serves index.html for non-existent paths
// This enables React Router to work correctly with client-side routing
func spaHandler(embedFS embed.FS) http.Handler {
	// Create a sub-filesystem for the frontend/dist directory
	dist, err := fs.Sub(embedFS, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Try to open the requested file
		file, err := dist.Open(path[1:]) // Remove leading slash
		if err == nil {
			// File exists, serve it
			file.Close()
			http.FileServer(http.FS(dist)).ServeHTTP(w, r)
			return
		}

		// File doesn't exist, check if it's a directory
		if path != "/" {
			dirFile, dirErr := dist.Open(path[1:] + "/index.html")
			if dirErr == nil {
				dirFile.Close()
				http.FileServer(http.FS(dist)).ServeHTTP(w, r)
				return
			}
		}

		// Neither file nor directory exists, serve index.html for SPA routing
		r.URL.Path = "/"
		http.FileServer(http.FS(dist)).ServeHTTP(w, r)
	})
}

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
			Handler: spaHandler(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	// Store app reference for later use (notification windows, etc)
	appInstance.wailsApp = app

	// Create main window (Settings screen) - Hidden initially for position restoration
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Twitch Overlay Settings",
		MinWidth:         400,
		MinHeight:        400,
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
		Hidden:           true, // Hide until position is restored
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})

	// Store mainWindow reference
	appInstance.mainWindow = mainWindow

	// Register WindowRuntimeReady event handler for window state restoration
	mainWindow.OnWindowEvent(events.Common.WindowRuntimeReady, func(e *application.WindowEvent) {
		// Window runtime is ready - now we can safely restore position and show the window
		appInstance.restoreWindowState()
	})

	// Register WindowClosing event handler to quit app when main window is closed
	mainWindow.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		// Quit the application - Shutdown() will be automatically called
		app.Quit()
	})

	// Initialize the application (database, etc.) before running
	// This must be called before WindowRuntimeReady to ensure database is ready
	ctx := context.Background()
	appInstance.Startup(ctx)

	// Run the application
	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}
