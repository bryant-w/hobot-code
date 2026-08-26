package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/bryant-w/hobot-code/sdk/go/hobot"
)

const (
	localAccessFullRead = "full-read"
	localAccessNone     = "none"
	maximumPromptFiles  = 8
)

var (
	quotedLocalPathPattern = regexp.MustCompile(`["'](/[^"'\r\n]+)["']`)
	fileURLPattern         = regexp.MustCompile(`file:///[A-Za-z0-9._~%!$&'()*+,;=:@/+-]+`)
	macPathPattern         = regexp.MustCompile(`/(?:Users|Volumes)/[^\s"'<>]+`)
)

type LocalFileImport struct {
	LocalPath string `json:"localPath"`
	BoardPath string `json:"boardPath"`
	Name      string `json:"name"`
	SizeBytes int64  `json:"sizeBytes"`
	SHA256    string `json:"sha256"`
}

type LocalPromptPreparation struct {
	Prompt string            `json:"prompt"`
	Files  []LocalFileImport `json:"files"`
}

func normalizeLocalAccess(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", localAccessFullRead:
		return localAccessFullRead, nil
	case localAccessNone:
		return localAccessNone, nil
	default:
		return "", fmt.Errorf("local access mode is invalid")
	}
}

func localPathsInPrompt(prompt string) []string {
	seen := map[string]bool{}
	paths := make([]string, 0)
	add := func(value string) {
		value = strings.TrimSpace(strings.TrimRight(value, ",.;:!?，。；：！？)]}"))
		if strings.HasPrefix(value, "file://") {
			parsed, err := url.Parse(value)
			if err != nil || parsed.Scheme != "file" || parsed.Host != "" {
				return
			}
			value, err = url.PathUnescape(parsed.Path)
			if err != nil {
				return
			}
		}
		if !strings.HasPrefix(value, "/") || seen[value] {
			return
		}
		for existing := range seen {
			if len(existing) > len(value) && strings.HasPrefix(existing, value) {
				return
			}
		}
		seen[value] = true
		paths = append(paths, value)
	}
	for _, match := range quotedLocalPathPattern.FindAllStringSubmatch(prompt, -1) {
		add(match[1])
	}
	for _, match := range fileURLPattern.FindAllString(prompt, -1) {
		add(match)
	}
	for _, indexes := range macPathPattern.FindAllStringIndex(prompt, -1) {
		prefixStart := indexes[0] - len("file://")
		if prefixStart >= 0 && prompt[prefixStart:indexes[0]] == "file://" {
			continue
		}
		add(prompt[indexes[0]:indexes[1]])
	}
	sort.SliceStable(paths, func(left, right int) bool { return len(paths[left]) > len(paths[right]) })
	return paths
}

func openVerifiedLocalFile(path string) (*os.File, os.FileInfo, string, error) {
	before, err := os.Lstat(path)
	if err != nil {
		return nil, nil, "", err
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() || before.Size() <= 0 || before.Size() > hobot.MaximumLocalFileBytes {
		return nil, nil, "", fmt.Errorf("local path must be a non-empty regular file no larger than 16 GiB")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, "", err
	}
	after, err := file.Stat()
	if err != nil || !os.SameFile(before, after) {
		_ = file.Close()
		return nil, nil, "", fmt.Errorf("local file changed while it was opened")
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		_ = file.Close()
		return nil, nil, "", err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		_ = file.Close()
		return nil, nil, "", err
	}
	return file, after, hex.EncodeToString(hash.Sum(nil)), nil
}

func (app *App) PrepareLocalPrompt(boardID, prompt, accessMode string) (LocalPromptPreparation, error) {
	mode, err := normalizeLocalAccess(accessMode)
	if err != nil {
		return LocalPromptPreparation{}, err
	}
	paths := localPathsInPrompt(prompt)
	result := LocalPromptPreparation{Prompt: prompt, Files: []LocalFileImport{}}
	if len(paths) == 0 {
		return result, nil
	}
	if mode == localAccessNone {
		return LocalPromptPreparation{}, fmt.Errorf("Mac file access is disabled for this task")
	}
	if len(paths) > maximumPromptFiles {
		return LocalPromptPreparation{}, fmt.Errorf("a message can import at most %d local files", maximumPromptFiles)
	}
	client, err := app.client(boardID)
	if err != nil {
		return LocalPromptPreparation{}, err
	}
	baseContext := app.ctx
	if baseContext == nil {
		baseContext = context.Background()
	}
	for _, path := range paths {
		file, info, digest, err := openVerifiedLocalFile(path)
		if err != nil {
			return LocalPromptPreparation{}, fmt.Errorf("read Mac file %s: %w", path, err)
		}
		ctx, cancel := context.WithTimeout(baseContext, 2*time.Hour)
		boardPath, uploadErr := client.UploadLocalFile(ctx, info.Name(), file, info.Size(), digest)
		cancel()
		_ = file.Close()
		if uploadErr != nil {
			return LocalPromptPreparation{}, fmt.Errorf("transfer Mac file %s: %w", path, uploadErr)
		}
		result.Prompt = strings.ReplaceAll(result.Prompt, "file://"+path, boardPath)
		result.Prompt = strings.ReplaceAll(result.Prompt, path, boardPath)
		result.Files = append(result.Files, LocalFileImport{LocalPath: path, BoardPath: boardPath, Name: info.Name(), SizeBytes: info.Size(), SHA256: digest})
	}
	return result, nil
}
