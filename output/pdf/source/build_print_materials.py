from pathlib import Path
import math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white, black
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfdoc import PDFString
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing

ROOT = next(p for p in Path(__file__).resolve().parents if (p / 'website/src').is_dir())
OUT = ROOT / 'output/pdf'
ASSETS = ROOT / 'website/src/assets/device-mockups'
FONTS = Path(__file__).resolve().parent / 'fonts'
for name in ['Figtree-Regular', 'Figtree-Semibold', 'Figtree-Bold', 'Fraunces-Medium']:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / f'{name}.ttf')))
REG, SEMI, BOLD, SERIF = 'Figtree-Regular', 'Figtree-Semibold', 'Figtree-Bold', 'Fraunces-Medium'
INK = HexColor('#0f172a')
GREEN = HexColor('#256f00')
LEAF = HexColor('#45b700')
MUTED = HexColor('#51616a')
PALE = HexColor('#eff7e9')
LINE = HexColor('#cbd6c6')
PAPER = HexColor('#f8faf6')
IOS = 'https://apps.apple.com/de/app/health-habit-hub/id6793165538'
ANDROID = 'https://play.google.com/store/apps/details?id=de.felixreinsch.healthhabithub'
META = []


class Page:
    def __init__(self, c, width, height):
        self.c, self.w, self.h = c, width, height

    def rect(self, x, y, w, h, fill, radius=0, stroke=None, line=0.5):
        c = self.c
        c.setFillColor(fill or white)
        c.setStrokeColor(stroke or fill or white)
        c.setLineWidth(line)
        if radius:
            c.roundRect(x*mm, (self.h-y-h)*mm, w*mm, h*mm, radius*mm, fill=int(fill is not None), stroke=int(stroke is not None))
        else:
            c.rect(x*mm, (self.h-y-h)*mm, w*mm, h*mm, fill=int(fill is not None), stroke=int(stroke is not None))

    def line(self, x, y, x2, y2, color=LINE, width=0.6):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(x*mm, (self.h-y)*mm, x2*mm, (self.h-y2)*mm)

    def circle(self, x, y, r, fill, stroke=None, line=0.5):
        self.c.setFillColor(fill or white)
        self.c.setStrokeColor(stroke or fill or white)
        self.c.setLineWidth(line)
        self.c.circle(x*mm, (self.h-y)*mm, r*mm, fill=int(fill is not None), stroke=int(stroke is not None))

    def text(self, text, x, y, size=10, font=REG, color=INK, align='left'):
        self.c.setFillColor(color)
        self.c.setFont(font, size)
        fn = {'left':self.c.drawString, 'center':self.c.drawCentredString, 'right':self.c.drawRightString}[align]
        fn(x*mm, (self.h-y)*mm, text)
        tw = pdfmetrics.stringWidth(text, font, size)/mm
        left = x if align == 'left' else x-tw if align == 'right' else x-tw/2
        assert left >= 7.5 and left+tw <= self.w-7.5, (text, left, left+tw, self.w)

    def para(self, text, x, y, w, size=10, leading=None, font=REG, color=MUTED, max_h=None):
        style = ParagraphStyle('p', fontName=font, fontSize=size, leading=leading or size*1.38,
            textColor=color, splitLongWords=False, allowWidows=0, allowOrphans=0)
        p = Paragraph(text, style)
        aw, ah = p.wrap(w*mm, self.h*mm)
        if max_h:
            assert ah/mm <= max_h, (text, ah/mm, max_h)
        assert y+ah/mm < self.h-7, (text, y+ah/mm)
        p.drawOn(self.c, x*mm, (self.h-y)*mm-ah)
        return ah/mm

    def heading(self, lines, x, y, size=27, leading=1.05, color=INK):
        for i, s in enumerate(lines):
            self.text(s, x, y+i*size*leading/mm, size, SERIF, color)

    def image(self, path, x, y, w=None, h=None):
        img = ImageReader(str(path))
        iw, ih = img.getSize()
        if w is None: w = h*iw/ih
        if h is None: h = w*ih/iw
        self.c.drawImage(img, x*mm, (self.h-y-h)*mm, w*mm, h*mm, mask='auto')
        return w, h

    def rotated_image(self, path, cx, cy, h, angle):
        img = ImageReader(str(path))
        iw, ih = img.getSize()
        w = h*iw/ih
        self.c.saveState()
        self.c.translate(cx*mm, (self.h-cy)*mm)
        self.c.rotate(angle)
        self.c.drawImage(img, -w*mm/2, -h*mm/2, w*mm, h*mm, mask='auto')
        self.c.restoreState()

    def svg(self, path, x, y, h):
        from svglib.svglib import svg2rlg
        d = svg2rlg(str(path))
        factor = h*mm/d.height
        w = d.width*factor/mm
        d.scale(factor, factor)
        renderPDF.draw(d, self.c, x*mm, (self.h-y-h)*mm)
        return w

    def brand(self, x, y, scale=1):
        s = 9*scale
        self.image(ROOT/'website/public/app_icon.png', x, y, w=s)
        self.text('Health Habit Hub', x+s+3*scale, y+5.9*scale, 11.2*scale, SEMI)

    def eyebrow(self, text, x, y, color=GREEN, size=8):
        self.text(text, x, y, size, BOLD, color)

    def link(self, url, x, y, w, h):
        self.c.linkURL(url, (x*mm, (self.h-y-h)*mm, (x+w)*mm, (self.h-y)*mm), relative=0, thickness=0)

    def qr(self, value, x, y, size):
        # Vector QR, error correction M, four-module white quiet zone on all sides.
        qr = QrCodeWidget(value, barLevel='M', barBorder=4, barFillColor=black,
                          barStrokeColor=black, barWidth=size*mm, barHeight=size*mm)
        b = qr.getBounds()
        d = Drawing(size*mm, size*mm, transform=[size*mm/(b[2]-b[0]), 0, 0, size*mm/(b[3]-b[1]), 0, 0])
        d.add(qr)
        self.rect(x, y, size, size, white)
        renderPDF.draw(d, self.c, x*mm, (self.h-y-size)*mm)
        self.link(value, x, y, size, size)
        META.append({'page':self.c.getPageNumber(),'url':value,'x':x,'y':y,'size_mm':size})


def new_canvas(path, size, title):
    c = canvas.Canvas(str(path), pagesize=(size[0]*mm,size[1]*mm), pageCompression=1)
    c.setTitle(title)
    c.setAuthor('Health Habit Hub | Forschungsgruppe Digital Health, TU Dresden')
    c.setSubject('Deutschsprachiges Druckmaterial für Health Habit Hub')
    c.setCreator('Health Habit Hub')
    c._doc.Catalog.Lang = PDFString('de-DE')
    return c


def fold_marks(p, xs):
    for x in xs:
        p.line(x, 3.5, x, 6.5, MUTED, 0.45)
        p.line(x, 203.5, x, 206.5, MUTED, 0.45)


def network(p, x, y):
    # A small, clearly illustrative network, rather than invented usage statistics.
    nodes = [(-24,-5,8,'Schlaf'),(0,-14,9,'Bewegung'),(24,-1,8,'Ernährung'),(9,13,7,'Alltag'),(-17,16,7,'Ruhe')]
    for a,b in [(0,1),(1,2),(2,3),(3,4),(4,0),(1,3),(0,3)]:
        p.line(x+nodes[a][0],y+nodes[a][1],x+nodes[b][0],y+nodes[b][1],LINE,1)
    for i,(dx,dy,r,label) in enumerate(nodes):
        p.circle(x+dx,y+dy,r,PALE if i%2 else HexColor('#deedcf'))
        p.text(label,x+dx,y+dy+0.8,6.8,SEMI,GREEN,'center')


def phone_network(p, start, width):
    nodes = [(12,79,2.3),(19,65,1.2),(width-19,69,1.8),(width-11,91,2.5),
             (width-16,142,1.4),(width-11,155,2.1),(15,150,2),(10,119,1.2)]
    for a,b in [(0,1),(1,2),(2,3),(3,4),(4,5),(5,6),(6,7),(7,0),(0,4),(2,6)]:
        p.line(start+nodes[a][0],nodes[a][1],start+nodes[b][0],nodes[b][1],LINE,0.65)
    for i,(x,y,r) in enumerate(nodes):
        p.circle(start+x,y,r,LEAF if i in (1,4,7) else white,GREEN if i not in (1,4,7) else None,0.6)


def cover_network(p):
    nodes = [(211,118,2.2),(226,105,1.5),(249,109,2.0),(281,117,2.6),
             (284,150,1.7),(275,179,2.2),(226,183,1.7),(209,151,2.5)]
    for a,b in [(0,1),(1,2),(2,3),(3,4),(4,5),(5,6),(6,7),(7,0),(0,4),(1,5),(3,6)]:
        p.line(nodes[a][0],nodes[a][1],nodes[b][0],nodes[b][1],LINE,0.8)
    for i,(x,y,r) in enumerate(nodes):
        p.circle(x,y,r,LEAF if i%3==0 else white,GREEN if i%3 else None,0.8)


def flyer():
    path = OUT/'health-habit-hub-faltflyer-de.pdf'
    c = new_canvas(path, (297,210), 'Health Habit Hub | Faltflyer | A4 Wickelfalz')
    p = Page(c,297,210)
    # Outside: shorter inward flap (97 mm), back (100 mm), cover (100 mm).
    p.rect(8,8,81,190,PAPER,radius=3)
    p.eyebrow('DIE IDEE DAHINTER',16,21)
    p.heading(['Dein Alltag.', 'Unsere', 'Forschung.'],16,35,size=25)
    p.para('Was hilft, damit aus einem Vorsatz eine Gewohnheit wird? Das Health Habit Hub verbindet einen Tracker für deinen Alltag mit Forschung an der TU Dresden.',16,69,65,size=10.2,max_h=35)
    network(p,49,123)
    p.para('Du entscheidest, was du teilst. Die Teilnahme ist freiwillig. Für die reguläre Teilnahme brauchst du weder Namen noch E-Mail-Adresse.',16,152,65,size=10.2,max_h=30)
    p.text('Digital Health · TU Dresden',16,189,8.3,SEMI,GREEN)

    x = 106
    p.eyebrow('JETZT MITMACHEN',x,21)
    p.heading(['App laden.', 'Alltag entdecken.'],x,35,size=24.5)
    p.para('Kostenlos für iOS und Android.<br/>Scanne den passenden QR-Code.',x,57,80,size=10.2,max_h=14)
    p.text('iPhone / iOS',x+17,78,9.2,SEMI,INK,'center')
    p.text('Android',x+61,78,9.2,SEMI,INK,'center')
    p.qr(IOS,x,81,34)
    p.qr(ANDROID,x+44,81,34)
    p.text('App Store',x+17,120,8.6,SEMI,GREEN,'center')
    p.text('Google Play',x+61,120,8.6,SEMI,GREEN,'center')
    steps = [(132,'Studieninformation lesen und einwilligen.'),(148,'Konto einrichten. Die 24-Wort-Wiederherstellungsphrase sicher aufbewahren.'),(169,'Kein Studiencode? Wähle „Ohne Studiencode beitreten“.')]
    for i,(y,s) in enumerate(steps,1):
        p.circle(x+2.5,y+2.3,2.7,PALE)
        p.text(str(i),x+2.5,y+3.2,8,SEMI,GREEN,'center')
        p.para(s,x+9,y-0.6,69,size=9.1,leading=12.2,max_h=17)
    p.text('healthhabithub.de',x,192,11,SEMI,GREEN)
    p.link('https://healthhabithub.de',x,187,77,7)

    p.brand(206,16)
    p.eyebrow('GEWOHNHEITEN VERSTEHEN',206,40,size=7.7)
    p.heading(['Dein Alltag.', 'Deine Gewohnheiten.'],206,55,size=22.5,leading=1.12)
    p.para('Behalte deine Routinen im Blick und unterstütze die Forschung zu gesunden Gewohnheiten.',206,77,79,size=11,leading=15.5,max_h=23)
    cover_network(p)
    p.rotated_image(ASSETS/'Graph.png',232,144,72,9)
    p.rotated_image(ASSETS/'Habits.png',259,148,77,-9)
    p.text('Erfassen. Teilen. Entdecken.',206,198,10.5,SEMI,GREEN)
    fold_marks(p,[97,197])
    c.showPage()

    p = Page(c,297,210)
    panels = [
        (0,100,'01 / ROUTINEN FESTHALTEN',['Deine Routinen','im Blick.'],'Habits.png','Halte Gewohnheiten fest und erkenne im Kalender, wie regelmäßig du sie ausführst. Kurze Fragebögen machen sichtbar, wie selbstverständlich eine Routine wird.'),
        (100,100,'02 / WISSEN TEILEN',['Ein Netzwerk aus','Gewohnheiten.'],'Graph.png','Entdecke im gemeinsamen Graphen, welche Routinen andere Teilnehmende geteilt haben. Was du freiwillig beiträgst, hilft der Forschung, Alltagsgewohnheiten zu verstehen.'),
        (200,97,'03 / NEUE IDEEN ENTDECKEN',['Passende Ideen','für deinen Alltag.'],'Recommendations.png','Erhalte KI-generierte Vorschläge auf Basis einer kuratierten Sammlung verhaltenswissenschaftlicher Fachartikel. Du entscheidest, was du ausprobieren möchtest.'),
    ]
    for start,width,eyebrow,head,shot,body in panels:
        p.eyebrow(eyebrow,start+9,18,size=7.5)
        p.heading(head,start+9,32,size=23)
        p.line(start+9,47,start+28,47,LEAF,1.4)
        phone_network(p,start,width)
        h=105
        w=h*1317/2716
        p.image(ASSETS/shot,start+(width-w)/2,55,h=h)
        p.para(body,start+9,171,width-18,size=9.9,leading=13.5,max_h=25)
    fold_marks(p,[100,200])
    c.save()
    return path


def poster(platform):
    is_ios=platform=='ios'
    name='iPhone / iOS' if is_ios else 'Android'
    store='App Store' if is_ios else 'Google Play'
    url=IOS if is_ios else ANDROID
    path=OUT/f'health-habit-hub-a4-{platform}-de.pdf'
    c=new_canvas(path,(210,297),f'Health Habit Hub | {name} herunterladen | A4')
    p=Page(c,210,297)
    p.brand(16,17,1.2)
    chip_w=39 if is_ios else 33
    p.rect(194-chip_w,18,chip_w,10,PALE,radius=5)
    p.text(name,194-chip_w/2,24.7,10.5,SEMI,GREEN,'center')
    p.eyebrow('GEWOHNHEITEN FESTHALTEN. FORSCHUNG UNTERSTÜTZEN.',16,47,size=8.8)
    p.heading(['Deine Gewohnheiten.', 'Dein nächster Schritt.'],16,65,size=34.5,leading=1.08)
    p.text('Behalte deinen Alltag im Blick und entdecke Ideen für deine Routinen. Mit dem Health Habit Hub.',16,96,size=11.5,font=REG,color=MUTED)

    p.eyebrow('FÜR DEIN IPHONE' if is_ios else 'FÜR DEIN ANDROID-SMARTPHONE',22,124,size=7.5)
    p.qr(url,20,128,87)
    p.image(ROOT/'website/public/app_icon.png',135,135,w=42)
    p.text('Health',156,192,20,SERIF,INK,'center')
    p.text('Habit Hub',156,201,20,SERIF,INK,'center')
    p.line(118,128,118,210,LINE,0.6)

    p.text('Scannen. App laden. Loslegen.',16,235,23,SERIF,INK)
    badge_path = Path(__file__).resolve().parent/'assets/app-store-de.svg' if is_ios else ROOT/'website/public/badges/google-play-de.svg'
    badge_w = p.svg(badge_path,16,245,17)
    p.link(url,16,245,badge_w,17)
    p.text('Verfügbar für iOS' if is_ios else 'Verfügbar im Play Store',16+badge_w+8,251.5,12,SEMI,GREEN)
    p.text('Kostenlos herunterladen',16+badge_w+8,258.5,10,REG,MUTED)
    p.line(16,274,194,274,LINE,0.8)
    p.text('Digital Health · TU Dresden',16,283,9,SEMI)
    p.text('healthhabithub.de',194,283,11,SEMI,GREEN,'right')
    p.link('https://healthhabithub.de',147,277,47,8)
    c.save()
    return path


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    paths=[flyer(),poster('ios'),poster('android')]
    for p in paths: print(p)
