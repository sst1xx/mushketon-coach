#!/usr/bin/env python3
"""Generate PWA icons (icon-192.png, icon-512.png) as a simple shooting-target
sight glyph, using only the Python standard library (zlib) — no external deps.

Design: a dark circular badge with concentric ISSF-style rings (white/dark)
and a crosshair + center dot, on a transparent-free solid background so it
renders correctly as a maskable/any-purpose PWA icon.
"""
import struct
import zlib
import math

BG = (0x14, 0x1a, 0x21, 255)       # dark background
RING_LIGHT = (0xf5, 0xf3, 0xec, 255)  # off-white ring
RING_DARK = (0x14, 0x1a, 0x21, 255)   # dark ring (matches bg)
ACCENT = (0xd6, 0x3b, 0x2b, 255)      # red crosshair/center accent


def make_pixels(size: int):
    cx = cy = size / 2
    r_outer = size * 0.46
    px = [[BG for _ in range(size)] for _ in range(size)]

    ring_count = 5
    for y in range(size):
        for x in range(size):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d > r_outer:
                continue
            frac = d / r_outer
            ring_idx = int(frac * ring_count)
            color = RING_LIGHT if ring_idx % 2 == 0 else RING_DARK
            px[y][x] = color

    # crosshair
    line_w = max(2, size // 64)
    gap = size * 0.06
    arm = size * 0.40
    for y in range(size):
        for x in range(size):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d > r_outer:
                continue
            if abs(dx) <= line_w / 2 and gap < abs(dy) < arm:
                px[y][x] = ACCENT
            if abs(dy) <= line_w / 2 and gap < abs(dx) < arm:
                px[y][x] = ACCENT

    # center dot
    dot_r = size * 0.045
    for y in range(size):
        for x in range(size):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            if math.hypot(dx, dy) <= dot_r:
                px[y][x] = ACCENT

    return px


def write_png(path: str, size: int):
    pixels = make_pixels(size)
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # no filter
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    write_png("public/icon-192.png", 192)
    write_png("public/icon-512.png", 512)
    print("wrote public/icon-192.png and public/icon-512.png")
