/**
 * ruoyi-ai SSE 事件 → ruoyi-copilot applyStreamEvent 适配层
 *
 * ruoyi-ai 后端 CodingController 直接吐出与前端卡片协议对齐的事件名
 * （thinking/text/add|edit|delete-start|progress|end/cmd/list-progress/done/error），
 * 事件 payload 为 { filePath, command, content, status }。
 *
 * applyStreamEvent 读取规则（见 App.vue）：
 *   eventType = payload?.event || event.type
 *   data      = payload?.data || payload
 * 所以这里把 ruoyi-ai 的 payload 包一层 { data }，保持与现有 demo/旧后端一致。
 *
 * 这是一个纯函数，独立可测、可替换。换回别的后端只需换这个文件。
 */

export function mapRuoyiEvent(rawEvent) {
  const type = rawEvent?.type
  const payload = rawEvent?.payload

  // 完成信号：streamChat 的 [DONE] 或后端 done 事件都归一为 complete
  if (type === 'complete' || type === 'done') return [{ type: 'complete' }]

  if (!payload) return []

  // 透传 ruoyi-ai 的事件名（已对齐），payload 包一层 data
  return [{ type, payload: { data: payload } }]
}
