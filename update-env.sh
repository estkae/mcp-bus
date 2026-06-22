#!/bin/bash
# Update Environment Variables für DigitalOcean App

# App ID abrufen
APP_ID=$(doctl apps list --format ID,Spec.Name | grep "remote-mcp-server" | awk '{print $1}')

if [ -z "$APP_ID" ]; then
  echo "❌ App nicht gefunden"
  exit 1
fi

echo "📦 App ID: $APP_ID"
echo "🔧 Setze SERVER_URL..."

# Environment Variable setzen
doctl apps update $APP_ID --env "SERVER_URL=https://mcp-bus-suyns.ondigitalocean.app"

echo "✅ Environment Variable gesetzt"
echo "⏳ App wird neu deployed..."
