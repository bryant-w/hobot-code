package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLocalPathsInPromptHandlesQuotedURLAndBarePaths(t *testing.T) {
	prompt := `test "/Users/demo/My Models/model.hbm", file:///Volumes/data/model%202.onnx and /Users/demo/plain.bc again /Users/demo/plain.bc`
	want := []string{"/Users/demo/My Models/model.hbm", "/Volumes/data/model 2.onnx", "/Users/demo/plain.bc"}
	if got := localPathsInPrompt(prompt); !reflect.DeepEqual(got, want) {
		t.Fatalf("paths = %#v, want %#v", got, want)
	}
}

func TestLocalAccessDefaultsToFullReadAndRejectsUnknownMode(t *testing.T) {
	if mode, err := normalizeLocalAccess(""); err != nil || mode != localAccessFullRead {
		t.Fatalf("default mode = %q, %v", mode, err)
	}
	if mode, err := normalizeLocalAccess(localAccessNone); err != nil || mode != localAccessNone {
		t.Fatalf("none mode = %q, %v", mode, err)
	}
	if _, err := normalizeLocalAccess("write"); err == nil {
		t.Fatal("write access was accepted")
	}
}

func TestOpenVerifiedLocalFileHashesRegularFileAndRejectsSymlink(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "model.hbm")
	content := []byte("verified model")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	file, info, digest, err := openVerifiedLocalFile(path)
	if err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	expected := sha256.Sum256(content)
	if info.Size() != int64(len(content)) || digest != hex.EncodeToString(expected[:]) {
		t.Fatalf("unexpected file evidence: size=%d digest=%s", info.Size(), digest)
	}
	link := filepath.Join(dir, "linked.hbm")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := openVerifiedLocalFile(link); err == nil {
		t.Fatal("symlinked local file was accepted")
	}
}
