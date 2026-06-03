# 性能与稳定性压测 — TODO

> 本目录承载 v1.2 文档 §"性能和稳定性"（doc/v1.2-完整交付版-AB端任务分配.md 行 559 附近）压测基线的脚本与报告留痕。
> 当前 **不** 包含实际压测脚本（脚本与 CI 闸门见下方 TODO）。本 README 用于记录基线、TODO 与验收人，由项目管理员跟进。

---

## 1. 项目背景与基线

- 目标规模：单实例 **50-100 人** 在线并发（含 admin / supervisor / sales / operations / academic 角色）。
- 业务基线（来自 v1.2 文档 §"性能和稳定性"）：
  - 列表接口（`/api/leads`、`/api/posts`、`/api/orders`、`/api/notifications`）**P95 ≤ 1.5s**。
  - WebSocket 通知 **从 emit 到客户端展示 ≤ 3s**。
  - 客资 / 订单关键写接口 **P95 ≤ 1s**（含事务）。
- 部署基线：单实例 PM2 fork 模式（`ecosystem.config.js`），MySQL `connectionLimit: 50`，Node `waitForConnections: true, queueLimit: 0`。
- 验收环境：与生产同规格的预发机器；DB 行数至少达到当前生产的 1.5x（防止缓存掩盖全表扫描问题）。

## 2. 工具选型 TODO

- [ ] **选 k6 还是 artillery**（推荐 k6：Go 实现轻量、JS 脚本易上手、原生支持 checks / thresholds）。
  - 备选 artillery：Node 实现，与项目同栈，但 VU 数量大时 CPU 占用更高。
- [ ] 准备 docker-compose 预发环境（复用 `deploy/` 现有 nginx + mysql 配置；调小 `connectionLimit` 到 10 模拟真实压力）。
- [ ] 准备 seed 数据脚本（500 账号 / 5,000 作品 / 50,000 客资 / 5,000 订单），保证 list / stats 接口走索引。

## 3. 场景脚本 TODO

- [ ] **登录态登录脚本**：4 个角色各 5-10 个虚拟用户，登录后保存 Bearer token（`auth.service` 走 in-memory Map，重启后需重新登录）。
- [ ] **列表接口压测**：
  - `GET /api/leads?limit=20&offset=0`（带 `scope=self` / `scope=all` 两种）
  - `GET /api/posts?limit=20`
  - `GET /api/orders?limit=20&offset=0`
  - `GET /api/notifications?status=unread&limit=20`
  - 目标 P95 ≤ 1.5s。
- [ ] **写接口压测**：
  - `POST /api/leads`（命中本次事务化改造的路径，验证 1s 内返回）
  - `PATCH /api/leads/:id/status`（覆盖所有 status 码）
  - `POST /api/orders/:id/follow-records`
  - 目标 P95 ≤ 1s。
- [ ] **状态更新乐观锁压测**：并发改同一 `lead.status` 验证 409 / Conflict 比例与正确性（对应 `leads.service.ts` 中 `updateResult.affected` 判定）。
- [ ] **WebSocket 通知延迟**：模拟 100 VU 在线，`POST /api/leads` 后统计 emit → 客户端 `notifications.js` 回调的时间差，目标 ≤ 3s。
- [ ] **批量导入场景**（可选）：复用 `imports.service.ts` 跑 1k 行 xlsx，验证事务批提交不会锁表超过 5s。

## 4. 报告与归档

- [ ] 录制 perf 报告到 `backend/test/perf/reports/`（k6 `--out json=reports/...json` + 自带 HTML summary）。
- [ ] 报告命名规范：`{YYYYMMDD}-{场景}-{git_sha}.html`。
- [ ] 关键指标登记进 `doc/perf-baseline.md`（新增）：用于回归对比。

## 5. CI 闸门

- [ ] 在 CI 加 perf 闸门：每个 release 标签前必须跑过 list / write / optimistic-lock 三组场景，P95 退化 > 20% 视为不通过。
- [ ] perf job 标记为 `manual trigger`（不阻塞日常 PR），由 release manager 手动触发。

## 6. 验收

| 项 | 验收人 | 截止时间 | 状态 |
| --- | --- | --- | --- |
| 工具选型（k6 / artillery）确定 | _（待补）_ | _（待补）_ | ⏳ |
| 列表接口 P95 ≤ 1.5s 达标 | _（待补）_ | _（待补）_ | ⏳ |
| 写接口 P95 ≤ 1s 达标 | _（待补）_ | _（待补）_ | ⏳ |
| 乐观锁并发冲突符合预期 | _（待补）_ | _（待补）_ | ⏳ |
| CI 闸门接入 | _（待补）_ | _（待补）_ | ⏳ |

## 7. 关联文档

- v1.2 任务分配 §5.2 客资状态机
- v1.2 任务分配 §"性能和稳定性"
- B 端剩余功能清单 `doc/B端-剩余功能清单.md` §2.1
- `backend/src/modules/leads/leads.service.ts` `TODO(PERF)` 注释（create 路径）

## 8. 备注

- 本目录是 **TODO 留痕**，不包含实际脚本。脚本提交需在 PR 描述中引用本 README 的对应 TODO 项。
- 所有改动需同时更新本 README 顶部"状态"行，保持与代码同步。
