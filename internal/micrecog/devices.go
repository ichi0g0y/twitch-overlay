package micrecog

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type Device struct {
	Index             int     `json:"index"`
	Name              string  `json:"name"`
	MaxInputChannels  int     `json:"max_input_channels"`
	DefaultSampleRate float64 `json:"default_samplerate"`
	HostAPI           *int    `json:"hostapi,omitempty"`
	HostAPIName       string  `json:"hostapi_name,omitempty"`
	IsDefault         bool    `json:"is_default"`
}

func ListDevices(ctx context.Context) ([]Device, error) {
	micDir, err := resolveMicRecogDir()
	if err != nil {
		return nil, err
	}

	exe, exeArgs, err := resolveExecutable(micDir)
	if err != nil {
		return nil, err
	}

	args := append([]string{}, exeArgs...)
	args = append(args, "--list-devices-json")

	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.Dir = micDir
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")

	output, err := cmd.Output()
	if err != nil {
		details := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			details = strings.TrimSpace(string(exitErr.Stderr))
		}
		logger.Warn("mic-recog device scan failed",
			zap.Error(err),
			zap.String("details", details))
		if details != "" {
			return nil, fmt.Errorf("mic-recog device scan failed: %w: %s", err, details)
		}
		return nil, fmt.Errorf("mic-recog device scan failed: %w", err)
	}

	var payload struct {
		Devices []Device `json:"devices"`
	}
	if err := json.Unmarshal(output, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse mic-recog devices: %w", err)
	}

	return payload.Devices, nil
}
