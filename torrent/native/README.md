# Swarmplay native bridge
This directory contains offline C ABI stubs.
They expose ensure, status, and stop entry points.
All stub functions return `SWARM_ERROR_UNAVAILABLE`.
No libtorrent dependency is included yet.
No network access or compilation is required.
Later, add the libtorrent-backed session implementation.
Build integration will be added with CMake later.
The ABI is intended for Jellyfin P/Invoke.
