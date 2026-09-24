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
	"unicode/utf8"

	"github.com/go-text/typesetting/font"
	"github.com/srwiley/rasterx"
)

const (
	Width  = 1200
	Height = 630
	pad    = 80
)

// Palette of the light theme (web/src/index.css).
var (
	bg     = color.RGBA{0xf6, 0xf4, 0xef, 0xff}
	elev   = color.RGBA{0xfb, 0xfa, 0xf7, 0xff}
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

// Plain flattens markdown-ish note text into a single line for descriptions and excerpts.
func Plain(s string) string {
	var b strings.Builder
	for _, l := range strings.Split(s, "\n") {
		l = strings.Join(strings.Fields(listMarker.ReplaceAllString(l, "")), " ")
		if l == "" {
			continue
		}
		if b.Len() > 0 {
			// separate list items and bare lines so they don't run together
			if strings.ContainsRune(".!?:;,…", lastRune(b.String())) {
				b.WriteString(" ")
			} else {
				b.WriteString(" · ")
			}
		}
		b.WriteString(l)
	}
	return b.String()
}

func WordCount(s string) int { return len(strings.Fields(s)) }

func lastRune(s string) rune {
	r, _ := utf8.DecodeLastRuneInString(s)
	return r
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
	x0, x1 := max(0, int(cx-radius*2)), min(Width, int(cx+radius*2))
	y0, y1 := max(0, int(cy-radius*2)), min(Height, int(cy+radius*2))
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			a := strength * math.Exp(-(dx*dx+dy*dy)/(2*radius*radius))
			if a < 0.002 {
				continue
			}
			i := c.img.PixOffset(x, y)
			p := c.img.Pix[i : i+3 : i+3]
			p[0] = uint8(float64(p[0])*(1-a) + float64(col.R)*a + 0.5)
			p[1] = uint8(float64(p[1])*(1-a) + float64(col.G)*a + 0.5)
			p[2] = uint8(float64(p[2])*(1-a) + float64(col.B)*a + 0.5)
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

func (c *canvas) roundRect(x0, y0, x1, y1, r float64, col color.Color) {
	c.fill(col, func(a rasterx.Adder) { rasterx.AddRoundRect(x0, y0, x1, y1, r, r, 0, rasterx.RoundGap, a) })
}

func (c *canvas) rect(x0, y0, x1, y1 float64, col color.Color) {
	c.fill(col, func(a rasterx.Adder) { rasterx.AddRect(x0, y0, x1, y1, 0, a) })
}

func (c *canvas) circle(cx, cy, r float64, col color.Color) {
	c.fill(col, func(a rasterx.Adder) { rasterx.AddCircle(cx, cy, r, a) })
}

// wordmark draws "blank." with the accent dot; with caret it adds the app's blinking cursor bar.
func (c *canvas) wordmark(x, baseline, size float32, caret bool) float32 {
	s := style{face: c.face(c.f.serif), size: size, color: ink, tracking: -0.03}
	x = c.ts.draw(c.img, s, "blank", x, baseline)
	s.color = accent
	x = c.ts.draw(c.img, s, ".", x, baseline)
	if caret {
		h := float64(size) * 0.72
		x0 := float64(x) + float64(size)*0.04
		c.rect(x0, float64(baseline)-h+float64(size)*0.02, x0+math.Max(3, float64(size)*0.028), float64(baseline)+float64(size)*0.02, accent)
		x = float32(x0) + float32(math.Max(3, float64(size)*0.028))
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

// pill draws a rounded label right-aligned at xRight, vertically centred on cy.
func (c *canvas) pill(xRight, cy float32, text string, tinted bool) {
	s := style{face: c.face(c.f.sans), size: 21, color: muted}
	fillCol, border, dot := color.Color(elev), color.Color(line), color.Color(faint)
	if tinted {
		s.color = accent
		fillCol = color.RGBA{0xe9, 0xee, 0xfa, 0xff}
		border = color.RGBA{0xc4, 0xd3, 0xf8, 0xff}
		dot = accent
	}
	tw := c.ts.width(s, text)
	h, padX, dotR, gap := float32(48), float32(22), float32(4.5), float32(12)
	w := padX + dotR*2 + gap + tw + padX
	x0, y0 := xRight-w, cy-h/2
	c.roundRect(float64(x0), float64(y0), float64(xRight), float64(y0+h), float64(h/2), border)
	c.roundRect(float64(x0+1.5), float64(y0+1.5), float64(xRight-1.5), float64(y0+h-1.5), float64(h/2-1.5), fillCol)
	c.circle(float64(x0+padX+dotR), float64(cy), float64(dotR), dot)
	c.ts.draw(c.img, s, text, x0+padX+dotR*2+gap, cy+7.5)
}

func (c *canvas) footer(left, right string) {
	c.rect(pad, Height-pad-58, Width-pad, Height-pad-56.5, line)
	s := style{face: c.face(c.f.mono), size: 20, color: faint, tracking: 0.02}
	c.ts.draw(c.img, s, left, pad, Height-pad)
	if right != "" {
		c.ts.draw(c.img, s, right, Width-pad-c.ts.width(s, right), Height-pad)
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

// Site renders the default card for blank.achraf.tn.
func Site() ([]byte, error) {
	c, err := newCanvas()
	if err != nil {
		return nil, err
	}
	c.glow(Width/2, Height*0.42, 230, 0.11, accent)

	const size = 216
	x := (Width - c.wordmarkWidth(size, true)) / 2
	c.wordmark(x, 330, size, true)

	a := style{face: c.face(c.f.sans), size: 34, color: muted}
	b := style{face: c.face(c.f.sans), size: 34, color: ink}
	t1, t2 := "A quiet place for your thoughts. ", "Just start typing."
	w := c.ts.width(a, t1) + c.ts.width(b, t2)
	x = (Width - w) / 2
	x = c.ts.draw(c.img, a, t1, x, 430)
	c.ts.draw(c.img, b, t2, x, 430)

	m := style{face: c.face(c.f.mono), size: 21, color: faint, tracking: 0.08}
	label := "BLANK.ACHRAF.TN"
	c.ts.draw(c.img, m, label, (Width-c.ts.width(m, label))/2, Height-72)
	return c.png()
}

// SharedNote renders the card for a live shared note.
func SharedNote(n Note) ([]byte, error) {
	c, err := newCanvas()
	if err != nil {
		return nil, err
	}
	c.glow(Width-140, 60, 260, 0.12, accent)
	c.glow(-40, Height+40, 220, 0.05, accent)

	c.wordmark(pad, pad+44, 56, false)
	if n.ExpiresAt != nil {
		c.pill(Width-pad, pad+28, "Fades "+n.ExpiresAt.UTC().Format("2 Jan 2006"), true)
	} else {
		c.pill(Width-pad, pad+28, "Shared note", false)
	}

	heading, body := Present(n.Title, n.Content)
	words := WordCount(heading + " " + body)
	heading, okH := renderable(c.f.serif, heading)
	excerpt, okB := renderable(c.f.sans, Plain(body))
	if !okH || heading == "" {
		// Text in a script these fonts can't draw: lead with a neutral line rather than boxes.
		heading = "A note, shared with you."
		if !okB {
			excerpt = ""
		}
	}
	if !okB {
		excerpt = ""
	}

	maxW := float32(Width - pad*2)
	titleTop := float32(212)
	big := style{face: c.face(c.f.serif), size: 92, color: ink, tracking: -0.015}
	lines := c.ts.wrap(big, heading, maxW, 1)
	if strings.HasSuffix(lines[0], "…") {
		big.size = 76
		maxLines := 2
		if excerpt == "" {
			maxLines = 3
		}
		lines = c.ts.wrap(big, heading, maxW, maxLines)
	}
	lh := big.size * 1.04
	y := titleTop + big.size*0.8
	for _, l := range lines {
		c.ts.draw(c.img, big, l, pad, y)
		y += lh
	}

	if excerpt != "" {
		s := style{face: c.face(c.f.sans), size: 29, color: muted}
		maxLines := 3
		if len(lines) > 1 {
			maxLines = 2
		}
		y += 26 - lh + s.size*1.55
		for _, l := range c.ts.wrap(s, excerpt, maxW, maxLines) {
			c.ts.draw(c.img, s, l, pad, y)
			y += s.size * 1.55
		}
	}

	unit := "words"
	if words == 1 {
		unit = "word"
	}
	right := fmt.Sprintf("%d %s · %d min read", words, unit, max(1, (words+199)/200))
	c.footer("blank.achraf.tn", right)
	return c.png()
}

// Unavailable renders the card for a share link that expired (gone=true) or never existed.
func Unavailable(gone bool) ([]byte, error) {
	c, err := newCanvas()
	if err != nil {
		return nil, err
	}
	c.glow(Width-140, 60, 260, 0.06, accent)
	c.wordmark(pad, pad+44, 56, false)

	title, sub := "This note isn’t here.", "The link may be incomplete, or the note was removed."
	if gone {
		title, sub = "This note has faded.", "It was shared with an expiry, and that time has passed."
	}
	t := style{face: c.face(c.f.serifItalic), size: 92, color: muted, tracking: -0.015}
	c.ts.draw(c.img, t, title, pad, 212+92*0.8)
	s := style{face: c.face(c.f.sans), size: 29, color: faint}
	c.ts.draw(c.img, s, sub, pad, 212+92*0.8+26+29*1.55)
	c.footer("blank.achraf.tn", "write your own →")
	return c.png()
}
