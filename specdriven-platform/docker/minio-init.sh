#!/bin/sh
# Cria bucket S3 no MinIO (profile storage).
set -e
mc alias set local "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
mc mb --ignore-existing "local/${S3_BUCKET:-specdriven}"
echo "Bucket ${S3_BUCKET:-specdriven} pronto."
