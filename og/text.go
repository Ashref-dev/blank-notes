// Package og renders the 1200×630 link-preview images (Open Graph / Twitter cards) for blank.
// Text is shaped with HarfBuzz (go-text/typesetting) so the site's fonts keep their kerning.
package og

import (
	"bytes"
	"embed"
	"image"
	"image/color"
	"strings"
	"sync"
	"unicode"

	"github.com/go-text/render"
	"github.com/go-text/typesetting/di"
	"github.com/go-text/typesetting/font"
	"github.com/go-text/typesetting/language"
	"github.com/go-text/typesetting/shaping"
	"golang.org/x/image/math/fixed"
)

//go:embed fonts/*.ttf
var fontFiles embed.FS

type fontSet struct {
	serif, serifItalic, sans, sansMedium, mono *font.Font
}

var (
	fontsOnce sync.Once
	fonts     fontSet
	fontsErr  error
)

func loadFonts() (fontSet, error) {
	fontsOnce.Do(func() {
		load := func(name string) *font.Font {
			if fontsErr != nil {
				return nil
			}
			b, err := fontFiles.ReadFile("fonts/" + name)
			if err != nil {
				fontsErr = err
				return nil
			}
			f, err := font.ParseTTF(bytes.NewReader(b))
			if err != nil {
				fontsErr = err
				return nil
			}
			return f.Font
		}
		fonts = fontSet{
			serif:       load("InstrumentSerif-Regular.ttf"),
			serifItalic: load("InstrumentSerif-Italic.ttf"),
			sans:        load("Geist-Regular.ttf"),
			sansMedium:  load("Geist-Medium.ttf"),
			mono:        load("GeistMono-Regular.ttf"),
		}
	})
	return fonts, fontsErr
}

// style is one text treatment: a face (not safe for concurrent use, so one per render), a pixel size,
// a colour and letter-spacing in em.
type style struct {
	face     *font.Face
	size     float32
	color    color.Color
	tracking float32
}

type typesetter struct {
	shaper shaping.HarfbuzzShaper
}

func (t *typesetter) shape(s style, text string) shaping.Output {
	runes := []rune(text)
	out := t.shaper.Shape(shaping.Input{
		Text:      runes,
		RunEnd:    len(runes),
		Direction: di.DirectionLTR,
		Face:      s.face,
		Size:      fixed.Int26_6(s.size * 64),
		Script:    language.Latin,
		Language:  language.NewLanguage("en"),
	})
	if s.tracking != 0 && len(out.Glyphs) > 0 {
		out.AddLetterSpacing(fixed.Int26_6(s.tracking*s.size*64), true, true)
	}
	return out
}

func (t *typesetter) width(s style, text string) float32 {
	out := t.shape(s, text)
	return float32(out.Advance) / 64
}

// draw paints text with its baseline at (x, y) and returns the x where it ends.
func (t *typesetter) draw(img *image.RGBA, s style, text string, x, y float32) float32 {
	if text == "" {
		return x
	}
	out := t.shape(s, text)
	r := render.Renderer{FontSize: s.size, Color: s.color}
	r.DrawShapedRunAt(out, img, int(x+0.5), int(y+0.5))
	return x + float32(out.Advance)/64
}

// wrap breaks text into at most maxLines lines no wider than maxW, ending with "…" when it had to cut.
func (t *typesetter) wrap(s style, text string, maxW float32, maxLines int) []string {
	words := strings.Fields(text)
	var lines []string
	cur := ""
	truncated := false
	for i := 0; i < len(words); i++ {
		w := words[i]
		next := w
		if cur != "" {
			next = cur + " " + w
		}
		if t.width(s, next) <= maxW {
			cur = next
			continue
		}
		if cur == "" {
			// a single word wider than the line: split it by runes
			head, tail := t.splitToFit(s, w, maxW)
			cur = head
			if tail != "" {
				words = append(words[:i+1], words[i:]...)
				words[i+1] = tail
			}
			continue
		}
		lines = append(lines, cur)
		cur = ""
		i--
		if len(lines) == maxLines {
			truncated = true
			break
		}
	}
	if !truncated && cur != "" {
		lines = append(lines, cur)
	}
	if len(lines) > maxLines {
		lines, truncated = lines[:maxLines], true
	}
	if truncated && len(lines) > 0 {
		last := lines[len(lines)-1]
		for last != "" && t.width(s, last+"…") > maxW {
			if i := strings.LastIndexByte(last, ' '); i > 0 {
				last = last[:i]
			} else {
				rs := []rune(last)
				last = string(rs[:len(rs)-1])
			}
		}
		lines[len(lines)-1] = strings.TrimRight(last, " ,.;:—–-") + "…"
	}
	return lines
}

func (t *typesetter) splitToFit(s style, word string, maxW float32) (string, string) {
	rs := []rune(word)
	n := len(rs)
	for n > 1 && t.width(s, string(rs[:n])) > maxW {
		n--
	}
	return string(rs[:n]), string(rs[n:])
}

// renderable drops characters the fonts can't draw (emoji, other scripts) and reports whether enough of
// the letters survived for the text to still read as itself.
func renderable(f *font.Font, text string) (string, bool) {
	var b strings.Builder
	letters, kept := 0, 0
	for _, r := range text {
		_, ok := f.NominalGlyph(r)
		if unicode.IsLetter(r) {
			letters++
			if ok {
				kept++
			}
		}
		switch {
		case ok:
			b.WriteRune(r)
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " "), letters == 0 || kept*10 >= letters*8
}
