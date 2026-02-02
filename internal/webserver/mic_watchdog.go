package webserver

import (
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

const micRecogClientID = "mic-recog"

type micRecogState struct {
	mu             sync.RWMutex
	lastSeen       time.Time
	lastStart      time.Time
	lastRestart    time.Time
	connected      bool
	lastConnected  time.Time
	lastDisconnect time.Time
}

var micRecogStateStore = &micRecogState{}
var micRecogWatchdogOnce sync.Once

type micRecogSnapshot struct {
	lastSeen       time.Time
	lastStart      time.Time
	lastRestart    time.Time
	connected      bool
	lastConnected  time.Time
	lastDisconnect time.Time
}

func markMicRecogConnected(clientID string) {
	if clientID != micRecogClientID {
		return
	}
	now := time.Now()
	micRecogStateStore.mu.Lock()
	micRecogStateStore.connected = true
	micRecogStateStore.lastSeen = now
	micRecogStateStore.lastConnected = now
	micRecogStateStore.mu.Unlock()
}

func markMicRecogDisconnected(clientID string) {
	if clientID != micRecogClientID {
		return
	}
	now := time.Now()
	micRecogStateStore.mu.Lock()
	micRecogStateStore.connected = false
	micRecogStateStore.lastDisconnect = now
	micRecogStateStore.mu.Unlock()
}

func markMicRecogSeen(clientID string) {
	if clientID != micRecogClientID {
		return
	}
	now := time.Now()
	micRecogStateStore.mu.Lock()
	micRecogStateStore.lastSeen = now
	micRecogStateStore.mu.Unlock()
}

func markMicRecogStart(now time.Time) {
	micRecogStateStore.mu.Lock()
	micRecogStateStore.lastStart = now
	micRecogStateStore.mu.Unlock()
}

func markMicRecogRestart(now time.Time) {
	micRecogStateStore.mu.Lock()
	micRecogStateStore.lastRestart = now
	micRecogStateStore.lastStart = now
	micRecogStateStore.lastSeen = time.Time{}
	micRecogStateStore.connected = false
	micRecogStateStore.mu.Unlock()
}

func snapshotMicRecogState() micRecogSnapshot {
	micRecogStateStore.mu.RLock()
	defer micRecogStateStore.mu.RUnlock()
	return micRecogSnapshot{
		lastSeen:       micRecogStateStore.lastSeen,
		lastStart:      micRecogStateStore.lastStart,
		lastRestart:    micRecogStateStore.lastRestart,
		connected:      micRecogStateStore.connected,
		lastConnected:  micRecogStateStore.lastConnected,
		lastDisconnect: micRecogStateStore.lastDisconnect,
	}
}

func StartMicRecogWatchdog() {
	micRecogWatchdogOnce.Do(func() {
		go runMicRecogWatchdog()
		logger.Info("mic-recog watchdog started")
	})
}

func runMicRecogWatchdog() {
	wasRunning := false
	for {
		checkSeconds := micWatchdogGetIntSetting("MIC_RECOG_WATCHDOG_CHECK_SECONDS", 10)
		if checkSeconds < 3 {
			checkSeconds = 3
		}
		time.Sleep(time.Duration(checkSeconds) * time.Second)

		if !micWatchdogGetBoolSetting("MIC_RECOG_WATCHDOG_ENABLED", true) {
			continue
		}

		if !micWatchdogGetBoolSetting("MIC_RECOG_ENABLED", true) {
			continue
		}

		if micRecogManager == nil {
			continue
		}

		running := micRecogManager.IsRunning()
		now := time.Now()
		if running && !wasRunning {
			markMicRecogStart(now)
		}

		if !running {
			tryMicRecogRestart("process not running")
			wasRunning = running
			continue
		}

		state := snapshotMicRecogState()
		graceSeconds := micWatchdogGetIntSetting("MIC_RECOG_WATCHDOG_GRACE_SECONDS", 30)
		idleSeconds := micWatchdogGetIntSetting("MIC_RECOG_WATCHDOG_IDLE_SECONDS", 90)

		if state.lastSeen.IsZero() {
			if !state.lastStart.IsZero() && now.Sub(state.lastStart) > time.Duration(graceSeconds)*time.Second {
				tryMicRecogRestart("no messages since start")
			}
			wasRunning = running
			continue
		}

		if now.Sub(state.lastSeen) > time.Duration(idleSeconds)*time.Second {
			tryMicRecogRestart("no messages within idle timeout")
		}

		wasRunning = running
	}
}

func tryMicRecogRestart(reason string) {
	state := snapshotMicRecogState()
	cooldownSeconds := micWatchdogGetIntSetting("MIC_RECOG_WATCHDOG_COOLDOWN_SECONDS", 30)
	if cooldownSeconds < 1 {
		cooldownSeconds = 1
	}
	if !state.lastRestart.IsZero() {
		if time.Since(state.lastRestart) < time.Duration(cooldownSeconds)*time.Second {
			return
		}
	}

	logger.Warn("mic-recog watchdog restarting", zap.String("reason", reason))
	stopped := micRecogManager.Stop()
	time.Sleep(300 * time.Millisecond)

	port := env.Value.ServerPort
	if port == 0 {
		port = 8080
	}

	if err := micRecogManager.Start(port); err != nil {
		logger.Warn("mic-recog watchdog restart failed", zap.Error(err))
	}

	if !stopped {
		logger.Warn("mic-recog stop timed out; forced restart")
	}

	markMicRecogRestart(time.Now())
}

func micWatchdogGetBoolSetting(key string, fallback bool) bool {
	db := localdb.GetDB()
	if db == nil {
		return fallback
	}
	manager := settings.NewSettingsManager(db)
	value, err := manager.GetRealValue(key)
	if err != nil {
		return fallback
	}
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func micWatchdogGetIntSetting(key string, fallback int) int {
	db := localdb.GetDB()
	if db == nil {
		return fallback
	}
	manager := settings.NewSettingsManager(db)
	value, err := manager.GetRealValue(key)
	if err != nil {
		return fallback
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
