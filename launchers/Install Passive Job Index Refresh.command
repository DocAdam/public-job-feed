#!/bin/bash
set -e

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
LABEL="com.public-job-feed.maintain-index"
SOURCE="$PROJECT_DIR/launchers/$LABEL.plist.example"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/data/jobs/logs"
cp "$SOURCE" "$TARGET"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$TARGET"

echo "Installed twice-daily passive job index maintenance."
echo "Definition: $TARGET"
echo "Logs: $PROJECT_DIR/data/jobs/logs"
echo
read -n 1 -s -r -p "Press any key to close..."
echo
