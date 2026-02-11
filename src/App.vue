<template>
  <div id="app">
    <header class="header">
      <div class="header-container">
        <div class="header-left">
          <!-- MENU BUTTON -->
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

    <!-- MENU DRAWER (menu-button) -->
    <teleport to="body">
      <div v-if="menuOpen" class="menu-root" @keydown.esc="closeMenu" tabindex="-1">
        <div class="overlay" @click="closeMenu"></div>

        <aside class="menu-drawer" role="dialog" aria-modal="true" aria-label="Меню">
          <div class="menu-head">
            <div class="menu-title">Меню</div>
            <button class="close-btn" @click="closeMenu" aria-label="Закрыть">✕</button>
          </div>

          <div class="menu-body">
            <!-- ✅ BIZ CARD moved here -->
            <div class="biz-card">
              <div class="biz-top">
                <div class="biz-title">Business аккаунт</div>
                <span v-if="isBusiness" class="biz-badge">Активен</span>
                <span v-else class="biz-badge off">Не активен</span>
              </div>

              <div class="biz-text" v-if="isBusiness">
                Ты можешь отправлять мероприятия в предложку. Они появятся после подтверждения админом
                (<b>is_published=true</b>).
              </div>
              <div class="biz-text" v-else>
                Business даст возможность предлагать мероприятия. Оплату подключим позже — сейчас статус меняется вручную
                в базе.
              </div>

              <div class="biz-actions">
                <button v-if="isBusiness" class="biz-btn" @click="openCreateEvent">
                  ➕ Добавить мероприятие
                </button>

                <button v-else class="biz-btn secondary" @click="openProfileOrAuth">
                  Узнать про Business
                </button>
              </div>
            </div>

            <div class="menu-divider"></div>

            <!-- optional quick actions -->
            <button class="menu-item" @click="openProfileOrAuth">
              👤 Профиль / Вход
            </button>
          </div>

          <div class="menu-foot">
            <button class="apply-btn" @click="closeMenu">Закрыть</button>
          </div>
        </aside>
      </div>
    </teleport>

    <!-- AUTH / PROFILE -->
    <AuthModal
      v-if="showAuth"
      :telegram-bot-username="telegramBotUsername"
      @close="closeAllModals"
      @google="loginGoogle"
      @telegram-auth="onTelegramAuth"
    />

    <ProfileModal
      v-if="showProfileEdit"
      :profile="profile"
      :telegram-link="telegramLink"
      :saving="saving"
      :loading="profileLoading"
      @close="closeAllModals"
      @save="saveProfile"
      @pick-avatar="onPickAvatar"
      @logout="logout"
    />

    <!-- ✅ Create event modal is now here (single source of truth) -->
    <CreateEventModal
      :open="createEventOpen"
      :categories="categories"
      :create-business-event="createBusinessEvent"
      @close="createEventOpen = false"
      @created="onDraftCreated"
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

    const profileLoading = ref(false)
    const saving = ref(false)
    const pickedAvatarFile = ref(null)

    const headerImgBroken = ref(false)
    const headerAvatarUrl = computed(() => normalizeStoragePublicUrl(profile.value?.image_path || ''))
    const hasHeaderAvatarUrl = computed(() => headerAvatarUrl.value.trim().length > 0)
    const showHeaderAvatar = computed(() => hasHeaderAvatarUrl.value && !headerImgBroken.value)

    const onHeaderImgError = () => {
      headerImgBroken.value = true
    }

    watch(
      () => profile.value?.image_path,
      () => {
        headerImgBroken.value = false
      }
    )

    const isBusiness = computed(() => profile.value?.It_business === true)

    // menu drawer
    const menuOpen = ref(false)
    const openMenu = async () => {
      menuOpen.value = true
      await nextTick()
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
    }
    const closeMenu = () => {
      menuOpen.value = false
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }

    // categories for create modal
    const categories = ref([])
    const categoriesLoaded = ref(false)
    const loadCategoriesOnce = async () => {
      if (categoriesLoaded.value) return
      const { data } = await getCategories()
      categories.value = data ?? []
      categoriesLoaded.value = true
    }

    // create event modal
    const createEventOpen = ref(false)
    const openCreateEvent = async () => {
      await loadAuthAndProfile()
      if (!session.value) {
        closeMenu()
        showAuth.value = true
        return
      }
      await loadCategoriesOnce()
      closeMenu()
      createEventOpen.value = true
    }

    const onDraftCreated = () => {
      alert('✅ Мероприятие отправлено. Оно появится после подтверждения админом.')
    }

    // auth/profile loader
    const loadAuthAndProfile = async () => {
      profileLoading.value = true
      try {
        const { session: s } = await getSession()
        session.value = s

        if (!s) {
          profile.value = null
          telegramLink.value = null
          return
        }

        const { user } = await getUser()
        if (user) await ensurePublicUserRow(user)

        const { data: p } = await getMyPublicUser()
        if (p?.image_path) p.image_path = normalizeStoragePublicUrl(p.image_path)
        profile.value = p

        const { data: tg } = await getMyTelegramLink()
        telegramLink.value = tg
      } finally {
        profileLoading.value = false
      }
    }

    const closeAllModals = () => {
      showAuth.value = false
      showProfileEdit.value = false
    }

    const openProfileModal = async () => {
      showAuth.value = false
      showProfileEdit.value = true
      profileLoading.value = true

      await loadAuthAndProfile()

      if (!session.value) {
        showProfileEdit.value = false
        showAuth.value = true
        profileLoading.value = false
        return
      }
      profileLoading.value = false
    }

    const openProfileOrAuth = async () => {
      await loadAuthAndProfile()
      closeMenu()
      if (!session.value) showAuth.value = true
      else showProfileEdit.value = true
    }

    const loginGoogle = async () => {
      const redirectTo = window.location.origin + import.meta.env.BASE_URL
      const { error } = await signInWithGoogle({ redirectTo })
      if (error) {
        console.error(error)
        alert('Ошибка входа через Google (см. консоль)')
      }
    }

    const onTelegramAuth = async (telegramData) => {
      await loadAuthAndProfile()
      if (!session.value) {
        alert('Сначала войди через Google, затем подтверди Telegram.')
        return
      }

      const { error } = await linkTelegramViaEdgeFunction(telegramData)
      if (error) {
        console.error(error)
        alert('Ошибка Telegram подтверждения (см. консоль)')
        return
      }

      await loadAuthAndProfile()
      showAuth.value = false
      showProfileEdit.value = true
    }

    const onPickAvatar = (file) => {
      pickedAvatarFile.value = file || null
    }

    const saveProfile = async (form) => {
      saving.value = true
      try {
        let avatarUrl = null

        if (pickedAvatarFile.value) {
          const { publicUrl, error } = await uploadAvatar(pickedAvatarFile.value)
          if (error) throw error
          avatarUrl = publicUrl
        }

        const patch = {
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          birth_day: form.birth_day || null,
          phone: form.phone || null,
          email: form.email || null,
          gender: form.gender || null
        }
        if (avatarUrl) patch.image_path = normalizeStoragePublicUrl(avatarUrl)

        const { data, error } = await updateMyPublicUser(patch)
        if (error) throw error

        if (data?.image_path) data.image_path = normalizeStoragePublicUrl(data.image_path)
        profile.value = data

        pickedAvatarFile.value = null
        headerImgBroken.value = false

        alert('Сохранено')
      } catch (e) {
        console.error('Save profile error:', e)
        alert('Ошибка сохранения (см. консоль)')
      } finally {
        saving.value = false
      }
    }

    const logout = async () => {
      await signOut()
      await loadAuthAndProfile()
      closeAllModals()
      closeMenu()
    }

    onMounted(loadAuthAndProfile)

    return {
      telegramBotUsername,
      searchTerm,

      headerAvatarUrl,
      showHeaderAvatar,
      onHeaderImgError,

      showAuth,
      showProfileEdit,
      profileLoading,
      profile,
      telegramLink,
      saving,

      isBusiness,

      menuOpen,
      openMenu,
      closeMenu,

      categories,
      createEventOpen,
      openCreateEvent,
      onDraftCreated,

      createBusinessEvent,

      openProfileModal,
      openProfileOrAuth,
      closeAllModals,
      loginGoogle,
      onTelegramAuth,
      onPickAvatar,
      saveProfile,
      logout
    }
  }
}
</script>

<style>
.header-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f2f2f2;
  display: grid;
  place-items: center;
  font-size: 18px;
  color: #9aa0a6;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; background: #efefef; color: #14181b; }
#app { min-height: 100vh; }

.header { background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
.header-container {
  max-width: 1200px; margin: 0 auto; padding: 16px 20px;
  display: flex; justify-content: space-between; align-items: center;
}
.header-left { display: flex; align-items: center; gap: 16px; }

.menu-button {
  width: 40px; height: 40px; border-radius: 50%;
  background: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.menu-icon { display: flex; flex-direction: column; gap: 3px; }
.menu-icon span { width: 18px; height: 2px; background: #14181b; border-radius: 1px; }

.search-container { position: relative; display: flex; align-items: center; }
.search-icon { position: absolute; left: 12px; font-size: 14px; opacity: .6; }
.search-input {
  width: 300px; padding: 10px 12px 10px 36px;
  border: 2px solid #efefef; border-radius: 20px;
  outline: none; font-size: 14px;
}

.profile-button {
  width: 40px; height: 40px; border-radius: 50%;
  background: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.header-avatar { width: 40px; height: 40px; object-fit: cover; border-radius: 50%; display: block; }

/* --- MENU DRAWER --- */
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
  padding: 14px;
  border-bottom: 1px solid #f2f2f2;
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
.menu-foot { padding: 14px; border-top: 1px solid #f2f2f2; display: flex; justify-content: flex-end; }
.apply-btn {
  border: none;
  background: #8a75e3;
  color: #fff;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor: pointer;
}

/* biz-card (moved here) */
.biz-card {
  background: #fcfcff;
  border: 1px solid rgba(138,117,227,.18);
  border-radius: 16px;
  padding: 12px;
  display: grid;
  gap: 10px;
}
.biz-top { display: flex; align-items: center; gap: 10px; }
.biz-title { font-weight: 900; }
.biz-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 900;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(0, 200, 120, .12);
  border: 1px solid rgba(0, 200, 120, .22);
}
.biz-badge.off { background: rgba(180,180,180,.16); border-color: rgba(180,180,180,.28); }
.biz-text { font-size: 12px; opacity: .8; line-height: 1.25; }

.biz-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.biz-btn {
  border: none;
  border-radius: 14px;
  padding: 11px 12px;
  font-weight: 900;
  cursor: pointer;
  background: #8a75e3;
  color: #fff;
}
.biz-btn.secondary { background: #efefef; color: #14181b; }
.biz-btn:hover { filter: brightness(.98); }

.menu-divider { height: 1px; background: #f2f2f2; margin: 6px 0; }

.menu-item {
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 12px 12px;
  font-weight: 900;
  cursor: pointer;
  text-align: left;
}
.menu-item:hover { background: #fafafa; }
</style>
