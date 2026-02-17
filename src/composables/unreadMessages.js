// src/composables/unreadMessages.js
import { ref, computed } from 'vue'

// Глобальное состояние (один инстанс на приложение)
const _unreadCount = ref(0)

export const useUnreadMessages = () => {
  const unreadCount = computed(() => Number(_unreadCount.value || 0))

  const setUnreadCount = (n) => {
    const v = Number(n || 0)
    _unreadCount.value = Number.isFinite(v) ? Math.max(0, v) : 0
  }

  const incUnread = (by = 1) => {
    const v = Number(by || 1)
    if (!Number.isFinite(v)) return
    _unreadCount.value = Math.max(0, Number(_unreadCount.value || 0) + v)
  }

  const decUnread = (by = 1) => {
    const v = Number(by || 1)
    if (!Number.isFinite(v)) return
    _unreadCount.value = Math.max(0, Number(_unreadCount.value || 0) - v)
  }

  return {
    unreadCount,
    setUnreadCount,
    incUnread,
    decUnread
  }
}
