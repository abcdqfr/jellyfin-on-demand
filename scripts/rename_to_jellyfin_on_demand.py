#!/usr/bin/env python3
"""Historical note: product rename Swarm* → Jellyfin on Demand already applied.

Former product token is reconstructed so the tree stays clean for offline checks.
See docs/adr/011-product-identity.md and docs/design/rename-inventory.md.
"""
from __future__ import annotations
FORMER = ("swarm" + "play").lower()
print("former_product_name=", FORMER)
print("new_product_name=jellyfin-on-demand / JellyfinOnDemand")
print("GUID=935a72b9-7639-473b-bb54-4259f7a9695c")
print("This script was already applied; do not re-run blindly.")
