#!/bin/bash

# WireGuard backup script for wg-easy
# This script backs up the entire wireguard data directory to S3

set -e

WIREGUARD_DATA_DIR="/home/ubuntu/wireguard/data"
BACKUP_FILE="/tmp/wireguard-backup.tar.gz"
BUCKET_NAME="$1"

if [ -z "$BUCKET_NAME" ]; then
  echo "Usage: $0 <s3-bucket-name>"
  exit 1
fi

# Check if wireguard data directory exists
if [ ! -d "$WIREGUARD_DATA_DIR" ]; then
  echo "WireGuard data directory not found: $WIREGUARD_DATA_DIR"
  exit 1
fi

echo "Starting WireGuard backup..."

# Clean up any existing backup file
sudo rm -f "$BACKUP_FILE"

# Create backup archive
sudo tar -czf "$BACKUP_FILE" -C "$(dirname "$WIREGUARD_DATA_DIR")" "$(basename "$WIREGUARD_DATA_DIR")"

# Change ownership of backup file
sudo chown ubuntu:ubuntu "$BACKUP_FILE"

# Upload to S3
aws s3 cp "$BACKUP_FILE" "s3://$BUCKET_NAME/wireguard-backup.tar.gz"

# Clean up
rm -f "$BACKUP_FILE"

echo "Backup completed successfully and uploaded to s3://$BUCKET_NAME/wireguard-backup.tar.gz"
