package og

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/go-text/typesetting/font"
	"github.com/srwiley/rasterx"
)

const (
	Width  = 1200
	Height = 630
)

// Palette of the light theme (web/src/index.css).
var (
	bg     = color.RGBA{0xf6, 0xf4, 0xef, 0xff}
	ink    = color.RGBA{0x1a, 0x19, 0x17, 0xff}
	muted  = color.RGBA{0x6d, 0x69, 0x60, 0xff}
	faint  = color.RGBA{0xa3, 0x9e, 0x94, 0xff}
	line   = color.RGBA{0xe4, 0xe1, 0xda, 0xff}
	accent = color.RGBA{0x16, 0x5d, 0xfc, 0xff}
)

// Note is what a shared-note card shows.
type Note struct {
	Title     string
	Content   string
	CreatedAt time.Time
	ExpiresAt *time.Time
}

var listMarker = regexp.MustCompile(`^\s*(?:#{1,6}\s+|[-*+•]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)`)

// Present splits a shared note into what a preview should lead with and what follows it. Notes shared by
// the previous app repeat the title as the first line of content; untitled notes lead with their first line.
func Present(title, content string) (heading, body string) {
	title = strings.TrimSpace(title)
	content = strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
	first, rest, _ := strings.Cut(content, "\n")
	first = strings.TrimSpace(first)
	switch {
	case title != "" && (first == title || (strings.HasSuffix(title, "...") && strings.HasPrefix(first, strings.TrimSuffix(title, "...")))):
		return first, strings.TrimSpace(rest)
	case title != "":
		return title, content
	default:
		return strings.TrimSpace(listMarker.ReplaceAllString(first, "")), strings.TrimSpace(rest)
	}
}

func WordCount(s string) int { return len(strings.Fields(s)) }

// Stats summarises a note's length without revealing any of it: "9 words · 1 min read".
func Stats(words int) (count, read string) {
	unit := "words"
	if words == 1 {
		unit = "word"
	}
	return fmt.Sprintf("%d %s", words, unit), fmt.Sprintf("%d min read", max(1, (words+199)/200))
}

type canvas struct {
	img *image.RGBA
	ts  typesetter
	f   fontSet
}

func newCanvas() (*canvas, error) {
	f, err := loadFonts()
	if err != nil {
		return nil, fmt.Errorf("loading fonts: %w", err)
	}
	img := image.NewRGBA(image.Rect(0, 0, Width, Height))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = bg.R, bg.G, bg.B, 0xff
	}
	return &canvas{img: img, f: f}, nil
}

func (c *canvas) face(f *font.Font) *font.Face { return font.NewFace(f) }

// glow blends a soft radial wash of col into the background, like the blurred accent orb in the app.
func (c *canvas) glow(cx, cy, radius, strength float64, col color.RGBA) {
	x0, x1 := max(0, int(cx-radius*3.5)), min(Width, int(cx+radius*3.5))
	y0, y1 := max(0, int(cy-radius*3.5)), min(Height, int(cy+radius*3.5))
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			if a := strength * math.Exp(-(dx*dx+dy*dy)/(2*radius*radius)); a >= 0.002 {
				c.blend(x, y, col, a)
			}
		}
	}
}

func (c *canvas) fill(col color.Color, shape func(rasterx.Adder)) {
	sc := rasterx.NewScannerGV(Width, Height, c.img, c.img.Bounds())
	f := rasterx.NewFiller(Width, Height, sc)
	f.SetColor(col)
	shape(f)
	f.Draw()
}

func (c *canvas) rect(x0, y0, x1, y1 float64, col color.Color) {
	c.fill(col, func(a rasterx.Adder) { rasterx.AddRect(x0, y0, x1, y1, 0, a) })
}

// caret draws the editor's accent text cursor after x and returns where it ends.
func (c *canvas) caret(x, baseline, size float32) float32 {
	h := float64(size) * 0.72
	w := math.Max(3, float64(size)*0.028)
	x0 := float64(x) + float64(size)*0.08
	c.rect(x0, float64(baseline)-h+float64(size)*0.02, x0+w, float64(baseline)+float64(size)*0.02, accent)
	return float32(x0 + w)
}

// wordmark draws "blank." with the accent dot; with caret it adds the app's cursor bar.
func (c *canvas) wordmark(x, baseline, size float32, caret bool) float32 {
	s := style{face: c.face(c.f.serif), size: size, color: ink, tracking: -0.03}
	x = c.ts.draw(c.img, s, "blank", x, baseline)
	s.color = accent
	x = c.ts.draw(c.img, s, ".", x, baseline)
	if caret {
		x = c.caret(x-size*0.04, baseline, size)
	}
	return x
}

func (c *canvas) wordmarkWidth(size float32, caret bool) float32 {
	s := style{face: c.face(c.f.serif), size: size, tracking: -0.03}
	w := c.ts.width(s, "blank.")
	if caret {
		w += size*0.04 + float32(math.Max(3, float64(size)*0.028))
	}
	return w
}

// span is one run of differently styled text on a line.
type span struct {
	s    style
	text string
}

func (c *canvas) spansWidth(spans []span) float32 {
	var w float32
	for _, sp := range spans {
		w += c.ts.width(sp.s, sp.text)
	}
	return w
}

func (c *canvas) drawSpans(spans []span, x, baseline float32) {
	for _, sp := range spans {
		x = c.ts.draw(c.img, sp.s, sp.text, x, baseline)
	}
}

func (c *canvas) png() ([]byte, error) {
	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.DefaultCompression}
	if err := enc.Encode(&buf, c.img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func deg(d float64) float64 { return d * math.Pi / 180 }

// Site renders the default card for blank.achraf.tn: a small stack of paper on a dotted desk, the
// wordmark with its cursor, and "thoughts" selected the way the editor highlights text.
func Site() ([]byte, error) {
	c, err := newCanvas()
	if err != nil {
		return nil, err
	}
	c.dots(24)
	c.glow(Width*0.8, Height*0.14, 250, 0.2, accent)
	c.glow(Width*0.12, Height*0.98, 190, 0.08, accent)

	const cx, cy, w, h = Width / 2, 292.0, 880.0, 400.0
	c.sheet(cx-10, cy+10, w, h, deg(-3.4), sheetBack)
	c.sheet(cx+8, cy+4, w, h, deg(2.2), sheetBack)
	c.sheet(cx, cy, w, h, 0, sheetFill)

	const size = 184
	c.wordmark((Width-c.wordmarkWidth(size, true))/2, 312, size, true)

	a := style{face: c.face(c.f.sans), size: 34, color: muted}
	b := style{face: c.face(c.f.sans), size: 34, color: ink}
	pre, word := span{a, "A quiet place for your "}, span{b, "thoughts"}
	line := []span{pre, word, {a, "."}}
	x, y := (Width-c.spansWidth(line))/2, float32(400)
	sx, sw := float64(x+c.ts.width(a, pre.text)), float64(c.ts.width(b, word.text))
	c.fill(selection, func(ad rasterx.Adder) {
		roundRectPath(ad, sx+sw/2, float64(y)-34*0.34, sw+10, 34*1.32, 5, 0)
	})
	c.drawSpans(line, x, y)

	m := style{face: c.face(c.f.mono), size: 19, color: faint, tracking: 0.14}
	label := "BLANK.ACHRAF.TN"
	c.ts.draw(c.img, m, label, (Width-c.ts.width(m, label))/2, 588)
	return c.png()
}

// Layout of the single-sheet cards (shared note, unavailable).
const (
	noteCX, noteCY, noteW, noteH = Width / 2, 314.0, 1056.0, 492.0
	noteLeft                     = noteCX - noteW/2 + 64
	noteTop                      = noteCY - noteH/2
	noteMaxW                     = noteW - 128
	noteRule                     = 444.0
	noteFoot                     = 500.0
)

func noteSheet(glow float64) (*canvas, error) {
	c, err := newCanvas()
	if err != nil {
		return nil, err
	}
	c.dots(24)
	c.glow(Width-120, 40, 280, glow, accent)
	c.glow(60, Height+20, 200, glow*0.35, accent)
	c.sheet(noteCX+6, noteCY+6, noteW, noteH, deg(-1.4), sheetBack)
	c.sheet(noteCX, noteCY, noteW, noteH, 0, sheetFill)
	c.wordmark(noteLeft, noteTop+94, 46, false)
	return c, nil
}

// footer draws the rule, the site on the left and a large right-aligned line of spans.
func (c *canvas) footer(right []span) {
	c.rect(noteLeft, noteRule, noteLeft+noteMaxW, noteRule+1.5, line)
	m := style{face: c.face(c.f.mono), size: 22, color: muted, tracking: 0.02}
	c.ts.draw(c.img, m, "blank.achraf.tn", noteLeft, noteFoot)
	c.drawSpans(right, noteLeft+noteMaxW-c.spansWidth(right), noteFoot)
}

// SharedNote renders the card for a live shared note. It shows the title only: the body stays private,
// hinted at by blurred placeholder lines whose shapes don't depend on the text.
func SharedNote(n Note) ([]byte, error) {
	c, err := noteSheet(0.18)
	if err != nil {
		return nil, err
	}

	heading, body := Present(n.Title, n.Content)
	words, bodyWords := WordCount(heading+" "+body), WordCount(body)
	heading, ok := renderable(c.f.serif, heading)
	if !ok || heading == "" {
		// Text in a script these fonts can't draw: lead with a neutral line rather than boxes.
		heading = "A note, shared with you."
	}

	maxW := float32(noteMaxW) - 24 // room for the caret
	big := style{face: c.face(c.f.serif), size: 94, color: ink, tracking: -0.015}
	lines := c.ts.wrap(big, heading, maxW, 1)
	if strings.HasSuffix(lines[0], "…") {
		big.size = 76
		lines = c.ts.wrap(big, heading, maxW, 3)
	}
	y := float32(190) + big.size*0.8
	for i, l := range lines {
		if i > 0 {
			y += big.size * 1.04
		}
		end := c.ts.draw(c.img, big, l, noteLeft, y)
		if i == len(lines)-1 {
			c.caret(end, y, big.size)
		}
	}

	if bodyWords > 0 {
		first := float64(y) + 58
		fit := int(math.Floor((noteRule-34-first)/40)) + 1
		if rows := min(3, (bodyWords+11)/12, fit); rows > 0 {
			c.ghostLines(noteLeft, first, noteMaxW, rows, 1)
		}
	}

	count, read := Stats(words)
	st := style{face: c.face(c.f.sansMedium), size: 30, color: ink}
	sep := style{face: c.face(c.f.sans), size: 30, color: faint}
	c.footer([]span{{st, count}, {sep, "  ·  "}, {st, read}})
	return c.png()
}

// Unavailable renders the card for a share link that expired (gone=true) or never existed.
func Unavailable(gone bool) ([]byte, error) {
	c, err := noteSheet(0.08)
	if err != nil {
		return nil, err
	}
	title, sub := "This note isn’t here.", "The link may be incomplete, or the note was removed."
	if gone {
		title, sub = "This note has faded.", "It was shared with an expiry, and that time has passed."
	}
	t := style{face: c.face(c.f.serifItalic), size: 84, color: muted, tracking: -0.015}
	y := float32(190) + 84*0.8
	c.ts.draw(c.img, t, title, noteLeft, y)
	s := style{face: c.face(c.f.sans), size: 28, color: faint}
	c.ts.draw(c.img, s, sub, noteLeft, y+64)
	if gone {
		c.ghostLines(noteLeft, float64(y)+122, noteMaxW, 2, 0.55)
	}
	cta := style{face: c.face(c.f.sansMedium), size: 28, color: accent}
	c.footer([]span{{cta, "Write your own →"}})
	return c.png()
}
