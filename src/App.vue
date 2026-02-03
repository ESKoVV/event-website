<template>
  <div id="app">
    <header class="header">
      <div class="header-container">
        <div class="header-left">
          <button class="menu-button" aria-label="Меню">
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

          <!-- Плейсхолдер профиля -->
          <div v-else class="header-placeholder">
            👤
          </div>
        </button>
      </div>
    </header>

    <router-view v-slot="{ Component }">
      <component :is="Component" :global-search-term="searchTerm" />
    </router-view>

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
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import AuthModal from './components/AuthModal.vue'
import ProfileModal from './components/ProfileModal.vue'
import { useSupabase } from './composables/useSupabase.js'


const hashToHue = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

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
  components: { AuthModal, ProfileModal },
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
      getMyTelegramLink
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

    const headerLetter = computed(() => {
      const base = (profile.value?.first_name || profile.value?.email || '').trim()
      return base ? base[0].toUpperCase() : 'U'
    })

    const headerLetterStyle = computed(() => {
      const seed = (profile.value?.id || profile.value?.email || 'user').toString().toLowerCase()
      const hue = hashToHue(seed)
      return {
        background: `linear-gradient(135deg, hsl(${hue}, 80%, 55%), hsl(${(hue + 40) % 360}, 80%, 45%))`
      }
    })

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

      openProfileModal,
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
.header-letter {
  width: 40px; height: 40px; border-radius: 50%;
  display: grid; place-items: center;
  font-weight: 1000; font-size: 16px; color: #fff;
  text-shadow: 0 6px 18px rgba(0,0,0,.25);
}
</style>
