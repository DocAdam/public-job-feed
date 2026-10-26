#!/bin/bash
set -e
export FEED_PARENT_LAUNCHER="$0"
exec /bin/bash "/Users/adampugh/GitHub/public-job-feed/launchers/Refresh Job Feed.command" "$@"
