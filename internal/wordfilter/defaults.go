package wordfilter

import "embed"

//go:embed defaults/*
var defaultWordLists embed.FS
