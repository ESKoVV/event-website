<template>
  <div id="app">
    <header class="header">
      <div class="header-container">
        <div class="header-left">
          <button class="menu-button" aria-label="Меню" @click="openMenu">
            <div class="menu-icon"><span></span><span></span><span></span></div>
          </button>

          <div class="search-container">
            <div class="search-icon">🔍</div>
            <input v-model="searchTerm" type="text" placeholder="Поиск" class="search-input" />
          </div>
        </div>

        <button class="profile-button" @click="openProfileModal" aria-label="Профиль">
          <img
            v-if="showHeaderAvatar"
            class="header-avatar"
            :src="headerAvatarUrl"
            alt="avatar"
            @error="onHeaderImgError"
          />
          <div v-else class="header-placeholder">👤</div>
        </button>
      </div>
    </header>

    <div class="layout">
      <aside class="sidebar" aria-label="Разделы">
        <button class="nav-item" :class="{ active: isActiveRoute('home') }" type="button" @click="go('home')">
          <span class="ni-ico">📰</span>
          <span class="ni-txt">Лента</span>
        </button>

        <button class="nav-item" :class="{ active: isActiveRoute('messages') }" type="button" @click="go('messages')">
          <span class="ni-ico">💬</span>
          <span class="ni-txt">Сообщения</span>
        </button>

        <button class="nav-item" :class="{ active: isActiveRoute('friends') }" type="button" @click="go('friends')">
          <span class="ni-ico">👥</span>
          <span class="ni-txt">Друзья</span>
        </button>

        <div class="nav-sep"></div>

        <button class="nav-item" type="button" @click="openProfileOrAuth">
          <span class="ni-ico">👤</span>
          <span class="ni-txt">Профиль</span>
        </button>
      </aside>

      <main class="content">
        <router-view v-slot="{ Component }">
          <component :is="Component" :global-search-term="searchTerm" />
        </router-view>
      </main>
    </div>

    <!-- MENU DRAWER -->
    <teleport to="body">
      <div v-if="menuOpen" class="menu-root" @keydown.esc="closeMenu" tabindex="-1">
        <div class="overlay" @click="closeMenu"></div>

        <aside class="menu-drawer" role="dialog" aria-modal="true" aria-label="Меню">
          <div class="menu-head">
            <div class="menu-title">Меню</div>
            <button class="close-btn" @click="closeMenu" aria-label="Закрыть">✕</button>
          </div>

          <div class="menu-body">
            <button class="menu-item" @click="openProfileOrAuth">👤 Профиль / Вход</button>
            <button class="menu-item" @click="go('home'); closeMenu()">📰 Лента</button>
            <button class="menu-item" @click="go('messages'); closeMenu()">💬 Сообщения</button>
            <button class="menu-item" @click="go('friends'); closeMenu()">👥 Друзья</button>
          </div>

          <div class="menu-foot">
            <button class="apply-btn" @click="closeMenu">Закрыть</button>
          </div>
        </aside>
      </div>
    </teleport>

    <AuthModal
      v-if="showAuth"
      :telegram-bot-username="telegramBotUsername"
      @close="showAuth = false"
      @google="loginGoogle"
      @telegram="handleTelegramLogin"
    />

    <ProfileModal
      v-if="showProfileEdit"
      :profile="profile"
      :telegram-link="telegramLink"
      :saving="saving"
      :categories="categories"
      @close="showProfileEdit = false"
      @save="saveProfile"
      @pick-avatar="onPickedAvatar"
      @logout="logout"
      @open-create-event="openCreateEvent"
    />

    <CreateEventModal
      v-if="showCreateEvent"
      :open="showCreateEvent"
      :categories="categories"
      :create-business-event="createBusinessEvent"
      @close="showCreateEvent = false"
      @created="onCreatedEvent"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthModal from './components/AuthModal.vue'
import ProfileModal from './components/ProfileModal.vue'
import CreateEventModal from './components/CreateEventModal.vue'
import { useSupabase } from './composables/useSupabase.js'

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

export default {
  name: 'App',
  components: { AuthModal, ProfileModal, CreateEventModal },
  setup() {
    const router = useRouter()
    const route = useRoute()

    const {
      getSession,
      getUser,
      signInWithGoogle,
      signOut,
      ensurePublicUserRow,
      getMyPublicUser,
      updateMyPublicUser,
      uploadAvatar,
      linkTelegramViaEdgeFunction,
      getMyTelegramLink,
      getCategories,
      createBusinessEvent
    } = useSupabase()

    const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || ''

    const searchTerm = ref('')

    const session = ref(null)
    const profile = ref(null)
    const telegramLink = ref(null)

    const categories = ref([])
    const saving = ref(false)

    const showAuth = ref(false)
    const showProfileEdit = ref(false)
    const showCreateEvent = ref(false)

    const menuOpen = ref(false)

    const headerAvatarUrl = computed(() => normalizeStoragePublicUrl(profile.value?.image_path || ''))
    const showHeaderAvatar = ref(false)

    const onHeaderImgError = () => {
      showHeaderAvatar.value = false
    }

    const loadSessionAndProfile = async () => {
      const { session: s } = await getSession()
      session.value = s || null

      const { user } = await getUser()
      if (user) {
        await ensurePublicUserRow(user)
        const { data } = await getMyPublicUser()
        profile.value = data || null

        const { data: tg } = await getMyTelegramLink()
        telegramLink.value = tg || null
      } else {
        profile.value = null
        telegramLink.value = null
      }

      showHeaderAvatar.value = !!(session.value && headerAvatarUrl.value)
    }

    const loadCategories = async () => {
      const { data } = await getCategories()
      categories.value = data || []
    }

    const openMenu = () => {
      menuOpen.value = true
      nextTick(() => {})
    }
    const closeMenu = () => {
      menuOpen.value = false
    }

    const openProfileModal = async () => {
      const { session: s } = await getSession()
      if (!s) {
        showAuth.value = true
        return
      }
      showProfileEdit.value = true
    }

    const openProfileOrAuth = () => {
      if (!session.value) showAuth.value = true
      else showProfileEdit.value = true
      closeMenu()
    }

    const loginGoogle = async () => {
      await signInWithGoogle()
      await loadSessionAndProfile()
      showAuth.value = false
    }

    const handleTelegramLogin = async (payload) => {
      const { session: s } = await getSession()
      if (!s) return
      await linkTelegramViaEdgeFunction(payload)
      await loadSessionAndProfile()
      showAuth.value = false
    }

    const logout = async () => {
      await signOut()
      showProfileEdit.value = false
      showCreateEvent.value = false
      await loadSessionAndProfile()
    }

    const saveProfile = async (form) => {
      saving.value = true
      try {
        const { error } = await updateMyPublicUser(form)
        if (error) throw error
        await loadSessionAndProfile()
        showProfileEdit.value = false
      } finally {
        saving.value = false
      }
    }

    const onPickedAvatar = async (fileOrBlob) => {
      if (!fileOrBlob) return
      saving.value = true
      try {
        const { data, error } = await uploadAvatar(fileOrBlob)
        if (error) throw error
        await updateMyPublicUser({ image_path: data?.publicUrl || data?.url || profile.value?.image_path })
        await loadSessionAndProfile()
      } finally {
        saving.value = false
      }
    }

    const openCreateEvent = () => {
      showCreateEvent.value = true
    }

    const onCreatedEvent = async () => {
      showCreateEvent.value = false
    }

    const go = (name) => router.push({ name })
    const isActiveRoute = (name) => route.name === name

    const onOpenProfileEvent = () => openProfileModal()

    onMounted(async () => {
      window.addEventListener('open-profile', onOpenProfileEvent)
      await loadCategories()
      await loadSessionAndProfile()
    })

    watch(
      () => headerAvatarUrl.value,
      () => {
        showHeaderAvatar.value = !!(session.value && headerAvatarUrl.value)
      }
    )

    return {
      telegramBotUsername,
      searchTerm,

      showAuth,
      showProfileEdit,
      showCreateEvent,

      session,
      profile,
      telegramLink,
      categories,
      saving,

      headerAvatarUrl,
      showHeaderAvatar,
      onHeaderImgError,

      menuOpen,
      openMenu,
      closeMenu,

      openProfileModal,
      openProfileOrAuth,
      loginGoogle,
      handleTelegramLogin,
      logout,
      saveProfile,
      onPickedAvatar,
      openCreateEvent,
      onCreatedEvent,

      go,
      isActiveRoute,
      createBusinessEvent
    }
  }
}
</script>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #fff;
  border-bottom: 1px solid #efefef;
}
.header-container {
  max-width: 1300px;
  margin: 0 auto;
  padding: 12px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.menu-button {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.menu-icon {
  width: 18px;
  height: 14px;
  display: grid;
  gap: 3px;
}
.menu-icon span {
  display: block;
  height: 2px;
  border-radius: 999px;
  background: #111;
  opacity: 0.9;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.55;
  font-size: 14px;
}
.search-input {
  width: 520px;
  max-width: min(520px, 52vw);
  padding: 10px 12px 10px 36px;
  border: 2px solid #efefef;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
}

.profile-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: 0 0 auto;
}
.header-avatar {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}
.header-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fafafa;
  border: 1px solid #efefef;
  display: grid;
  place-items: center;
}

.layout {
  max-width: 1300px;
  margin: 0 auto;
  padding: 0 18px 18px;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 14px;
}
.sidebar {
  position: sticky;
  top: 72px;
  align-self: start;
  height: calc(100vh - 84px);
  border: 1px solid #efefef;
  border-radius: 18px;
  background: #fff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nav-item {
  width: 100%;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 12px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  text-align: left;
}
.nav-item:hover {
  background: #fafafa;
}
.nav-item.active {
  background: rgba(138, 117, 227, 0.1);
  border-color: rgba(138, 117, 227, 0.22);
}
.ni-ico {
  width: 18px;
  display: inline-flex;
  justify-content: center;
}
.ni-txt {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-sep {
  height: 1px;
  background: #f2f2f2;
  margin: 6px 0;
}
.content {
  min-width: 0;
}

.menu-root { position: fixed; inset: 0; z-index: 9999; }
.overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(2px); }
.menu-drawer {
  position: absolute; top: 0; left: 0; height: 100%;
  width: min(420px, 92vw);
  background: #fff; border-right: 1px solid #efefef;
  box-shadow: 10px 0 30px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
  animation: slideInLeft 180ms ease;
}
@keyframes slideInLeft { from { transform: translateX(-18px); opacity: 0.7; } to { transform: translateX(0); opacity: 1; } }
.menu-head { display: flex; align-items: center; gap: 10px; padding: 14px; border-bottom: 1px solid #f2f2f2; }
.menu-title { font-weight: 900; font-size: 16px; }
.close-btn { margin-left: auto; border: 1px solid #efefef; background: #fafafa; border-radius: 12px; padding: 8px 10px; cursor: pointer; }
.menu-body { padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.menu-item { border: 1px solid #efefef; background: #fff; border-radius: 14px; padding: 12px; cursor: pointer; font-weight: 900; text-align: left; }
.menu-foot { padding: 14px; border-top: 1px solid #f2f2f2; display: flex; justify-content: flex-end; }
.apply-btn { border: none; background: #8a75e3; color: #fff; border-radius: 14px; padding: 12px 16px; font-weight: 900; cursor: pointer; }

@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; padding: 0 12px 18px; }
  .sidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap; justify-content: center; top: auto; }
  .nav-item { width: auto; padding: 10px 12px; }
  .ni-txt { display: none; }
  .search-input { max-width: none; width: min(520px, 60vw); }
}
@media (max-width: 520px) {
  .header-container { padding: 12px 12px; }
  .search-input { width: min(520px, 54vw); }
}
</style>
