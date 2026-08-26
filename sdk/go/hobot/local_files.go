package hobot

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const MaximumLocalFileBytes int64 = 16 << 30

var localFileDigestPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func safeLocalFileName(value string) (string, error) {
	name := filepath.Base(strings.TrimSpace(value))
	if name == "" || name == "." || name == string(filepath.Separator) || len(name) > 255 || strings.ContainsAny(name, "\x00\r\n") {
		return "", fmt.Errorf("local file name is invalid")
	}
	return name, nil
}

// UploadLocalFile streams a verified local file into the board's private,
// content-addressed import directory. Existing matching content is reused.
func (client *Client) UploadLocalFile(ctx context.Context, filename string, input io.Reader, size int64, digest string) (string, error) {
	if input == nil || size <= 0 || size > MaximumLocalFileBytes {
		return "", fmt.Errorf("local file size must be between 1 byte and %d bytes", MaximumLocalFileBytes)
	}
	if !localFileDigestPattern.MatchString(digest) {
		return "", fmt.Errorf("local file SHA-256 is invalid")
	}
	name, err := safeLocalFileName(filename)
	if err != nil {
		return "", err
	}
	info, err := client.Ping(ctx)
	if err != nil {
		return "", fmt.Errorf("resolve board state directory: %w", err)
	}
	stateRoot := filepath.Clean(info.StateRoot)
	if !filepath.IsAbs(stateRoot) || stateRoot == "/" {
		return "", fmt.Errorf("board returned an unsafe state directory")
	}
	targetDir := filepath.Join(stateRoot, "local-inputs", digest[:16])
	target := filepath.Join(targetDir, name)
	command := strings.Join([]string{
		"set -eu",
		"umask 077",
		"mkdir -p " + quoteArg(targetDir),
		"target=" + quoteArg(target),
		"expected=" + quoteArg(digest),
		"expected_size=" + strconv.FormatInt(size, 10),
		"if [ -f \"$target\" ] && [ \"$(wc -c <\"$target\")\" = \"$expected_size\" ] && [ \"$(sha256sum \"$target\" | awk '{print $1}')\" = \"$expected\" ]; then printf '%s\\n' \"$target\"; exit 0; fi",
		"temporary=\"$target.part.$$\"",
		"trap 'rm -f -- \"$temporary\"' EXIT HUP INT TERM",
		"cat >\"$temporary\"",
		"[ \"$(wc -c <\"$temporary\")\" = \"$expected_size\" ]",
		"[ \"$(sha256sum \"$temporary\" | awk '{print $1}')\" = \"$expected\" ]",
		"chmod 0600 \"$temporary\"",
		"mv -f -- \"$temporary\" \"$target\"",
		"trap - EXIT HUP INT TERM",
		"printf '%s\\n' \"$target\"",
	}, "; ")
	output, err := client.runBoardCommandWithReader(ctx, command, input)
	if err != nil {
		return "", fmt.Errorf("upload local file: %w", err)
	}
	if strings.TrimSpace(string(output)) != target {
		return "", fmt.Errorf("board returned an invalid local file path")
	}
	return target, nil
}
