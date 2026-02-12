package webserver

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/fontmanager"
)

func handleFontFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filename, data, err := fontmanager.GetCustomFontFile()
	if err != nil {
		if err == fontmanager.ErrNoCustomFont {
			http.Error(w, "No custom font configured", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to load custom font", http.StatusInternalServerError)
		return
	}

	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".ttf":
		w.Header().Set("Content-Type", "font/ttf")
	case ".otf":
		w.Header().Set("Content-Type", "font/otf")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	// Font updates should be reflected quickly; keep caching conservative.
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

