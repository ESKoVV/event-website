<template>
  <div class="page">
    <div class="container">
      <div class="head">
        <div class="h-title">Сообщения</div>

        <div class="h-actions">
          <input
            v-model="userQuery"
            class="user-search"
            type="text"
            placeholder="Найти пользователя по username или ФИО"
            @input="onUserQueryInput"
          />
          <button class="btn" @click="reloadAll" :disabled="loading">
            {{ loading ? '...' : 'Обновить' }}
          </button>
        </div>
      </div>

      <div v-if="needAuth" class="state">
        <div class="s-title">Нужно войти</div>
        <div class="s-sub">Открой профиль (👤) и войди через Google/Telegram.</div>
      </div>

      <div v-else class="grid">
        <!-- LEFT: контакты/поиск/друзья -->
        <aside class="left">
          <div class="block">
            <div class="b-title">Заявки в друзья</div>
            <div v-if="incomingRequests.length === 0" class="muted">Нет заявок</div>

            <div v-else class="list">
              <div v-for="r in incomingRequests" :key="r.other.id" class="row">
                <div class="u">
                  <div class="ava">{{ letter(r.other) }}</div>
                  <div class="meta">
                    <div class="name">{{ displayName(r.other) }}</div>
                    <div class="sub">@{{ r.other.username || '—' }}</div>
                  </div>
                </div>
                <button class="btn small" @click="accept(r.other.id)">Принять</button>
              </div>
            </div>
          </div>

          <div class="block">
            <div class="b-title">Друзья</div>
            <div v-if="friends.length === 0" class="muted">Пока нет друзей</div>

            <div v-else class="list">
              <button
                v-for="u in friends"
                :key="u.id"
                class="contact"
                :class="{ active: selectedUserId === u.id }"
                @click="openChat(u.id)"
              >
                <div class="ava">{{ letter(u) }}</div>
                <div class="meta">
                  <div class="name">{{ displayName(u) }}</div>
                  <div class="sub">@{{ u.username || '—' }}</div>
                </div>
              </button>
            </div>
          </div>

          <div class="block">
            <div class="b-title">Поиск</div>
            <div v-if="userQuery.trim() && searchedUsers.length === 0" class="muted">Ничего не найдено</div>

            <div v-if="searchedUsers.length" class="list">
              <div v-for="u in searchedUsers" :key="u.id" class="row">
                <div class="u">
                  <div class="ava">{{ letter(u) }}</div>
                  <div class="meta">
                    <div class="name">{{ displayName(u) }}</div>
                    <div class="sub">@{{ u.username || '—' }}</div>
                  </div>
                </div>

                <div class="actions">
                  <button class="btn small ghost" @click="openChat(u.id)">Написать</button>
                  <button class="btn small" @click="addFriend(u.id)">В друзья</button>
                </div>
              </div>
            </div>
          </div>

          <div class="block">
            <div class="b-title">Последние чаты</div>
            <div v-if="threads.length === 0" class="muted">Нет сообщений</div>

            <button
              v-for="t in threads"
              :key="t.other.id"
              class="contact"
              :class="{ active: selectedUserId === t.other.id }"
              @click="openChat(t.other.id)"
            >
              <div class="ava">{{ letter(t.other) }}</div>
              <div class="meta">
                <div class="name">{{ displayName(t.other) }}</div>
                <div class="sub">
                  <span class="mono">@{{ t.other.username || '—' }}</span>
                  <span class="dot">•</span>
                  <span class="last">{{ (t.lastMessage?.body || '').slice(0, 42) }}</span>
                </div>
              </div>
            </button>
          </div>
        </aside>

        <!-- RIGHT: чат -->
        <main class="right">
          <div v-if="!selectedUser" class="empty">
            Выбери друга/чат слева или найди пользователя.
          </div>

          <div v-else class="chat">
            <div class="chat-head">
              <div class="ch-ava">{{ letter(selectedUser) }}</div>
              <div class="ch-meta">
                <div class="ch-name">{{ displayName(selectedUser) }}</div>
                <div class="ch-sub">@{{ selectedUser.username || '—' }}</div>
              </div>

              <button class="btn small ghost" @click="removeFriend(selectedUser.id)">
                Удалить/Отменить
              </button>
            </div>

            <div class="chat-body" ref="chatBody">
              <div v-for="m in messages" :key="m.id" class="msg" :class="{ mine: m.sender_id === myId }">
                <div class="bubble">{{ m.body }}</div>
                <div class="time">{{ fmt(m.created_at) }}</div>
              </div>
            </div>

            <div class="chat-foot">
              <textarea
                v-model="draft"
                class="input"
                rows="1"
                placeholder="Написать сообщение…"
                @keydown.enter.exact.prevent="send"
              />
              <button class="btn" @click="send" :disabled="sending || !draft.trim()">
                {{ sending ? '...' : 'Отправить' }}
              </button>
            </div>
          </div>
        </main>
      </div>

      <div v-if="error" class="state error">
        <div class="s-title">Ошибка</div>
        <div class="s-sub">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

const debounce = (fn, ms = 250) => {
  let t = null
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export default {
  name: 'MessagesView',
  setup() {
    const {
      getUser,
      getMyPublicUser,
      searchUsers,
      getPublicUserById,
      getFriendships,
      sendFriendRequest,
      acceptFriendRequest,
      removeFriendOrRequest,
      getInboxThreads,
      getConversation,
      sendMessage,
      markConversationRead
    } = useSupabase()

    const loading = ref(false)
    const sending = ref(false)
    const error = ref('')

    const myId = ref('')
    const needAuth = ref(false)

    const userQuery = ref('')
    const searchedUsers = ref([])

    const friendships = ref([])
    const friends = ref([])
    const incomingRequests = ref([])

    const threads = ref([])

    const selectedUserId = ref('')
    const selectedUser = ref(null)

    const messages = ref([])
    const draft = ref('')

    const chatBody = ref(null)

    const displayName = (u) => {
      const fn = String(u?.first_name || '').trim()
      const ln = String(u?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || u?.email || 'Пользователь'
    }

    const letter = (u) => (displayName(u)[0] || 'П').toUpperCase()

    const fmt = (v) => {
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) return ''
      return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    }

    const rebuildFriends = async () => {
      const list = friendships.value || []
      const acceptedOtherIds = []
      const incomingOtherIds = []

      for (const f of list) {
        const isRequesterMe = f.requester_id === myId.value
        const otherId = isRequesterMe ? f.addressee_id : f.requester_id

        if (f.status === 'accepted') acceptedOtherIds.push(otherId)
        if (f.status === 'pending' && !isRequesterMe) incomingOtherIds.push(otherId)
      }

      const loadUsersByIds = async (ids) => {
        const out = []
        for (const id of ids) {
          const { data } = await getPublicUserById(id)
          if (data?.id) out.push(data)
        }
        return out
      }

      friends.value = await loadUsersByIds(acceptedOtherIds)
      const incomingUsers = await loadUsersByIds(incomingOtherIds)
      incomingRequests.value = incomingUsers.map((u) => ({ other: u }))
    }

    const loadThreads = async () => {
      const { data } = await getInboxThreads(250)
      const rows = data || []
      const out = []

      for (const t of rows) {
        const { data: u } = await getPublicUserById(t.otherUserId)
        if (!u?.id) continue
        out.push({ other: u, lastMessage: t.lastMessage })
      }

      threads.value = out
    }

    const openChat = async (otherId) => {
      selectedUserId.value = otherId
      error.value = ''

      const { data: u } = await getPublicUserById(otherId)
      selectedUser.value = u || null

      const { data: conv } = await getConversation(otherId, 200)
      messages.value = conv || []

      await markConversationRead(otherId)

      await nextTick()
      chatBody.value?.scrollTo?.({ top: chatBody.value.scrollHeight, behavior: 'smooth' })
    }

    const send = async () => {
      if (!selectedUserId.value) return
      const text = draft.value.trim()
      if (!text) return

      sending.value = true
      try {
        await sendMessage(selectedUserId.value, text)
        draft.value = ''
        const { data: conv } = await getConversation(selectedUserId.value, 200)
        messages.value = conv || []
        await nextTick()
        chatBody.value?.scrollTo?.({ top: chatBody.value.scrollHeight, behavior: 'smooth' })
        await loadThreads()
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        sending.value = false
      }
    }

    const addFriend = async (otherId) => {
      try {
        await sendFriendRequest(otherId)
        await reloadFriendships()
      } catch (e) {
        error.value = String(e?.message || e)
      }
    }

    const accept = async (otherId) => {
      try {
        await acceptFriendRequest(otherId)
        await reloadFriendships()
      } catch (e) {
        error.value = String(e?.message || e)
      }
    }

    const removeFriend = async (otherId) => {
      try {
        await removeFriendOrRequest(otherId)
        await reloadFriendships()
      } catch (e) {
        error.value = String(e?.message || e)
      }
    }

    const reloadFriendships = async () => {
      const { data } = await getFriendships()
      friendships.value = data || []
      await rebuildFriends()
    }

    const doSearchUsers = async () => {
      const q = userQuery.value.trim()
      if (!q) {
        searchedUsers.value = []
        return
      }
      const { data } = await searchUsers(q, 20)
      // не показываем себя
      searchedUsers.value = (data || []).filter((x) => x.id !== myId.value)
    }

    const onUserQueryInput = debounce(doSearchUsers, 250)

    const reloadAll = async () => {
      loading.value = true
      error.value = ''
      try {
        const { user } = await getUser()
        if (!user?.id) {
          needAuth.value = true
          return
        }

        needAuth.value = false
        myId.value = user.id

        // подстрахуемся: если строки профиля нет — getMyPublicUser может быть null, но у тебя ensurePublicUserRow вызывается в App.vue
        await getMyPublicUser()

        await reloadFriendships()
        await loadThreads()
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(reloadAll)

    return {
      loading,
      error,
      needAuth,
      myId,

      userQuery,
      searchedUsers,
      onUserQueryInput,

      friends,
      incomingRequests,

      threads,

      selectedUserId,
      selectedUser,
      openChat,

      messages,
      draft,
      send,
      sending,

      displayName,
      letter,
      fmt,

      addFriend,
      accept,
      removeFriend,

      reloadAll,
      chatBody
    }
  }
}
</script>

<style scoped>
.page{ padding: 12px 0; }
.container{ max-width: 1200px; margin: 0 auto; padding: 0 12px; }

.head{
  display:flex; align-items:center; justify-content: space-between; gap: 12px;
  margin-bottom: 12px;
}
.h-title{ font-weight: 900; font-size: 18px; }
.h-actions{ display:flex; gap: 10px; align-items:center; flex: 1 1 auto; justify-content:flex-end; }
.user-search{
  width: min(520px, 100%);
  border: 1px solid #efefef;
  border-radius: 14px;
  padding: 10px 12px;
  outline: none;
}

.grid{
  display:grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
}
@media (max-width: 900px){
  .grid{ grid-template-columns: 1fr; }
}

.block{
  background:#fff;
  border:1px solid #efefef;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 12px;
}
.b-title{ font-weight: 900; margin-bottom: 10px; }
.muted{ font-size: 12px; opacity: .7; }

.list{ display:flex; flex-direction: column; gap: 8px; }

.contact{
  display:flex; align-items:center; gap: 10px;
  width:100%;
  border:1px solid #efefef;
  background:#fff;
  border-radius: 14px;
  padding: 10px;
  cursor: pointer;
  text-align:left;
}
.contact.active{
  border-color:#8a75e3;
  box-shadow: 0 8px 20px rgba(138,117,227,.18);
}
.ava{
  width: 38px; height: 38px; border-radius: 999px;
  display:grid; place-items:center;
  background: #f2f2f2;
  font-weight: 900;
}
.meta{ min-width: 0; }
.name{ font-weight: 900; font-size: 13px; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
.sub{ font-size: 12px; opacity: .75; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.dot{ margin: 0 6px; opacity:.5; }
.last{ opacity:.85; }

.row{
  display:flex; align-items:center; justify-content: space-between; gap: 10px;
  border:1px solid #efefef;
  border-radius: 14px;
  padding: 10px;
  background:#fff;
}
.u{ display:flex; align-items:center; gap: 10px; min-width: 0; }
.actions{ display:flex; gap: 8px; flex-wrap: wrap; }

.right{
  background:#fff;
  border:1px solid #efefef;
  border-radius: 16px;
  overflow:hidden;
  min-height: 520px;
}
.empty{ padding: 16px; font-weight: 900; opacity: .7; }

.chat{ display:flex; flex-direction: column; height: 100%; min-height: 520px; }
.chat-head{
  display:flex; align-items:center; gap: 10px;
  padding: 12px;
  border-bottom: 1px solid #f2f2f2;
}
.ch-ava{
  width: 42px; height: 42px; border-radius: 999px;
  display:grid; place-items:center;
  background:#f2f2f2;
  font-weight: 900;
}
.ch-meta{ min-width: 0; }
.ch-name{ font-weight: 900; }
.ch-sub{ font-size: 12px; opacity: .75; }

.chat-body{
  padding: 12px;
  overflow:auto;
  display:flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  background: #fafafa;
}
.msg{ max-width: 76%; }
.msg.mine{ align-self: flex-end; text-align: right; }
.bubble{
  background:#fff;
  border:1px solid #efefef;
  border-radius: 16px;
  padding: 10px 12px;
  font-weight: 700;
  line-height: 1.25;
  white-space: pre-wrap;
}
.msg.mine .bubble{
  border-color: rgba(138,117,227,.35);
}
.time{ font-size: 11px; opacity: .6; margin-top: 4px; }

.chat-foot{
  padding: 12px;
  border-top: 1px solid #f2f2f2;
  display:flex;
  gap: 10px;
  align-items:flex-end;
}
.input{
  flex: 1 1 auto;
  border: 1px solid #efefef;
  border-radius: 14px;
  padding: 10px 12px;
  outline:none;
  resize:none;
}

.btn{
  border:none;
  background:#8a75e3;
  color:#fff;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
}
.btn.small{ padding: 8px 10px; border-radius: 12px; font-size: 12px; }
.btn.ghost{
  background:#fafafa;
  color:#14181b;
  border:1px solid #efefef;
}

.state{
  margin-top: 12px;
  padding: 14px;
  border: 1px solid #efefef;
  border-radius: 16px;
  background:#fff;
}
.state.error{ border-color: rgba(217,83,79,.35); }
.s-title{ font-weight: 900; margin-bottom: 6px; }
.s-sub{ opacity: .8; font-weight: 700; }
</style>
