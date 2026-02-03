<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="top">
        <h3 class="title">Профиль</h3>
        <button class="x" @click="$emit('close')">✕</button>
      </div>

      <div class="muted" v-if="telegramLink">
        Telegram привязан: <b>@{{ telegramLink.username || 'без username' }}</b>
      </div>
      <div class="muted" v-else>
        Telegram не привязан (вход → Telegram)
      </div>

      <!-- Аватар: кликаем -> выбираем файл -->
      <div class="avatar-row">
        <button class="avatar" @click="triggerPick" aria-label="Изменить аватар">
          <!-- 1) локальный превью после кропа -->
          <img v-if="showLocalAvatar" :src="localAvatarUrl" />

          <!-- 2) аватар из БД (если есть и не упал по ошибке) -->
          <img
            v-else-if="showProfileAvatar"
            :src="profileAvatarUrl"
            @error="onProfileImgError"
          />

          <!-- 3) fallback: буква + стильный фон -->
          <div v-else class="avatar-fallback" :style="{ background: avatarGradient }">
            {{ avatarLetter }}
          </div>
        </button>

        <div class="avatar-hint">Нажми на аватар, чтобы поменять</div>

        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept="image/*"
          @change="onPick"
        />
      </div>

      <div class="grid">
        <label class="field">
          <span>Имя</span>
          <input v-model="form.first_name" type="text" />
        </label>

        <label class="field">
          <span>Фамилия</span>
          <input v-model="form.last_name" type="text" />
        </label>

        <label class="field">
          <span>Дата рождения</span>
          <input v-model="form.birth_day" type="date" />
        </label>

        <label class="field">
          <span>Телефон</span>
          <input v-model="form.phone" type="text" placeholder="+7..." />
        </label>

        <label class="field">
          <span>Email</span>
          <input v-model="form.email" type="email" />
        </label>

        <label class="field">
          <span>Пол</span>
          <select v-model="form.gender">
            <option value="">Не выбран</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
            <option value="other">Другое</option>
          </select>
        </label>
      </div>

      <div class="btns">
        <button class="btn" :disabled="saving" @click="$emit('save', form)">
          {{ saving ? 'Сохранение...' : 'Сохранить' }}
        </button>
        <button class="btn danger" @click="$emit('logout')">Выйти из аккаунта</button>
      </div>

      <div class="note">It_business не отображается и не редактируется с клиента.</div>
    </div>

    <!-- Кроп модалка -->
    <AvatarCropModal
      v-if="cropFile"
      :file="cropFile"
      @close="cropFile = null"
      @done="onCropped"
    />
  </div>
</template>

<script>
import { reactive, watch, ref, computed } from 'vue'
import AvatarCropModal from './AvatarCropModal.vue'

export default {
  name: 'ProfileModal',
  components: { AvatarCropModal },
  emits: ['close', 'save', 'pick-avatar', 'logout'],
  props: {
    profile: { type: Object, default: null },
    telegramLink: { type: Object, default: null },
    saving: { type: Boolean, default: false }
  },
  setup(props, { emit }) {
    const form = reactive({
      first_name: '',
      last_name: '',
      birth_day: '', // yyyy-mm-dd
      phone: '',
      email: '',
      gender: ''
    })

    const fileInput = ref(null)

    const cropFile = ref(null) // выбранный файл для обрезки
    const localAvatarUrl = ref('') // превью после кропа (локально)

    // если профильная картинка сломалась (404/403/invalid), переключаемся на fallback
    const profileImgBroken = ref(false)

    const fill = () => {
      form.first_name = props.profile?.first_name ?? ''
      form.last_name = props.profile?.last_name ?? ''
      form.birth_day = props.profile?.birth_day ?? ''
      form.phone = props.profile?.phone ?? ''
      form.email = props.profile?.email ?? ''
      form.gender = props.profile?.gender ?? ''
      // при смене профиля сбрасываем флаг ошибки картинки
      profileImgBroken.value = false
    }

    watch(
      () => props.profile,
      () => fill(),
      { immediate: true }
    )

    // если локальный аватар меняется — тоже сбрасываем флаг битой картинки
    watch(localAvatarUrl, () => {
      profileImgBroken.value = false
    })

    const triggerPick = () => {
      fileInput.value?.click()
    }

    const onPick = (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      cropFile.value = file
      e.target.value = ''
    }

    const onCropped = (file) => {
      emit('pick-avatar', file)
      cropFile.value = null
      localAvatarUrl.value = URL.createObjectURL(file)
    }

    // -------------------------
    // ✅ AVATAR DISPLAY LOGIC
    // -------------------------

    const showLocalAvatar = computed(() => {
      return typeof localAvatarUrl.value === 'string' && localAvatarUrl.value.trim().length > 0
    })

    const profileAvatarUrl = computed(() => {
      const src = props.profile?.image_path
      return typeof src === 'string' ? src.trim() : ''
    })

    const hasProfileAvatarUrl = computed(() => {
      return profileAvatarUrl.value.length > 0
    })

    const showProfileAvatar = computed(() => {
      // показываем фото из профиля ТОЛЬКО если есть url и оно не "сломалось"
      return hasProfileAvatarUrl.value && !profileImgBroken.value
    })

    const onProfileImgError = () => {
      // 🔥 ключевой фикс: если img не загрузился — показываем fallback
      profileImgBroken.value = true
    }

    const avatarLetter = computed(() => {
      const first = (props.profile?.first_name || '').trim()
      const email = (props.profile?.email || '').trim()
      const src = first || email
      return src ? src.charAt(0).toUpperCase() : '?'
    })

    const avatarGradient = computed(() => {
      const key = props.profile?.id || props.profile?.email || 'default'
      const hash = [...String(key)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)

      const gradients = [
        ['#ff7a18', '#ffb347'],
        ['#6a11cb', '#2575fc'],
        ['#11998e', '#38ef7d'],
        ['#ee0979', '#ff6a00'],
        ['#8360c3', '#2ebf91'],
        ['#fc5c7d', '#6a82fb'],
        ['#0f2027', '#2c5364']
      ]

      const g = gradients[hash % gradients.length]
      return `linear-gradient(135deg, ${g[0]}, ${g[1]})`
    })

    return {
      form,
      fileInput,
      triggerPick,
      onPick,
      cropFile,
      onCropped,
      localAvatarUrl,

      // avatar
      showLocalAvatar,
      showProfileAvatar,
      profileAvatarUrl,
      onProfileImgError,
      avatarLetter,
      avatarGradient
    }
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal {
  width: 620px;
  max-width: calc(100vw - 40px);
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  margin: 0;
}
.x {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.7;
}

.muted {
  opacity: 0.7;
  margin: 8px 0 14px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: none;
  background: #f5f5f5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ✅ fallback-аватар */
.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  user-select: none;
}

.avatar-hint {
  opacity: 0.7;
  font-size: 13px;
}

.hidden {
  display: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field span {
  font-size: 12px;
  opacity: 0.7;
}

input,
select {
  border: 1px solid #efefef;
  border-radius: 12px;
  padding: 10px 12px;
  outline: none;
}

.btns {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.btn {
  flex: 1;
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  background: #8a75e3;
  color: #fff;
  font-weight: 700;
}

.btn.danger {
  background: #d9534f;
}

.note {
  margin-top: 12px;
  font-size: 12px;
  opacity: 0.7;
}
</style>
