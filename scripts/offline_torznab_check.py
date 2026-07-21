#!/usr/bin/env python3
from pathlib import Path
import xml.etree.ElementTree as ET


path = Path(__file__).resolve().parent.parent / "docs/design/fixtures/torznab-sample.xml"
count = len(ET.parse(path).getroot().findall("./channel/item"))
print(f"torznab items: {count}")
raise SystemExit(0 if count >= 2 else 1)
