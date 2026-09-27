# 彩窗铅条骨架编排 —— 零依赖 Node 静态服务镜像
FROM node:22-alpine

WORKDIR /app

# 项目无第三方依赖，仅拷贝清单以利分层缓存
COPY package.json ./
COPY web ./web
COPY server.js ./
COPY scripts ./scripts
COPY test ./test

# 构建静态产物到 dist/
RUN npm run build

# 容器内监听端口可由 WEB_PORT 配置
ENV WEB_PORT=8080
EXPOSE 8080

# 静态 Web 健康检查：/healthz 返回 {"status":"ok"}
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null || exit 1

CMD ["node", "server.js"]
