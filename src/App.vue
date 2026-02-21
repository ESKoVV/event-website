<template>
  <div id="app">
    <header class="header">
      <div class="header-container">
        <div class="header-left">
          <div class="search-container">
            <div class="search-icon">🔍</div>
            <input v-model="searchTerm" type="text" placeholder="Поиск" class="search-input" />
          </div>
        </div>

        <div class="header-right">
          <button class="profile-button desktop-only" @click="openProfileModal" aria-label="Профиль">
            <img
              v-if="showHeaderAvatar"
              class="header-avatar"
              :src="headerAvatarUrl"
              alt="avatar"
              @error="onHeaderImgError"
            />
            <div v-else class="header-placeholder">👤</div>
          </button>

          <div class="build-version" :title="`Версия сборки: ${appVersion}`">v{{ appVersion }}</div>
        </div>
        <button class="profile-button desktop-only" @click="openProfileModal" aria-label="Профиль">
          <img
            v-if="showHeaderAvatar"
            class="header-avatar"
            :src="headerAvatarUrl"
            alt="avatar"
            @error="onHeaderImgError"
          />
          <div v-else class="header-placeholder">👤</div>
        </button>

        <div class="build-version" :title="`Версия сборки: ${appVersion}`">v{{ appVersion }}</div>
      </div>
    </header>

    <div class="layout">
      <!-- DESKTOP SIDEBAR (в мобилке превращается в bottom-bar через CSS) -->
      <aside class="sidebar" aria-label="Разделы">
        <!-- 1: Лента -->
        <button class="nav-item" :class="{ active: isActiveRoute('home') }" type="button" @click="go('home')">
          <span class="ni-ico">📰</span>
          <span class="ni-txt">Лента</span>
        </button>

        <!-- 2: Друзья (поиск друзей) -->
        <button class="nav-item" :class="{ active: isActiveRoute('friends') }" type="button" @click="go('friends')">
          <span class="ni-ico">👥</span>
          <span class="ni-txt">Друзья</span>
        </button>

        <!-- 3: Сообщения (центральная на мобилке) -->
        <button class="nav-item nav-item-messages" :class="{ active: isActiveRoute('messages') }" type="button" @click="go('messages')">
          <span class="ni-ico ni-ico-wrap ni-ico-messages">
            <span class="ni-ico-inner">💬</span>
            <span v-if="unreadCount > 0" class="badge" aria-label="Непрочитанные сообщения">{{ badgeText }}</span>
          </span>
          <span class="ni-txt">Сообщения</span>
        </button>

        <!-- 4: Меню (в мобилке между сообщениями и профилем) -->
        <!-- Меню нужно только на мобильной версии -->
        <button class="nav-item nav-item-menu mobile-only" type="button" @click="openMenu">
          <span class="ni-ico">☰</span>
          <span class="ni-txt">Меню</span>
        </button>

        <!-- 5: Профиль (в мобилке справа) -->
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
            <button class="menu-item" @click="go('home'); closeMenu()">📰 Лента</button>
            <button class="menu-item" @click="go('friends'); closeMenu()">👥 Друзья</button>

            <button class="menu-item menu-item-with-badge" @click="go('messages'); closeMenu()">
              <span class="mib-left">💬 Сообщения</span>
              <span v-if="unreadCount > 0" class="menu-badge">{{ badgeText }}</span>
            </button>

            <!-- будущие разделы добавляй сюда -->
            <div class="menu-note">Здесь будут остальные разделы позже</div>

            <button class="menu-item" @click="openProfileOrAuth">👤 Профиль / Вход</button>
          </div>

          <div class="menu-foot">
            <button class="apply-btn" @click="closeMenu">Закрыть</button>
          </div>
        </aside>
      </div>
    </teleport>

    <!-- ✅ ВСЕ МОДАЛКИ В BODY -->
    <teleport to="body">
      <AuthModal
        v-if="showAuth"
        :telegram-bot-username="telegramBotUsername"
        @close="showAuth = false"
        @google="loginGoogle"
        @telegram="handleTelegramLogin"
      />
    </teleport>

    <teleport to="body">
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
    </teleport>

    <teleport to="body">
      <CreateEventModal
        v-if="showCreateEvent"
        :open="showCreateEvent"
        :categories="categories"
        :create-business-event="createBusinessEvent"
        @close="showCreateEvent = false"
        @created="onCreatedEvent"
      />
    </teleport>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthModal from './components/AuthModal.vue'
import ProfileModal from './components/ProfileModal.vue'
import CreateEventModal from './components/CreateEventModal.vue'
import { useSupabase } from './composables/useSupabase.js'
import { useUnreadMessages } from './composables/unreadMessages.js'

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

    const { unreadCount } = useUnreadMessages()

    const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || ''
    const appVersion = import.meta.env.VITE_APP_VERSION || 'dev'

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

    const badgeText = computed(() => {
      const n = Number(unreadCount.value || 0)
      if (n <= 0) return ''
      if (n > 99) return '99+'
      return String(n)
    })

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
      appVersion,
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
      createBusinessEvent,

      unreadCount,
      badgeText
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
.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.build-version {
.build-version {
  margin-left: auto;
  font-size: 12px;
  font-weight: 800;
  color: #6f6f7a;
  background: #f4f3ff;
  border: 1px solid #e8e4ff;
  border-radius: 999px;
  padding: 6px 10px;
  white-space: nowrap;
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
  left: 12px;
  font-size: 14px;
  opacity: 0.6;
}
.search-input {
  height: 42px;
  width: min(520px, 52vw);
  border-radius: 14px;
  border: 1px solid #efefef;
  padding: 0 14px 0 36px;
  outline: none;
}
.search-input:focus {
  border-color: #e2e2e2;
}
.profile-button {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.header-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.header-placeholder {
  font-size: 18px;
}

.layout {
  max-width: 1300px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 18px;
  padding: 18px;
}
.sidebar {
  position: sticky;
  top: 72px;
  align-self: start;
  border: 1px solid #efefef;
  border-radius: 18px;
  background: #fff;
  padding: 10px;
  height: fit-content;
}
.nav-item {
  width: 100%;
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px 10px;
  border-radius: 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.nav-item:hover {
  background: #f7f7f7;
}
.nav-item.active {
  background: #111;
  color: #fff;
}
.ni-ico {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #f3f3f3;
  font-size: 18px;
}
.nav-item.active .ni-ico {
  background: rgba(255, 255, 255, 0.14);
}
.ni-txt {
  font-weight: 600;
  font-size: 14px;
}

/* messages icon with badge */
.ni-ico-wrap {
  position: relative;
}
.ni-ico-inner {
  display: inline-block;
  line-height: 1;
}
.badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ff2f2f;
  color: #fff;
  font-weight: 800;
  font-size: 11px;
  display: grid;
  place-items: center;
  border: 2px solid #fff;
}

.content {
  min-width: 0;
}

/* MENU */
.menu-root {
  position: fixed;
  inset: 0;
  z-index: 50;
}
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}
.menu-drawer {
  position: absolute;
  top: 0;
  left: 0;
  width: min(380px, 86vw);
  height: 100%;
  background: #fff;
  border-right: 1px solid #efefef;
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.menu-head {
  padding: 14px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #efefef;
}
.menu-title {
  font-weight: 900;
}
.close-btn {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
}
.menu-body {
  padding: 14px;
  display: grid;
  gap: 10px;
}
.menu-item {
  width: 100%;
  padding: 12px 12px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-weight: 700;
}
.menu-item:hover {
  background: #f7f7f7;
}
.menu-note {
  font-size: 12px;
  opacity: 0.6;
  padding: 0 4px;
}
.menu-foot {
  padding: 14px;
  border-top: 1px solid #efefef;
}
.apply-btn {
  width: 100%;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: #111;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.menu-item-with-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.mib-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.menu-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #ff2f2f;
  color: #fff;
  font-weight: 900;
  font-size: 12px;
  display: grid;
  place-items: center;
}

/* Показываем некоторые элементы только на мобильной версии */
.mobile-only {
  display: none !important;
}

/* ===== MOBILE BOTTOM BAR ===== */
@media (max-width: 980px) {
  .mobile-only {
    display: inline-flex !important;
  }
  .layout {
    grid-template-columns: 1fr;
    padding-bottom: 92px; /* место под нижнюю панель */
  }

  .desktop-only {
    display: none !important;
  }

  .build-version {
    display: none;
  }

  .sidebar {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 12px;
    top: auto;
    z-index: 30;

    border-radius: 22px;
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;

    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  }

  .nav-item {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 10px 6px;
    border-radius: 18px;
  }

  .ni-txt {
    display: none;
  }

  .ni-ico {
    width: 46px;
    height: 46px;
    border-radius: 18px;
    font-size: 20px;
  }

  /* центральная кнопка сообщения — чуть выделяем */
  .nav-item-messages .ni-ico {
    width: 54px;
    height: 54px;
    border-radius: 20px;
    font-size: 22px;
    transform: translateY(-10px);
    border: 1px solid #efefef;
    background: #fff;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
  }
  .nav-item.active .nav-item-messages .ni-ico {
    background: #fff;
  }
  .badge {
    top: -8px;
    right: -10px;
    border-color: #fff;
  }
}
</style>
