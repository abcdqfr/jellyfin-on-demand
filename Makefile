# swarmplay — local lab host (this machine).
# Shape borrowed from sister strmarr Makefile (gate → package → deploy → verify),
# without *arr/docker lab services.

.PHONY: help build native package gate deploy start stop restart status up \
	smoke verify uninstall

VERSION ?= 0.1.7
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
DOTNET ?= $(ROOT)/.tools/dotnet/dotnet
export PATH := $(ROOT)/.tools/dotnet:$(PATH)
export DOTNET_ROOT := $(ROOT)/.tools/dotnet
export DOTNET_CLI_HOME := $(ROOT)/.tools/dotnet-cli-home
export NUGET_PACKAGES := $(ROOT)/.tools/nuget
export DOTNET_NOLOGO := 1
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE := 1
export DOTNET_CLI_TELEMETRY_OPTOUT := 1

PLUGIN_PROJ := $(ROOT)/plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarmplay.csproj
NATIVE_SO := $(ROOT)/torrent/native/build/libswarmplay_native.so
DIST_DIR := $(ROOT)/dist/swarmplay-$(VERSION)

JF_PLUGIN_DIR ?= /var/lib/jellyfin/plugins/Jellyfin.Plugin.Swarmplay
JF_NATIVE_LIB ?= /usr/local/lib/libswarmplay_native.so
JF_URL ?= http://127.0.0.1:8096
SUDO ?= sudo

help:
	@echo "swarmplay local lab targets:"
	@echo "  make build       — plugin (jf10) + ensure native .so exists"
	@echo "  make package     — dist/swarmplay-$(VERSION)/ (+ zip)"
	@echo "  make gate        — scripts/ci_gate.sh (commit gate)"
	@echo "  make deploy      — install plugin + native into system Jellyfin"
	@echo "  make start|stop|restart|status"
	@echo "  make up          — package + deploy + start + verify"
	@echo "  make smoke       — play-bind smoke against $(JF_URL)"
	@echo "  make verify      — plugin loaded + native resolvable"
	@echo "  make uninstall   — remove deployed plugin + native drop-in"

build:
	@$(DOTNET) build $(PLUGIN_PROJ) -p:JellyfinTarget=jf10 -c Release -v q
	@test -f $(NATIVE_SO) || (echo "missing $(NATIVE_SO); build torrent/native" >&2; exit 1)

native:
	@test -f $(NATIVE_SO) || (echo "missing $(NATIVE_SO); build torrent/native" >&2; exit 1)
	@echo "native: $(NATIVE_SO)"

package: build
	@$(ROOT)/scripts/package_release.sh $(VERSION)

gate:
	@$(ROOT)/scripts/ci_gate.sh

deploy: package
	@$(ROOT)/scripts/deploy_local.sh $(VERSION)

start:
	@$(SUDO) systemctl enable jellyfin.service
	@$(SUDO) systemctl start jellyfin.service
	@echo "jellyfin: waiting for HTTP..."
	@for i in $$(seq 1 60); do \
		curl -sf -m 2 $(JF_URL)/System/Info/Public >/dev/null && break; \
		sleep 1; \
	done
	@curl -sf -m 3 $(JF_URL)/System/Info/Public >/dev/null || (echo "jellyfin: HTTP not ready" >&2; exit 1)
	@echo "jellyfin: started (enable on boot)"

stop:
	@$(SUDO) systemctl stop jellyfin.service
	@echo "jellyfin: stopped"

restart:
	@$(SUDO) systemctl restart jellyfin.service
	@echo "jellyfin: restarted"

status:
	@systemctl is-active jellyfin.service || true
	@$(SUDO) systemctl status jellyfin.service --no-pager -l || true
	@ss -ltn | grep -E ':8096\b' || echo "(port 8096 not listening)"

up: deploy start verify
	@echo "up: Swarmplay $(VERSION) on $(JF_URL) — use Jellyfin Desktop against this host"

verify:
	@JF_URL=$(JF_URL) $(ROOT)/scripts/deploy_verify.sh

smoke:
	@test -n "$$JF_USER" -a -n "$$JF_PASS" || (echo "smoke: set JF_USER and JF_PASS" >&2; exit 1)
	@JF_URL=$(JF_URL) JF_USER=$$JF_USER JF_PASS=$$JF_PASS $(ROOT)/scripts/jf_system_smoke.py

uninstall:
	@$(ROOT)/scripts/deploy_local.sh --uninstall
