# 결함관리서비스 v1.0 — Node.js 내장 모듈만 사용(외부 npm 의존성 0건)
# 빌드 단계 없이 소스를 그대로 복사해 실행한다.
FROM node:20-alpine

# Alpine 기본 이미지에는 tzdata가 없어 Intl 타임존 계산이 깨질 수 있다. 명시적으로 설치한다.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

WORKDIR /app

# package.json만 먼저 복사(캐시 최적화). dependencies가 없으므로 npm install은 사실상 no-op.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund || true

COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts
COPY config ./config

# data/uploads/backup/logs는 볼륨으로 마운트되어 컨테이너 재생성 후에도 유지된다.
RUN mkdir -p data uploads backup logs

ENV DMS_HOST=0.0.0.0
ENV DMS_PORT=8080
EXPOSE 8080

# 컨테이너 헬스체크: /api/health 200 응답 확인
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/server.js"]
