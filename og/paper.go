package og

import (
	"image/color"
	"math"

	"github.com/srwiley/rasterx"
	"golang.org/x/image/math/fixed"
)

// Paper, shadow and texture primitives the cards are built from.

var (
	sheetFill   = color.RGBA{0xfe, 0xfd, 0xfb, 0xff}
	sheetBack   = color.RGBA{0xf9, 0xf7, 0xf2, 0xff}
	sheetEdge   = color.RGBA{0xe2, 0xde, 0xd5, 0xff}
	shadowColor = color.RGBA{0x3b, 0x34, 0x28, 0xff}
	dotColor    = color.RGBA{0xc9, 0xc3, 0xb7, 0xff}
	ghostColor  = color.RGBA{0xe3, 0xdf, 0xd7, 0xff}
	selection   = color.NRGBA{0x16, 0x5d, 0xfc, 0x2e} // --selection in web/src/index.css
)

// blend mixes col into the pixel at (x, y) with coverage a.
func (c *canvas) blend(x, y int, col color.RGBA, a float64) {
	if x < 0 || y < 0 || x >= Width || y >= Height || a <= 0 {
		return
	}
	a = math.Min(a, 1)
	i := c.img.PixOffset(x, y)
	p := c.img.Pix[i : i+3 : i+3]
	p[0] = uint8(float64(p[0])*(1-a) + float64(col.R)*a + 0.5)
	p[1] = uint8(float64(p[1])*(1-a) + float64(col.G)*a + 0.5)
	p[2] = uint8(float64(p[2])*(1-a) + float64(col.B)*a + 0.5)
}

// dots lays a notebook dot grid over the background, fading out towards the bottom-left.
func (c *canvas) dots(spacing int) {
	for y := spacing / 2; y < Height; y += spacing {
		for x := spacing / 2; x < Width; x += spacing {
			fx, fy := float64(x)/Width, float64(y)/Height
			a := 0.75 * math.Min(1, 0.25+0.9*(fx*0.7+(1-fy)*0.5))
			c.blend(x, y, dotColor, a)
			for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				c.blend(x+d[0], y+d[1], dotColor, a*0.35)
			}
		}
	}
}

// rectCoverage is how much of a Gaussian-blurred span [-half, half] covers u.
func rectCoverage(u, half, sigma float64) float64 {
	k := 1 / (sigma * math.Sqrt2)
	return 0.5 * (math.Erf((u+half)*k) - math.Erf((u-half)*k))
}

// blurRect paints a Gaussian-blurred w×h rectangle centred on (cx, cy), rotated by angle (radians).
func (c *canvas) blurRect(cx, cy, w, h, angle, sigma, strength float64, col color.RGBA) {
	sin, cos := math.Sincos(-angle)
	ex := math.Abs(w/2*cos) + math.Abs(h/2*sin) + sigma*3
	ey := math.Abs(w/2*sin) + math.Abs(h/2*cos) + sigma*3
	x0, x1 := max(0, int(cx-ex)), min(Width, int(cx+ex)+1)
	y0, y1 := max(0, int(cy-ey)), min(Height, int(cy+ey)+1)
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			dx, dy := float64(x)+0.5-cx, float64(y)+0.5-cy
			u, v := dx*cos-dy*sin, dx*sin+dy*cos
			a := strength * rectCoverage(u, w/2, sigma) * rectCoverage(v, h/2, sigma)
			if a > 0.002 {
				c.blend(x, y, col, a)
			}
		}
	}
}

// roundRectPath adds a w×h rounded rectangle centred on (cx, cy) and rotated by angle to a path.
func roundRectPath(a rasterx.Adder, cx, cy, w, h, r, angle float64) {
	sin, cos := math.Sincos(angle)
	pt := func(x, y float64) fixed.Point26_6 {
		return fixed.Point26_6{
			X: fixed.Int26_6((cx + x*cos - y*sin) * 64),
			Y: fixed.Int26_6((cy + x*sin + y*cos) * 64),
		}
	}
	hw, hh := w/2-r, h/2-r
	corners := [4][3]float64{{hw, -hh, -90}, {hw, hh, 0}, {-hw, hh, 90}, {-hw, -hh, 180}}
	const steps = 10
	for i, k := range corners {
		for s := 0; s <= steps; s++ {
			t := (k[2] + 90*float64(s)/steps) * math.Pi / 180
			p := pt(k[0]+r*math.Cos(t), k[1]+r*math.Sin(t))
			if i == 0 && s == 0 {
				a.Start(p)
			} else {
				a.Line(p)
			}
		}
	}
	a.Stop(true)
}

// sheet draws a sheet of paper with a soft drop shadow and a hairline edge.
func (c *canvas) sheet(cx, cy, w, h, angle float64, fill color.RGBA) {
	const r = 22
	c.blurRect(cx, cy+18, w-24, h-8, angle, 28, 0.13, shadowColor)
	c.blurRect(cx, cy+2, w, h, angle, 2.5, 0.07, shadowColor)
	c.fill(sheetEdge, func(a rasterx.Adder) { roundRectPath(a, cx, cy, w, h, r, angle) })
	c.fill(fill, func(a rasterx.Adder) { roundRectPath(a, cx, cy, w-3, h-3, r-1.5, angle) })
}

// ghostLines hints at text that isn't shown: rows of blurred word shapes, like a frosted preview.
// The shapes come from a fixed rhythm, never from the note itself.
func (c *canvas) ghostLines(x, y, maxW float64, rows int, strength float64) {
	rhythm := []float64{92, 54, 128, 70, 40, 112, 66, 86, 48, 122, 58, 98, 74, 36, 104}
	ends := map[int][]float64{1: {0.48}, 2: {0.92, 0.56}, 3: {0.95, 0.82, 0.5}}[rows]
	k := 0
	for row, end := range ends {
		cx, limit := x, x+maxW*end
		for {
			w := rhythm[k%len(rhythm)]
			k++
			if cx+w > limit {
				if cx == x || limit-cx > 34 {
					w = limit - cx
				} else {
					break
				}
			}
			c.blurRect(cx+w/2, y+float64(row)*40, w, 15, 0, 4.5, strength, ghostColor)
			cx += w + 16
			if cx >= limit {
				break
			}
		}
	}
}
