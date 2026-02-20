package webserver

import (
	"strings"
	"testing"
)

func TestPaletteColorIndexForUserID_LongUserID(t *testing.T) {
	longUserID := strings.Repeat("1234567890abcdef", 1024)
	paletteLen := len(colorPalette)

	idx := paletteColorIndexForUserID(longUserID, paletteLen)
	if idx < 0 || idx >= paletteLen {
		t.Fatalf("paletteColorIndexForUserID returned invalid index: %d (paletteLen=%d)", idx, paletteLen)
	}
}
