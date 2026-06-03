# 通知系统使用指南

## 概述

通知系统已完整实现，包括 CRUD API、WebSocket 实时推送和数据库持久化。

## API 端点

### 1. 获取通知列表
```
GET /api/notifications
```

**查询参数：**
- `status`: 'unread' | 'all' (默认 'all')
- `type`: 通知类型过滤
- `limit`: 每页数量 (默认 30，最大 200)
- `offset`: 偏移量 (默认 0)

**响应：**
```json
{
  "items": [...],
  "unreadCount": 5,
  "total": 50,
  "limit": 30,
  "offset": 0
}
```

### 2. 获取未读数
```
GET /api/notifications/unread-count
```

**响应：**
```json
{
  "unreadCount": 5
}
```

### 3. 标记单条已读
```
PATCH /api/notifications/:id/read
POST /api/notifications/:id/read (兼容旧版)
```

**响应：**
```json
{
  "ok": true,
  "changed": true
}
```

### 4. 全部标记已读
```
POST /api/notifications/read-all
```

**响应：**
```json
{
  "ok": true,
  "affected": 5
}
```

## WebSocket 实时推送

### 连接
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3100/notifications', {
  auth: { token: 'your-jwt-token' },
  transports: ['websocket']
});
```

### 事件监听
```javascript
// 连接成功
socket.on('notification:connected', (data) => {
  console.log('已连接', data.userId);
});

// 新通知
socket.on('notification:new', (notification) => {
  console.log('收到新通知', notification);
  // 更新 UI
});

// 错误处理
socket.on('notification:error', (error) => {
  console.error('通知错误', error.message);
});
```

## 通知类型

| 类型代码 | 标签 | 使用场景 |
|---------|------|---------|
| `lead_assigned` | 新客资分配 | 销售收到新分配客资 |
| `collaboration_requested` | 协同申请 | 运营收到协同申请 |
| `customer_not_passed` | 客户未通过 | 运营收到客户未通过 |
| `collaboration_handled` | 协同已处理 | 销售收到运营已处理 |
| `customer_added` | 客户已添加 | 运营收到销售已添加 |
| `order_created` | 新订单 | 教务收到新订单 |
| `order_updated` | 订单更新 | 订单进度更新 |
| `order_abnormal` | 订单异常 | 订单异常通知 |
| `export_finished` | 导出完成 | 导出任务完成 |
| `supervisor_suggestion` | 主管建议 | 主管建议通知 |

## 后端使用示例

### 在服务中创建通知

```typescript
import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../constants/notification-types';

@Injectable()
export class LeadsService {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  async assignLead(leadId: string, salesUserId: string) {
    // 业务逻辑...
    
    // 发送通知
    await this.notificationsService.create({
      receiverIds: [salesUserId],
      portType: 'sales',
      typeCode: NotificationType.LEAD_ASSIGNED,
      title: '新客资分配',
      content: `您收到了一条新客资`,
      relatedId: leadId,
      relatedType: 'lead',
    });
  }
}
```

### 使用辅助函数

```typescript
import { createNotification } from '../../shared/utils/notification-helper';
import { NotificationType } from '../../constants/notification-types';

// 在任何服务中
await createNotification(this.notificationsService, {
  receiverIds: [userId],
  portType: 'operations',
  typeCode: NotificationType.COLLABORATION_REQUESTED,
  title: '协同申请',
  content: `销售申请协同处理客资`,
  relatedId: taskId,
  relatedType: 'collaboration_task',
});
```

## 技术实现

- **框架**: NestJS + Socket.IO
- **数据库**: MySQL (notifications 表)
- **认证**: JWT token
- **房间管理**: 按 user_id 分组
- **离线支持**: 通知入库，用户上线后可查询历史
- **容错**: 通知创建失败不影响主业务流程

## 注意事项

1. 通知必须入库，不能只推送
2. WebSocket 连接需要 JWT token 认证
3. 通知创建是异步的，失败不会抛出异常
4. 支持批量接收者（receiverIds 数组）
5. portType 根据用户角色自动解析
