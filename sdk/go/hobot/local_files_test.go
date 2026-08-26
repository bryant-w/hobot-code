package hobot

import "testing"

func TestSafeLocalFileName(t *testing.T) {
	if name, err := safeLocalFileName("/Users/demo/model.hbm"); err != nil || name != "model.hbm" {
		t.Fatalf("name = %q, %v", name, err)
	}
	for _, value := range []string{"", ".", "bad\nname"} {
		if _, err := safeLocalFileName(value); err == nil {
			t.Fatalf("unsafe name accepted: %q", value)
		}
	}
}
