#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the project root directory
cd "$SCRIPT_DIR"

# Set PYTHONPATH and start the server
export PYTHONPATH="$SCRIPT_DIR/backend"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload