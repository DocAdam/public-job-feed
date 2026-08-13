#!/bin/bash
set -e

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
GSHEET_DIR="$PROJECT_DIR/data/jobs/gsheet-package/latest"

echo "Opening latest Google Sheets package:"
echo "$GSHEET_DIR"

open "$GSHEET_DIR"
