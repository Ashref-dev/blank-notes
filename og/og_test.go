package og

import (
	"bytes"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Set OG_OUT=<dir> to write the rendered cards to disk for a visual check.
func TestCards(t *testing.T) {
	exp := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	created := time.Date(2026, 9, 24, 12, 0, 0, 0, time.UTC)
	cases := map[string]func() ([]byte, error){
		"site": Site,
		"note": func() ([]byte, error) {
			return SharedNote(Note{Title: "Weekend in Sidi Bou Said", Content: "Blue doors, white walls, and the best bambalouni by the harbour.\n\n- [ ] Café des Délices at sunset\n- [ ] Walk down to the marina\n- [x] Book the train from Tunis\n\nBring cash, and a jacket for the evening wind off the sea.", CreatedAt: created, ExpiresAt: &exp})
		},
		"note-long-title": func() ([]byte, error) {
			return SharedNote(Note{Title: "Okay give me a summary and any bugs or things to do from the previous memories of this session please", Content: "Concise list.", CreatedAt: created})
		},
		"note-untitled": func() ([]byte, error) {
			return SharedNote(Note{Content: "okay give me a summary and any bugs or things to do from the previous memories of this session please. concise list.", CreatedAt: created})
		},
		"note-legacy": func() ([]byte, error) {
			return SharedNote(Note{Title: "Meeting notes", Content: "Meeting notes\nShip the redesign on Friday 🚀. Check OG previews on Slack, iMessage and X.", CreatedAt: created})
		},
		"note-arabic": func() ([]byte, error) {
			return SharedNote(Note{Title: "ملاحظات الاجتماع", Content: "نص الملاحظة هنا", CreatedAt: created})
		},
		"expired":  func() ([]byte, error) { return Unavailable(true) },
		"notfound": func() ([]byte, error) { return Unavailable(false) },
	}
	out := os.Getenv("OG_OUT")
	for name, render := range cases {
		b, err := render()
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		img, err := png.Decode(bytes.NewReader(b))
		if err != nil {
			t.Fatalf("%s: invalid png: %v", name, err)
		}
		if sz := img.Bounds().Size(); sz.X != Width || sz.Y != Height {
			t.Fatalf("%s: size %v", name, sz)
		}
		if len(b) > 600<<10 {
			t.Errorf("%s: %d bytes, too large for some previewers (WhatsApp)", name, len(b))
		}
		if out != "" {
			if err := os.WriteFile(filepath.Join(out, name+".png"), b, 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func TestPresent(t *testing.T) {
	for _, c := range []struct{ title, content, head, body string }{
		{"Hello", "World", "Hello", "World"},
		{"Hello", "Hello\n\nWorld", "Hello", "World"},
		{"A very long title that got truncated at fif...", "A very long title that got truncated at fifty chars\nrest", "A very long title that got truncated at fifty chars", "rest"},
		{"", "- [ ] first line\nsecond", "first line", "second"},
		{"", "## Heading\nbody", "Heading", "body"},
	} {
		h, b := Present(c.title, c.content)
		if h != c.head || b != c.body {
			t.Errorf("Present(%q, %q) = %q, %q; want %q, %q", c.title, c.content, h, b, c.head, c.body)
		}
	}
}

func BenchmarkSharedNote(b *testing.B) {
	n := Note{Title: "Weekend in Sidi Bou Said", Content: "Blue doors, white walls, and the best bambalouni by the harbour.", CreatedAt: time.Now()}
	for i := 0; i < b.N; i++ {
		if _, err := SharedNote(n); err != nil {
			b.Fatal(err)
		}
	}
}
