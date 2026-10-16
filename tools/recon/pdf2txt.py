"""Dependency-free PDF text extractor.

Parses the PDF object graph, resolves each page's /Contents streams, then
extracts show-text operators. Handles FlateDecode, PDF literal/hex strings,
plain (Latin-1) fonts, and ToUnicode CMaps for CID fonts.
"""
import re
import sys
import zlib


# ---------------------------------------------------------------- object model

OBJ_RE = re.compile(rb"(?<![0-9])(\d+)\s+(\d+)\s+obj\b(.*?)\bendobj", re.S)


class Pdf:
    def __init__(self, data: bytes):
        self.data = data
        self.objs = {}
        for m in OBJ_RE.finditer(data):
            self.objs[int(m.group(1))] = m.group(3)
        self.trailer = data

    # -- low level helpers -------------------------------------------------
    @staticmethod
    def _stream_of(body: bytes):
        m = re.search(rb"stream\r?\n", body)
        if not m:
            return None, body
        dic = body[: m.start()]
        end = body.find(b"endstream", m.end())
        raw = body[m.end(): end if end >= 0 else len(body)]
        raw = raw.rstrip(b"\r\n")
        if b"FlateDecode" in dic:
            try:
                raw = zlib.decompress(raw)
            except Exception:
                try:
                    raw = zlib.decompressobj().decompress(raw)
                except Exception:
                    pass
        return dic, raw

    def get(self, num):
        return self.objs.get(num)

    def resolve(self, token: bytes):
        """token like b'12 0 R' -> object body, else None."""
        m = re.match(rb"\s*(\d+)\s+\d+\s+R\b", token)
        if m:
            return self.get(int(m.group(1)))
        return None

    # -- page tree ---------------------------------------------------------
    def pages(self):
        out = []
        for num, body in self.objs.items():
            head = body[: body.find(b"stream") if b"stream" in body else len(body)]
            if re.search(rb"/Type\s*/Page\b", head) and not re.search(rb"/Type\s*/Pages\b", head):
                out.append((num, body))
        out.sort(key=lambda t: t[0])
        return out

    def content_bytes(self, page_body: bytes) -> bytes:
        head = page_body[: page_body.find(b"stream") if b"stream" in page_body else len(page_body)]
        m = re.search(rb"/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)", head, re.S)
        if not m:
            dic, raw = self._stream_of(page_body)
            return raw if dic is not None else b""
        spec = m.group(1)
        refs = re.findall(rb"(\d+)\s+\d+\s+R", spec)
        blob = b""
        for r in refs:
            body = self.get(int(r))
            if body is None:
                continue
            dic, raw = self._stream_of(body)
            blob += raw + b"\n"
        return blob

    # -- fonts / ToUnicode -------------------------------------------------
    def page_fonts(self, page_body: bytes):
        """Return {fontname: to_unicode_cmap_bytes} for the page's resources."""
        head = page_body[: page_body.find(b"stream") if b"stream" in page_body else len(page_body)]
        res_body = head
        m = re.search(rb"/Resources\s*(\d+)\s+\d+\s+R", head)
        if m:
            res_body = self.get(int(m.group(1))) or head
        fonts = {}
        fm = re.search(rb"/Font\s*<<(.*?)>>", res_body, re.S)
        if not fm:
            fm2 = re.search(rb"/Font\s*(\d+)\s+\d+\s+R", res_body)
            if not fm2:
                return fonts
            fdict = self.get(int(fm2.group(1))) or b""
        else:
            fdict = fm.group(1)
        for name, num in re.findall(rb"/([A-Za-z0-9#+._-]+)\s+(\d+)\s+\d+\s+R", fdict):
            fobj = self.get(int(num))
            if fobj is None:
                continue
            tu = re.search(rb"/ToUnicode\s+(\d+)\s+\d+\s+R", fobj)
            if tu:
                tb = self.get(int(tu.group(1)))
                if tb:
                    _, raw = self._stream_of(tb)
                    fonts[name.decode("latin-1")] = raw
        return fonts


# ---------------------------------------------------------------- CMap parsing

def parse_cmap(data: bytes):
    """Parse a ToUnicode CMap -> {code:int -> str}."""
    table = {}
    if not data:
        return table
    text = data
    for blk in re.findall(rb"beginbfchar(.*?)endbfchar", text, re.S):
        for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", blk):
            table[int(src, 16)] = _utf16be(dst)
    for blk in re.findall(rb"beginbfrange(.*?)endbfrange", text, re.S):
        for lo, hi, dst in re.findall(
                rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", blk):
            lo_i, hi_i = int(lo, 16), int(hi, 16)
            base = _utf16be(dst)
            if hi_i - lo_i > 65535:
                continue
            for k in range(lo_i, hi_i + 1):
                table[k] = base
    return table


def _utf16be(hexstr: bytes) -> str:
    h = hexstr.decode("ascii")
    if len(h) % 4 == 0 and len(h) > 0:
        try:
            return bytes.fromhex(h).decode("utf-16-be", "replace")
        except Exception:
            pass
    try:
        return chr(int(h, 16))
    except Exception:
        return ""


# ---------------------------------------------------------------- text ops

def decode_literal(s: bytes) -> bytes:
    out = bytearray()
    i = 0
    while i < len(s):
        c = s[i]
        if c == 0x5C and i + 1 < len(s):
            n = s[i + 1]
            simple = {0x6E: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12,
                      0x28: 0x28, 0x29: 0x29, 0x5C: 0x5C}
            if n in simple:
                out.append(simple[n]); i += 2; continue
            if 0x30 <= n <= 0x37:
                j, dig = i + 1, b""
                while j < len(s) and len(dig) < 3 and 0x30 <= s[j] <= 0x37:
                    dig += s[j: j + 1]; j += 1
                out.append(int(dig, 8) & 0xFF); i = j; continue
            out.append(n); i += 2; continue
        out.append(c); i += 1
    return bytes(out)


NUM = rb"[-+]?[\d.]+"
TOKEN_RE = re.compile(
    rb"/([A-Za-z0-9#+._-]+)\s+(" + NUM + rb")\s+Tf"
    rb"|(" + NUM + rb")\s+(" + NUM + rb")\s+(" + NUM + rb")\s+("
    + NUM + rb")\s+(" + NUM + rb")\s+(" + NUM + rb")\s+Tm"
    rb"|(" + NUM + rb")\s+(" + NUM + rb")\s+(TD|Td)"
    rb"|(T\*|ET)"
    rb"|(\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\))"
    rb"|(<[0-9A-Fa-f\s]*>)"
    rb"|(\[|\]|TJ|Tj)"
)


def extract_content(content: bytes, fonts) -> str:
    """Rebuild text lines by tracking the text-matrix y coordinate."""
    cur = None
    two_byte = False
    size = 1.0
    x = y = 0.0            # current text position
    last_line_y = None     # y of the line currently being written
    gap = 0.0              # accumulated horizontal advance since last glyph
    lines = []             # list of [ (x, text) ]
    cur_line = []

    def end_line():
        if cur_line:
            lines.append(sorted(cur_line, key=lambda t: t[0]))
            cur_line.clear()

    def newline(new_y):
        nonlocal last_line_y, gap, x
        if last_line_y is None or abs(new_y - last_line_y) > max(1.0, size * 0.3):
            end_line()
            last_line_y = new_y
        gap = 0.0

    def push(raw: bytes):
        nonlocal gap, x
        if cur:
            if two_byte:
                for k in range(0, len(raw) - 1, 2):
                    code = (raw[k] << 8) | raw[k + 1]
                    ch = cur.get(code, "")
                    _emit(ch)
            else:
                for b in raw:
                    ch = cur.get(b, chr(b) if 32 <= b < 127 else "")
                    _emit(ch)
        else:
            _emit(raw.decode("latin-1"))

    def _emit(ch):
        nonlocal gap, x
        if not ch:
            return
        if gap > size * 0.28 and cur_line:
            cur_line.append((x - gap, " "))
        cur_line.append((x, ch))
        w = size * (0.5 if ord(ch[0]) < 0x2E80 else 1.0)
        x += w
        gap = 0.0

    for m in TOKEN_RE.finditer(content):
        tok = m.group(0)
        if m.group(1) is not None:                       # /F1 12 Tf
            name = m.group(1).decode("latin-1")
            cur = fonts.get(name)
            two_byte = bool(cur) and _is_wide(cur)
            size = float(m.group(2))
        elif m.group(3) is not None:                     # a b c d e f Tm
            x, y = float(m.group(7)), float(m.group(8))
            size = abs(float(m.group(6))) or size
            newline(y)
            gap = 0.0
        elif m.group(9) is not None:                     # tx ty Td / TD
            x += float(m.group(9)); y += float(m.group(10))
            newline(y)
        elif m.group(11) is not None:                    # T*
            newline(y - size * 1.2)
        elif m.group(12) is not None:                    # ET
            end_line()
        elif m.group(13) is not None:                    # literal string
            push(decode_literal(m.group(13)[1:-1]))
            gap = size * 0.6
        elif m.group(14) is not None:                    # hex string
            h = re.sub(rb"[^0-9A-Fa-f]", b"", m.group(14)[1:-1])
            if len(h) % 2:
                h += b"0"
            try:
                push(bytes.fromhex(h.decode("ascii")))
            except Exception:
                pass
            gap = size * 0.6
        elif m.group(15) is not None and m.group(15) in (b"]",):
            gap = size * 0.6
    end_line()

    out = []
    for items in lines:
        out.append("".join(t for _, t in items).rstrip())
    text = "\n".join(out)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _is_wide(cmap) -> bool:
    if not cmap:
        return False
    wide = sum(1 for k in cmap if k > 255)
    return wide > len(cmap) * 0.5


def main(path: str) -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    with open(path, "rb") as fh:
        data = fh.read()
    pdf = Pdf(data)
    chunks = []
    for i, (_, body) in enumerate(pdf.pages(), 1):
        fonts = pdf.page_fonts(body)
        cmaps = {n: parse_cmap(raw) for n, raw in fonts.items()}
        content = pdf.content_bytes(body)
        txt = extract_content(content, cmaps)
        chunks.append(f"\n========== PAGE {i} ==========\n{txt}")
    if not chunks:
        # fallback: scan every stream for text operators
        for num, body in sorted(pdf.objs.items()):
            dic, raw = Pdf._stream_of(body)
            if dic is not None and (b"Tj" in raw or b"TJ" in raw):
                chunks.append(extract_content(raw, {}))
    print("\n".join(chunks))


if __name__ == "__main__":
    main(sys.argv[1])
