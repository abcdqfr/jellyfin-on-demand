#!/usr/bin/env python3
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
FIXTURE = json.loads((ROOT / "docs/design/fixtures/ready-cases.json").read_text())


def ready_mode(values, assumptions):
    warm = assumptions["warm_band_bytes"]
    head_min = assumptions["head_magic_min_bytes"]
    timeout_head_min = assumptions["timeout_head_min_bytes"]

    if values["tail_bytes_have"] >= warm and values["head_bytes_have"] >= warm:
        return "A"
    if values["head_bytes_have"] >= head_min and values["head_magic_ok"]:
        return "B"
    if values["warm_deadline_exceeded"] and values["head_bytes_have"] >= timeout_head_min:
        return "C"
    return "none"


failures = []
for case in FIXTURE["cases"]:
    mode = ready_mode(case["input"], FIXTURE["assumptions"])
    actual = {"ready": mode != "none", "mode": mode}
    if actual != case["expected"]:
        failures.append(f'{case["name"]}: expected {case["expected"]}, got {actual}')

if failures:
    print("\n".join(failures))
    raise SystemExit(1)
print(f"ready: {len(FIXTURE['cases'])} cases")
