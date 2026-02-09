package ollama

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func normalizeBaseURL(baseURL string) string {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return ""
	}
	// Allow users to specify host:port without scheme in settings/env.
	if !strings.Contains(trimmed, "://") {
		return "http://" + strings.TrimRight(trimmed, "/")
	}
	return strings.TrimRight(trimmed, "/")
}

func isServerHealthy(baseURL string) bool {
	baseURL = normalizeBaseURL(baseURL)
	if baseURL == "" {
		return false
	}
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

func isPortOpen(host string, port int) bool {
	addr := net.JoinHostPort(strings.TrimSpace(host), strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

