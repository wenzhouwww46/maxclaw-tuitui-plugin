# @qihoo/tuitui-bot-sdk

推推机器人 Node.js SDK。源码使用 TypeScript，发布产物为 JavaScript 和类型声明。

## 安装

```bash
npm install @qihoo/tuitui-bot-sdk
```

推推机器人 SDK 迭代较快，可能包含不兼容变更。建议固定到明确版本，不要使用 `^`、`~`、`>=` 等自动升级范围；升级前先完成兼容性验证。

## 发送消息

```ts
import { TuituiBotClient } from "@qihoo/tuitui-bot-sdk";

const client = new TuituiBotClient("your-app-id", "your-app-secret");

await client.im.sendText({
  to: client.to.account("user-account"),
  text: "你好，来自 `ts` SDK",
});
```

SDK 使用 `client.to.account()`、`uid()`、`group()`、`accounts()` 和 `uids()` 创建单聊或群聊目标，频道和帖子能力位于 `client.teams`。

## 发送消息错误处理

消息、团队、文件和机器人属性等 API 调用失败时会抛出错误，使用方应捕获并记录完整的错误对象：

```ts
try {
  const response = await client.im.sendText({
    to: client.to.account("user-account"),
    text: "你好",
  });
  console.log("消息发送成功", response);
} catch (error) {
  // 发送失败需要记录日志，方便后面排查问题。
  console.error("消息发送失败", error);
}
```

使用方需要完整记录错误日志。SDK 抛出的错误对象中包含错误详情，特别是详情中的 `trans_id` 是本次 API 调用的上下文 ID。如果遇到难以定位的问题，可以提交该 ID 和错误消息，与推推技术支持团队一起排查原因。

## 事件订阅(收消息)

事件订阅是 SDK 通过 WebSocket 长连接持续接收推推机器人事件的能力，包括单聊、群聊、团队帖子和交互回调。只发送消息时不需要订阅；只有需要接收事件时才建立长连接。完整代码请参考 `samples/src/receive.ts`。

消息事件的数据结构请参考 SDK 导出的 `TuituiMessageData` 类型定义。

SDK 收到事件后会自动向推推服务确认已接收，无需业务代码额外回复。心跳事件不会触发业务回调，同一事件也不会被重复处理。

**错误处理**

长连接异常时，SDK 会在内部自动尝试重新连接，无需使用方主动重连。订阅过程不会向业务代码抛出异常；如需感知错误，可以在 `onError` 回调中打印错误日志，但不需要在该回调中执行重连或其他恢复操作，SDK 会自行重试。调用 `unsubscribe()` 后会关闭连接并停止重连。

## 发送交互式卡片

SDK 接收推推原生交互卡片结构，业务可以定义自己的模板。具体字段请参考 SDK 导出的 `TuituiOutboundInteractiveMessage` 类型以及推推 API 文档，完整代码请参考 `samples/src/send-interactive.ts`。

**最佳实践**

发送交互式卡片后，需要开启事件订阅（收消息）。用户点击同意、拒绝等按钮时，会收到一条类型为 `interactive` 的消息。处理完业务逻辑后，应调用 `client.im.modifyInteractive()` 原地更新卡片，删除操作按钮并显示“已同意”或“已拒绝”等最终状态文案，不应继续保留可点击按钮，给用户操作反馈同时避免用户重复操作。

## Agent 执行中间步骤上报

`client.agent` 提供 Agent 执行中间步骤的类型化、保序上报能力。具体调用示例请查看 `samples/src/agent-report.ts`。

## API

- `client.im`：发送单聊、群聊消息（文本、图片、图文、页面、链接、文件和交互卡片）、编辑消息、表情回复和拉取聊天记录。
- `client.teams`：团队、频道、帖子 API。
- `client.file`：底层公共文件 API，支持上传文件和查询临时下载 URL，可用于消息、帖子等场景。
- `client.fileSpace`：文件空间，目前仅用于团队模块，包含文件、目录的新增、列表和删除。
- `client.group`：建群、群成员管理及群信息查询。
- `client.property`：机器人自身属性查询与修改（名称、账号、头像、Webhook、可交互式消息回调地址和快捷指令）。
- `client.event`：通过 WebSocket 订阅推推事件，用于实时收消息等场景。
- `client.agent`：上报 Agent 执行中间步骤（模型调用、工具调用），供推推客户端展示。
- `client.request()`：调用尚未封装的原始 Bot API。

消息、帖子的内容支持 Markdown 格式（可交互式消息除外）。

## 示例

包含收、发消息示例，用法详见 `samples/README.md`。
