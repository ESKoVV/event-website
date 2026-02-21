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
                  {{ threadPreview(t.lastMessage?.body || '') }}
                </div>
                <div v-if="t.unreadCount > 0" class="thread-pill" aria-label="Непрочитанные">
                  {{ t.unreadCount > 99 ? '99+' : t.unreadCount }}
                </div>
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
              <div class="chat-peer-sub">
                {{ peer?.sub || '' }}
                <span v-if="peerTyping" class="typing-pill" aria-label="Печатает">печатает…</span>
              </div>
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
                  <div class="msg-actions">
                    <button class="msg-action" type="button" @click="setReply(m)" aria-label="Ответить">↩︎</button>
                  </div>

                  <!-- reply preview inside message -->
                  <div v-if="parseBody(m.body).reply" class="msg-reply">
                    <div class="msg-reply-top">
                      Ответ на <span class="msg-reply-who">{{ parseBody(m.body).reply.who }}</span>
                    </div>
                    <div class="msg-reply-text">{{ parseBody(m.body).reply.text }}</div>
                  </div>

                  <div class="msg-text">{{ parseBody(m.body).text }}</div>

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
          <!-- reply-to bar -->
          <div v-if="replyTo" class="reply-bar">
            <div class="reply-bar-left">
              <div class="reply-bar-title">Ответ на {{ replyTo.who }}</div>
              <div class="reply-bar-snippet">{{ replyTo.text }}</div>
            </div>
            <button class="reply-bar-close" type="button" @click="clearReply" aria-label="Отменить ответ">✕</button>
          </div>

          <div class="chat-input-row">
            <input
              v-model="draft"
              class="chat-input"
              type="text"
              placeholder="Напиши сообщение…"
              @input="onDraftInput"
              @blur="stopTyping"
              @keydown.enter.prevent="send"
              :disabled="sending"
            />
            <button class="chat-send" type="button" @click="send" :disabled="sending || !draft.trim()">Отправить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase, supabase } from '../../composables/useSupabase.js'
import { useUnreadMessages } from '../../composables/unreadMessages.js'

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

/**
 * Reply-мета хранится внутри body:
 * __REPLY__{"id":"...","who":"...","text":"..."}__REPLY__<текст>
 */
const REPLY_PREFIX = '__REPLY__'
const REPLY_SUFFIX = '__REPLY__'

const safeJsonParse = (s) => {
  try { return JSON.parse(s) } catch { return null }
}

const buildBodyWithReply = ({ replyTo, text }) => {
  const pure = String(text || '')
  if (!replyTo) return pure
  const meta = {
    id: String(replyTo.id || ''),
    who: String(replyTo.who || 'сообщение'),
    text: String(replyTo.text || '').slice(0, 180)
  }
  return `${REPLY_PREFIX}${JSON.stringify(meta)}${REPLY_SUFFIX}${pure}`
}

const parseBody = (body) => {
  const raw = String(body || '')
  if (!raw.startsWith(REPLY_PREFIX)) {
    return { reply: null, text: raw }
  }
  const end = raw.indexOf(REPLY_SUFFIX, REPLY_PREFIX.length)
  if (end === -1) return { reply: null, text: raw }

  const jsonPart = raw.slice(REPLY_PREFIX.length, end)
  const meta = safeJsonParse(jsonPart)
  const text = raw.slice(end + REPLY_SUFFIX.length)

  if (!meta || typeof meta !== 'object') return { reply: null, text: raw }

  const reply = {
    id: String(meta.id || ''),
    who: String(meta.who || 'сообщение'),
    text: String(meta.text || '').trim()
  }
  return { reply, text }
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

    const replyTo = ref(null) // { id, who, text }
    const chatBodyRef = ref(null)

    // ✅ typing
    const peerTyping = ref(false)
    let typingSelfTimer = null
    let typingPeerTimer = null
    let typingChannel = null

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

    const threadPreview = (body) => {
      const p = parseBody(body)
      const t = String(p.text || '').trim()
      return t || (p.reply ? 'Ответ' : '')
    }

    const appendMessageUnique = (m) => {
      if (!m?.id) return false
      if (messages.value.some((x) => x?.id === m.id)) return false
      messages.value = [...messages.value, m]
      return true
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

      replyTo.value = null
      peerTyping.value = false

      // я перестаю "печатать" в прошлом чате
      await stopTyping()

      await loadPeer(otherId)
      await reloadConversation()
      await markThreadAsRead(otherId)
    }

    const setReply = (m) => {
      if (!m) return
      const isMine = m.sender_id === myId.value
      const who = isMine ? 'тебя' : (peer.value?.title || 'пользователя')
      const p = parseBody(m.body)
      const clean = String(p.text || '').trim()
      replyTo.value = {
        id: String(m.id || ''),
        who,
        text: clean.slice(0, 120)
      }
      nextTick(() => {})
    }

    const clearReply = () => {
      replyTo.value = null
    }

    // ==========================
    // ✅ Typing (send)
    // ==========================
    const setTyping = async (isTyping) => {
      const uid = myId.value
      const otherId = selectedOtherId.value
      if (!uid || !otherId) return

      try {
        await supabase.from('typing').upsert(
          [
            {
              user_id: uid,
              other_id: otherId,
              is_typing: !!isTyping,
              updated_at: new Date().toISOString()
            }
          ],
          { onConflict: 'user_id,other_id' }
        )
      } catch {
        // ignore
      }
    }

    const onDraftInput = async () => {
      // отправляем "печатает" сразу и сбрасываем через таймер
      if (!selectedOtherId.value) return

      if (typingSelfTimer) clearTimeout(typingSelfTimer)
      await setTyping(true)
      typingSelfTimer = setTimeout(async () => {
        await setTyping(false)
      }, 1200)
    }

    const stopTyping = async () => {
      try {
        if (typingSelfTimer) clearTimeout(typingSelfTimer)
        typingSelfTimer = null
        await setTyping(false)
      } catch {
        // ignore
      }
    }

    // ==========================
    // Send message
    // ==========================
    const send = async () => {
      const otherId = selectedOtherId.value
      const text = String(draft.value || '').trim()
      if (!otherId || !text) return

      sending.value = true
      try {
        await stopTyping()

        const finalBody = buildBodyWithReply({ replyTo: replyTo.value, text })
        const { data, error } = await sendMessage(otherId, finalBody)
        if (error) throw error

        draft.value = ''
        replyTo.value = null

        if (data) {
          const appended = appendMessageUnique(data)
          if (appended) await scrollBottom()

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

      const idx = threads.value.findIndex((t) => t.otherUserId === otherId)
      let t = idx !== -1 ? threads.value[idx] : null

      if (!t) {
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

      if (isOpenNow) {
        const appended = appendMessageUnique(m)
        if (appended) await scrollBottom()
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
          onUpdate: () => {}
        })
        if (error) return
        rtChannel = channel
      } catch {
        // игнор
      }
    }

    // ==========================
    // ✅ Typing (realtime subscribe)
    // ==========================
    const setupTypingRealtime = async () => {
      try {
        const uid = myId.value
        if (!uid) return

        // слушаем только строки, где other_id = мой id (то есть "мне печатают")
        typingChannel = supabase
          .channel(`typing-${uid}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'typing',
              filter: `other_id=eq.${uid}`
            },
            (payload) => {
              const row = payload?.new || payload?.old
              if (!row) return

              // печатает ли текущий собеседник
              if (String(row.user_id) !== String(selectedOtherId.value)) return

              const isOn = row.is_typing === true
              peerTyping.value = isOn

              // авто-сброс, если кто-то "завис" в typing=true
              if (typingPeerTimer) clearTimeout(typingPeerTimer)
              if (isOn) {
                typingPeerTimer = setTimeout(() => {
                  peerTyping.value = false
                }, 2000)
              }
            }
          )
          .subscribe()
      } catch {
        // ignore
      }
    }

    const teardownTypingRealtime = () => {
      try {
        if (typingChannel) supabase.removeChannel(typingChannel)
      } catch {
        // ignore
      }
      typingChannel = null
      if (typingPeerTimer) clearTimeout(typingPeerTimer)
      typingPeerTimer = null
      peerTyping.value = false
    }

    onMounted(async () => {
      const qWith = String(route.query.with || '').trim()
      if (qWith) selectedOtherId.value = qWith

      await reload()
      await setupRealtime()
      await setupTypingRealtime()

      if (selectedOtherId.value) {
        await loadPeer(selectedOtherId.value)
        await reloadConversation()
        await markThreadAsRead(selectedOtherId.value)
      }
    })

    onBeforeUnmount(async () => {
      try {
        await stopTyping()
      } catch {}

      try {
        if (rtChannel && typeof rtChannel.unsubscribe === 'function') rtChannel.unsubscribe()
      } catch {
        // ignore
      }
      rtChannel = null

      teardownTypingRealtime()

      if (typingSelfTimer) clearTimeout(typingSelfTimer)
      typingSelfTimer = null
    })

    watch(
      () => route.query.with,
      async (val) => {
        const nextId = String(val || '').trim()
        if (!nextId) {
          await stopTyping()
          selectedOtherId.value = ''
          peer.value = null
          messages.value = []
          replyTo.value = null
          peerTyping.value = false
          return
        }
        if (nextId === selectedOtherId.value) return
        await stopTyping()
        selectedOtherId.value = nextId
        replyTo.value = null
        peerTyping.value = false
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

      replyTo,

      chatBodyRef,

      reload,
      openThread,
      send,
      reloadConversation,

      setReply,
      clearReply,

      parseBody,
      threadPreview,

      formatTime,
      openProfileLogin,

      onAvaErr,
      onPeerAvaErr,

      // typing
      peerTyping,
      onDraftInput,
      stopTyping
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

/* На компьютерной версии убираем кнопки-иконки (как просили). На мобильной оставляем. */
@media (min-width: 981px) {
  .mv-refresh,
  .chat-head-btn {
    display: none !important;
  }
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
  overflow: hidden;
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
  flex: 0 0 auto;
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
  min-height: 0;
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
  display: flex;
  align-items: center;
  gap: 8px;
}
.typing-pill{
  opacity: 1;
  font-weight: 900;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(42,91,255,.10);
  border: 1px solid rgba(42,91,255,.18);
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
  min-height: 0;
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
  overflow: hidden;
  border-radius: 18px;
  padding: 10px 12px;
  border: 1px solid #efefef;
  background: #fff;
  position: relative;
}

.msg.mine .msg-bubble {
  background: #111;
  color: #fff;
  border-color: #111;
}

/* reply button */
.msg-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.msg-bubble:hover .msg-actions {
  opacity: 1;
}
.msg-action {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.9);
  cursor: pointer;
  font-weight: 900;
}
.msg.mine .msg-action {
  border-color: rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.12);
  color: #fff;
}

/* reply preview inside message */
.msg-reply {
  border-left: 3px solid #2a5bff;
  padding-left: 10px;
  margin-bottom: 8px;
  opacity: 0.95;
}
.msg.mine .msg-reply {
  border-left-color: rgba(255,255,255,0.55);
}
.msg-reply-top {
  font-size: 12px;
  font-weight: 900;
  opacity: 0.85;
}
.msg-reply-who {
  font-weight: 950;
}
.msg-reply-text {
  font-size: 12px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.msg-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 14px;
  padding-right: 34px; /* место под кнопку reply */
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
  background: #fff;
  display: grid;
  gap: 10px;
}

/* reply bar above input */
.reply-bar {
  border: 1px solid #efefef;
  border-radius: 16px;
  padding: 10px 10px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  background: #fafafa;
}
.reply-bar-title {
  font-weight: 950;
  font-size: 12px;
}
.reply-bar-snippet {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reply-bar-close {
  width: 34px;
  height: 34px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  font-weight: 900;
}

.chat-input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
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
  /* reply кнопка всегда видна на мобилке */
  .msg-actions {
    opacity: 1;
  }
}
</style>
