<template>
  <div class="mv">
    <div class="mv-left">
      <div class="mv-head">
        <div class="mv-title">Сообщения</div>
        <button class="mv-refresh" type="button" @click="reload" :disabled="loading">⟳</button>
      </div>

      <div v-if="authRequired" class="mv-empty">
        <div class="mv-empty-title">Нужен вход</div>
        <div class="mv-empty-text">Авторизуйся, чтобы видеть чаты.</div>
        <button class="mv-empty-btn" type="button" @click="openProfileLogin">Открыть вход</button>
      </div>

      <div v-else>
        <div v-if="loading" class="mv-skel">
          <div class="skel-row" v-for="i in 6" :key="i"></div>
        </div>

        <div v-else-if="threads.length === 0" class="mv-empty">
          <div class="mv-empty-title">Пока пусто</div>
          <div class="mv-empty-text">Начни переписку — и здесь появятся чаты.</div>
        </div>

        <div v-else class="mv-list">
          <button
            v-for="t in threads"
            :key="t.otherUserId"
            type="button"
            class="thread"
            :class="{ active: t.otherUserId === selectedOtherId, unread: t.unread }"
            @click="openThread(t.otherUserId)"
          >
            <div class="thread-ava">
              <img v-if="t.avatar" :src="t.avatar" class="thread-ava-img" alt="avatar" @error="onAvaErr(t)" />
              <div v-else class="thread-ava-ph">👤</div>
              <div v-if="t.unread" class="thread-dot" aria-label="Непрочитано"></div>
            </div>

            <div class="thread-mid">
              <div class="thread-top">
                <div class="thread-name">
                  {{ t.title }}
                </div>
                <div class="thread-time">{{ formatTime(t.lastMessage?.created_at) }}</div>
              </div>

              <div class="thread-sub">
                <div class="thread-preview">
                  {{ t.lastMessage?.body || '' }}
                </div>
                <div v-if="t.unreadCount > 0" class="thread-pill" aria-label="Непрочитанные">{{ t.unreadCount > 99 ? '99+' : t.unreadCount }}</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <div class="mv-right">
      <div v-if="authRequired" class="chat-empty">
        <div class="chat-empty-title">Сообщения</div>
        <div class="chat-empty-text">Войди, чтобы открыть чат.</div>
      </div>

      <div v-else-if="!selectedOtherId" class="chat-empty">
        <div class="chat-empty-title">Выбери чат</div>
        <div class="chat-empty-text">Слева список диалогов.</div>
      </div>

      <div v-else class="chat">
        <div class="chat-head">
          <div class="chat-peer">
            <div class="chat-peer-ava">
              <img
                v-if="peer?.avatar"
                :src="peer.avatar"
                class="chat-peer-ava-img"
                alt="avatar"
                @error="onPeerAvaErr"
              />
              <div v-else class="chat-peer-ava-ph">👤</div>
            </div>
            <div class="chat-peer-info">
              <div class="chat-peer-name">{{ peer?.title || 'Пользователь' }}</div>
              <div class="chat-peer-sub">{{ peer?.sub || '' }}</div>
            </div>
          </div>

          <button class="chat-head-btn" type="button" @click="reloadConversation" :disabled="convLoading">⟳</button>
        </div>

        <div ref="chatBodyRef" class="chat-body">
          <div v-if="convLoading" class="chat-skel">
            <div class="chat-skel-bubble" v-for="i in 8" :key="i"></div>
          </div>

          <template v-else>
            <div v-if="messages.length === 0" class="chat-empty-inner">
              Пока нет сообщений
            </div>

            <div v-else class="chat-msgs">
              <div
                v-for="m in messages"
                :key="m.id"
                class="msg"
                :class="{ mine: m.sender_id === myId, their: m.sender_id !== myId }"
              >
                <div class="msg-bubble">
                  <div class="msg-text">{{ m.body }}</div>
                  <div class="msg-meta">
                    <span class="msg-time">{{ formatTime(m.created_at) }}</span>
                    <span v-if="m.sender_id === myId" class="msg-check">✓</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="chat-foot">
          <input
            v-model="draft"
            class="chat-input"
            type="text"
            placeholder="Напиши сообщение…"
            @keydown.enter.prevent="send"
            :disabled="sending"
          />
          <button class="chat-send" type="button" @click="send" :disabled="sending || !draft.trim()">Отправить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '../composables/useSupabase.js'
import { useUnreadMessages } from '../composables/unreadMessages.js'

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

export default {
  name: 'MessagesView',
  setup() {
    const router = useRouter()
    const route = useRoute()

    const {
      getUser,
      getPublicUserById,
      getInboxThreads,
      getConversation,
      sendMessage,
      markConversationRead,
      subscribeToMyMessages
    } = useSupabase()

    const { setUnreadCount } = useUnreadMessages()

    const myId = ref('')
    const authRequired = ref(false)

    const loading = ref(false)
    const convLoading = ref(false)
    const sending = ref(false)

    const threads = ref([]) // [{ otherUserId, lastMessage, unread, unreadCount, title, avatar }]
    const selectedOtherId = ref('')

    const peer = ref(null)
    const messages = ref([])
    const draft = ref('')

    const chatBodyRef = ref(null)

    let rtChannel = null

    const calcUnreadTotal = () => {
      let total = 0
      for (const t of threads.value) total += Number(t.unreadCount || 0)
      setUnreadCount(total)
    }

    const formatTime = (iso) => {
      if (!iso) return ''
      try {
        const d = new Date(iso)
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        return `${hh}:${mm}`
      } catch {
        return ''
      }
    }

    const openProfileLogin = () => {
      window.dispatchEvent(new Event('open-profile'))
    }

    const safeTitleFromUser = (u) => {
      if (!u) return 'Пользователь'
      const fn = String(u.first_name || '').trim()
      const ln = String(u.last_name || '').trim()
      const uname = String(u.username || '').trim()
      const email = String(u.email || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || uname || email || 'Пользователь'
    }

    const ensureThreadsUsers = async (rows) => {
      const ids = [...new Set((rows || []).map((x) => x.otherUserId).filter(Boolean))]
      const map = new Map()

      await Promise.all(
        ids.map(async (id) => {
          const { data } = await getPublicUserById(id)
          if (data) map.set(id, data)
        })
      )

      return map
    }

    const reload = async () => {
      loading.value = true
      try {
        const { user } = await getUser()
        if (!user?.id) {
          authRequired.value = true
          myId.value = ''
          threads.value = []
          setUnreadCount(0)
          return
        }
        authRequired.value = false
        myId.value = user.id

        const { data, error } = await getInboxThreads(60)
        if (error) throw error

        const rows = (data || []).map((x) => ({
          otherUserId: x.otherUserId,
          lastMessage: x.lastMessage
        }))

        const usersMap = await ensureThreadsUsers(rows)

        const enriched = rows.map((r) => {
          const m = r.lastMessage || {}
          const unread = m.receiver_id === user.id && !m.read_at
          // В этой модели: unreadCount либо 0/1 по lastMessage.
          // Если хочешь точное число по диалогу — добавим отдельный запрос/агрегацию.
          const unreadCount = unread ? 1 : 0
          const u = usersMap.get(r.otherUserId)

          return {
            otherUserId: r.otherUserId,
            lastMessage: m,
            unread,
            unreadCount,
            title: safeTitleFromUser(u),
            avatar: normalizeStoragePublicUrl(u?.image_path || '')
          }
        })

        threads.value = enriched
        calcUnreadTotal()

        // автоселект из query ?with=
        const qWith = String(route.query.with || '').trim()
        if (qWith && enriched.some((t) => t.otherUserId === qWith)) {
          selectedOtherId.value = qWith
          await loadPeer(qWith)
          await reloadConversation()
          await markThreadAsRead(qWith)
        }
      } finally {
        loading.value = false
      }
    }

    const loadPeer = async (otherId) => {
      if (!otherId) {
        peer.value = null
        return
      }
      const { data } = await getPublicUserById(otherId)
      const title = safeTitleFromUser(data)
      peer.value = {
        id: otherId,
        title,
        sub: data?.username ? `@${data.username}` : '',
        avatar: normalizeStoragePublicUrl(data?.image_path || '')
      }
    }

    const scrollBottom = async () => {
      await nextTick()
      const el = chatBodyRef.value
      if (!el) return
      el.scrollTop = el.scrollHeight
    }

    const reloadConversation = async () => {
      if (!selectedOtherId.value) return
      convLoading.value = true
      try {
        const { user } = await getUser()
        if (!user?.id) return
        myId.value = user.id

        const { data, error } = await getConversation(selectedOtherId.value, 250)
        if (error) throw error

        messages.value = data || []
        await scrollBottom()
      } finally {
        convLoading.value = false
      }
    }

    const markThreadAsRead = async (otherId) => {
      if (!otherId) return
      try {
        // снимаем unread локально сразу (без ожидания)
        const idx = threads.value.findIndex((t) => t.otherUserId === otherId)
        if (idx !== -1) {
          const was = Number(threads.value[idx].unreadCount || 0)
          threads.value[idx] = {
            ...threads.value[idx],
            unread: false,
            unreadCount: 0,
            lastMessage: {
              ...threads.value[idx].lastMessage,
              read_at: threads.value[idx].lastMessage?.read_at || new Date().toISOString()
            }
          }
          if (was > 0) calcUnreadTotal()
        }

        await markConversationRead(otherId)
        calcUnreadTotal()
      } catch {
        // игнор
      }
    }

    const openThread = async (otherId) => {
      selectedOtherId.value = otherId
      router.replace({ name: 'messages', query: { with: otherId } })

      await loadPeer(otherId)
      await reloadConversation()
      await markThreadAsRead(otherId)
    }

    const send = async () => {
      const otherId = selectedOtherId.value
      const text = String(draft.value || '').trim()
      if (!otherId || !text) return

      sending.value = true
      try {
        const { data, error } = await sendMessage(otherId, text)
        if (error) throw error

        draft.value = ''

        // обновим локально список сообщений и треды
        if (data) {
          messages.value = [...messages.value, data]
          await scrollBottom()

          // поднимем тред наверх
          const idx = threads.value.findIndex((t) => t.otherUserId === otherId)
          if (idx !== -1) {
            const t = threads.value[idx]
            const nextT = { ...t, lastMessage: data }
            const copy = [...threads.value]
            copy.splice(idx, 1)
            threads.value = [nextT, ...copy]
          }
        }
      } finally {
        sending.value = false
      }
    }

    const onAvaErr = (t) => {
      const idx = threads.value.findIndex((x) => x.otherUserId === t.otherUserId)
      if (idx !== -1) threads.value[idx] = { ...threads.value[idx], avatar: '' }
    }

    const onPeerAvaErr = () => {
      if (!peer.value) return
      peer.value = { ...peer.value, avatar: '' }
    }

    const handleRealtimeInsert = async (m) => {
      if (!m) return
      const uid = myId.value
      if (!uid) return

      const otherId = m.sender_id === uid ? m.receiver_id : m.sender_id
      if (!otherId) return

      // обновляем/создаём тред
      const idx = threads.value.findIndex((t) => t.otherUserId === otherId)
      let t = idx !== -1 ? threads.value[idx] : null

      if (!t) {
        await loadPeer(otherId) // чтобы быстро подтянуть имя, но peer тут не используем; всё равно подтянем user ниже
        const { data: u } = await getPublicUserById(otherId)
        t = {
          otherUserId: otherId,
          lastMessage: m,
          unread: false,
          unreadCount: 0,
          title: safeTitleFromUser(u),
          avatar: normalizeStoragePublicUrl(u?.image_path || '')
        }
      }

      // если это входящее и мы не в этом диалоге — считаем непрочитанным
      const isIncoming = m.receiver_id === uid
      const isOpenNow = selectedOtherId.value === otherId
      const unread = isIncoming && !m.read_at && !isOpenNow
      const unreadCount = unread ? 1 : 0

      const nextT = {
        ...t,
        lastMessage: m,
        unread,
        unreadCount
      }

      const copy = [...threads.value]
      if (idx !== -1) copy.splice(idx, 1)
      threads.value = [nextT, ...copy]

      calcUnreadTotal()

      // если сообщение пришло в открытый диалог — сразу подгружаем в список и помечаем прочитанным
      if (isOpenNow) {
        messages.value = [...messages.value, m]
        await scrollBottom()
        await markThreadAsRead(otherId)
      }
    }

    const setupRealtime = async () => {
      try {
        const { user } = await getUser()
        if (!user?.id) return
        myId.value = user.id

        const { channel, error } = await subscribeToMyMessages({
          onInsert: (m) => handleRealtimeInsert(m),
          onUpdate: () => {
            // при желании можно реагировать на read_at, пока не нужно
          }
        })
        if (error) return
        rtChannel = channel
      } catch {
        // игнор
      }
    }

    onMounted(async () => {
      // initial select from query
      const qWith = String(route.query.with || '').trim()
      if (qWith) selectedOtherId.value = qWith

      await reload()
      await setupRealtime()

      // если уже выбран — прогружаем
      if (selectedOtherId.value) {
        await loadPeer(selectedOtherId.value)
        await reloadConversation()
        await markThreadAsRead(selectedOtherId.value)
      }
    })

    onBeforeUnmount(() => {
      try {
        if (rtChannel && typeof rtChannel.unsubscribe === 'function') rtChannel.unsubscribe()
      } catch {
        // ignore
      }
      rtChannel = null
    })

    watch(
      () => route.query.with,
      async (val) => {
        const nextId = String(val || '').trim()
        if (!nextId) {
          selectedOtherId.value = ''
          peer.value = null
          messages.value = []
          return
        }
        if (nextId === selectedOtherId.value) return
        selectedOtherId.value = nextId
        await loadPeer(nextId)
        await reloadConversation()
        await markThreadAsRead(nextId)
      }
    )

    return {
      myId,
      authRequired,

      loading,
      convLoading,
      sending,

      threads,
      selectedOtherId,
      peer,
      messages,
      draft,

      chatBodyRef,

      reload,
      openThread,
      send,
      reloadConversation,

      formatTime,
      openProfileLogin,

      onAvaErr,
      onPeerAvaErr
    }
  }
}
</script>

<style scoped>
.mv {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 14px;
  min-height: calc(100vh - 120px);
}

.mv-left,
.mv-right {
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  overflow: hidden;
  min-width: 0;
}

.mv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px;
  border-bottom: 1px solid #efefef;
}
.mv-title {
  font-weight: 900;
  font-size: 16px;
}
.mv-refresh {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  font-weight: 900;
}
.mv-refresh:disabled {
  opacity: 0.5;
  cursor: default;
}

.mv-skel {
  padding: 12px;
  display: grid;
  gap: 10px;
}
.skel-row {
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(90deg, #f3f3f3, #fafafa, #f3f3f3);
  background-size: 200% 100%;
  animation: sk 1.2s infinite linear;
}
@keyframes sk {
  0% { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}

.mv-list {
  padding: 10px;
  display: grid;
  gap: 8px;
}

.thread {
  width: 100%;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 18px;
  padding: 10px;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  transition: transform 0.06s ease, background 0.15s ease, border-color 0.15s ease;
}
.thread:hover {
  background: #fafafa;
  border-color: #e9e9e9;
}
.thread:active {
  transform: scale(0.99);
}
.thread.active {
  border-color: #111;
}
.thread.unread {
  background: #f6f8ff;
  border-color: #dfe6ff;
}

.thread-ava {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  border: 1px solid #efefef;
  overflow: hidden;
  display: grid;
  place-items: center;
  position: relative;
  background: #fff;
}
.thread-ava-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thread-ava-ph {
  font-size: 18px;
}
.thread-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #2a5bff;
  right: 6px;
  top: 6px;
  border: 2px solid #fff;
}

.thread-mid {
  min-width: 0;
  display: grid;
  gap: 6px;
}
.thread-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.thread-name {
  font-weight: 900;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread.unread .thread-name {
  font-weight: 950;
}
.thread-time {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
}

.thread-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.thread-preview {
  font-size: 13px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.thread.unread .thread-preview {
  opacity: 0.95;
  font-weight: 800;
}

.thread-pill {
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #2a5bff;
  color: #fff;
  font-weight: 900;
  font-size: 12px;
  display: grid;
  place-items: center;
}

.mv-empty {
  padding: 18px;
}
.mv-empty-title {
  font-weight: 900;
  font-size: 16px;
  margin-bottom: 6px;
}
.mv-empty-text {
  opacity: 0.8;
  margin-bottom: 12px;
}
.mv-empty-btn {
  height: 42px;
  border-radius: 14px;
  border: none;
  background: #111;
  color: #fff;
  font-weight: 900;
  padding: 0 14px;
  cursor: pointer;
}

/* RIGHT */
.chat {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.chat-head {
  padding: 12px 14px;
  border-bottom: 1px solid #efefef;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.chat-peer {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.chat-peer-ava {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  border: 1px solid #efefef;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #fff;
}
.chat-peer-ava-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.chat-peer-ava-ph {
  font-size: 16px;
}
.chat-peer-info {
  min-width: 0;
}
.chat-peer-name {
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-peer-sub {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-head-btn {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  font-weight: 900;
}
.chat-head-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.chat-body {
  padding: 14px;
  overflow: auto;
  background: #fbfbfb;
}
.chat-skel {
  display: grid;
  gap: 10px;
}
.chat-skel-bubble {
  height: 38px;
  border-radius: 16px;
  background: linear-gradient(90deg, #f0f0f0, #fafafa, #f0f0f0);
  background-size: 200% 100%;
  animation: sk 1.2s infinite linear;
}
.chat-empty-inner {
  opacity: 0.7;
  font-weight: 800;
}

.chat-msgs {
  display: grid;
  gap: 8px;
}
.msg {
  display: flex;
}
.msg.mine {
  justify-content: flex-end;
}
.msg.their {
  justify-content: flex-start;
}
.msg-bubble {
  max-width: min(560px, 84%);
  border-radius: 18px;
  padding: 10px 12px;
  border: 1px solid #efefef;
  background: #fff;
}
.msg.mine .msg-bubble {
  background: #111;
  color: #fff;
  border-color: #111;
}
.msg-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}
.msg-meta {
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.75;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.msg.mine .msg-meta {
  opacity: 0.7;
}
.msg-check {
  font-weight: 900;
}

.chat-foot {
  padding: 12px 14px;
  border-top: 1px solid #efefef;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  background: #fff;
}
.chat-input {
  height: 44px;
  border-radius: 14px;
  border: 1px solid #efefef;
  padding: 0 12px;
  outline: none;
}
.chat-input:focus {
  border-color: #e2e2e2;
}
.chat-send {
  height: 44px;
  border-radius: 14px;
  border: none;
  background: #111;
  color: #fff;
  font-weight: 900;
  padding: 0 14px;
  cursor: pointer;
}
.chat-send:disabled {
  opacity: 0.6;
  cursor: default;
}

.chat-empty {
  padding: 18px;
}
.chat-empty-title {
  font-weight: 900;
  font-size: 16px;
  margin-bottom: 6px;
}
.chat-empty-text {
  opacity: 0.8;
}

@media (max-width: 980px) {
  .mv {
    grid-template-columns: 1fr;
  }
}
</style>
