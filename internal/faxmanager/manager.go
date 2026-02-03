package faxmanager

import (
	"fmt"
	"image"
	"os"
	"path/filepath"
	"sync"
	"time"

	gonanoid "github.com/matoous/go-nanoid/v2"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/paths"
	"go.uber.org/zap"
)

type Fax struct {
	ID        string
	UserName  string
	Message   string
	ImageURL  string
	AvatarURL string // User avatar URL
	Timestamp time.Time
	ColorPath string
	MonoPath  string
}

var (
	faxStorage = make(map[string]*Fax)
	mu         sync.RWMutex
)

// InitializeDataDir initializes the data directory for storing fax images
func InitializeDataDir() {
	if err := os.MkdirAll(paths.GetOutputDir(), 0755); err != nil {
		logger.Error("Failed to create data directory", zap.Error(err))
	}
}

// GetRecentFaxes returns the most recent fax messages
func GetRecentFaxes(limit int) ([]*Fax, error) {
	mu.RLock()
	defer mu.RUnlock()

	faxes := make([]*Fax, 0, len(faxStorage))
	for _, fax := range faxStorage {
		faxes = append(faxes, fax)
	}

	// Sort by timestamp (newest first)
	for i := 0; i < len(faxes)-1; i++ {
		for j := i + 1; j < len(faxes); j++ {
			if faxes[i].Timestamp.Before(faxes[j].Timestamp) {
				faxes[i], faxes[j] = faxes[j], faxes[i]
			}
		}
	}

	// Limit the results
	if limit > 0 && limit < len(faxes) {
		faxes = faxes[:limit]
	}

	return faxes, nil
}

// GenerateID creates a new nanoid
func GenerateID() (string, error) {
	return gonanoid.New()
}

// SaveFax saves both color and mono images and registers them
func SaveFax(userName string, message string, imageURL string, avatarURL string, colorImg, monoImg image.Image) (*Fax, error) {
	id, err := GenerateID()
	if err != nil {
		return nil, fmt.Errorf("failed to generate ID: %w", err)
	}

	outputDir := paths.GetOutputDir()
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create output directory: %w", err)
	}

	// Save paths
	colorPath := filepath.Join(outputDir, fmt.Sprintf("%s_color.png", id))
	monoPath := filepath.Join(outputDir, fmt.Sprintf("%s_mono.png", id))

	// Create fax record
	fax := &Fax{
		ID:        id,
		UserName:  userName,
		Message:   message,
		ImageURL:  imageURL,
		AvatarURL: avatarURL,
		Timestamp: time.Now(),
		ColorPath: colorPath,
		MonoPath:  monoPath,
	}

	// Store in memory
	mu.Lock()
	faxStorage[id] = fax
	mu.Unlock()

	// Schedule deletion after 10 minutes
	scheduleDeletion(id)

	logger.Info("Fax saved", 
		zap.String("id", id),
		zap.String("userName", userName),
		zap.String("colorPath", colorPath),
		zap.String("monoPath", monoPath))

	return fax, nil
}

// GetFax retrieves a fax by ID
func GetFax(id string) (*Fax, bool) {
	mu.RLock()
	defer mu.RUnlock()
	fax, exists := faxStorage[id]
	return fax, exists
}

// scheduleDeletion sets up automatic deletion after 10 minutes
func scheduleDeletion(id string) {
	time.AfterFunc(10*time.Minute, func() {
		deleteFax(id)
	})
}

// deleteFax removes fax from storage and deletes files
func deleteFax(id string) {
	mu.Lock()
	fax, exists := faxStorage[id]
	if exists {
		delete(faxStorage, id)
	}
	mu.Unlock()

	if !exists {
		return
	}

	// Delete files
	if err := os.Remove(fax.ColorPath); err != nil && !os.IsNotExist(err) {
		logger.Error("Failed to delete color image", zap.Error(err))
	}
	if err := os.Remove(fax.MonoPath); err != nil && !os.IsNotExist(err) {
		logger.Error("Failed to delete mono image", zap.Error(err))
	}

	logger.Info("Fax deleted", zap.String("id", id))
}

// GetImagePath returns the path for the requested image type
func GetImagePath(id string, imageType string) (string, error) {
	fax, exists := GetFax(id)
	if !exists {
		return "", fmt.Errorf("fax not found")
	}

	switch imageType {
	case "color":
		return fax.ColorPath, nil
	case "mono":
		return fax.MonoPath, nil
	default:
		return "", fmt.Errorf("invalid image type: %s", imageType)
	}
}