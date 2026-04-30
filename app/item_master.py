"""
Item Master Data for Construction Cash Tracker.

Maps standardized item names to local/native language aliases used by
field staff across different project sites. This ensures consistent
data entry regardless of which language or spelling the user prefers.
"""
from __future__ import annotations

from typing import TypedDict


class ItemEntry(TypedDict):
    standard_name: str
    aliases: list[str]
    default_unit: str
    ledger: str


class CategoryGroup(TypedDict):
    name: str
    items: list[ItemEntry]


UNITS: list[str] = [
    "No.", "Bag", "KG", "Cum", "Cft", "MT", "Ton",
    "Litre", "Metre", "Ft.", "Sqft", "Set", "Box",
    "Bucket", "Bandle", "Gram", "Roll", "Pair",
]

LEDGER_TYPES: list[str] = [
    "Material", "Consumable", "Recevable", "Machinery",
    "Centering", "General", "Stationery",
]

PAYMENT_MODES: list[str] = [
    "Cash", "UPI", "Bank Transfer", "Challan", "Credit", "HO (Head Office)",
]

# Payment modes that DON'T deduct from cash fund balance
NON_CASH_MODES: list[str] = ["HO (Head Office)", "Challan"]

ITEM_CATEGORIES: list[CategoryGroup] = [
    {
        "name": "🧱 Cement & Concrete",
        "items": [
            {"standard_name": "Cement (OPC)", "aliases": ["Cement", "Cement Bag", "cement bag"], "default_unit": "Bag", "ledger": "Material"},
            {"standard_name": "Cement Bricks", "aliases": ["Cement Bricks"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Bricks (Red)", "aliases": ["Bricks"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Cover Blocks", "aliases": ["Cover blocks"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Cube Mould", "aliases": ["Cube Mold New", "Cube Mould"], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Slump Cone", "aliases": ["Slump Cone", "Slump Plen"], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Chuna (Lime)", "aliases": ["Chuna", "Chuna 3 kg", "layout chuna"], "default_unit": "Bag", "ledger": "Consumable"},
            {"standard_name": "Geru (Red Oxide)", "aliases": ["Geru", "Geru for layout marking"], "default_unit": "KG", "ledger": "Consumable"},
            {"standard_name": "Thermocol Sheet", "aliases": ["Thermocol 20 MM"], "default_unit": "No.", "ledger": "Material"},
        ],
    },
    {
        "name": "🔩 Steel & TMT Bars",
        "items": [
            {"standard_name": "TMT Steel 8 MM", "aliases": ["Steel 8 MM", "Steel 8 mm"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "TMT Steel 10 MM", "aliases": ["Steel 10 MM", "Steel 10 mm", "10 MM Steel"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "TMT Steel 12 MM", "aliases": ["Steel 12 MM", "Steel 12 mm", "12 MM Steel", "sariya"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "TMT Steel 16 MM", "aliases": ["Steel 16 MM", "Steel 16 mm", "16 MM sariya"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "TMT Steel 20 MM", "aliases": ["Steel 20 MM", "Steel 20 mm"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "TMT Steel 25 MM", "aliases": ["Steel 25 MM", "25 MM Steel"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "Binding Wire", "aliases": ["Banding wire", "Bending wire", "MS Banding wire"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "Tomy Steel", "aliases": ["Tomy Steel"], "default_unit": "KG", "ledger": "Material"},
        ],
    },
    {
        "name": "⛰️ Aggregate & Sand",
        "items": [
            {"standard_name": "Metal 10 MM", "aliases": ["10 MM Metal"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "Metal 20 MM", "aliases": ["20 MM Metal", "Metal 20 MM", "20 Metal"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "Metal 25 MM", "aliases": ["25 MM Metal"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "River Sand", "aliases": ["River Sand", "R Send", "R send"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "M-Sand", "aliases": ["M Sand", "M Send", "M sand", "M send"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "Crusher Dust", "aliases": ["Crusher Dust", "Churi", "Send channa"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "Murram", "aliases": ["Murram", "Muram"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "GSB (Granular Sub Base)", "aliases": ["GSB"], "default_unit": "Cum", "ledger": "Material"},
            {"standard_name": "Road Waste (Emulsion)", "aliases": ["Road West", "Kali Pani"], "default_unit": "Litre", "ledger": "Material"},
        ],
    },
    {
        "name": "🪵 Centering & Shuttering",
        "items": [
            {"standard_name": "Plywood Sheet 4x8", "aliases": ["Plywood 4x8", "Plywood 4*8", "Plywood Sheet"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "Plywood (Other Sizes)", "aliases": ["Plywood 12 MM", "Plywood 3x8", "Plywood 2.5x8"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "Ply Centering", "aliases": ["Ply Centing", "Centing Ply Sheet", "4*8 Centring"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "Balli (Bamboo Pole)", "aliases": ["Bali", "Bali 10 fit", "Bali 12 fit", "Bali 8 fit", "Baas", "baas"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "MS Chaddar (Sheet)", "aliases": ["Ms Chaddar", "Chaddar Sheet", "MS sheet", "M S SHEET"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "Column Pharma", "aliases": ["Column Pharma 500", "Column Pharma 600", "Column Pharma 800"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "Centering Chabhi", "aliases": ["Centing Cabei", "Chabi", "Chabi 2+4+5 fit"], "default_unit": "No.", "ledger": "Centering"},
            {"standard_name": "Silver Reip (Tape)", "aliases": ["Silver Reip", "Reip"], "default_unit": "No.", "ledger": "Centering"},
        ],
    },
]

ITEM_CATEGORIES.extend([
    {
        "name": "🔧 Tools & Hardware",
        "items": [
            {"standard_name": "Favda (Shovel)", "aliases": ["Favda", "Favdha", "Pavda"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Geti (Pickaxe)", "aliases": ["Geti", "Geti Handle wooden"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Tagari (Basket)", "aliases": ["Tagari", "PVC Tagari"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Tasla (Pan)", "aliases": ["Tasla"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Belcha (Spade)", "aliases": ["Belcha"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Hathoda (Hammer)", "aliases": ["Hathoda", "Hammr"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Karni (Trowel)", "aliases": ["karni"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Nails", "aliases": ["Nails", "Bombay Nails", "Nails 3\"", "Nails 2.5"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "Nut Bolt", "aliases": ["Nut Bolt", "Nut & Bolt", "Nut bolt"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "Shikanja (Screw)", "aliases": ["Shikanja", "Shikanja MS", "Scroo"], "default_unit": "KG", "ledger": "Material"},
            {"standard_name": "Saval (Level)", "aliases": ["Saval"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Randa (Planer)", "aliases": ["Randa 3 Feet", "Palish Randa"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Guniya (L-Square)", "aliases": ["Guniya 24\"", "L scale"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Measuring Tape", "aliases": ["30 M Steel Tep", "30 Meter Steel Tep", "5 M MS Tep", "Tep"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Bucket (20L)", "aliases": ["Bucket", "20 litre Bucket", "Balti MS 20 Liter", "Balti Plastic 20 Liter"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Pani Drum (200L)", "aliases": ["Pani drum 200 Ltr.", "Empty Pani Dram 200 Liter"], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Teirpal (Tarpaulin)", "aliases": ["Teirpal", "New Teirpal"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Rassi (Rope)", "aliases": ["Rasi", "Rassi", "PVC Rassi", "Purani Nariyal Rassi"], "default_unit": "Metre", "ledger": "Consumable"},
            {"standard_name": "Gum Boot", "aliases": ["Gum Boot", "Gum boot"], "default_unit": "Pair", "ledger": "Consumable"},
            {"standard_name": "Safety Helmet", "aliases": ["Septy Helmate", "Old Septy Helmate"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Safety Shoes", "aliases": ["Safety Boot", "Safety shoes"], "default_unit": "Pair", "ledger": "Consumable"},
            {"standard_name": "Hand Gloves", "aliases": ["Hand Gloves"], "default_unit": "Pair", "ledger": "Consumable"},
        ],
    },
    {
        "name": "⚡ Electrical",
        "items": [
            {"standard_name": "Electric Cable 2.5mm", "aliases": ["2.5 mm wired", "2.5 m cable electric", "2 Core cable", "3 Core cable"], "default_unit": "Metre", "ledger": "Material"},
            {"standard_name": "Electric Board", "aliases": ["Electric Board", "Ele. Board", "Electric board"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Electric Tape", "aliases": ["Electric Tep", "Electric tep", "Ele. Wire"], "default_unit": "Roll", "ledger": "Consumable"},
            {"standard_name": "LED Light", "aliases": ["LED Light", "LED light 60 w", "60 w Halogen Light"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Switch Socket", "aliases": ["Switch socket", "Cut Out", "Cut out"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Modular Box", "aliases": ["6 Modular Box", "12 Modular Box"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Bopp Tape", "aliases": ["Boop Tep", "Boop Tep roll", "Bopp Tep roll"], "default_unit": "Roll", "ledger": "Consumable"},
        ],
    },
    {
        "name": "🚰 Plumbing & PVC",
        "items": [
            {"standard_name": "PVC Pipe 4 inch", "aliases": ["4\" PVC Pipe", "4\" pipe", "8\" PVC pipe"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "PVC Bend", "aliases": ["4\" PVC Bend", "PVC Bend"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "PVC T-Joint", "aliases": ["4\" PVC T", "4* T"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "GI Nipple", "aliases": ["1\" Gi niple", "Pipe Niple", "1¼*¼ Gi nipple"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Garden Pipe", "aliases": ["Garden Pipe 1Inch", "2\".5 Pipe", "¾ Green feasible pipe"], "default_unit": "Metre", "ledger": "Material"},
            {"standard_name": "Teflon Tape", "aliases": ["Teflon Tep", "Teflon tep"], "default_unit": "Roll", "ledger": "Consumable"},
            {"standard_name": "Water Tank", "aliases": ["Pani Tenkar 6000 Ltr"], "default_unit": "No.", "ledger": "Recevable"},
        ],
    },
    {
        "name": "🚜 Machinery & Equipment",
        "items": [
            {"standard_name": "Cutter Machine", "aliases": ["Cutter machine", "Steel Cutter Machine", "Ply Cutter Machine"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Drill Machine", "aliases": ["Drill machine", "Hand Grinder"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Vibrator (Hand)", "aliases": ["Hand Vibrator", "New Hand Vibrator", "RCC vibrator needle"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Plate Compactor", "aliases": ["Plat Compactor"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Level Machine", "aliases": ["Level machine", "Total station machine"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Bending Machine", "aliases": ["Banding machine"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Breaker Machine", "aliases": ["Breaker machine"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Cutting Blade", "aliases": ["14\" Cutter Patta", "14\" Cutting pata", "4\" Steel cutting pata", "Aari pata"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Engine Oil", "aliases": ["Engine oil", "Servo ECO 15W40", "Hydrolic oil 68 No."], "default_unit": "Litre", "ledger": "Consumable"},
            {"standard_name": "Grease", "aliases": ["Greece", "MAAC AP-3 Grease"], "default_unit": "KG", "ledger": "Consumable"},
        ],
    },
    {
        "name": "🪑 Site Furniture & Misc",
        "items": [
            {"standard_name": "Chair", "aliases": ["Chair"], "default_unit": "No.", "ledger": "General"},
            {"standard_name": "Office Table", "aliases": ["Office table 3*2 fit", "Office table 4*2 fit"], "default_unit": "No.", "ledger": "General"},
            {"standard_name": "Blanket", "aliases": ["Blanket"], "default_unit": "No.", "ledger": "General"},
            {"standard_name": "Mattress", "aliases": ["Mattress", "Gadda"], "default_unit": "No.", "ledger": "General"},
            {"standard_name": "Pillow", "aliases": ["Pillow"], "default_unit": "No.", "ledger": "General"},
            {"standard_name": "Broom", "aliases": ["Broom", "Shipe Jadu", "Sip jadu"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Lock", "aliases": ["Lock", "Look", "look"], "default_unit": "No.", "ledger": "Consumable"},
            {"standard_name": "Register (Notebook)", "aliases": ["Ragister"], "default_unit": "No.", "ledger": "Stationery"},
            {"standard_name": "Marker Pen", "aliases": ["Marker Pen"], "default_unit": "No.", "ledger": "Stationery"},
        ],
    },
    {
        "name": "🧪 Testing Equipment",
        "items": [
            {"standard_name": "Brass Test Sieve", "aliases": ["Brass Test Sieves", "Test Brass Sieves"], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "MS Sieve", "aliases": ["MS Sieve 12.5 MM", "MS Sieve 20 MM", "MS Sieve 45 MM"], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Cube Testing Machine", "aliases": ["Cube Testing Machine"], "default_unit": "No.", "ledger": "Machinery"},
            {"standard_name": "Sand Measurement Tube", "aliases": ["Sand Masurment Tube", "Sand Tube"], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Vernier Caliper", "aliases": ["Vernier Caliper 6\""], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Depth Gauge", "aliases": ["Depth guage 6\""], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Strip Level", "aliases": ["Strip level 12\""], "default_unit": "No.", "ledger": "Recevable"},
            {"standard_name": "Weighing Scale", "aliases": ["Weight Kata 150 KG", "Weight machine"], "default_unit": "No.", "ledger": "Recevable"},
        ],
    },
    {
        "name": "🏗️ Expansion & Joint Materials",
        "items": [
            {"standard_name": "Expansion Joint Pad", "aliases": ["Expansion Join pad", "Expansion joint pad", "Joint Paid"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Expansion Joint Sheet", "aliases": ["Expension joint sheet 50 MM"], "default_unit": "No.", "ledger": "Material"},
            {"standard_name": "Solvent", "aliases": ["Solvent"], "default_unit": "Litre", "ledger": "Material"},
            {"standard_name": "Paint (Oil)", "aliases": ["Oil paint for layout marking", "200 ML Oli Paint", "100 g orange oil paint"], "default_unit": "Litre", "ledger": "Consumable"},
            {"standard_name": "Paint Brush", "aliases": ["4\" Paint brush", "Brush"], "default_unit": "No.", "ledger": "Consumable"},
        ],
    },
])
