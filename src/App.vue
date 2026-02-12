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

    <router-view v-slot="{ Component }">
      <component :is="Component" :global-search-term="searchTerm" />
    </router-view>

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
            <!-- ✅ УБРАН блок Business аккаунт отсюда -->
            <button class="menu-item" @click="openProfileOrAuth">👤 Профиль / Вход</button>
          </div>

          <div class="menu-foot">
            <button class="apply-btn" @click="closeMenu">Закрыть</button>
          </div>
        </aside>
      </div>
    </teleport>

    <!-- AUTH MODAL -->
    <AuthModal
      v-if="showAuth"
      :telegram-bot-username="telegramBotUsername"
      @close="showAuth = false"
      @google="loginGoogle"
      @telegram="handleTelegramLogin"
    />

    <!-- PROFILE MODAL -->
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

    <!-- CREATE EVENT MODAL -->
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

    const showAuth = ref(false)
    const showProfileEdit = ref(false)
    const showCreateEvent = ref(false)

    const profileLoading = ref(false)
    const saving = ref(false)
    const pickedAvatarFile = ref(null)

    const categories = ref([])

    const menuOpen = ref(false)
    const openMenu = () => (menuOpen.value = true)
    const closeMenu = () => (menuOpen.value = false)

    const isBusiness = computed(() => profile.value?.It_business === true)

    const headerAvatarUrl = computed(() => {
      const a = (profile.value?.avatar_url || '').trim()
      const b = (profile.value?.image_path || '').trim()
      return normalizeStoragePublicUrl(a || b)
    })

    const headerAvatarErrored = ref(false)

    const showHeaderAvatar = computed(() => {
      const url = headerAvatarUrl.value
      return !!url && !headerAvatarErrored.value
    })

    const onHeaderImgError = () => {
      headerAvatarErrored.value = true
    }

    const openProfileModal = () => {
      if (!session.value) {
        showAuth.value = true
        return
      }
      showProfileEdit.value = true
    }

    const openProfileOrAuth = () => {
      closeMenu()
      openProfileModal()
    }

    const openCreateEvent = () => {
      if (!session.value) {
        showAuth.value = true
        return
      }
      // только бизнес
      if (!isBusiness.value) {
        showProfileEdit.value = true
        return
      }
      showCreateEvent.value = true
    }

    const loginGoogle = async () => {
      const redirectTo = window.location.origin
      await signInWithGoogle({ redirectTo })
    }

    const handleTelegramLogin = async (telegramAuthData) => {
      await linkTelegramViaEdgeFunction(telegramAuthData)
      await refreshAll()
      showAuth.value = false
    }

    const refreshAll = async () => {
      profileLoading.value = true
      try {
        const { session: s } = await getSession()
        session.value = s || null

        const { user } = await getUser()
        if (user) {
          await ensurePublicUserRow(user)
          const { data: p } = await getMyPublicUser()
          profile.value = p || null

          const { data: tg } = await getMyTelegramLink()
          telegramLink.value = tg || null
        } else {
          profile.value = null
          telegramLink.value = null
        }

        const { data: cats } = await getCategories()
        categories.value = cats || []
      } finally {
        profileLoading.value = false
      }
    }

    const saveProfile = async (form) => {
      saving.value = true
      try {
        const patch = { ...form }

        // avatar upload (если выбрали)
        if (pickedAvatarFile.value) {
          const { publicUrl } = await uploadAvatar(pickedAvatarFile.value)

          if (publicUrl) {
            // ✅ твой столбец в БД
            patch.image_path = publicUrl

            // (опционально) оставим и это, если вдруг где-то ещё используется
            patch.avatar_url = publicUrl
          }

          pickedAvatarFile.value = null
          headerAvatarErrored.value = false
        }

        await updateMyPublicUser(patch)
        await refreshAll()
        showProfileEdit.value = false
      } finally {
        saving.value = false
      }
    }


    const onPickedAvatar = (file) => {
      pickedAvatarFile.value = file || null
    }

    const logout = async () => {
      await signOut()
      await refreshAll()
      showProfileEdit.value = false
      showAuth.value = false
      showCreateEvent.value = false
    }

    const onCreatedEvent = async () => {
      // можно тут что-то обновлять, если надо
      await nextTick()
    }

    onMounted(refreshAll)
    watch(() => session.value, () => {}) // оставлено как было

    return {
      telegramBotUsername,
      searchTerm,

      menuOpen,
      openMenu,
      closeMenu,

      session,
      profile,
      telegramLink,
      categories,

      showAuth,
      showProfileEdit,
      showCreateEvent,

      isBusiness,

      headerAvatarUrl,
      showHeaderAvatar,
      onHeaderImgError,

      openProfileModal,
      openProfileOrAuth,
      openCreateEvent,

      loginGoogle,
      handleTelegramLogin,

      saveProfile,
      onPickedAvatar,
      logout,

      createBusinessEvent,
      saving,
      onCreatedEvent
    }
  }
}
</script>

<style>
.header-placeholder {
  width: 40px; height: 40px; border-radius: 50%;
  background: #f2f2f2; display: grid; place-items: center;
  font-size: 18px; color: #9aa0a6;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; background: #efefef; color: #14181b; }
#app { min-height: 100vh; }

.header { background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
.header-container {
  max-width: 1200px; margin: 0 auto; padding: 16px 20px;
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px;
}

/* ✅ FIX: header-left растягивается, поиск ужимается, профиль не уезжает */
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
}

.menu-button {
  width: 40px; height: 40px; border-radius: 50%;
  background: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 auto;
}
.menu-icon { display: flex; flex-direction: column; gap: 3px; }
.menu-icon span { width: 18px; height: 2px; background: #14181b; border-radius: 1px; }

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
}
.search-icon { position: absolute; left: 12px; font-size: 14px; opacity: .6; }
.search-input {
  width: 100%;
  max-width: 520px;
  padding: 10px 12px 10px 36px;
  border: 2px solid #efefef; border-radius: 20px;
  outline: none; font-size: 14px;
}

.profile-button {
  width: 40px; height: 40px; border-radius: 50%;
  background: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  flex: 0 0 auto;
}
.header-avatar { width: 40px; height: 40px; object-fit: cover; border-radius: 50%; display: block; }

/* MENU DRAWER */
.menu-root { position: fixed; inset: 0; z-index: 9999; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,.35); backdrop-filter: blur(2px); }

.menu-drawer {
  position: absolute; top: 0; left: 0; height: 100%;
  width: min(420px, 92vw);
  background: #fff;
  border-right: 1px solid #efefef;
  box-shadow: 10px 0 30px rgba(0,0,0,0.12);
  display: flex; flex-direction: column;
  animation: slideInLeft 180ms ease;
}
@keyframes slideInLeft { from { transform: translateX(-18px); opacity: .7; } to { transform: translateX(0); opacity: 1; } }

.menu-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px; border-bottom: 1px solid #f2f2f2;
}
.menu-title { font-weight: 900; font-size: 16px; }
.close-btn {
  margin-left: auto;
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
}

.menu-body { padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.menu-item{
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  font-weight: 900;
  text-align: left;
}

.menu-foot { padding: 14px; border-top: 1px solid #f2f2f2; display: flex; justify-content: flex-end; }
.apply-btn {
  border: none; background: #8a75e3; color: #fff;
  border-radius: 14px; padding: 12px 16px;
  font-weight: 900; cursor: pointer;
}

/* ✅ extra mobile polish */
@media (max-width: 520px){
  .header-container{ padding: 12px 12px; }
  .search-input{ max-width: none; }
}
</style>
