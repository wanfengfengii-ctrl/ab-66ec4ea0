# 彩窗铅条骨架编排

为拆解后的彩窗规划铅条骨架：在浏览器中录入 5–8 块带唯一编号的玻璃片、
每片允许的连接数闭区间，以及 8–14 条带两端编号、抗拉等级与安装代价的
候选铅条；编辑草稿后一键编排，查看采用/未采用铅条、各片实际连接数与
骨架结构图。

## 问题定义

联合选择**恰好比玻璃片数少一条**的候选铅条，使其：

1. 全部玻璃片连通；
2. 任意子集不形成环（即构成一棵生成树）；
3. 每片玻璃片的实际连接数落在其允许闭区间 `[lo, hi]` 内。

择优次序（逐级比较）：

1. **最弱采用铅条的抗拉等级最高**（瓶颈最大化）；
2. 并列时**总安装代价最低**；
3. 仍并列时，采用铅条**录入序号序列字典序最小**。

不存在合格骨架时，页面稳定列出**按玻璃片编号排序**的首个失败证据
（连接范围不足 / 候选图不连通 / 联合约束不可满足）。

## 技术说明

- 零依赖：原生 Node.js `http` 静态服务 + 原生 SVG 画布，无第三方包。
- 核心求解器 `web/solver.js` 为浏览器与 Node 共享的 ES Module；
  n ≤ 8、m ≤ 14 下用 DFS + 并查集枚举全部生成树（含可达度剪枝），
  按三级次序择优。
- 无解诊断依次检查：候选铅条触达数不足、候选图连通分量、
  单片在任意生成树中的度数上下界（枚举取得）、联合约束结论。
- `test/solver.test.js` 使用**独立的组合暴力枚举**作为参考实现，
  对 200 个随机模型交叉校验可行性与三个择优目标。

## 本地运行（需 Node ≥ 20）

```bash
npm run verify    # 测试 + 构建 + 样例冒烟（含 HTTP 健康检查）
npm start         # 启动页面，默认 http://localhost:8080
WEB_PORT=9000 npm start   # 自定义端口
```

健康检查：`GET /healthz` → `200 {"status":"ok"}`。

## Docker

页面端口由 `WEB_PORT` 配置（默认 8080）：

```bash
docker compose up web --build         # 默认 8080
WEB_PORT=9000 docker compose up web   # 自定义端口
```

一次性校验服务：自行执行代码测试、构建和骨架样例冒烟，
以退出码报告结果（通过为 0）：

```bash
docker compose run --build verify
# 或随 up 一并运行（verify 依赖 web 健康检查通过后才开始冒烟）
WEB_PORT=9000 docker compose up --build
```

## 目录结构

```
web/
  solver.js     # 求解器（枚举、择优、无解证据），浏览器/Node 共用
  sample.js     # 内置演示样例
  app.js        # 画布交互与结果渲染
  index.html / styles.css
server.js       # 零依赖静态服务，含 /healthz
scripts/
  build.mjs     # 组装 dist/ 并做求解器自检
  smoke.mjs     # 样例骨架冒烟 + HTTP 健康检查（支持 SMOKE_TARGET）
test/
  solver.test.js# node:test，含独立暴力枚举交叉校验
Dockerfile / docker-compose.yml
```
