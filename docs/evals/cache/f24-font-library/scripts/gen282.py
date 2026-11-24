from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
c = canvas.Canvas("fx/ac282-name-lies.pdf", pagesize=(595, 842)); y = 780
for i, (ttf, text) in enumerate([("fx/ttf/fake-lora.ttf", "Named Lora, drawn in Roboto: total due 450"), ("fx/ttf/fake-roboto.ttf", "Named Roboto, drawn in Playfair: total 450"), ("fx/ttf/fake-inter.ttf", "Named Inter, drawn in DejaVu Serif: total 450")]):
    pdfmetrics.registerFont(RLFont(f"L{i}", ttf)); c.setFont(f"L{i}", 16); c.drawString(60, y, text); y -= 60
c.save()
