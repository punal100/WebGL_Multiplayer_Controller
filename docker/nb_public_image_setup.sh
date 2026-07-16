#!/usr/bin/env sh
set -e

# Compatibility shim for managed container platforms (e.g. E2E Networks Pods)
# that default the container start command to /etc/config/nb_public_image_setup.sh.
# This image does not ship E2E's base-image bootstrap, so we provide this script
# at that path. It simply starts the server (+ auto Cloudflare Tunnel), matching
# the image's own CMD. Set NO_TUNNEL=1 (env) to run the plain server instead.

cd /app
exec node server/launch.js
