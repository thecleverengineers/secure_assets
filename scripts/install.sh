#!/usr/bin/env bash
set -euo pipefail

echo "Bootstrapping Secure Assets..."
docker compose up -d --build

echo "Services:"
echo "- Web: http://localhost:5173"
echo "- API health: http://localhost:3000/health"
echo "- AI health: http://localhost:8000/health"
