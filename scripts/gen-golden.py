# Generate the golden test fixture for the JS DeepSeek tokenizer port.
# Usage: python scripts/gen-golden.py <tokenizer.json> <out.json>
import json
import random
import sys

from tokenizers import Tokenizer

path, out = sys.argv[1], sys.argv[2]
tok = Tokenizer.from_file(path)
rng = random.Random(0xD5E3E4)

CHARSETS = [
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "0123456789",
    "  \t\n\r",
    "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
    "你好世界中文测试中文分词器測试",
    "こんにちは世界日本語",
    "😀🎉🚀✨🤔😊",
    "一二三四五六七八九十百千万",
    "{}(),;:<>[]/\\|@#^&*",
    "…—–«»·",
    "\u00e9\u00fc\u00df\u20ac\u4e2d\u6587",
    "DeepSeek-V3 is a powerful language model.",
    "①②③④⑤",
]

def random_text(maxlen=1200):
    n = rng.randint(1, maxlen)
    parts = []
    while len(parts) < n:
        cs = rng.choice(CHARSETS)
        k = rng.randint(1, 12)
        parts.append("".join(rng.choice(cs) for _ in range(k)))
    # keep the length roughly bounded by slicing on char boundary
    s = "".join(parts)
    return s[:n]

cases = []
def add_case(text):
    enc = tok.encode(text)
    cases.append({"text": text, "tokens": len(enc.ids)})

# Deterministic hand-picked cases
for text in [
    "",
    "Hello!",
    "Hello world",
    "  Hello  world  ",
    "Hi there, how are you? 42!",
    "你好世界！这是测试。",
    "1234567890",
    "1" * 5,
    "1" * 4,
    "1" * 3,
    "a" * 300,
    "a" * 257,
    "😀 emoji test 🎉",
    "こんにちは世界",
    'const foo = (x) => x.map(v => v * 2); // comment',
    "import math\n\ndef f(x):\n    return math.sqrt(x)\n",
    '"quoted" and \'single\' — dashes…',
    "A" * 1000,
    "\n\n\n",
    "|".join(["x"] * 50),
    "()[]{}",
    "\t\t\t",
    "€100,000.00",
    "１２３４５６７８９０",
    u"\u4e2d\u6587\u6d4b\u8bd5\u2014\u2014\u4e00\u4e8c\u4e09",
    "test<|endoftext|>test",
]:
    add_case(text)

# Random cases: 400 short-ish, 80 long
for _ in range(400):
    add_case(random_text(200))
for _ in range(80):
    add_case(random_text(3000))

# Streaming cases: prefix counts. Each row: {text, counts:[c1..ck]} where c_i =
# encode(text[:p_i]).tokens for random split points (character-safe).
streams = []
for _ in range(60):
    text = random_text(400)
    # build random split points (char indices, at least one)
    k = rng.randint(2, 12)
    pts = sorted(rng.sample(range(1, len(text) + 1), min(k, len(text))))
    counts = []
    for p in pts:
        enc = tok.encode(text[:p])
        counts.append(len(enc.ids))
    streams.append({"text": text, "parts": pts, "counts": counts})

# Stress stream: one very long CJK run + one long latin run, split into chunks
for text in ["你" * 2000 + "好世界！" * 200, ("the quick brown fox " * 600) + "!" * 30]:
    k = rng.randint(8, 20)
    pts = sorted(rng.sample(range(1, len(text) + 1), min(k, len(text))))
    counts = []
    for p in pts:
        enc = tok.encode(text[:p])
        counts.append(len(enc.ids))
    streams.append({"text": text, "parts": pts, "counts": counts})

doc = {"generator": "tokenizers " + __import__("tokenizers").__version__, "cases": cases, "streams": streams}
with open(out, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False)
print("cases:", len(cases), "streams:", len(streams), "->", out)
