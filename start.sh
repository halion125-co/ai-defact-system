#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 설치되어 있지 않습니다. Node.js 18 이상을 설치한 뒤 다시 실행하세요."
  exit 1
fi
echo "결함관리서비스 v1.0 시작..."
exec node backend/server.js
