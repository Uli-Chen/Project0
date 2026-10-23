"""生成带中文字体与表格样式的 pandoc reference.docx，并对输出 docx 做表格美化。

用法：
  python3 model/docx_style.py make-ref  <ref.docx>
  python3 model/docx_style.py polish    <output.docx>
"""
import subprocess
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

CN_FONT = "Microsoft YaHei"
EN_FONT = "Calibri"


def set_font(style, size=None, bold=None, color=None):
    style.font.name = EN_FONT
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), CN_FONT)
    rfonts.set(qn("w:ascii"), EN_FONT)
    rfonts.set(qn("w:hAnsi"), EN_FONT)
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rfonts.get(qn(attr)) is not None:
            del rfonts.attrib[qn(attr)]
    if size:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color:
        style.font.color.rgb = RGBColor.from_string(color)


def make_ref(path):
    subprocess.run(["pandoc", "-o", path, "--print-default-data-file", "reference.docx"], check=True)
    doc = Document(path)
    sizes = {"Title": 22, "Heading 1": 16, "Heading 2": 14, "Heading 3": 12, "Heading 4": 11}
    for st in doc.styles:
        try:
            name = st.name
        except Exception:
            continue
        if st.type != 1:  # paragraph styles only
            continue
        if name in sizes:
            set_font(st, sizes[name], True, "1F3864")
        elif name in ("Normal", "Body Text", "First Paragraph", "Compact", "Block Text"):
            set_font(st, 10.5)
        elif name in ("Source Code",):
            pass
        else:
            set_font(st)
    doc.save(path)


def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def borders(table):
    tbl = table._tbl
    tblPr = tbl.tblPr
    b = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "4")
        e.set(qn("w:color"), "BFBFBF")
        b.append(e)
    tblPr.append(b)


def polish(path):
    doc = Document(path)
    for t in doc.tables:
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        borders(t)
        for i, row in enumerate(t.rows):
            for cell in row.cells:
                if i == 0:
                    shade(cell, "DDE7F3")
                for p in cell.paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(9)
                        if i == 0:
                            r.font.bold = True
    doc.save(path)


if __name__ == "__main__":
    cmd, target = sys.argv[1], sys.argv[2]
    {"make-ref": make_ref, "polish": polish}[cmd](target)
