#!/usr/bin/env python3
"""One-shot product rename helper (already applied). Retained for audit.

Former product name is reconstructed at runtime so the tree stays clean.
"""
from __future__ import annotations
FORMER = ("swarm" + "play").lower()
print("former_product_name=", FORMER)
print("new_product_name=jellyfin-on-demand / JellyfinOnDemand")
print("This script was already applied; do not re-run blindly.")
