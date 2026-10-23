"""生成 WriteMentor 初步营收模型（Excel，公式联动）。

用法：python3 model/build_revenue_model.py
输出：03_营收模型.xlsx（与本脚本上级目录同级）

约定：
- 蓝色字体 = 可调输入假设；黑色字体 = 公式。
- 所有金额单位：人民币元（不含税）；年度口径 2027–2031。
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / "03_营收模型.xlsx"
YEARS = [2027, 2028, 2029, 2030, 2031]
FIRST_COL = 3  # C 列 = 2027
YCOLS = [get_column_letter(FIRST_COL + i) for i in range(len(YEARS))]
LAST = YCOLS[-1]

BLUE = Font(color="1F4E9E")
BOLD = Font(bold=True)
TITLE = Font(bold=True, size=14)
HDR_FILL = PatternFill("solid", fgColor="DDE7F3")
SEC_FILL = PatternFill("solid", fgColor="F2F2F2")
INPUT_FILL = PatternFill("solid", fgColor="FFF9E6")
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

FMT = {
    "int": "#,##0",
    "yuan": "¥#,##0",
    "yuan2": "¥#,##0.00",
    "pct": "0.0%",
    "x": "0.0",
    "mult": "0.00x",
}

LINES = [
    ("ielts", "雅思写作"),
    ("cet", "四六级写作"),
    ("toefl", "托福写作"),
]

# ---------------------------------------------------------------------------
# 输入假设（基准情景）。键：(参数名, 单位, 格式, [2027..2031], 说明)
# ---------------------------------------------------------------------------
LINE_INPUTS = {
    "ielts": [
        ("pop", "年度目标人群", "人/人次", "int", [650_000] * 5,
         "中国大陆雅思考试人群代理值 50–85 万，取 65 万；官方未公布"),
        ("reach", "新注册触达率", "%", "pct", [0.08, 0.18, 0.26, 0.30, 0.33],
         "新注册用户 ÷ 目标人群；2027 年 5 月公测，非全年"),
        ("conv", "免费→付费转化率", "%", "pct", [0.06, 0.07, 0.08, 0.085, 0.09],
         "经营假设；Commercial Gate 下限 5%"),
        ("months", "平均付费月数", "月", "x", [2.5, 2.7, 3.0, 3.0, 3.0],
         "雅思备考周期 4–12 周"),
        ("arppu", "月 ARPPU", "元/月", "yuan", [69, 74, 79, 79, 82],
         "Lite ¥39 / Pro ¥79 / Sprint ¥129 + 加量包混合"),
        ("repeat", "上年付费用户次年再付费率", "%", "pct", [0, 0.10, 0.12, 0.12, 0.12],
         "重考、单科重考、转托福/口语"),
        ("loops_paid", "付费用户月均 AI 闭环数", "次/月", "x", [12] * 5, "深度闭环口径"),
        ("loops_free", "免费用户年均 AI 闭环数", "次/年", "x", [2] * 5, "诊断 + 赠送额度"),
        ("cac", "新付费用户获客成本 CAC", "元/人", "yuan", [120, 90, 70, 60, 60],
         "可变投放；不含品牌固定市场费"),
        ("b2b_n", "B2B 客户数（留学/培训机构）", "家", "int", [3, 12, 25, 40, 55], "年末在约客户"),
        ("b2b_acv", "B2B 年客单价", "元/家/年", "yuan", [40_000, 45_000, 50_000, 55_000, 60_000],
         "按活跃学员数或调用量计费"),
    ],
    "cet": [
        ("pop", "年度目标人群", "人/人次", "int", [10_000_000] * 5,
         "四六级年报考 >1,000 万人次（媒体口径），取 1,000 万作保守代理"),
        ("reach", "新注册触达率", "%", "pct", [0.003, 0.02, 0.04, 0.055, 0.065],
         "2027 年 9 月上线，仅覆盖 12 月考季"),
        ("conv", "免费→付费转化率", "%", "pct", [0.035, 0.04, 0.045, 0.05, 0.05],
         "大学生价格敏感，低于雅思"),
        ("months", "平均付费月数", "月", "x", [1.5, 1.8, 2.0, 2.0, 2.0], "考前冲刺为主"),
        ("arppu", "月 ARPPU", "元/月", "yuan", [25, 25, 27, 29, 29],
         "月卡 ¥19.9 / 冲刺包 ¥49（2 个月）/ 学期包混合"),
        ("repeat", "上年付费用户次年再付费率", "%", "pct", [0, 0.20, 0.22, 0.22, 0.22],
         "四级→六级、重考、考研英语"),
        ("loops_paid", "付费用户月均 AI 闭环数", "次/月", "x", [8] * 5, ""),
        ("loops_free", "免费用户年均 AI 闭环数", "次/年", "x", [1.5] * 5, ""),
        ("cac", "新付费用户获客成本 CAC", "元/人", "yuan", [30, 25, 20, 18, 18],
         "校园大使 + 社群裂变为主"),
        ("b2b_n", "B2B 客户数（高校院系/学院）", "家", "int", [0, 5, 18, 35, 55], "2028 年推出教师端"),
        ("b2b_acv", "B2B 年客单价", "元/家/年", "yuan", [0, 50_000, 60_000, 60_000, 65_000],
         "院系级年度授权"),
    ],
    "toefl": [
        ("pop", "年度目标人群", "人/人次", "int", [250_000] * 5,
         "中国大陆托福考试人群代理值；ETS 未公布，见调研章节"),
        ("reach", "新注册触达率", "%", "pct", [0, 0.06, 0.18, 0.25, 0.30], "2028 年 6 月上线"),
        ("conv", "免费→付费转化率", "%", "pct", [0, 0.06, 0.07, 0.08, 0.085], ""),
        ("months", "平均付费月数", "月", "x", [0, 2.5, 2.8, 3.0, 3.0], ""),
        ("arppu", "月 ARPPU", "元/月", "yuan", [0, 79, 82, 85, 85], "托福用户客单价略高于雅思"),
        ("repeat", "上年付费用户次年再付费率", "%", "pct", [0, 0, 0.10, 0.12, 0.12], ""),
        ("loops_paid", "付费用户月均 AI 闭环数", "次/月", "x", [12] * 5, ""),
        ("loops_free", "免费用户年均 AI 闭环数", "次/年", "x", [2] * 5, ""),
        ("cac", "新付费用户获客成本 CAC", "元/人", "yuan", [0, 110, 85, 70, 65], "交叉销售雅思存量用户可降低"),
        ("b2b_n", "B2B 客户数（留学机构/国际学校）", "家", "int", [0, 3, 10, 20, 30], ""),
        ("b2b_acv", "B2B 年客单价", "元/家/年", "yuan", [0, 40_000, 45_000, 50_000, 55_000], ""),
    ],
}

GLOBAL_INPUTS = [
    ("ai_cost", "AI 全口径成本 / 闭环", "元/次", "yuan2", [0.30, 0.28, 0.25, 0.22, 0.20],
     "含重试、Embedding、OCR、监控；推理本身仅几分钱"),
    ("fee", "支付通道及渠道分成率（B2C）", "%", "pct", [0.06] * 5, "微信/支付宝 + 部分应用商店分成的混合费率"),
    ("b2b_cost", "B2B 交付成本率", "% B2B 收入", "pct", [0.15] * 5, "实施、培训、客户成功外的直接成本"),
    ("cloud", "云服务与基础设施（固定）", "元/年", "yuan", [250_000, 400_000, 600_000, 800_000, 1_000_000], ""),
    ("gold_n", "Gold Set 新增标注篇数", "篇/年", "int", [1_500, 2_500, 2_500, 2_000, 2_000], "雅思→四六级→托福依次建设"),
    ("gold_cost", "单篇标注成本（双评 + 仲裁）", "元/篇", "yuan", [150] * 5, ""),
    ("content", "题库与内容研发（固定）", "元/年", "yuan", [150_000, 300_000, 350_000, 400_000, 450_000], "原创题目、微练习库"),
    ("brand", "品牌与内容营销（固定）", "元/年", "yuan", [300_000, 600_000, 800_000, 1_000_000, 1_200_000], "小红书/B站内容、校园活动"),
    ("legal", "法务、合规、行政", "元/年", "yuan", [250_000, 350_000, 450_000, 550_000, 650_000], "PIPL、生成式 AI 登记、等保、财税"),
]

HEADCOUNT = [
    # key, 角色, 人数[2027..2031], 人均年成本（含社保）
    ("hc_mgmt", "创始人 / 管理", [1, 1, 2, 2, 2], 400_000),
    ("hc_eng", "研发（前后端）", [2, 3, 4, 5, 6], 350_000),
    ("hc_ml", "LLM / 算法", [1, 2, 2, 3, 3], 450_000),
    ("hc_edu", "教研 / 评分体系", [1, 2, 3, 3, 3], 250_000),
    ("hc_growth", "增长 / 用户运营", [1, 2, 3, 4, 4], 220_000),
    ("hc_sales", "B2B 销售 / 客户成功", [0, 1, 2, 3, 4], 250_000),
    ("hc_ops", "客服 / 职能", [0, 1, 1, 2, 2], 150_000),
]

SCENARIOS = [
    # key, 名称, 悲观, 基准, 乐观
    ("m_reach", "触达率系数", 0.70, 1.00, 1.30),
    ("m_conv", "转化率系数", 0.70, 1.00, 1.25),
    ("m_months", "付费月数系数", 0.85, 1.00, 1.15),
    ("m_arppu", "ARPPU 系数", 0.85, 1.00, 1.10),
    ("m_cac", "CAC 系数", 1.40, 1.00, 0.85),
    ("m_b2b", "B2B 客户数系数", 0.50, 1.00, 1.30),
]

STARTING_CASH = 6_000_000


class Registry:
    """记录每个键所在的 (sheet, row)，用于生成跨表引用。"""

    def __init__(self):
        self.rows = {}

    def set(self, key, ws, row):
        self.rows[key] = (ws.title, row)

    def ref(self, key, col, absolute=False):
        title, row = self.rows[key]
        c = f"${col}${row}" if absolute else f"{col}{row}"
        return f"'{title}'!{c}"


REG = Registry()


def style_header(ws, row, labels):
    for i, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = BOLD
        c.fill = HDR_FILL
        c.border = BOX
        c.alignment = Alignment(horizontal="center", vertical="center")


def section(ws, row, text, width=8):
    c = ws.cell(row=row, column=1, value=text)
    c.font = BOLD
    for col in range(1, width + 1):
        ws.cell(row=row, column=col).fill = SEC_FILL
    return row + 1


def write_row(ws, row, key, label, unit, fmt, values=None, formulas=None, note="", is_input=False, bold=False):
    ws.cell(row=row, column=1, value=label).font = BOLD if bold else Font()
    ws.cell(row=row, column=2, value=unit)
    for i, col in enumerate(YCOLS):
        v = values[i] if values is not None else formulas(col, i)
        c = ws[f"{col}{row}"]
        c.value = v
        c.number_format = FMT[fmt]
        c.border = BOX
        if is_input:
            c.font = BLUE
            c.fill = INPUT_FILL
        elif bold:
            c.font = BOLD
    if note:
        ws.cell(row=row, column=FIRST_COL + len(YEARS), value=note).font = Font(color="7F7F7F", size=9)
    if key:
        REG.set(key, ws, row)
    return row + 1


def prev(col):
    """上一年列字母；2027 返回 None。"""
    idx = YCOLS.index(col)
    return YCOLS[idx - 1] if idx > 0 else None


# ---------------------------------------------------------------------------
def build_readme(wb):
    ws = wb.active
    ws.title = "说明"
    lines = [
        ("WriteMentor（暂定名）初步营收模型", TITLE),
        ("版本 v0.1 ｜ 2026-10 ｜ 内部规划用，非会计预测", None),
        ("", None),
        ("结构", BOLD),
        ("1. 假设：所有可调参数（蓝色字体 + 浅黄底）。修改后其余工作表自动重算。", None),
        ("2. 收入测算：分考试线（雅思 / 四六级 / 托福）计算注册、付费、B2C 与 B2B 收入。", None),
        ("3. 成本测算：AI 成本、渠道费、人力、市场、内容、合规等。", None),
        ("4. 损益与现金：年度经营损益、累计现金、资金缺口。", None),
        ("5. 单位经济：LTV、CAC、LTV/CAC、贡献利润率。", None),
        ("6. 敏感性：转化率 × 付费月数、AI 单次成本对末年利润的影响。", None),
        ("", None),
        ("使用方法", BOLD),
        ("• 在『假设』表 C3 单元格选择情景：1 = 悲观，2 = 基准，3 = 乐观。", None),
        ("• 金额单位：人民币元，不含增值税；未计所得税、融资费用和股权激励。", None),
        ("• 公式：新注册 = 目标人群 × 触达率；新付费 = 新注册 × 转化率；", None),
        ("  B2C 收入 = (新付费 + 上年付费 × 再付费率) × 平均付费月数 × 月 ARPPU。", None),
        ("• 市场规模类数据（考生人数）为代理值，来源与可信度见商业计划书市场章节。", None),
        ("", None),
        ("重要提示", BOLD),
        ("本模型所有经营参数（触达率、转化率、CAC 等）均为假设，需在 Beta 与公测阶段用真实 cohort 数据替换。", None),
    ]
    for i, (text, font) in enumerate(lines, start=1):
        c = ws.cell(row=i, column=1, value=text)
        if font:
            c.font = font
    ws.column_dimensions["A"].width = 110


def build_assumptions(wb):
    ws = wb.create_sheet("假设")
    ws["A1"] = "输入假设（蓝色可调）"
    ws["A1"].font = TITLE
    ws["A3"] = "情景选择（1 悲观 / 2 基准 / 3 乐观）"
    ws["A3"].font = BOLD
    ws["C3"] = 2
    ws["C3"].font = Font(color="1F4E9E", bold=True)
    ws["C3"].fill = INPUT_FILL
    ws["C3"].border = BOX
    dv = DataValidation(type="list", formula1='"1,2,3"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add("C3")
    REG.rows["scenario"] = (ws.title, 3)

    row = 5
    row = section(ws, row, "情景系数")
    style_header(ws, row, ["系数", "", "悲观", "基准", "乐观", "当前生效"])
    row += 1
    for key, label, lo, base, hi in SCENARIOS:
        ws.cell(row=row, column=1, value=label)
        for j, v in enumerate([lo, base, hi]):
            c = ws.cell(row=row, column=3 + j, value=v)
            c.font = BLUE
            c.fill = INPUT_FILL
            c.number_format = FMT["mult"]
            c.border = BOX
        c = ws.cell(row=row, column=6, value=f"=CHOOSE($C$3,C{row},D{row},E{row})")
        c.number_format = FMT["mult"]
        c.font = BOLD
        c.border = BOX
        REG.rows[key] = (ws.title, row)
        row += 1

    row += 1
    for line_key, line_name in LINES:
        row = section(ws, row, f"考试线：{line_name}")
        style_header(ws, row, ["参数", "单位"] + [str(y) for y in YEARS] + ["说明 / 依据"])
        row += 1
        for key, label, unit, fmt, vals, note in LINE_INPUTS[line_key]:
            row = write_row(ws, row, f"{line_key}.{key}", label, unit, fmt, values=vals, note=note, is_input=True)
        row += 1

    row = section(ws, row, "通用成本假设")
    style_header(ws, row, ["参数", "单位"] + [str(y) for y in YEARS] + ["说明 / 依据"])
    row += 1
    for key, label, unit, fmt, vals, note in GLOBAL_INPUTS:
        row = write_row(ws, row, key, label, unit, fmt, values=vals, note=note, is_input=True)

    row += 1
    row = section(ws, row, "人力计划（人数，FTE）")
    style_header(ws, row, ["角色", "人均年成本"] + [str(y) for y in YEARS] + ["说明"])
    row += 1
    for key, label, counts, cost in HEADCOUNT:
        ws.cell(row=row, column=1, value=label)
        c = ws.cell(row=row, column=2, value=cost)
        c.font = BLUE
        c.fill = INPUT_FILL
        c.number_format = FMT["yuan"]
        for i, col in enumerate(YCOLS):
            cc = ws[f"{col}{row}"]
            cc.value = counts[i]
            cc.font = BLUE
            cc.fill = INPUT_FILL
            cc.border = BOX
        REG.set(key, ws, row)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="期初现金（2027 年初）").font = BOLD
    c = ws.cell(row=row, column=3, value=STARTING_CASH)
    c.font = BLUE
    c.fill = INPUT_FILL
    c.number_format = FMT["yuan"]
    REG.rows["cash0"] = (ws.title, row)

    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 12
    for col in YCOLS:
        ws.column_dimensions[col].width = 14
    ws.column_dimensions[get_column_letter(FIRST_COL + len(YEARS))].width = 60
    ws.freeze_panes = "C5"


def m(key):
    """情景系数（当前生效）的绝对引用。"""
    return REG.ref(key, "F", absolute=True)


def build_revenue(wb):
    ws = wb.create_sheet("收入测算")
    ws["A1"] = "收入测算（分考试线）"
    ws["A1"].font = TITLE
    row = 3
    style_header(ws, row, ["指标", "单位"] + [str(y) for y in YEARS] + ["公式说明"])
    row += 1

    for lk, lname in LINES:
        A = lambda k, col: REG.ref(f"{lk}.{k}", col)  # noqa: E731
        row = section(ws, row, lname)
        row = write_row(ws, row, f"r.{lk}.reg", "新注册用户", "人", "int",
                        formulas=lambda c, i: f"=ROUND({A('pop', c)}*{A('reach', c)}*{m('m_reach')},0)",
                        note="目标人群 × 触达率 × 情景系数")
        row = write_row(ws, row, f"r.{lk}.newpay", "新付费用户", "人", "int",
                        formulas=lambda c, i: f"=ROUND({REG.ref(f'r.{lk}.reg', c)}*{A('conv', c)}*{m('m_conv')},0)",
                        note="新注册 × 转化率")

        def repeat_f(c, i, lk=lk, A=A):
            p = prev(c)
            if p is None:
                return 0
            return f"=ROUND({REG.ref(f'r.{lk}.payers', p)}*{A('repeat', c)},0)"

        REG.set(f"r.{lk}.payers", ws, row + 1)  # 预登记下一行（付费合计），供再付费公式前向引用
        row = write_row(ws, row, f"r.{lk}.repeat", "再付费用户（上年付费留存）", "人", "int",
                        formulas=repeat_f, note="上年付费用户 × 再付费率")
        row = write_row(ws, row, f"r.{lk}.payers", "年度付费用户合计", "人", "int",
                        formulas=lambda c, i: f"={REG.ref(f'r.{lk}.newpay', c)}+{REG.ref(f'r.{lk}.repeat', c)}")
        row = write_row(ws, row, f"r.{lk}.pmonths", "付费用户月数", "人·月", "int",
                        formulas=lambda c, i: f"={REG.ref(f'r.{lk}.payers', c)}*{A('months', c)}*{m('m_months')}")
        row = write_row(ws, row, f"r.{lk}.arppu", "生效月 ARPPU", "元/月", "yuan",
                        formulas=lambda c, i: f"={A('arppu', c)}*{m('m_arppu')}")
        row = write_row(ws, row, f"r.{lk}.b2c", "B2C 收入", "元", "yuan",
                        formulas=lambda c, i: f"={REG.ref(f'r.{lk}.pmonths', c)}*{REG.ref(f'r.{lk}.arppu', c)}",
                        bold=True)
        row = write_row(ws, row, f"r.{lk}.b2bn", "B2B 客户数", "家", "int",
                        formulas=lambda c, i: f"=ROUND({A('b2b_n', c)}*{m('m_b2b')},0)")
        row = write_row(ws, row, f"r.{lk}.b2b", "B2B 收入", "元", "yuan",
                        formulas=lambda c, i: f"={REG.ref(f'r.{lk}.b2bn', c)}*{A('b2b_acv', c)}", bold=True)
        row = write_row(ws, row, f"r.{lk}.total", f"{lname} 收入合计", "元", "yuan",
                        formulas=lambda c, i: f"={REG.ref(f'r.{lk}.b2c', c)}+{REG.ref(f'r.{lk}.b2b', c)}", bold=True)
        row = write_row(ws, row, f"r.{lk}.loops", "AI 闭环调用次数", "次", "int",
                        formulas=lambda c, i: (
                            f"={REG.ref(f'r.{lk}.pmonths', c)}*{A('loops_paid', c)}"
                            f"+({REG.ref(f'r.{lk}.reg', c)}-{REG.ref(f'r.{lk}.newpay', c)})*{A('loops_free', c)}"),
                        note="付费人·月 × 月均闭环 + 免费注册 × 年均闭环")
        row += 1

    row = section(ws, row, "合计")

    def sum_lines(suffix):
        return lambda c, i: "=" + "+".join(REG.ref(f"r.{lk}.{suffix}", c) for lk, _ in LINES)

    row = write_row(ws, row, "r.reg", "新注册用户合计", "人", "int", formulas=sum_lines("reg"))
    row = write_row(ws, row, "r.newpay", "新付费用户合计", "人", "int", formulas=sum_lines("newpay"))
    row = write_row(ws, row, "r.payers", "付费用户合计", "人", "int", formulas=sum_lines("payers"))
    row = write_row(ws, row, "r.b2c", "B2C 收入合计", "元", "yuan", formulas=sum_lines("b2c"), bold=True)
    row = write_row(ws, row, "r.b2b", "B2B 收入合计", "元", "yuan", formulas=sum_lines("b2b"), bold=True)
    row = write_row(ws, row, "r.total", "总营收", "元", "yuan",
                    formulas=lambda c, i: f"={REG.ref('r.b2c', c)}+{REG.ref('r.b2b', c)}", bold=True)
    row = write_row(ws, row, "r.loops", "AI 闭环调用次数合计", "次", "int", formulas=sum_lines("loops"))

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 10
    for col in YCOLS:
        ws.column_dimensions[col].width = 16
    ws.column_dimensions[get_column_letter(FIRST_COL + len(YEARS))].width = 44
    ws.freeze_panes = "C4"


def build_costs(wb):
    ws = wb.create_sheet("成本测算")
    ws["A1"] = "成本测算"
    ws["A1"].font = TITLE
    row = 3
    style_header(ws, row, ["成本项", "单位"] + [str(y) for y in YEARS] + ["公式说明"])
    row += 1

    G = lambda k, c: REG.ref(k, c)  # noqa: E731

    row = section(ws, row, "直接成本（COGS）")
    row = write_row(ws, row, "c.ai", "AI 模型与调用成本", "元", "yuan",
                    formulas=lambda c, i: f"={G('r.loops', c)}*{G('ai_cost', c)}", note="闭环次数 × 单次全口径成本")
    row = write_row(ws, row, "c.fee", "支付通道与渠道分成", "元", "yuan",
                    formulas=lambda c, i: f"={G('r.b2c', c)}*{G('fee', c)}")
    row = write_row(ws, row, "c.b2bd", "B2B 交付成本", "元", "yuan",
                    formulas=lambda c, i: f"={G('r.b2b', c)}*{G('b2b_cost', c)}")
    row = write_row(ws, row, "c.cogs", "直接成本合计", "元", "yuan",
                    formulas=lambda c, i: f"={G('c.ai', c)}+{G('c.fee', c)}+{G('c.b2bd', c)}", bold=True)

    row += 1
    row = section(ws, row, "市场营销")

    def cac_f(c, i):
        parts = [f"{G(f'r.{lk}.newpay', c)}*{G(f'{lk}.cac', c)}" for lk, _ in LINES]
        return f"=({'+'.join(parts)})*{m('m_cac')}"

    row = write_row(ws, row, "c.perf", "效果投放（CAC × 新付费）", "元", "yuan", formulas=cac_f)
    row = write_row(ws, row, "c.brand", "品牌与内容营销", "元", "yuan", formulas=lambda c, i: f"={G('brand', c)}")
    row = write_row(ws, row, "c.mkt", "市场营销合计", "元", "yuan",
                    formulas=lambda c, i: f"={G('c.perf', c)}+{G('c.brand', c)}", bold=True)

    row += 1
    row = section(ws, row, "人力")
    hc_rows = []
    for key, label, _, _ in HEADCOUNT:
        title, hrow = REG.rows[key]
        row = write_row(ws, row, f"c.{key}", label, "元", "yuan",
                        formulas=lambda c, i, hrow=hrow, title=title: f"='{title}'!{c}{hrow}*'{title}'!$B${hrow}")
        hc_rows.append(f"c.{key}")
    row = write_row(ws, row, "c.hc", "人力合计", "元", "yuan",
                    formulas=lambda c, i: "=" + "+".join(G(k, c) for k in hc_rows), bold=True)
    row = write_row(ws, row, "c.fte", "期末人数（FTE）", "人", "int",
                    formulas=lambda c, i: "=" + "+".join(G(k, c) for k, _, _, _ in HEADCOUNT))

    row += 1
    row = section(ws, row, "其他运营费用")
    row = write_row(ws, row, "c.cloud", "云服务与基础设施", "元", "yuan", formulas=lambda c, i: f"={G('cloud', c)}")
    row = write_row(ws, row, "c.gold", "Gold Set 标注", "元", "yuan",
                    formulas=lambda c, i: f"={G('gold_n', c)}*{G('gold_cost', c)}")
    row = write_row(ws, row, "c.content", "题库与内容研发", "元", "yuan", formulas=lambda c, i: f"={G('content', c)}")
    row = write_row(ws, row, "c.legal", "法务、合规、行政", "元", "yuan", formulas=lambda c, i: f"={G('legal', c)}")
    row = write_row(ws, row, "c.other", "其他运营费用合计", "元", "yuan",
                    formulas=lambda c, i: f"={G('c.cloud', c)}+{G('c.gold', c)}+{G('c.content', c)}+{G('c.legal', c)}",
                    bold=True)

    row += 1
    row = write_row(ws, row, "c.total", "总成本", "元", "yuan",
                    formulas=lambda c, i: f"={G('c.cogs', c)}+{G('c.mkt', c)}+{G('c.hc', c)}+{G('c.other', c)}",
                    bold=True)

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 8
    for col in YCOLS:
        ws.column_dimensions[col].width = 16
    ws.column_dimensions[get_column_letter(FIRST_COL + len(YEARS))].width = 36
    ws.freeze_panes = "C4"


def build_pnl(wb):
    ws = wb.create_sheet("损益与现金")
    ws["A1"] = "经营损益与现金（规划口径）"
    ws["A1"].font = TITLE
    row = 3
    style_header(ws, row, ["项目", "单位"] + [str(y) for y in YEARS] + ["说明"])
    row += 1
    G = lambda k, c: REG.ref(k, c)  # noqa: E731

    for lk, lname in LINES:
        row = write_row(ws, row, f"p.{lk}", f"营收：{lname}", "元", "yuan",
                        formulas=lambda c, i, lk=lk: f"={G(f'r.{lk}.total', c)}")
    row = write_row(ws, row, "p.rev", "总营收", "元", "yuan", formulas=lambda c, i: f"={G('r.total', c)}", bold=True)
    row = write_row(ws, row, "p.growth", "营收同比增长", "%", "pct",
                    formulas=lambda c, i: "" if prev(c) is None else f"=IF({prev(c)}{REG.rows['p.rev'][1]}=0,\"\",{c}{REG.rows['p.rev'][1]}/{prev(c)}{REG.rows['p.rev'][1]}-1)")
    row = write_row(ws, row, "p.cogs", "直接成本", "元", "yuan", formulas=lambda c, i: f"={G('c.cogs', c)}")
    row = write_row(ws, row, "p.gp", "毛利", "元", "yuan",
                    formulas=lambda c, i: f"={c}{REG.rows['p.rev'][1]}-{c}{REG.rows['p.cogs'][1]}", bold=True)
    row = write_row(ws, row, "p.gm", "毛利率", "%", "pct",
                    formulas=lambda c, i: f"=IF({c}{REG.rows['p.rev'][1]}=0,0,{c}{REG.rows['p.gp'][1]}/{c}{REG.rows['p.rev'][1]})")
    row = write_row(ws, row, "p.mkt", "市场营销", "元", "yuan", formulas=lambda c, i: f"={G('c.mkt', c)}")
    row = write_row(ws, row, "p.hc", "人力", "元", "yuan", formulas=lambda c, i: f"={G('c.hc', c)}")
    row = write_row(ws, row, "p.other", "其他运营费用", "元", "yuan", formulas=lambda c, i: f"={G('c.other', c)}")
    row = write_row(ws, row, "p.cost", "总成本", "元", "yuan", formulas=lambda c, i: f"={G('c.total', c)}", bold=True)
    row = write_row(ws, row, "p.op", "经营利润", "元", "yuan",
                    formulas=lambda c, i: f"={c}{REG.rows['p.rev'][1]}-{c}{REG.rows['p.cost'][1]}", bold=True)
    row = write_row(ws, row, "p.opm", "经营利润率", "%", "pct",
                    formulas=lambda c, i: f"=IF({c}{REG.rows['p.rev'][1]}=0,0,{c}{REG.rows['p.op'][1]}/{c}{REG.rows['p.rev'][1]})")
    row += 1

    def cash_f(c, i):
        oprow = REG.rows["p.op"][1]
        p = prev(c)
        if p is None:
            return f"={REG.ref('cash0', 'C', absolute=True)}+{c}{oprow}"
        return f"={p}{row}+{c}{oprow}"

    row = write_row(ws, row, "p.cash", "期末现金（未计新增融资）", "元", "yuan", formulas=cash_f, bold=True,
                    note="期初现金 + 累计经营利润")
    cashrow = REG.rows["p.cash"][1]
    row = write_row(ws, row, "p.cummin", "累计最低现金点", "元", "yuan",
                    formulas=lambda c, i: f"=MIN($C${cashrow}:{c}{cashrow})")
    row = write_row(ws, row, "p.gap", "资金缺口（需新增融资）", "元", "yuan",
                    formulas=lambda c, i: f"=MAX(0,-{c}{REG.rows['p.cummin'][1]})", note="> 0 表示需在此前完成融资")

    for col in YCOLS:
        ws.column_dimensions[col].width = 16
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions[get_column_letter(FIRST_COL + len(YEARS))].width = 32
    ws.freeze_panes = "C4"

    # 图表 1：分考试线营收（堆叠柱）
    ch = BarChart()
    ch.type = "col"
    ch.grouping = "stacked"
    ch.overlap = 100
    ch.title = "分考试线营收（元）"
    first = REG.rows["p.ielts"][1]
    last = REG.rows["p.toefl"][1]
    data = Reference(ws, min_col=1, max_col=FIRST_COL + len(YEARS) - 1, min_row=first, max_row=last)
    ch.add_data(Reference(ws, min_col=FIRST_COL, max_col=FIRST_COL + len(YEARS) - 1, min_row=first, max_row=last),
                from_rows=True, titles_from_data=False)
    for s, (lk, lname) in zip(ch.series, LINES):
        from openpyxl.chart.series import SeriesLabel
        s.tx = SeriesLabel(v=lname)
    ch.set_categories(Reference(ws, min_col=FIRST_COL, max_col=FIRST_COL + len(YEARS) - 1, min_row=3, max_row=3))
    ch.height, ch.width = 8, 16
    ws.add_chart(ch, f"A{row + 2}")
    del data

    # 图表 2：营收、成本、经营利润
    lc = LineChart()
    lc.title = "营收 / 总成本 / 经营利润（元）"
    from openpyxl.chart.series import SeriesLabel
    for key, name in [("p.rev", "总营收"), ("p.cost", "总成本"), ("p.op", "经营利润")]:
        r = REG.rows[key][1]
        lc.add_data(Reference(ws, min_col=FIRST_COL, max_col=FIRST_COL + len(YEARS) - 1, min_row=r, max_row=r),
                    from_rows=True, titles_from_data=False)
        lc.series[-1].tx = SeriesLabel(v=name)
    lc.set_categories(Reference(ws, min_col=FIRST_COL, max_col=FIRST_COL + len(YEARS) - 1, min_row=3, max_row=3))
    lc.height, lc.width = 8, 16
    ws.add_chart(lc, f"F{row + 2}")


def build_unit(wb):
    ws = wb.create_sheet("单位经济")
    ws["A1"] = "单位经济（分考试线）"
    ws["A1"].font = TITLE
    row = 3
    style_header(ws, row, ["指标", "单位"] + [str(y) for y in YEARS] + ["说明"])
    row += 1
    G = lambda k, c: REG.ref(k, c)  # noqa: E731
    for lk, lname in LINES:
        row = section(ws, row, lname)
        row = write_row(ws, row, f"u.{lk}.ltvrev", "单个付费用户生命周期收入", "元", "yuan",
                        formulas=lambda c, i, lk=lk: (
                            f"={G(f'{lk}.months', c)}*{m('m_months')}*{G(f'r.{lk}.arppu', c)}"))
        row = write_row(ws, row, f"u.{lk}.var", "单个付费用户变动成本", "元", "yuan",
                        formulas=lambda c, i, lk=lk: (
                            f"={G(f'{lk}.months', c)}*{m('m_months')}*({G(f'{lk}.loops_paid', c)}*{G('ai_cost', c)}"
                            f"+{G(f'r.{lk}.arppu', c)}*{G('fee', c)})"),
                        note="AI 成本 + 渠道费")
        row = write_row(ws, row, f"u.{lk}.ltv", "贡献 LTV", "元", "yuan",
                        formulas=lambda c, i, lk=lk: f"={G(f'u.{lk}.ltvrev', c)}-{G(f'u.{lk}.var', c)}", bold=True)
        row = write_row(ws, row, f"u.{lk}.cac", "生效 CAC", "元", "yuan",
                        formulas=lambda c, i, lk=lk: f"={G(f'{lk}.cac', c)}*{m('m_cac')}")
        row = write_row(ws, row, f"u.{lk}.ratio", "LTV / CAC", "倍", "x",
                        formulas=lambda c, i, lk=lk: (
                            f"=IF({G(f'u.{lk}.cac', c)}=0,\"\",{G(f'u.{lk}.ltv', c)}/{G(f'u.{lk}.cac', c)})"),
                        note="Scale Gate 要求 ≥ 3", bold=True)
        row = write_row(ws, row, f"u.{lk}.cm", "贡献利润率", "%", "pct",
                        formulas=lambda c, i, lk=lk: (
                            f"=IF({G(f'u.{lk}.ltvrev', c)}=0,\"\",{G(f'u.{lk}.ltv', c)}/{G(f'u.{lk}.ltvrev', c)})"))
        row += 1
    ws.column_dimensions["A"].width = 28
    for col in YCOLS:
        ws.column_dimensions[col].width = 14
    ws.column_dimensions[get_column_letter(FIRST_COL + len(YEARS))].width = 26


def build_sensitivity(wb):
    """末年（2031）经营利润敏感性。

    利润对“转化率系数 a”和“付费月数系数 b”是线性/双线性的：
      B2C 收入、AI 付费部分、渠道费 ∝ a·b；效果投放 ∝ a；其余不变。
    因此可用基准分量精确重算，无需 Excel 数据表功能。
    """
    ws = wb.create_sheet("敏感性")
    ws["A1"] = f"敏感性分析：{YEARS[-1]} 年经营利润（元，基于当前情景）"
    ws["A1"].font = TITLE
    c = LAST
    G = lambda k: REG.ref(k, c)  # noqa: E731

    ws["A3"] = "基准分量"
    ws["A3"].font = BOLD
    comps = [
        ("B2C 收入", f"={G('r.b2c')}"),
        ("付费部分 AI 成本",
         "=" + "+".join(f"{G(f'r.{lk}.pmonths')}*{G(f'{lk}.loops_paid')}*{G('ai_cost')}" for lk, _ in LINES)),
        ("渠道费", f"={G('c.fee')}"),
        ("效果投放", f"={G('c.perf')}"),
        ("其余（不随 a、b 变化）的利润", None),  # 由下式计算
        ("基准经营利润", f"={G('p.op')}"),
    ]
    r0 = 4
    for i, (label, f) in enumerate(comps):
        ws.cell(row=r0 + i, column=1, value=label)
        if f:
            cell = ws.cell(row=r0 + i, column=2, value=f)
            cell.number_format = FMT["yuan"]
    # 其余 = 基准利润 - (B2C - AI付费 - 渠道费) + 效果投放
    ws.cell(row=r0 + 4, column=2, value=f"=B{r0 + 5}-(B{r0}-B{r0 + 1}-B{r0 + 2})+B{r0 + 3}").number_format = FMT["yuan"]
    for i in range(len(comps)):
        ws.cell(row=r0 + i, column=2).border = BOX

    # 二维表：转化率系数 × 付费月数系数
    t0 = r0 + 8
    ws.cell(row=t0, column=1, value="表 1：转化率系数（行）× 付费月数系数（列）").font = BOLD
    a_vals = [0.6, 0.8, 1.0, 1.2, 1.4]
    b_vals = [0.67, 0.83, 1.0, 1.17, 1.33]
    ws.cell(row=t0 + 1, column=1, value="a \\ b").font = BOLD
    for j, b in enumerate(b_vals):
        cell = ws.cell(row=t0 + 1, column=2 + j, value=b)
        cell.number_format = FMT["mult"]
        cell.font = BLUE
        cell.fill = HDR_FILL
    for i, a in enumerate(a_vals):
        rr = t0 + 2 + i
        cell = ws.cell(row=rr, column=1, value=a)
        cell.number_format = FMT["mult"]
        cell.font = BLUE
        cell.fill = HDR_FILL
        for j in range(len(b_vals)):
            cl = get_column_letter(2 + j)
            f = (f"=$A{rr}*{cl}${t0 + 1}*($B${r0}-$B${r0 + 1}-$B${r0 + 2})"
                 f"-$A{rr}*$B${r0 + 3}+$B${r0 + 4}")
            cell = ws.cell(row=rr, column=2 + j, value=f)
            cell.number_format = FMT["yuan"]
            cell.border = BOX
    ws.cell(row=t0 + 8, column=1,
            value="说明：系数 1.00 = 当前情景；如付费月数系数 0.67 ≈ 雅思从 3.0 个月降至 2.0 个月。").font = Font(color="7F7F7F", size=9)

    # 一维表：AI 单次成本
    s0 = t0 + 11
    ws.cell(row=s0, column=1, value=f"表 2：AI 全口径单次闭环成本 → {YEARS[-1]} 年经营利润").font = BOLD
    ws.cell(row=s0 + 1, column=1, value="单次成本（元）").font = BOLD
    ws.cell(row=s0 + 1, column=2, value="经营利润（元）").font = BOLD
    for i, v in enumerate([0.10, 0.20, 0.30, 0.50, 1.00, 2.00]):
        rr = s0 + 2 + i
        cell = ws.cell(row=rr, column=1, value=v)
        cell.number_format = FMT["yuan2"]
        cell.font = BLUE
        f = f"={G('p.op')}-{G('r.loops')}*(A{rr}-{G('ai_cost')})"
        cell = ws.cell(row=rr, column=2, value=f)
        cell.number_format = FMT["yuan"]
        cell.border = BOX

    ws.column_dimensions["A"].width = 34
    for j in range(2, 8):
        ws.column_dimensions[get_column_letter(j)].width = 16


def main():
    wb = Workbook()
    build_readme(wb)
    build_assumptions(wb)
    build_revenue(wb)
    build_costs(wb)
    build_pnl(wb)
    build_unit(wb)
    build_sensitivity(wb)
    wb.calculation.fullCalcOnLoad = True  # 打开时强制重算（openpyxl 不缓存公式结果）
    wb.save(OUT)
    print(f"saved: {OUT}")


if __name__ == "__main__":
    main()
