package ollama

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type ModelfileConfig struct {
	BaseModel    string
	SystemPrompt string
	NumPredict   *int
	Temperature  *float64
	TopP         *float64
	NumCtx       *int
	Stop         []string
}

func BuildModelfile(cfg ModelfileConfig) (string, error) {
	base := strings.TrimSpace(cfg.BaseModel)
	if base == "" {
		return "", errors.New("base model is required")
	}

	var builder strings.Builder
	builder.WriteString("FROM ")
	builder.WriteString(base)
	builder.WriteString("\n")

	if strings.TrimSpace(cfg.SystemPrompt) != "" {
		builder.WriteString("SYSTEM ")
		builder.WriteString(strconv.Quote(strings.TrimSpace(cfg.SystemPrompt)))
		builder.WriteString("\n")
	}

	if cfg.Temperature != nil {
		builder.WriteString("PARAMETER temperature ")
		builder.WriteString(formatFloat(*cfg.Temperature))
		builder.WriteString("\n")
	}
	if cfg.TopP != nil {
		builder.WriteString("PARAMETER top_p ")
		builder.WriteString(formatFloat(*cfg.TopP))
		builder.WriteString("\n")
	}
	if cfg.NumCtx != nil {
		builder.WriteString("PARAMETER num_ctx ")
		builder.WriteString(strconv.Itoa(*cfg.NumCtx))
		builder.WriteString("\n")
	}
	if cfg.NumPredict != nil {
		builder.WriteString("PARAMETER num_predict ")
		builder.WriteString(strconv.Itoa(*cfg.NumPredict))
		builder.WriteString("\n")
	}
	for _, stop := range cfg.Stop {
		stop = strings.TrimSpace(stop)
		if stop == "" {
			continue
		}
		builder.WriteString("PARAMETER stop ")
		builder.WriteString(strconv.Quote(stop))
		builder.WriteString("\n")
	}

	return builder.String(), nil
}

func SaveModelfile(dir, name, content string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", errors.New("model name is required")
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	filename := sanitizeFileName(name) + ".modelfile"
	path := filepath.Join(dir, filename)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func CreateModel(name, modelfilePath string, timeout time.Duration) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("model name is required")
	}
	if modelfilePath == "" {
		return errors.New("modelfile path is required")
	}
	exe, err := exec.LookPath("ollama")
	if err != nil {
		return fmt.Errorf("ollama not found: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, exe, "create", name, "-f", modelfilePath)
	if output, err := cmd.CombinedOutput(); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("ollama create timeout: %w", ctx.Err())
		}
		return fmt.Errorf("ollama create failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func sanitizeFileName(name string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9._:-]+`)
	safe := re.ReplaceAllString(name, "_")
	return strings.Trim(safe, "_")
}

func formatFloat(value float64) string {
	rounded := strconv.FormatFloat(value, 'f', 3, 64)
	rounded = strings.TrimRight(rounded, "0")
	rounded = strings.TrimRight(rounded, ".")
	if rounded == "" {
		return "0"
	}
	return rounded
}
