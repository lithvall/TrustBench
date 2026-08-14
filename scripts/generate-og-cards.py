# generate_og_cards.py
#
# Renders the 5 OG/Twitter card images for trustbench.io public pages.
# Output: 1200x630 PNG files (the size X uses for summary_large_image).
#
# Design tokens mirror src/site-chrome.ts:
#   brand green #1F7A3A, primary-dark #0F4D24, soft-green #E8F3EC,
#   bg #FAFAF7, ink #0F1A14, muted #5C6963, border #E4E8E5.
# Typography matches site CSS: Inter for prose, JetBrains Mono for label-caps.
#
# Rendering strategy: cairosvg rasterizes the bench-and-shield mark from the
# canonical SVG (kept identical to site-chrome.ts BENCH_LOGO_SVG so brand
# stays consistent). PIL composites everything else.

import os
import io
from PIL import Image, ImageDraw, ImageFont
import cairosvg

# --- brand tokens -------------------------------------------------------------
GREEN = (31, 122, 58)         # #1F7A3A
GREEN_DARK = (15, 77, 36)     # #0F4D24
SOFT_GREEN = (232, 243, 236)  # #E8F3EC
BG = (250, 250, 247)          # #FAFAF7
SURFACE = (255, 255, 255)     # #FFFFFF
INK = (15, 26, 20)            # #0F1A14
MUTED = (92, 105, 99)         # #5C6963
FAINT = (138, 147, 142)       # #8A938E
BORDER = (228, 232, 229)      # #E4E8E5
AMBER = (180, 83, 9)          # #B45309

# --- fonts --------------------------------------------------------------------
INTER_REG = "/tmp/fonts/extras/otf/Inter-Regular.otf"
INTER_SEMI = "/tmp/fonts/extras/otf/Inter-SemiBold.otf"
INTER_BOLD = "/tmp/fonts/extras/otf/Inter-Bold.otf"
JBM_REG = "/tmp/fonts/fonts/ttf/JetBrainsMono-Regular.ttf"
JBM_BOLD = "/tmp/fonts/fonts/ttf/JetBrainsMono-Bold.ttf"
JBM_SEMI = "/tmp/fonts/fonts/ttf/JetBrainsMono-SemiBold.ttf"

def f(path, size): return ImageFont.truetype(path, size)

# --- bench + shield logo, rasterized from SVG --------------------------------
# Kept byte-identical to site-chrome.ts BENCH_LOGO_SVG so the rasterized
# version matches the inline SVG on the live site exactly.
LOGO_SVG = """<svg width="{w}" height="{w}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="13" width="26" height="2.5" rx="0.5" fill="#1F7A3A"/>
  <rect x="3" y="17" width="26" height="2" rx="0.5" fill="#1F7A3A"/>
  <rect x="3" y="20.5" width="26" height="2" rx="0.5" fill="#1F7A3A"/>
  <rect x="5" y="22.5" width="2" height="6" fill="#1F7A3A"/>
  <rect x="25" y="22.5" width="2" height="6" fill="#1F7A3A"/>
  <path d="M16 4 L22 6 L22 12 Q22 15.5 16 18 Q10 15.5 10 12 L10 6 Z" fill="#1F7A3A" stroke="#FAFAF7" stroke-width="0.6"/>
  <text x="16" y="13.4" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="8.5" fill="#FFFFFF">T</text>
</svg>"""

# White-on-green variant for use on the green rail.
LOGO_SVG_INVERSE = """<svg width="{w}" height="{w}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="13" width="26" height="2.5" rx="0.5" fill="#FFFFFF"/>
  <rect x="3" y="17" width="26" height="2" rx="0.5" fill="#FFFFFF"/>
  <rect x="3" y="20.5" width="26" height="2" rx="0.5" fill="#FFFFFF"/>
  <rect x="5" y="22.5" width="2" height="6" fill="#FFFFFF"/>
  <rect x="25" y="22.5" width="2" height="6" fill="#FFFFFF"/>
  <path d="M16 4 L22 6 L22 12 Q22 15.5 16 18 Q10 15.5 10 12 L10 6 Z" fill="#FFFFFF" stroke="#1F7A3A" stroke-width="0.6"/>
  <text x="16" y="13.4" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="8.5" fill="#1F7A3A">T</text>
</svg>"""

def render_logo(size_px, inverse=False):
    """Rasterize the bench-and-shield SVG to a PIL Image at size_px x size_px."""
    svg = (LOGO_SVG_INVERSE if inverse else LOGO_SVG).format(w=size_px)
    png_bytes = cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                                 output_width=size_px, output_height=size_px)
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")

# --- text helpers -------------------------------------------------------------
def text_w(draw, s, font):
    """PIL text-bbox width."""
    box = draw.textbbox((0, 0), s, font=font)
    return box[2] - box[0]

def draw_label_caps(draw, xy, s, color=GREEN, size=18):
    """JetBrains Mono uppercase letter-spaced label, matching .label-caps."""
    font = f(JBM_BOLD, size)
    # Crude letter-spacing: insert hair-space (U+200A) between chars. PIL
    # doesn't expose letter-spacing directly. 0.06em is the CSS value;
    # approximate visually.
    x, y = xy
    upper = s.upper()
    for ch in upper:
        draw.text((x, y), ch, font=font, fill=color)
        x += text_w(draw, ch, font) + max(1, int(size * 0.06))

def draw_wrapped(draw, xy, text, font, fill, max_w, line_h):
    """Word-wrap to max_w, render line-by-line at line_h spacing."""
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_w(draw, trial, font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return y

# --- card frame ---------------------------------------------------------------
W, H = 1200, 630

def base_canvas():
    """Shared chrome: green left rail with white logo, off-white right area,
    bottom border line, footer with URL + brand mark."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Left green rail (160px) — gives every card a strong brand anchor.
    RAIL = 160
    d.rectangle([0, 0, RAIL, H], fill=GREEN)

    # Logo (inverse, white-on-green) on the rail, near top.
    # Logo (inverse, white-on-green) centered vertically on the rail.
    # Earlier attempt added a rotated TRUSTBENCH wordmark below the logo,
    # but the rotation overshot the 630px canvas and clipped to "BENCH" only.
    # Dropped: the shield mark + footer URL is enough branding on a 1200x630 card.
    LOGO_PX = 120
    logo = render_logo(LOGO_PX, inverse=True)
    img.paste(logo, ((RAIL - LOGO_PX) // 2, (H - LOGO_PX) // 2), logo)

    # Thin bottom strip in the right area: hair-rule + footer label.
    d.line([(RAIL + 64, H - 80), (W - 64, H - 80)], fill=BORDER, width=1)

    return img, d, RAIL

def draw_footer(d, rail, url, right_label):
    """Bottom-aligned footer: URL on the left, page label on the right."""
    url_font = f(JBM_SEMI, 22)
    label_font = f(JBM_REG, 18)
    d.text((rail + 64, H - 55), url, font=url_font, fill=GREEN_DARK)
    label_w = text_w(d, right_label, label_font)
    d.text((W - 64 - label_w, H - 51), right_label, font=label_font, fill=MUTED)

# --- card variants ------------------------------------------------------------
def card_home(out):
    img, d, rail = base_canvas()
    x0 = rail + 64
    y = 110
    draw_label_caps(d, (x0, y), "Public Registry + Live Telemetry")
    y += 56
    headline = "x402 endpoint trust,\non-chain verified."
    head_font = f(INTER_BOLD, 78)
    for line in headline.split("\n"):
        d.text((x0, y), line, font=head_font, fill=INK)
        y += 92
    y += 16
    sub_font = f(INTER_REG, 30)
    draw_wrapped(d, (x0, y),
                 "Non-custodial smart router for agent payments. "
                 "Cross-network coverage across Base and Solana.",
                 sub_font, MUTED, W - x0 - 80, 40)
    draw_footer(d, rail, "trustbench.io", "Registry · Router · Receipts")
    img.save(out, "PNG", optimize=True)

def card_methodology(out):
    img, d, rail = base_canvas()
    x0 = rail + 64
    y = 110
    draw_label_caps(d, (x0, y), "How We Measure")
    y += 56
    head_font = f(INTER_BOLD, 78)
    for line in ["HEAD probe.", "3 samples.", "From one host."]:
        d.text((x0, y), line, font=head_font, fill=INK)
        y += 92
    y += 8
    sub_font = f(INTER_REG, 28)
    draw_wrapped(d, (x0, y),
                 "Liveness telemetry, not a benchmark. "
                 "We say what we measure, including its limits.",
                 sub_font, MUTED, W - x0 - 80, 38)
    draw_footer(d, rail, "trustbench.io/methodology",
                "401/402/403/404/405/429 = alive")
    img.save(out, "PNG", optimize=True)

def card_rankings(out):
    img, d, rail = base_canvas()
    x0 = rail + 64
    y = 110
    draw_label_caps(d, (x0, y), "Live Rankings")
    y += 56
    head_font = f(INTER_BOLD, 78)
    for line in ["x402 endpoints,", "ranked by liveness."]:
        d.text((x0, y), line, font=head_font, fill=INK)
        y += 92
    y += 14
    sub_font = f(INTER_REG, 28)
    draw_wrapped(d, (x0, y),
                 "Cross-network. Base + Solana. Updated nightly.",
                 sub_font, MUTED, W - x0 - 80, 38)
    # Specimen pills near the right edge under the headline. Visual signal
    # that the page is a structured registry, not a wall of text.
    pill_font = f(JBM_BOLD, 16)
    px, py = x0, 472
    for label, fill_bg, fill_fg in [
        ("VERIFIED", SOFT_GREEN, GREEN_DARK),
        ("1P · COINBASE", SOFT_GREEN, GREEN_DARK),
        ("3P", (245, 247, 245), MUTED),
        ("BASE", (245, 247, 245), MUTED),
        ("SOLANA", (245, 247, 245), MUTED),
    ]:
        w = text_w(d, label, pill_font) + 24
        d.rounded_rectangle([px, py, px + w, py + 32], radius=16, fill=fill_bg)
        d.text((px + 12, py + 7), label, font=pill_font, fill=fill_fg)
        px += w + 10
    # Copy fix 2026-08-14: was "Pay-to-list (refundable bond) · Never
    # pay-to-rank". The bond is a design intent, not a shipped mechanism.
    # NOTE: the rendered PNGs are stale until this script is re-run.
    draw_footer(d, rail, "trustbench.io/rankings",
                "Free automatic listing · Never pay-to-rank")
    img.save(out, "PNG", optimize=True)

def card_pricing(out):
    img, d, rail = base_canvas()
    x0 = rail + 64
    y = 110
    draw_label_caps(d, (x0, y), "Pricing")
    y += 56
    head_font = f(INTER_BOLD, 86)
    for line in ["Flat per-tx.", "Never % spread."]:
        d.text((x0, y), line, font=head_font, fill=INK)
        y += 100
    y += 4
    sub_font = f(INTER_REG, 28)
    draw_wrapped(d, (x0, y),
                 "v0.1.0 ships POST /route at $0.005 per call. "
                 "x402-native, non-custodial.",
                 sub_font, MUTED, W - x0 - 80, 38)
    draw_footer(d, rail, "trustbench.io/pricing", "USDC on Base")
    img.save(out, "PNG", optimize=True)

def card_receipt(out):
    img, d, rail = base_canvas()
    x0 = rail + 64
    y = 110
    draw_label_caps(d, (x0, y), "Signed Receipt")
    y += 56
    head_font = f(INTER_BOLD, 78)
    for line in ["Ed25519 + JCS.", "Verifiable by anyone."]:
        d.text((x0, y), line, font=head_font, fill=INK)
        y += 92
    y += 16
    sub_font = f(INTER_REG, 28)
    draw_wrapped(d, (x0, y),
                 "Public key at /.well-known/trustbench-pubkey. "
                 "On-chain settlement attested.",
                 sub_font, MUTED, W - x0 - 80, 38)
    # Two pill badges, mirroring the live receipt-html.ts render.
    badge_font = f(INTER_SEMI, 20)
    bx, by = x0, 470
    for label in ["Signature valid", "On-chain verified"]:
        # U+2713 CHECK MARK; Inter ships this glyph cleanly.
        text = f"✓  {label}"
        w = text_w(d, text, badge_font) + 36
        d.rounded_rectangle([bx, by, bx + w, by + 44], radius=22, fill=SOFT_GREEN)
        d.text((bx + 18, by + 11), text, font=badge_font, fill=GREEN_DARK)
        bx += w + 14
    draw_footer(d, rail, "trustbench.io/receipts/...",
                "Third-party verifier: @trustbench/verify-receipt")
    img.save(out, "PNG", optimize=True)

# --- main ---------------------------------------------------------------------
def main():
    out_dir = "/sessions/gracious-funny-volta/mnt/TrustBench/public/og"
    os.makedirs(out_dir, exist_ok=True)
    cards = [
        ("home.png", card_home),
        ("methodology.png", card_methodology),
        ("rankings.png", card_rankings),
        ("pricing.png", card_pricing),
        ("receipt.png", card_receipt),
    ]
    for name, fn in cards:
        path = os.path.join(out_dir, name)
        fn(path)
        print(f"wrote {path} ({os.path.getsize(path)} bytes)")

if __name__ == "__main__":
    main()
