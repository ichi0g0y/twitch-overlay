package micrecog

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type Manager struct {
	mu   sync.Mutex
	cmd  *exec.Cmd
	done chan struct{}
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) Start(port int) error {
	m.mu.Lock()
	if m.cmd != nil {
		m.mu.Unlock()
		logger.Info("mic-recog is already running")
		return nil
	}
	m.mu.Unlock()

	micDir, err := resolveMicRecogDir()
	if err != nil {
		return err
	}

	exe, exeArgs, err := resolveExecutable(micDir)
	if err != nil {
		return err
	}

	cfg := LoadConfig()
	if !cfg.Enabled {
		logger.Info("mic-recog is disabled by settings")
		return nil
	}

	wsURL := fmt.Sprintf("ws://localhost:%d/ws?clientId=mic-recog", port)
	args := append([]string{}, cfg.Args()...)
	args = append(args, "--ws-url", wsURL)
	fullArgs := append(exeArgs, args...)

	cmd := exec.Command(exe, fullArgs...)
	cmd.Dir = micDir
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("mic-recog stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("mic-recog stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("mic-recog start failed: %w", err)
	}

	done := make(chan struct{})
	m.mu.Lock()
	m.cmd = cmd
	m.done = done
	m.mu.Unlock()

	go streamOutput("stdout", stdout, false)
	go streamOutput("stderr", stderr, true)
	go func() {
		defer close(done)
		err := cmd.Wait()
		if err != nil {
			logger.Warn("mic-recog exited with error", zap.Error(err))
		} else {
			logger.Info("mic-recog exited")
		}
		m.mu.Lock()
		m.cmd = nil
		m.done = nil
		m.mu.Unlock()
	}()

	logger.Info("mic-recog started",
		zap.String("exe", exe),
		zap.Strings("args", fullArgs))
	return nil
}

func (m *Manager) Stop() {
	m.mu.Lock()
	cmd := m.cmd
	done := m.done
	m.mu.Unlock()

	if cmd == nil {
		return
	}

	logger.Info("Stopping mic-recog")
	if cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
	}

	if done == nil {
		return
	}

	select {
	case <-done:
		return
	case <-time.After(5 * time.Second):
	}

	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
	}
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
			logger.Warn("mic-recog output", zap.String("stream", name), zap.String("line", line))
		} else {
			logger.Debug("mic-recog output", zap.String("stream", name), zap.String("line", line))
		}
	}
	if err := scanner.Err(); err != nil {
		logger.Debug("mic-recog output scanner error", zap.String("stream", name), zap.Error(err))
	}
}

func resolveMicRecogDir() (string, error) {
	if envDir := os.Getenv("MIC_RECOG_DIR"); envDir != "" {
		if info, err := os.Stat(envDir); err == nil && info.IsDir() {
			return envDir, nil
		}
		return "", fmt.Errorf("MIC_RECOG_DIR not found: %s", envDir)
	}

	candidates := []string{}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "mic-recog"))
	}

	if execPath, err := os.Executable(); err == nil {
		execDir := filepath.Dir(execPath)
		candidates = append(candidates,
			filepath.Join(execDir, "mic-recog"),
			filepath.Join(execDir, "..", "Resources", "mic-recog"),
			filepath.Join(execDir, "..", "..", "mic-recog"),
			filepath.Join(execDir, "..", "..", "..", "mic-recog"),
		)
	}

	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("mic-recog directory not found")
}

func resolveExecutable(micDir string) (string, []string, error) {
	distDir := filepath.Join(micDir, "dist")
	binName := "mic_stream"
	if runtime.GOOS == "windows" {
		binName += ".exe"
	}
	distBin := filepath.Join(distDir, binName)
	if fileExists(distBin) {
		return distBin, nil, nil
	}

	venvPython := filepath.Join(micDir, ".venv", "bin", "python")
	if runtime.GOOS == "windows" {
		venvPython = filepath.Join(micDir, ".venv", "Scripts", "python.exe")
	}
	if fileExists(venvPython) {
		return venvPython, []string{"-u", filepath.Join(micDir, "mic_stream.py")}, nil
	}

	python := "python3"
	if runtime.GOOS == "windows" {
		python = "python"
	}
	if _, err := exec.LookPath(python); err != nil {
		return "", nil, fmt.Errorf("python not found: %w", err)
	}
	return python, []string{"-u", filepath.Join(micDir, "mic_stream.py")}, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
