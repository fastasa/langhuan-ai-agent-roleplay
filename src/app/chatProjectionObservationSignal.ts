import { ref } from 'vue'

// 消息投影观察数据刷新信号：投影写入完成后通知前端重拉，替代“typing 结束单次抢跑刷新”的竞态。
// 写侧唯一出口：src/repositories/chatRepository.ts 的内嵌投影保存与独立投影运行成功后 bump。
// 读侧（联动能力，两端必须同步消费，不得各自再加轮询）：
// 桌面 ChatMessageStream.vue 与移动端 MobileChatThread.vue 监听本信号后重拉投影观察数据。
export const chatProjectionObservationTick = ref(0)

export function bumpChatProjectionObservationTick() {
  chatProjectionObservationTick.value += 1
}
