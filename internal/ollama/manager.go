package ollama

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/paths"
	"github.com/ichi0g0y/twitch-overlay/internal/translation"
	"go.uber.org/zap"
)

type Manager struct {
	mu   sync.Mutex
	cmd  *exec.Cmd
	done chan struct{}
}

type runtimeConfig struct {
	baseURL   string
	host      string
	port      int
	autoStart bool
	backend   string
	micMode   string
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) Start() error {
	m.mu.Lock()
	if m.cmd != nil {
		m.mu.Unlock()
		logger.Info("ollama is already running")
		return nil
	}
	m.mu.Unlock()

	cfg, err := loadRuntimeConfig()
	if err != nil {
		return err
	}

	if !cfg.autoStart && cfg.backend != translation.BackendOllama && cfg.micMode != translation.BackendOllama {
		logger.Info("ollama auto start disabled")
		return nil
	}

	if !isLocalHost(cfg.host) {
		logger.Info("ollama auto start skipped (remote server)", zap.String("host", cfg.host))
		return nil
	}

	if cfg.baseURL != "" && isServerHealthy(cfg.baseURL) {
		logger.Info("ollama server already running", zap.String("url", cfg.baseURL))
		return nil
	}

	exe, err := exec.LookPath("ollama")
	if err != nil {
		return fmt.Errorf("ollama not found: %w", err)
	}

	cmd := exec.Command(exe, "serve")
	cmd.Env = append(os.Environ(), fmt.Sprintf("OLLAMA_HOST=%s", net.JoinHostPort(cfg.host, strconv.Itoa(cfg.port))))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("ollama stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("ollama stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("ollama start failed: %w", err)
	}

	done := make(chan struct{})
	m.mu.Lock()
	m.cmd = cmd
	m.done = done
	m.mu.Unlock()

	go streamOutput("stdout", stdout, false)
	go streamOutput("stderr", stderr, true)
	cmdRef := cmd
	go func() {
		defer close(done)
		err := cmdRef.Wait()
		if err != nil {
			logger.Warn("ollama exited with error", zap.Error(err))
		} else {
			logger.Info("ollama exited")
		}
		m.mu.Lock()
		if m.cmd == cmdRef {
			m.cmd = nil
			m.done = nil
		}
		m.mu.Unlock()
	}()

	logger.Info("ollama started", zap.String("exe", exe))
	return nil
}

func (m *Manager) Stop() bool {
	m.mu.Lock()
	cmd := m.cmd
	done := m.done
	m.mu.Unlock()

	if cmd == nil {
		return true
	}

	logger.Info("Stopping ollama")
	if cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
	}

	if done == nil {
		return true
	}

	select {
	case <-done:
		return true
	case <-time.After(5 * time.Second):
	}

	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}

	select {
	case <-done:
		return true
	case <-time.After(2 * time.Second):
	}

	logger.Warn("ollama stop timed out; clearing state")
	m.mu.Lock()
	if m.cmd == cmd {
		m.cmd = nil
		m.done = nil
	}
	m.mu.Unlock()
	return false
}

func (m *Manager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.cmd != nil
}

func loadRuntimeConfig() (runtimeConfig, error) {
	db := localdb.GetDB()
	if db == nil {
		_, err := localdb.SetupDB(paths.GetDBPath())
		if err != nil {
			return runtimeConfig{}, fmt.Errorf("ollama db init failed: %w", err)
		}
		db = localdb.GetDB()
		if db == nil {
			return runtimeConfig{}, fmt.Errorf("ollama db not available")
		}
	}

	manager := settings.NewSettingsManager(db)
	getSetting := func(key string) string {
		value, err := manager.GetRealValue(key)
		if err != nil {
			if def, ok := settings.DefaultSettings[key]; ok {
				return def.Value
			}
			return ""
		}
		return strings.TrimSpace(value)
	}

	baseURL := translation.ResolveOllamaBaseURL(getSetting("OLLAMA_BASE_URL"))
	host, port := parseHostPort(baseURL)

	autoStart := true
	if raw := strings.TrimSpace(os.Getenv("OLLAMA_AUTO_START")); raw != "" {
		autoStart = raw != "0" && strings.ToLower(raw) != "false"
	}

	cfg := runtimeConfig{
		baseURL:   baseURL,
		host:      host,
		port:      port,
		autoStart: autoStart,
		backend:   translation.ResolveTranslationBackend(getSetting("TRANSLATION_BACKEND")),
		micMode:   strings.TrimSpace(strings.ToLower(getSetting("MIC_TRANSCRIPT_TRANSLATION_MODE"))),
	}
	return cfg, nil
}

func parseHostPort(rawURL string) (string, int) {
	const defaultPort = 11434
	const defaultHost = "127.0.0.1"

	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return defaultHost, defaultPort
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		parsed, err = url.Parse("http://" + trimmed)
		if err != nil {
			return defaultHost, defaultPort
		}
	}

	host := parsed.Hostname()
	if host == "" {
		host = defaultHost
	}

	port := defaultPort
	if portStr := parsed.Port(); portStr != "" {
		if parsedPort, err := strconv.Atoi(portStr); err == nil {
			port = parsedPort
		}
	}
	return host, port
}

func isLocalHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "", "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func isServerHealthy(baseURL string) bool {
	endpoint := strings.TrimRight(baseURL, "/") + "/api/version"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return false
	}
	client := &http.Client{Timeout: 1 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func streamOutput(name string, r io.Reader, isErr bool) {
	scanner := bufio.NewScanner(r)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if isErr {
			logger.Warn("ollama output", zap.String("stream", name), zap.String("line", line))
		} else {
			logger.Debug("ollama output", zap.String("stream", name), zap.String("line", line))
		}
	}
	if err := scanner.Err(); err != nil {
		logger.Debug("ollama output scanner error", zap.String("stream", name), zap.Error(err))
	}
}
