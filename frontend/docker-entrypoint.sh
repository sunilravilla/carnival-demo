#!/bin/sh
# Generate self-signed SSL certificate if none is mounted
SSL_DIR="/etc/nginx/ssl"
if [ ! -f "$SSL_DIR/server.crt" ] || [ ! -f "$SSL_DIR/server.key" ]; then
    echo "No SSL certificate found. Generating self-signed certificate for local development..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/server.key" \
        -out "$SSL_DIR/server.crt" \
        -subj "/CN=localhost" \
        > /dev/null 2>&1
    echo "Self-signed certificate generated."
fi

exec nginx -g "daemon off;"
