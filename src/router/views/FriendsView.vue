<template>
  <div class="page">
    <div class="container">
      <div class="head">
        <div class="h-title">Друзья</div>

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
        <!-- LEFT: заявки + друзья -->
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

                <div class="actions">
                  <button class="btn small" @click="accept(r.other.id)">Принять</button>
                  <button class="btn small ghost" @click="removeFriendOrReq(r.other.id)">Отклонить</button>
                </div>
              </div>
            </div>
          </div>

          <div class="block">
            <div class="b-title">Друзья</div>
            <div v-if="friends.length === 0" class="muted">Пока нет друзей</div>

            <div v-else class="list">
              <div v-for="u in friends" :key="u.id" class="row">
                <div class="u">
                  <div class="ava">{{ letter(u) }}</div>
                  <div class="meta">
                    <div class="name">{{ displayName(u) }}</div>
                    <div class="sub">@{{ u.username || '—' }}</div>
                  </div>
                </div>

                <div class="actions">
                  <button class="btn small ghost" @click="goChat(u.id)">Написать</button>

                  <button class="btn small" type="button" @click.stop="toggleMenu(u.id)" aria-label="Меню">⋯</button>

                  <div v-if="openMenuId === u.id" class="menu" @click.stop>
                    <button class="menu-item" type="button" @click="openFriendsOf(u.id)">Посмотреть друзей</button>

                    <button
                      class="menu-item danger"
                      type="button"
                      @click="openDeleteModal(u.id)"
                    >
                      Удалить из друзей
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- RIGHT: поиск -->
        <main class="right">

          <div v-if="viewingFriendsOfId" class="block">
            <div class="b-title" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <span>Друзья пользователя</span>
              <button class="btn small ghost" type="button" @click="closeFriendsOf">Закрыть</button>
            </div>

            <div v-if="friendsOfLoading" class="muted">Загрузка…</div>
            <div v-else-if="friendsOfList.length === 0" class="muted">У пользователя пока нет друзей</div>

            <div v-else class="list">
              <div v-for="fu in friendsOfList" :key="fu.id" class="row">
                <div class="u">
                  <div class="ava">{{ letter(fu) }}</div>
                  <div class="meta">
                    <div class="name">{{ displayName(fu) }}</div>
                    <div class="sub">@{{ fu.username || '—' }}</div>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn small ghost" @click="goChat(fu.id)">Написать</button>
                </div>
              </div>
            </div>
          </div>
          <div class="block">
            <div class="b-title">Поиск пользователей</div>

            <div v-if="!userQuery.trim()" class="muted">
              Введи username (без @) или ФИО, чтобы найти пользователя.
            </div>

            <div v-else-if="searchedUsers.length === 0" class="muted">Ничего не найдено</div>

            <div v-else class="list">
              <div v-for="u in searchedUsers" :key="u.id" class="row">
                <div class="u">
                  <div class="ava">{{ letter(u) }}</div>
                  <div class="meta">
                    <div class="name">{{ displayName(u) }}</div>
                    <div class="sub">@{{ u.username || '—' }}</div>
                  </div>
                </div>

                <div class="actions">
                  <button class="btn small ghost" @click="goChat(u.id)">Написать</button>

                  <button
                    v-if="relationOf(u.id) === 'friend'"
                    class="btn small"
                    @click="openDeleteModal(u.id)"
                  >
                    Удалить
                  </button>

                  <button
                    v-else-if="relationOf(u.id) === 'incoming'"
                    class="btn small"
                    @click="accept(u.id)"
                  >
                    Принять
                  </button>

                  <button
                    v-else-if="relationOf(u.id) === 'outgoing'"
                    class="btn small ghost"
                    @click="removeFriendOrReq(u.id)"
                  >
                    Отменить
                  </button>

                  <button v-else class="btn small" @click="addFriend(u.id)">
                    В друзья
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="error" class="state error">
            <div class="s-title">Ошибка</div>
            <div class="s-sub">{{ error }}</div>
          </div>
        </main>
      </div>
    </div>

    <teleport to="body">
      <div v-if="confirmDeleteId" class="modal-root" @keydown.esc="closeDeleteModal" tabindex="-1">
        <div class="modal-overlay" @click="closeDeleteModal"></div>

        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Подтверждение удаления">
          <div class="modal-title">Удалить из друзей?</div>
          <div class="modal-text">Вы действительно хотите удалить пользователя из друзей?</div>
          <div class="modal-actions">
            <button class="btn small ghost" type="button" @click="closeDeleteModal">Отмена</button>
            <button class="btn small" type="button" @click="doDelete(confirmDeleteId)">Удалить</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabase, supabase } from '@/composables/useSupabase'

const debounce = (fn, ms = 250) => {
  let t = null
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export default {
  name: 'FriendsView',
  setup() {
    const router = useRouter()

    const {
      getUser,
      getMyPublicUser,
      searchUsers,
      getPublicUserById,
      getFriendships,
      sendFriendRequest,
      acceptFriendRequest,
      removeFriendOrRequest
    } = useSupabase()

    const loading = ref(false)
    const error = ref('')
    const needAuth = ref(false)
    const myId = ref('')

    const userQuery = ref('')
    const searchedUsers = ref([])

    const friendships = ref([])

    const friends = ref([])
    const incomingRequests = ref([])

    // UI menu (⋯) + confirm delete
    const openMenuId = ref('')
    const confirmDeleteId = ref('')

    // "друзья пользователя"
    const viewingFriendsOfId = ref('')
    const friendsOfLoading = ref(false)
    const friendsOfList = ref([])

    // быстрый индекс отношений по userId
    // friend | incoming | outgoing | none
    const relationIndex = ref(new Map())

    let cleanupDocClick = null

    const displayName = (u) => {
      const fn = String(u?.first_name || '').trim()
      const ln = String(u?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || u?.email || 'Пользователь'
    }

    const letter = (u) => (displayName(u)[0] || 'П').toUpperCase()

    const rebuildFromFriendships = async () => {
      const list = friendships.value || []

      const acceptedOtherIds = []
      const incomingOtherIds = []

      const idx = new Map()

      for (const f of list) {
        const isRequesterMe = f.requester_id === myId.value
        const otherId = isRequesterMe ? f.addressee_id : f.requester_id

        if (f.status === 'accepted') {
          idx.set(otherId, 'friend')
          acceptedOtherIds.push(otherId)
        }

        if (f.status === 'pending') {
          if (isRequesterMe) idx.set(otherId, 'outgoing')
          else {
            idx.set(otherId, 'incoming')
            incomingOtherIds.push(otherId)
          }
        }
      }

      relationIndex.value = idx

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

    const relationOf = (userId) => relationIndex.value.get(userId) || 'none'

    const reloadFriendships = async () => {
      const { data } = await getFriendships()
      friendships.value = data || []
      await rebuildFromFriendships()
    }

    const doSearchUsers = async () => {
      const q = userQuery.value.trim()
      if (!q) {
        searchedUsers.value = []
        return
      }
      const { data } = await searchUsers(q, 30)
      // не показываем себя
      searchedUsers.value = (data || []).filter((x) => x.id !== myId.value)
    }
    const onUserQueryInput = debounce(doSearchUsers, 250)

    const addFriend = async (otherId) => {
      error.value = ''
      try {
        await sendFriendRequest(otherId)
        await reloadFriendships()
        await doSearchUsers()
      } catch (e) {
        error.value = String(e?.message || e)
      }
    }

    const accept = async (otherId) => {
      error.value = ''
      try {
        await acceptFriendRequest(otherId)
        await reloadFriendships()
        await doSearchUsers()
      } catch (e) {
        error.value = String(e?.message || e)
      }
    }

    const removeFriendOrReq = async (otherId) => {
      error.value = ''
      try {
        await removeFriendOrRequest(otherId)
        await reloadFriendships()
        await doSearchUsers()
      } catch (e) {
        error.value = String(e?.message || e)
      }
    }


    const toggleMenu = (uid) => {
      openMenuId.value = openMenuId.value === String(uid || '') ? '' : String(uid || '')
    }

    const closeMenus = () => {
      openMenuId.value = ''
    }

    const closeDeleteModal = () => {
      confirmDeleteId.value = ''
    }

    const openDeleteModal = (uid) => {
      confirmDeleteId.value = String(uid || '')
      openMenuId.value = ''
    }

    const doDelete = async (uid) => {
      try {
        closeMenus()
        await removeFriendOrReq(uid)
        closeDeleteModal()
      } catch {
        // ignore
      }
    }

    const closeFriendsOf = () => {
      viewingFriendsOfId.value = ''
      friendsOfList.value = []
    }

    const openFriendsOf = async (otherId) => {
      closeMenus()
      viewingFriendsOfId.value = String(otherId || '')
      friendsOfList.value = []
      if (!otherId) return

      friendsOfLoading.value = true
      try {
        const { data, error: e1 } = await supabase
          .from('friendships')
          .select('*')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${otherId},addressee_id.eq.${otherId}`)
          .order('created_at', { ascending: false })
        if (e1) throw e1

        const rows = data || []
        const ids = new Set()
        for (const f of rows) {
          const oid = f.requester_id === otherId ? f.addressee_id : f.requester_id
          if (oid) ids.add(oid)
        }

        const out = []
        for (const id of ids) {
          const { data: u } = await getPublicUserById(id)
          if (u?.id) out.push(u)
        }
        friendsOfList.value = out
      } catch {
        friendsOfList.value = []
      } finally {
        friendsOfLoading.value = false
      }
    }

    const goChat = (otherId) => {
      // открываем MessagesView и просим открыть чат сразу
      // MessagesView читает query.with
      router.push({ path: '/messages', query: { with: otherId } })
    }

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

        // чтобы профиль точно был
        await getMyPublicUser()

        await reloadFriendships()
        await doSearchUsers()
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(reloadAll)

    

    onBeforeUnmount(() => {
      try {
        if (cleanupDocClick) cleanupDocClick()
      } catch {}
    })

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

      openMenuId,
      confirmDeleteId,
      toggleMenu,
      openDeleteModal,
      closeDeleteModal,
      openFriendsOf,
      closeFriendsOf,
      viewingFriendsOfId,
      friendsOfLoading,
      friendsOfList,
      doDelete,

      displayName,
      letter,

      relationOf,

      addFriend,
      accept,
      removeFriendOrReq,
      goChat,

      reloadAll
    }
  }
}
</script>

<style scoped>
.page { padding: 12px 0; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 12px; }

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
  grid-template-columns: 420px 1fr;
  gap: 12px;
}
@media (max-width: 980px){
  .grid{ grid-template-columns: 1fr; }
}

.left, .right{ min-width: 0; }

.block{
  background:#fff;
  border:1px solid #efefef;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 12px;
}
.b-title{ font-weight: 900; margin-bottom: 10px; }
.muted{ font-size: 12px; opacity: .7; font-weight: 700; }

.list{ display:flex; flex-direction: column; gap: 8px; }

.row{
  display:flex; align-items:center; justify-content: space-between; gap: 10px;
  border:1px solid #efefef;
  border-radius: 14px;
  padding: 10px;
  background:#fff;
}
.u{ display:flex; align-items:center; gap: 10px; min-width: 0; }
.ava{
  width: 38px; height: 38px; border-radius: 999px;
  display:grid; place-items:center;
  background: #f2f2f2;
  font-weight: 900;
  flex: 0 0 auto;
}
.meta{ min-width: 0; }
.name{ font-weight: 900; font-size: 13px; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
.sub{ font-size: 12px; opacity: .75; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
.actions{ display:flex; gap: 8px; flex-wrap: wrap; justify-content:flex-end; }

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


/* меню троеточия */
.row{ position: relative; }
.menu{
  position: absolute;
  margin-top: 6px;
  right: 10px;
  top: 100%;
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 14px;
  padding: 8px;
  display: grid;
  gap: 6px;
  z-index: 30;
  box-shadow: 0 12px 30px rgba(20,24,27,.10);
}
.menu-item{
  width: 100%;
  text-align: left;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 12px;
  padding: 10px 10px;
  font-weight: 900;
  cursor: pointer;
}
.menu-item:hover{ background:#fafafa; }
.menu-item.danger{ border-color: rgba(217,83,79,.28); color: #d9534f; }

.modal-root{ position: fixed; inset: 0; z-index: 70; }
.modal-overlay{ position: absolute; inset: 0; background: rgba(20,24,27,.45); }
.modal-card{
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 24px));
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 18px 40px rgba(20,24,27,.20);
}
.modal-title{ font-weight: 900; font-size: 16px; margin-bottom: 6px; }
.modal-text{ opacity: .8; font-weight: 700; }
.modal-actions{ margin-top: 14px; display:flex; justify-content:flex-end; gap: 8px; }
</style>
