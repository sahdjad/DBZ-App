#!/usr/bin/env python3
"""Generate hochmut_deutsch_final.docx from the markdown content."""

from docx import Document
from docx.shared import Pt, Mm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

# Color constants
DARK_GREEN = RGBColor(0x1a, 0x3a, 0x2a)
MID_GREEN  = RGBColor(0x2d, 0x5a, 0x3d)
GOLD       = RGBColor(0xc8, 0x92, 0x2a)
BEIGE      = RGBColor(0xf7, 0xf3, 0xec)
MID_TEXT   = RGBColor(0x3a, 0x3a, 0x3a)
LIGHT_TEXT = RGBColor(0x6a, 0x6a, 0x6a)
WHITE      = RGBColor(0xff, 0xff, 0xff)

doc = Document()

# --- Page setup ---
section = doc.sections[0]
section.page_width  = Mm(210)
section.page_height = Mm(297)
section.left_margin   = Mm(25)
section.right_margin  = Mm(25)
section.top_margin    = Mm(25)
section.bottom_margin = Mm(25)

# --- Styles ---
styles = doc.styles

def ensure_style(name, base='Normal'):
    try:
        return styles[name]
    except KeyError:
        return styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)

# Cover title
s = ensure_style('CoverTitle')
s.font.name = 'EB Garamond'
s.font.size = Pt(36)
s.font.bold = True
s.font.color.rgb = WHITE
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
s.paragraph_format.space_after = Pt(6)

# Cover subtitle
s = ensure_style('CoverSubtitle')
s.font.name = 'EB Garamond'
s.font.size = Pt(13)
s.font.italic = True
s.font.color.rgb = RGBColor(0xe8, 0xc8, 0x70)
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Chapter heading
s = ensure_style('ChapterHeading')
s.font.name = 'EB Garamond'
s.font.size = Pt(16)
s.font.bold = True
s.font.color.rgb = DARK_GREEN
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
s.paragraph_format.space_before = Pt(18)
s.paragraph_format.space_after  = Pt(10)

# Section heading
s = ensure_style('SectionHeading')
s.font.name = 'EB Garamond'
s.font.size = Pt(12)
s.font.bold = True
s.font.color.rgb = DARK_GREEN
s.paragraph_format.space_before = Pt(12)
s.paragraph_format.space_after  = Pt(6)

# Body text
s = ensure_style('BodyText')
s.font.name = 'EB Garamond'
s.font.size = Pt(11)
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
s.paragraph_format.space_after = Pt(6)

# Arabic text
s = ensure_style('ArabicText')
s.font.name = 'Amiri'
s.font.size = Pt(14)
s.font.color.rgb = DARK_GREEN
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
s.paragraph_format.space_after = Pt(4)

# Quran translation
s = ensure_style('QuranTranslation')
s.font.name = 'EB Garamond'
s.font.size = Pt(10.5)
s.font.italic = True
s.font.color.rgb = MID_TEXT
s.paragraph_format.left_indent = Mm(8)
s.paragraph_format.right_indent = Mm(8)
s.paragraph_format.space_after = Pt(2)

# Quote source
s = ensure_style('QuoteSource')
s.font.name = 'EB Garamond'
s.font.size = Pt(9)
s.font.bold = True
s.font.color.rgb = GOLD
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT

# Scholar quote
s = ensure_style('ScholarQuote')
s.font.name = 'EB Garamond'
s.font.size = Pt(10.5)
s.font.italic = True
s.font.color.rgb = MID_TEXT
s.paragraph_format.left_indent = Mm(10)
s.paragraph_format.space_after = Pt(4)

# Footnote text
s = ensure_style('FootnoteText')
s.font.name = 'EB Garamond'
s.font.size = Pt(8.5)
s.font.color.rgb = LIGHT_TEXT
s.paragraph_format.space_after = Pt(2)

# Lit entry
s = ensure_style('LitEntry')
s.font.name = 'EB Garamond'
s.font.size = Pt(10.5)
s.paragraph_format.left_indent = Mm(8)
s.paragraph_format.first_line_indent = Mm(-8)
s.paragraph_format.space_after = Pt(4)

# Meta label
s = ensure_style('MetaLabel')
s.font.name = 'EB Garamond'
s.font.size = Pt(9)
s.font.bold = True
s.font.color.rgb = GOLD
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Meta value
s = ensure_style('MetaValue')
s.font.name = 'EB Garamond'
s.font.size = Pt(11)
s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER

def add_para(text, style='BodyText', bold=False, italic=False, color=None, size=None, align=None):
    p = doc.add_paragraph(style=style)
    run = p.add_run(text)
    if bold:
        run.font.bold = True
    if italic:
        run.font.italic = True
    if color:
        run.font.color.rgb = color
    if size:
        run.font.size = Pt(size)
    if align:
        p.alignment = align
    return p

def add_hr(color_hex='c8922a'):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after  = Pt(4)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color_hex)
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p

def add_arabic(arabic_text, translation=None, source=None):
    p = add_para(arabic_text, style='ArabicText')
    if translation:
        pt = add_para(f'„{translation}"', style='QuranTranslation')
    if source:
        add_para(source, style='QuoteSource')

def add_page_break():
    doc.add_page_break()

# ================================================================
# COVER PAGE
# ================================================================
add_para('الْكِبْر', style='ArabicText', size=28, color=RGBColor(0xe8,0xc8,0x70))

p = add_para('HOCHMUT', style='CoverTitle', bold=True)
p.paragraph_format.space_before = Pt(12)

add_para('Eine Abhandlung über al-Kibr als Krankheit des Herzens', style='CoverSubtitle', italic=True)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(18)
p.paragraph_format.space_after  = Pt(6)
r = p.add_run('Medrese „Gazi Isa-Beg" Novi Pazar')
r.font.size = Pt(13)
r.font.bold = True
r.font.name = 'EB Garamond'
r.font.color.rgb = DARK_GREEN
p.alignment = WD_ALIGN_PARAGRAPH.CENTER

add_para('Abschlussarbeit im Fach Akhlāq (Islamische Ethik)', style='BodyText', align=WD_ALIGN_PARAGRAPH.CENTER)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(6)
r = p.add_run('Betreuer: ')
r.font.bold = True
r.font.name = 'EB Garamond'
r.font.size = Pt(11)
r = p.add_run('Prof. Edin Redžepović')
r.font.name = 'EB Garamond'
r.font.size = Pt(11)
r = p.add_run('   |   ')
r.font.name = 'EB Garamond'
r.font.size = Pt(11)
r = p.add_run('Verfasser: ')
r.font.bold = True
r.font.name = 'EB Garamond'
r.font.size = Pt(11)
r = p.add_run('Omer Kačapor')
r.font.name = 'EB Garamond'
r.font.size = Pt(11)

add_para('Novi Pazar, August 2025', style='BodyText', italic=True, align=WD_ALIGN_PARAGRAPH.CENTER)

add_hr()
add_page_break()

# ================================================================
# INHALTSVERZEICHNIS
# ================================================================
add_para('INHALTSVERZEICHNIS', style='ChapterHeading')
add_hr()

toc_entries = [
    ('1.', 'Einleitung', '3'),
    ('2.', 'Definition des Hochmuts', '4'),
    ('   2.1', 'Definition in der arabischen Sprache', '4'),
    ('   2.2', 'Definition in der Scharia', '4'),
    ('3.', 'Ursprung des Hochmuts und seine Gefahren', '5'),
    ('   3.1', 'Folgen des Hochmuts', '6'),
    ('   3.2', 'Regeln und Formen des Hochmuts', '7'),
    ('   3.3', 'Drei Stufen des Hochmuts', '8'),
    ('   3.4', 'Ursachen des Hochmuts', '9'),
    ('   3.5', 'Spuren des Hochmuts im Verhalten', '9'),
    ('   3.6', 'Die Realität des Hochmuts durch Aussagen der Gelehrten', '11'),
    ('4.', 'Behandlung des Hochmuts', '13'),
    ('5.', 'Schluss', '15'),
    ('6.', 'Literaturverzeichnis', '16'),
]

for num, title, page in toc_entries:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(f'{num}  {title}')
    r.font.name = 'EB Garamond'
    r.font.size = Pt(11)
    if not num.startswith('   '):
        r.font.bold = True
        r.font.color.rgb = DARK_GREEN
    else:
        r.font.color.rgb = MID_TEXT
    # add dots
    r2 = p.add_run(f'{"." * (50 - len(num) - len(title))}  {page}')
    r2.font.name = 'EB Garamond'
    r2.font.size = Pt(9)
    r2.font.color.rgb = LIGHT_TEXT

add_page_break()

# ================================================================
# EINLEITUNG
# ================================================================
add_para('EINLEITUNG', style='ChapterHeading')
add_hr()

add_para(
    'Alles Lob gebührt Allah, der über jegliche Ähnlichkeit mit Seinen Geschöpfen in Seinem Wesen erhaben ist, und auf den Seine Zeichen und Geschöpfe hinweisen. Ich bezeuge, dass es keinen Gott außer Allah gibt – Er wollte, was die Diener tun; hätte Er gewollt, sie vor den Sünden zu schützen, hätten sie Ihm nicht widersprochen; und hätte Er gewollt, dass alle Seine Diener Ihm gehorchen, wären sie gewiss gehorsam gewesen. Ich bezeuge ferner, dass Muhammad ﷺ Sein Diener und Gesandter ist, der letzte Gesandte in der zeitlichen Reihenfolge dieser Welt, und am Tage der Auferstehung der Geehrteste hinsichtlich Rang und Erwähnung. Allahs Segen, der Segen Seiner Engel und aller rechtschaffenen Geschöpfe sei auf ihm – auf demjenigen, der die Einheit Allahs bezeugte, zu Ihm führte und zu Ihm aufrief.',
    style='BodyText'
)

add_para(
    'Große Unterstützung bei der Ausarbeitung dieser Arbeit erhielt ich von meinem geschätzten Professor und zugleich Betreuer, Prof. Edin Redžepović. Möge Allah ihn mit der besten Belohnung belohnen.',
    style='BodyText'
)

add_para(
    'Ich werde mich bemühen, in dieser Abschlussarbeit möglichst verständlich zu erklären, was Hochmut ist, und dieses Thema so umfassend wie möglich zu behandeln. Mit dieser Arbeit möchte ich zunächst mich selbst dazu anregen, mich vor dieser gefährlichen Krankheit zu schützen, und danach auch jeden, der diese Arbeit liest. Wie der Dichter in einem Vers sagte:',
    style='BodyText'
)

add_arabic('عرفت الشر لا للشر لكن لتوقّيه',
           translation='Das Böse habe ich kennengelernt, nicht um es zu begehen, sondern um ihm auszuweichen.')

add_page_break()

# ================================================================
# DEFINITION
# ================================================================
add_para('DEFINITION DES „HOCHMUTS"', style='ChapterHeading')
add_hr()

add_para('Definition des Begriffs „al-Kibr (Hochmut)" in der arabischen Sprache', style='SectionHeading')

add_para('Ibn Manzūr führte an:', style='BodyText')

add_para(
    '„al-Kibr" (الكِبْر) – mit kurzem „i" – und „al-Kibriyāʾ" (الكبرياء) bedeuten Größe und Hochmut. Man sagt: „takabbara" (تَكَبَّرَ), „istakbara" (اسْتَكْبَرَ) und „takābara" (تَكَابَرَ) – all diese Verben bezeichnen Erhabenheit, Hochmut und Selbstüberschätzung.',
    style='ScholarQuote'
)
add_para(
    'Das Wort „Kibr" kann manchmal auch Alter bedeuten (abgeleitet vom Wort „as-sinn" – السِّن), doch gewöhnlich bezeichnen „Takabbur" und „Istikbār" Arroganz, Überheblichkeit und übermäßige Selbsterhöhung.¹',
    style='BodyText'
)

add_para('Definition des Begriffs „al-Kibr (Hochmut)" in der Scharia', style='SectionHeading')

add_arabic(
    'عَنْ عَبْدِ اللَّهِ بْنِ مَسْعُودٍ، عَنِ النَّبِيِّ صلى الله عليه وسلم قَالَ: «لَا يَدْخُلُ الْجَنَّةَ مَنْ كَانَ فِي قَلْبِهِ مِثْقَالُ ذَرَّةٍ مِنْ كِبْرٍ». قَالَ رَجُلٌ: إِنَّ الرَّجُلَ يُحِبُّ أَنْ يَكُونَ ثَوْبُهُ حَسَنًا وَنَعْلُهُ حَسَنَةً. قَالَ: «إِنَّ اللَّهَ جَمِيلٌ يُحِبُّ الْجَمَالَ، الْكِبْرُ بَطَرُ الْحَقِّ وَغَمْطُ النَّاسِ»'
)

add_para(
    'Von ʿAbdullāh ibn Masʿūd, möge Allah mit ihm zufrieden sein, wird überliefert, dass der Prophet ﷺ sagte: „Niemand wird das Paradies betreten, in dessen Herzen sich auch nur das Gewicht eines Stäubchens an Hochmut befindet." Da sagte ein Mann: „Ein Mensch liebt es doch, dass seine Kleidung schön ist und seine Schuhe schön sind." Darauf antwortete der Prophet ﷺ: „Allah ist schön und liebt die Schönheit. Hochmut bedeutet, die Wahrheit zurückzuweisen und die Menschen zu verachten."²',
    style='BodyText'
)

add_para('Der Prophet ﷺ definierte in diesem Hadith den „Kibr" durch zwei wesentliche Aspekte:', style='BodyText')

p = doc.add_paragraph(style='BodyText')
p.paragraph_format.left_indent = Mm(8)
r = p.add_run('Erstens: Baṭar al-Ḥaqq (بَطَرُ الْحَقِّ)')
r.font.bold = True
r = p.add_run(', was bedeutet: Die Wahrheit zurückzuweisen, sie zu leugnen und geringzuschätzen sowie sich über ihre Annahme zu erheben.')

p = doc.add_paragraph(style='BodyText')
p.paragraph_format.left_indent = Mm(8)
r = p.add_run('Zweitens: Ghamṭ an-Nās (غَمْطُ النَّاسِ)')
r.font.bold = True
r = p.add_run(': die Geringschätzung der Menschen. „Ghamṭ" bedeutet: andere herabzusetzen und ihren Wert zu mindern.')

add_page_break()

# ================================================================
# URSPRUNG
# ================================================================
add_para('URSPRUNG DES HOCHMUTS UND SEINE GEFAHREN', style='ChapterHeading')
add_hr()

add_para(
    'Scheich ʿAbdurrazzāq al-Badr sagte: „Hochmut ist eine Krankheit des Herzens und eine seiner schwersten Krankheiten. Er war die erste Sünde, durch die Allah gegenüber Ungehorsam begangen wurde. Der Erste, der ihn beging, war Iblīs. Er machte diese Eigenschaft zu einem Vorbild für seine Anhänger, war damit zufrieden, dass sie ihm darin folgen, und führte sie damit in den großen Untergang und in schwere Unglücke. Hochmut gehört zu den abscheulichsten und schädlichsten Sünden. Es ist die Pflicht jedes Gläubigen, eines Dieners Allahs, sich ernsthaft vor dieser Eigenschaft zu hüten, denn sie ist eine Sünde, die zu weiteren Sünden führt, und ein Übel, das noch mehr Übel nach sich zieht."³',
    style='BodyText'
)

add_para(
    'Imām adh-Dhahabī führt den Hochmut als die 17. große Sünde in seinem Werk über die großen Sünden auf und sagt: „Die 17. große Sünde: Hochmut, Prahlerei und Selbstbewunderung." Allah, der Erhabene, sagt:',
    style='BodyText'
)

add_arabic(
    'وَقَالَ مُوسَىٰٓ إِنِّي عُذْتُ بِرَبِّي وَرَبِّكُم مِّن كُلِّ مُتَكَبِّرٍ لَّا يُؤْمِنُ بِيَوْمِ ٱلْحِسَابِ',
    translation='Mūsā sagte: „Ich nehme Zuflucht bei meinem Herrn und eurem Herrn vor jedem Hochmütigen, der nicht an den Tag der Abrechnung glaubt."',
    source='al-Ghāfir, 27 ⁴'
)

add_para('Und Er, der Erhabene, sagt:', style='BodyText')

add_arabic(
    'إِنَّهُۥ لَا يُحِبُّ ٱلْمُسْتَكْبِرِينَ',
    translation='Wahrlich, Er liebt die Hochmütigen nicht.',
    source='an-Naḥl, 23 ⁵'
)

add_para(
    'Der Prophet ﷺ sagte: „Einst ging ein Mann hochmütig über die Erde, da ließ Allah ihn in die Erde versinken, und er versinkt darin bis zum Tage der Auferstehung."⁶',
    style='BodyText'
)

add_para(
    'Und er ﷺ sagte: „Diejenigen, die sich in dieser Welt überheblich verhalten haben, werden am Tage der Auferstehung wie Ameisen auferweckt werden. Die Menschen werden sie mit ihren Füßen zertreten, und sie werden erniedrigt werden."⁷',
    style='BodyText'
)

add_para('Adh-Dhahabī sagte: „Einige Gelehrte der frühen Generationen (Salaf) sagten: ‚Die erste Sünde, durch die Allah gegenüber Ungehorsam begangen wurde, war der Hochmut.‘“', style='BodyText')

add_arabic(
    'وَإِذْ قُلْنَا لِلْمَلَائِكَةِ اسْجُدُوا لِآدَمَ فَسَجَدُوا إِلَّا إِبْلِيسَ أَبَىٰ وَاسْتَكْبَرَ وَكَانَ مِنَ الْكَافِرِين',
    translation='Und als Wir zu den Engeln sagten: „Werft euch vor Ādam nieder!", da warfen sie sich nieder, außer Iblīs. Er weigerte sich, erhob sich in Hochmut und gehörte zu den Ungläubigen.',
    source='al-Baqara, 34 ⁸'
)

add_para(
    'Imām adh-Dhahabī kommentiert diesen Vers und sagt: „Demjenigen, der sich gegenüber der Wahrheit hochmütig verhält, wird sein Glaube nichts nützen – so wie es bei Iblīs der Fall war."⁹',
    style='BodyText'
)

add_para(
    'Scheich ʿAbdurrazzāq al-Badr kommentierte die Verse des edlen Qurʾāns, in denen Allah in der Sūra al-Aʿrāf¹⁰ den Dialog mit Iblīs erwähnt, und sagte: „Die Quintessenz dieser Verse ist, dass diese Eigenschaft – der Hochmut – eine Verhaltensweise ist, die zuerst von Iblīs eingeführt wurde. Sie war die Ursache für seinen Sturz, seine Erniedrigung und den Verlust seiner hohen Stellung. Deshalb bemüht er sich mit aller Kraft, die Zahl seiner Anhänger in dieser Eigenschaft zu vermehren. Er hat dem Menschen verschiedene Fallen und Versuchungen gestellt, um ihn dazu zu bringen, ihm in diesem Hochmut zu folgen. Wer sich also über andere erhebt und Hochmut zeigt, dessen Vorbild ist Iblīs."¹¹',
    style='BodyText'
)

add_para(
    'Durch diese Verse sehen wir, dass der Hochmut der Weg zum Unglauben ist. Hochmütige Personen meinen, niemanden zu brauchen, und benehmen sich entsprechend. Wer sich also hochmütig verhält, folgt dem Weg des Satans und nicht dem Vorbild der edlen Engel, die ihrem Herrn stets gehorsam sind.¹²',
    style='BodyText'
)

add_hr()

# ---- Folgen ----
add_para('Folgen des Hochmuts', style='SectionHeading')

add_para('Hochmut hat zahlreiche Folgen im Diesseits (Dunyā) und im Jenseits (Āḫira). Zu seinen Folgen im Diesseits gehören:', style='BodyText')

p = doc.add_paragraph(style='BodyText')
r = p.add_run('1. Die Verwehrung des Verständnisses der Zeichen Allahs und der Rechtleitung zur Wahrheit.')
r.font.bold = True

add_para('Allah, der Erhabene, sagt:', style='BodyText')

add_arabic(
    'سَأَصْرِفُ عَنْ آيَاتِيَ الَّذِينَ يَتَكَبَّرُونَ فِي الْأَرْضِ بِغَيْرِ الْحَقِّ',
    translation='Ich werde diejenigen von Meinen Zeichen abwenden, die sich zu Unrecht auf der Erde hochmütig verhalten.',
    source='al-Aʿrāf, 146 ¹³'
)

add_para(
    'Scheich al-Islām Ibn Taimiyya sagte: „Die hochmütigen Menschen, die ihren Begierden folgen, werden von den Zeichen Allahs abgewandt. Sie wissen und verstehen nicht, weil sie aufgrund ihres Hochmuts und der Befolgung ihrer Gelüste aufgehört haben, nach dem zu handeln, was sie wissen. Als Strafe wurde ihnen Verständnis und Wissen vorenthalten."¹⁴',
    style='BodyText'
)

p = doc.add_paragraph(style='BodyText')
r = p.add_run('2. Der Verlust von Segnungen und das Eintreffen der Strafe.')
r.font.bold = True

add_para(
    'Darauf weist ein Hadith hin: Der Prophet ﷺ sagte zu einem Mann: „Iss mit deiner rechten Hand!" Der Mann antwortete: „Ich kann nicht." Da sagte der Prophet ﷺ: „Mögest du es nie (wieder) können!" Nichts hinderte diesen Mann, außer seinem Hochmut. Fortan war er tatsächlich nie mehr in der Lage, seine Hand zum Mund zu heben – sie blieb, wir suchen Zuflucht bei Allah, starr wie ein Stock. Er konnte sie nicht mehr heben, weil er sich aus Hochmut gegen die Religion Allahs erhoben hatte.¹⁵',
    style='BodyText'
)

p = doc.add_paragraph(style='BodyText')
r = p.add_run('3. Das Hervorrufen von Allahs Zorn und Seines Fluches.')
r.font.bold = True

add_para(
    'Sufyān ibn ʿUyayna sagte: „Für denjenigen, der aus Begierde sündigt, hoffe ich auf Reue. Denn Ādam ʿalaihi s-salām sündigte aufgrund seiner Begierde – und ihm wurde vergeben. Doch für denjenigen, der aus Hochmut sündigt, fürchte ich den Fluch. Denn Iblīs sündigte aus Hochmut – und wurde deshalb verflucht."¹⁶',
    style='BodyText'
)

add_para('Die jenseitigen Folgen des Hochmuts werden im Qurʾān und in den Aḥādīṯ mit ernsten und schwerwiegenden Warnungen angekündigt. Zu den entsprechenden Versen gehören:', style='BodyText', italic=True)

add_arabic(
    'وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْۚ إِنَّ الَّذِينَ يَسْتَكْبِرُونَ عَنْ عِبَادَتِي سَيَدْخُلُونَ جَهَنَّمَ دَاخِرِينَ',
    translation='Euer Herr hat gesagt: „Ruft Mich an, so werde Ich euch erhören. Wahrlich, diejenigen, die sich aus Hochmut weigern, Mir zu dienen, werden erniedrigt in die Hölle eintreten."',
    source='al-Ghāfir, 60 ¹⁷'
)

add_arabic(
    'وَيَوْمَ الْقِيَامَةِ تَرَى الَّذِينَ كَذَبُوا عَلَى اللَّهِ وُجُوهُهُم مُّسْوَدَّةٌۚ أَلَيْسَ فِي جَهَنَّمَ مَثْوًى لِّلْمُتَكَبِّرِينَ',
    translation='Und am Tage der Auferstehung wirst du die Gesichter derjenigen, die über Allah Lügen verbreiteten, geschwärzt sehen. Ist nicht in der Hölle eine Bleibe für die Hochmütigen?',
    source='az-Zumar, 60 ¹⁸'
)

add_hr()

# ---- Regeln ----
add_para('Regeln und Formen des Hochmuts', style='SectionHeading')

add_para(
    'Nicht jeder Hochmut hat dieselbe Stufe. Die Gelehrten haben den Hochmut in Stufen und Grade eingeteilt und darüber klar gesprochen. Scheich ʿAbdurrazzāq al-Badr sagte: „Scheich ʿAbdurraḥmān as-Saʿdī sagte: ‚Mit dieser umfassenden Erklärung, die der Prophet ﷺ nannte, wurde die Bedeutung des Hochmuts sehr klar dargelegt. Er teilte den Hochmut in zwei Arten ein:',
    style='BodyText'
)

p = doc.add_paragraph(style='BodyText')
p.paragraph_format.left_indent = Mm(8)
r = p.add_run('Die erste Art ')
r.font.bold = True
r = p.add_run('des Hochmuts ist die Ablehnung und Nicht-Annahme der Wahrheit. Jeder, der die Wahrheit zurückweist, gilt als hochmütig, je nach dem Ausmaß seiner Ablehnung der Wahrheit. Es ist die Pflicht der Diener, sich der Wahrheit zu unterwerfen, mit der Allah Seine Gesandten schickte und Seine Bücher offenbarte. Wer sich vollständig weigert, den Gesandten zu gehorchen, ist ein Ungläubiger, der ewig in der Hölle bleiben wird.')

p = doc.add_paragraph(style='BodyText')
p.paragraph_format.left_indent = Mm(8)
r = p.add_run('Die zweite Art ')
r.font.bold = True
r = p.add_run('des Hochmuts ist die Verachtung und Geringschätzung anderer Menschen. Dies entsteht aus der Selbstgefälligkeit des Menschen und seiner Selbstüberhöhung. Selbstgefälligkeit führt zu einer hochmütigen Haltung gegenüber anderen, zu deren Herabsetzung, Verspottung und Erniedrigung durch Worte und Taten.\'"²⁰')

add_para(
    'So wird deutlich, dass Hochmut je nach Stufe und Intensität auch das Urteil des Unglaubens (Kufr) und des Polytheismus (Schirk) annehmen kann.',
    style='BodyText'
)

add_hr()

# ---- Drei Stufen ----
add_para('Drei Stufen des Hochmuts (Ibn Qudāma al-Maqdisī)', style='SectionHeading')

p = doc.add_paragraph(style='BodyText')
r = p.add_run('Erste Stufe: ')
r.font.bold = True
r.font.color.rgb = DARK_GREEN
r = p.add_run('Die Überheblichkeit ist im Herzen des Menschen fest verankert, sodass er sich selbst für besser hält als andere, sich jedoch bemüht und bescheiden verhält. In seinem Herzen ist der Baum des Hochmuts gepflanzt, aber er hat seine Äste abgeschnitten.')

p = doc.add_paragraph(style='BodyText')
r = p.add_run('Zweite Stufe: ')
r.font.bold = True
r.font.color.rgb = DARK_GREEN
r = p.add_run('Er zeigt seinen Hochmut durch sein Verhalten, hebt sich unter seinen Altersgenossen hervor und kritisiert diejenigen, die ihm nicht die gebührende Achtung entgegenbringen.²¹')

p = doc.add_paragraph(style='BodyText')
r = p.add_run('Dritte Stufe: ')
r.font.bold = True
r.font.color.rgb = DARK_GREEN
r = p.add_run('Er zeigt seinen Hochmut durch seine Zunge, wie Prahlerei, Selbstlob, das Erzählen über eigene Zustände zum Zweck des Angebens vor anderen, sowie Hochmut aufgrund von Abstammung und Herkunft.²³')

add_hr()

# ---- Ursachen ----
add_para('Ursachen des Hochmuts', style='SectionHeading')

add_para(
    'Al-Ghazālī nennt sieben Ursachen des Hochmuts, die bei Menschen auftreten. Die erste Ursache, die er nennt, ist das Wissen. Hochmut erfasst am schnellsten die Gelehrten, und Wissen ist etwas, womit sich Menschen am meisten erheben.',
    style='BodyText'
)
add_para(
    'Nicht selten können auch Arbeit und Gottesdienst eine Ursache des Hochmuts sein. Auch rechtschaffene und fromme Menschen sind nicht immun gegen Hochmut.',
    style='BodyText'
)
add_para(
    'Edle Abstammung kann eine Ursache des Hochmuts sein. Hochmut aufgrund edler Abstammung erfasst denjenigen, der einen anderen wegen seiner fehlenden Abstammung als geringer betrachtet.',
    style='BodyText'
)
add_para(
    'Ebenso kann Reichtum eine Ursache des Hochmuts sein. Diese Art von Hochmut ist am häufigsten bei Herrschenden und Reichen anzutreffen.',
    style='BodyText'
)
add_para(
    'Stärke ist eine weitere Ursache des Hochmuts. Damit ist das Erheben durch die Anzahl seiner Anhänger, Helfer, Schüler, Diener, durch die Anzahl seiner Familie, Verwandten und Nachkommen gemeint.²⁴',
    style='BodyText'
)
add_para(
    'Imām adh-Dhahabī sprach über den Hochmut des Gelehrten in seinem Buch „al-Kabāʾir" und sagte: „Die schlimmste Form des Hochmuts ist die, wenn sich der Mensch über andere wegen seines Wissens erhebt und sich in seinem Herzen wegen seiner vermeintlichen Tugend überhebt. Solchem Menschen hat das Wissen nicht genutzt."²⁵',
    style='BodyText'
)

add_hr()

# ---- Spuren ----
add_para('Spuren des Hochmuts im Verhalten', style='SectionHeading')

add_para('Hochmut hinterlässt zahlreiche schlechte Spuren im Verhalten, vor denen Allah und Sein Prophet ﷺ streng gewarnt haben.', style='BodyText')

spuren = [
    'Das Abwenden des Gesichts von anderen Menschen und ein hochmütiger Gang.',
    'Das Verspotten und Verleumden anderer, das Nennen anderer mit schlechten Namen und Spitznamen.',
    'Das üble Nachreden über andere Menschen, das Erwähnen dessen, was sie nicht mögen.',
    'Der Hochmütige, der Sturköpfige, kümmert sich nicht um seine Seele, verbessert sie nicht und entfernt seine Fehler und Mängel nicht.',
    'Er nimmt keinen Rat von jemandem an.',
    'Trifft er jemanden auf dem Weg, grüßt er nicht als Erster.',
]

for i, spur in enumerate(spuren, 1):
    p = doc.add_paragraph(style='BodyText')
    p.paragraph_format.left_indent = Mm(6)
    r = p.add_run('◆  ')
    r.font.color.rgb = GOLD
    r.font.size = Pt(8)
    r = p.add_run(spur)

add_para('Allah, der Erhabene, erwähnt die Worte des weisen Luqmān an seinen Sohn:', style='BodyText')

add_arabic(
    'وَلَا تُصَعِّرْ خَدَّكَ لِلنَّاسِ وَلَا تَمْشِ فِي الْأَرْضِ مَرَحًا إِنَّ اللَّهَ لَا يُحِبُّ كُلَّ مُخْتَالٍ فَخُورٍ',
    translation='Und wende dein Gesicht nicht aus Hochmut von den Menschen ab, und gehe nicht stolz auf der Erde, denn Allah liebt keinen eingebildeten Prahler.',
    source='Luqmān, 18 ²⁶'
)

add_arabic(
    'وَإِذَا قِيلَ لَهُ اتَّقِ اللَّهَ أَخَذَتْهُ الْعِزَّةُ بِالْإِثْمِ فَحَسْبُهُ جَهَنَّمُ وَلَبِئْسَ الْمِهَادُ',
    translation='Und wenn ihm gesagt wird: „Fürchte Allah!" – so packt ihn der Stolz in der Sünde. Die Hölle wird ihm genügen, und es ist eine schlimme Ruhestätte.',
    source='al-Baqara, 206 ²⁷'
)

add_para(
    'Es gibt noch viele weitere Spuren und Folgen, die diese gefährliche Krankheit mit sich bringt.²⁸',
    style='BodyText'
)

add_hr()

# ---- Aussagen ----
add_para('Die Realität des Hochmuts durch Aussagen der Gelehrten', style='SectionHeading')

add_para('Die frühen und späteren Generationen der Gelehrten sprachen über diese schlechte Eigenschaft und verwendeten dabei scharfe Worte, um denjenigen aufzuwecken, der sie besitzt, und ihn von dieser Krankheit zu befreien.', style='BodyText')

quotes = [
    ('Al-Aḥnaf ibn Qais', '„Wunderlich ist der Sohn Adams (der Mensch) – wie kann er hochmütig sein, obwohl er zweimal aus dem Harnkanal hervorgekommen ist!"²⁹'),
    ('Scheich al-Islām Ibn Taimiyya', '„Der Hochmut steht im Widerspruch zur wahren Bedeutung der Dienerschaft gegenüber Allah – wie es in einem authentischen Hadith bestätigt ist, in dem der Prophet ﷺ sagte: ‚Allah, der Erhabene, sagt: Meine Erhabenheit ist Mein Attribut, und Meine Majestät ist Mein Attribut. Wer Mir darin widerstreitet (indem er hochmütig und stolz ist), den werde Ich bestrafen.\'" Erhabenheit (al-ʿaẓama) und Majestät (al-kibr) sind Eigenschaften, die ausschließlich Allah gehören.³⁰'),
    ('Al-Jāḥiẓ', '„Weder haben Augen gesehen, noch haben Ohren gehört, noch konnte der Verstand sich eine Tat vorstellen, die ein kluger Mensch wählen oder ein Gelehrter auswählen würde und die ein schlimmeres Ergebnis, ein unangenehmeres Ende, einen schwereren Weg, einen tieferen Sturz, größeren Schaden für die Religion, größere Schande, größere Ursache für Allahs Zorn, größeren Anlass für Verachtung unter den Menschen, größere Entfernung vom Erfolg, deutlichere Abneigung gegenüber der Reue, geringeren Wert im Wesen, größere Abtrennung von der natürlichen Veranlagung (Fiṭra), größeres Hindernis für Wissen und größere Gegensätzlichkeit zur Sanftmut hätte – als Hochmut an einem Ort, wo er nicht hingehört, und Selbstgefälligkeit ohne wirklichen Wert."³¹'),
    ('Fuḍayl ibn ʿIyāḍ', '„Wer vor fünf Dingen bewahrt wird, wird vor dem Übel im Diesseits und im Jenseits bewahrt: Selbstgefälligkeit, Heuchelei, Hochmut, das Herabsetzen anderer und den Begierden."³²'),
]

for name, quote_text in quotes:
    p = doc.add_paragraph(style='ScholarQuote')
    r = p.add_run(name + ': ')
    r.font.bold = True
    r.font.color.rgb = DARK_GREEN
    r = p.add_run(quote_text)

add_page_break()

# ================================================================
# BEHANDLUNG
# ================================================================
add_para('BEHANDLUNG DES HOCHMUTS', style='ChapterHeading')
add_hr()

treatments = [
    ('Das Bittgebet (Duʿāʾ) und das Ersuchen um Hilfe von Allah',
     'gegen diese gefährliche Krankheit. Diese Krankheit ist verderbend, und niemand kann uns vor ihr retten außer Allah, dem Erhabenen. Deshalb sollen wir häufig zu Ihm Zuflucht nehmen mit Duʿāʾ und Ihn bitten, uns zu Seinen bescheidenen Dienern zu machen, die demütig auf Seiner Erde gehen!'),
    ('Die Erkenntnis Allahs, des Erhabenen, und die Erkenntnis seiner selbst',
     'Wenn der Mensch seinen Herrn auf rechte Weise erkennt, wird er verstehen, dass Größe und Hochmut niemandem außer Ihm zustehen. Er soll über seinen Ursprung nachdenken: Wie kam seine Entstehung zustande? Tot war er, dann hat Allah ihm Leben gegeben! Unvollkommen war er, dann hat Allah ihn in schönster Gestalt erschaffen! Unwissend war er, dann hat Allah ihm Verstand gegeben! Schwach war er, dann hat Allah ihm Stärke verliehen! Er wird krank, und Allah heilt ihn!'),
    ('Das Nachdenken über alles, womit sich Menschen über andere erheben',
     'Wer über alles nachdenkt, womit Menschen sich über andere erheben, wird erkennen, dass sich ein vernünftiger Mensch damit nicht über andere erheben kann. Wenn sich jemand durch seine Abstammung über andere erhebt: Andere haben zu diesem Ansehen und dieser Ehre beigetragen, sodass sich ein vernünftiger Mensch nicht mit fremdem Verdienst rühmen kann!'),
    ('Man soll versuchen, bescheiden und demütig zu sein',
     'Ihm bleibt nichts anderes übrig. Er soll wissen, dass es viele Menschen gab, die weit besser als er waren, intelligenter, von viel edlerer Abstammung, die die ganze Welt hätten besitzen können, was immer sie davon wollten. Allah hat sie unter allen Menschen ausgewählt und ausgezeichnet, gereinigt und ihnen die größte Seiner Gaben gegeben – das Prophetentum –, dennoch haben sie sich niemals über andere erhoben.'),
]

for title, body in treatments:
    p = doc.add_paragraph(style='BodyText')
    p.paragraph_format.space_before = Pt(8)
    r = p.add_run('– ' + title)
    r.font.bold = True
    r.font.color.rgb = DARK_GREEN
    add_para(body, style='BodyText')

add_para(
    'Wir bitten Allah, den Erhabenen, uns vor dieser verabscheuten Eigenschaft zu bewahren, uns zu Seinen bescheidenen und demütigen Dienern zu machen und uns dazu zu bringen, allen Menschen das zu wünschen, was wir uns selbst wünschen.',
    style='BodyText', italic=True
)

add_page_break()

# ================================================================
# SCHLUSS
# ================================================================
add_para('SCHLUSS', style='ChapterHeading')
add_hr()

add_para(
    'Hochmut ist eine Eigenschaft, vor der ein Gläubiger sich stets hüten muss, zu Allah vor ihr fliehen muss und bei Allah beständig Zuflucht davor suchen muss. Diese Eigenschaft ist gemäß den Quellen der Offenbarung eine große und verderbliche Sünde für denjenigen, der sie besitzt. Durch diese Abschlussarbeit habe ich versucht, diese Krankheit zu erklären und ihre Gefahr anhand der Worte Allahs und Seines Propheten ﷺ darzulegen, sowie anhand der Aussagen der Gelehrten. Ich habe mich bemüht, dies möglichst kurz zu halten, damit die Früchte dieser Arbeit geerntet werden können und Nutzen daraus gezogen werden kann. Ich bitte Allah, uns vor dieser Krankheit zu schützen, und jeden Muslim, der von ihr heimgesucht wird, zu retten und zu befreien. Ich bitte Allah um nützliches Wissen.',
    style='BodyText'
)

add_page_break()

# ================================================================
# LITERATURVERZEICHNIS
# ================================================================
add_para('LITERATURVERZEICHNIS', style='ChapterHeading')
add_hr()

lit_entries = [
    'Qurʾān, Übersetzung von Besim Korkut, Sarajevo, 1977.',
    'Ibn Manzūr, Lisān al-ʿArab, Dār Sādir, Beirut, 2003.',
    'Ṣaḥīḥ Muslim, Bayt al-Afkār, Riad, 1998.',
    'ʿAbdurrazzāq al-Badr, Aḥādīṯ Iṣlāḥ al-Qulūb, Dār al-Imām Muslim, Medina, 2022.',
    'Ṣaḥīḥ al-Buḫārī, Dār Ibn Kaṯīr, Damaskus, 2002.',
    'at-Tirmiḏī, Dār as-Salām, Riad, 2009.',
    'adh-Dhahabī, al-Kabāʾir, Maktabat al-Furqān, Dubai, 2003.',
    'Edin Redžepović, Osnove islamskog karaktera, al-Kalima, Novi Pazar, 2023.',
    'Ibn Taimiyya, Majmūʿ al-Fatāwā, Dār al-Wafāʾ, Alexandria, 2005.',
    'Ibn ʿUṯaimīn, Šarḥ Riyāḍ aṣ-Ṣāliḥīn, Muʾassasat aš-Šaiḫ ibn ʿUṯaimīn al-Ḫairiyya, Qasim, 2013.',
    'Ibn Qudāma, Muḫtaṣar Minhāj al-Qāṣidīn, Maktabat Dār al-Ḥijāz, Riad, 2019.',
    'Hajrudin Tahir Ahmetović, Djela srca, Amos Graf, Sarajevo, 2013.',
    'Ibn Abī d-Dunyā, at-Tawāḍuʿ wa-l-Ḫumūl, Dār al-Kutub al-ʿIlmiyya, Beirut, 1989.',
    'Ibn Taimiyya, al-ʿUbūdiyya, Dār al-Iṣlāḥ, 1999.',
    'ʿAmr ibn Baḥr al-Jāḥiẓ, ar-Rasāʾil, Dār al-Jāḥiẓ, Kairo, 1964.',
    'Ibn Abī d-Dunyā, Ḥilyat al-Awliyāʾ, Dār al-Fikr, Kairo, 1997.',
    'Aḥmad, Muʾassasat ar-Risāla, Beirut, 1995.',
]

for i, entry in enumerate(lit_entries, 1):
    p = doc.add_paragraph(style='LitEntry')
    r = p.add_run(f'{i})  ')
    r.font.bold = True
    r.font.color.rgb = GOLD
    r = p.add_run(entry)

add_hr()

# ================================================================
# FUSSNOTENVERZEICHNIS
# ================================================================
add_page_break()
add_para('FUSSNOTENVERZEICHNIS', style='ChapterHeading')
add_hr()

footnotes = [
    ('1', 'Ibn Manzūr, Lisān al-ʿArab, 13/11, Dār Sādir, Beirut, 2003.'),
    ('2', 'Ṣaḥīḥ Muslim, Nr. 91, Bayt al-Afkār, Riad, 1998.'),
    ('3', 'ʿAbdurrazzāq al-Badr, Aḥādīṯ Iṣlāḥ al-Qulūb, S. 566, Dār al-Imām Muslim, Medina, 2022.'),
    ('4', 'al-Ghāfir, 27.'),
    ('5', 'an-Naḥl, 23.'),
    ('6', 'Ṣaḥīḥ al-Buḫārī, Nr. 5789, Dār Ibn Kaṯīr, Damaskus, 2002.'),
    ('7', 'at-Tirmiḏī, Nr. 2492, Dār as-Salām, Riad, 2009. Der vollständige Hadith lautet: „…Dann werden sie in das Höllenfeuer-Gefängnis namens Būlis gebracht werden."'),
    ('8', 'al-Baqara, 34.'),
    ('9', 'adh-Dhahabī, al-Kabāʾir, S. 192, Maktabat al-Furqān, Dubai, 2003.'),
    ('10', 'Verse 11–17.'),
    ('11', 'ʿAbdurrazzāq al-Badr, Aḥādīṯ Iṣlāḥ al-Qulūb, S. 567, Dār al-Imām Muslim, Medina, 2022.'),
    ('12', 'Edin Redžepović, Osnove islamskog karaktera, S. 92, al-Kalima, Novi Pazar, 2023.'),
    ('13', 'al-Aʿrāf, 146.'),
    ('14', 'Ibn Taimiyya, Majmūʿ al-Fatāwā, 7/626, Dār al-Wafāʾ, Alexandria, 2005.'),
    ('15', 'Ibn ʿUṯaimīn, Šarḥ Riyāḍ aṣ-Ṣāliḥīn, 3/543, Muʾassasat aš-Šaiḫ ibn ʿUṯaimīn al-Ḫairiyya, Qasim, 2013.'),
    ('16', 'Ibn Qudāma, Muḫtaṣar Minhāj al-Qāṣidīn, S. 464, Maktabat Dār al-Ḥijāz, Riad, 2019.'),
    ('17', 'al-Ghāfir, 60.'),
    ('18', 'az-Zumar, 60.'),
    ('19', 'al-Ghāfir, 56.'),
    ('20', 'ʿAbdurrazzāq al-Badr, Aḥādīṯ Iṣlāḥ al-Qulūb, S. 567, Dār al-Imām Muslim, Medina, 2022.'),
    ('21', 'aš-Šuʿarāʾ, 215.'),
    ('22', 'al-Ḥujurāt, 13.'),
    ('23', 'Ibn Qudāma, Muḫtaṣar Minhāj al-Qāṣidīn, S. 465, Maktabat Dār al-Ḥijāz, Riad, 2019.'),
    ('24', 'Edin Redžepović, Osnove islamskog karaktera, S. 94, al-Kalima, Novi Pazar, 2023.'),
    ('25', 'adh-Dhahabī, al-Kabāʾir, S. 197, Maktabat al-Furqān, Dubai, 2003.'),
    ('26', 'Luqmān, 18.'),
    ('27', 'al-Baqara, 206.'),
    ('28', 'Hajrudin Tahir Ahmetović, Djela srca, S. 300–306, Amos Graf, Sarajevo, 2013.'),
    ('29', 'Ibn Abī d-Dunyā, at-Tawāḍuʿ wa-l-Ḫumūl, S. 251, Dār al-Kutub al-ʿIlmiyya, Beirut, 1989.'),
    ('30', 'Ibn Taimiyya, al-ʿUbūdiyya, S. 84–85, Dār al-Iṣlāḥ, 1999.'),
    ('31', 'ʿAmr ibn Baḥr al-Jāḥiẓ, ar-Rasāʾil, 4/178, Dār al-Jāḥiẓ, Kairo, 1964.'),
    ('32', 'Ibn Abī d-Dunyā, Ḥilyat al-Awliyāʾ, S. 84, Dār al-Fikr, Kairo, 1997.'),
]

for num, fn_text in footnotes:
    p = doc.add_paragraph(style='FootnoteText')
    r = p.add_run(f'{num}  ')
    r.font.bold = True
    r.font.color.rgb = GOLD
    r = p.add_run(fn_text)

# ================================================================
# SAVE
# ================================================================
output_path = '/home/user/Discipline-/hochmut_deutsch_final.docx'
doc.save(output_path)
import os
print(f'DOCX saved: {output_path}')
print(f'Size: {os.path.getsize(output_path):,} bytes')
