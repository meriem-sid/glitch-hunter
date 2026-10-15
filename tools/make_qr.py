# Makes assets/qr-play.png: the QR code shown on the stand's start and game over screens,
# so visitors can open the online version of the game on their phone.
#
#   pip install segno
#   python tools/make_qr.py                       (uses the address below)
#   python tools/make_qr.py https://example.com/  (or any other address)
#
# Black on white with a white border is what phone cameras read most reliably,
# so the QR code itself isn't neon; the game draws a neon frame around it.
import sys
import segno

URL = "https://meriem-sid.github.io/glitch-hunter/"

url = sys.argv[1] if len(sys.argv) > 1 else URL
qr = segno.make(url, error="m")
qr.save("assets/qr-play.png", scale=8, border=4, dark="black", light="white")
print("saved assets/qr-play.png for", url, "- version", qr.version, qr.symbol_size(scale=8, border=4), "px")
