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

      <!-- ✅ BUSINESS SECTION -->
      <div class="biz">
        <div class="biz-top">
          <div class="biz-title">Business аккаунт</div>
          <span v-if="isBusiness" class="biz-badge">Активен</span>
          <span v-else class="biz-badge off">Не активен</span>
        </div>

        <div class="biz-actions">
          <button class="biz-btn secondary" @click="showBizInfo = true">
            Узнать о бизнес аккаунте
          </button>

          <button v-if="isBusiness" class="biz-btn" @click="$emit('open-create-event')">
            ➕ Добавить мероприятие
          </button>
        </div>
      </div>

      <!-- Аватар: кликаем -> выбираем файл -->
      <div class="avatar-row">
        <button class="avatar" @click="triggerPick" aria-label="Изменить аватар">
          <img v-if="showLocalAvatar" :src="localAvatarUrl" />

          <img
            v-else-if="showProfileAvatar"
            :src="profileAvatarUrl"
            @error="onProfileImgError"
          />

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
    </div>

    <!-- ✅ Business info modal -->
    <teleport to="body">
      <div v-if="showBizInfo" class="biz-root" @keydown.esc="showBizInfo = false" tabindex="-1">
        <div class="biz-overlay" @click="showBizInfo = false"></div>
        <div class="biz-modal" role="dialog" aria-modal="true" aria-label="О бизнес аккаунте">
          <div class="biz-head">
            <div class="biz-h-title">О Business аккаунте</div>
            <button class="biz-close" @click="showBizInfo = false">✕</button>
          </div>

          <div class="biz-body">
            <p>
              <b>Business аккаунт</b> позволяет публиковать мероприятия.
            </p>
            <p>
              Стоимость — <b>200 рублей в месяц</b>.
            </p>
            <p>
              Для приобретения — напиши администратору.
            </p>
          </div>

          <div class="biz-foot">
            <button class="biz-ok" @click="showBizInfo = false">Понятно</button>
          </div>
        </div>
      </div>
    </teleport>

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
  emits: ['close', 'save', 'pick-avatar', 'logout', 'open-create-event'],
  props: {
    profile: { type: Object, default: null },
    telegramLink: { type: Object, default: null },
    saving: { type: Boolean, default: false }
  },
  setup(props, { emit }) {
    const form = reactive({
      first_name: '',
      last_name: '',
      birth_day: '',
      phone: '',
      email: '',
      gender: ''
    })

    const showBizInfo = ref(false)

    const isBusiness = computed(() => props.profile?.It_business === true)

    watch(
      () => props.profile,
      (p) => {
        form.first_name = p?.first_name || ''
        form.last_name = p?.last_name || ''
        form.birth_day = p?.birth_day || ''
        form.phone = p?.phone || ''
        form.email = p?.email || ''
        form.gender = p?.gender || ''
      },
      { immediate: true }
    )

    // avatar
    const fileInput = ref(null)
    const cropFile = ref(null)
    const localAvatarUrl = ref('')
    const localErrored = ref(false)
    const profileErrored = ref(false)

    const triggerPick = () => fileInput.value?.click()

    const onPick = (e) => {
      const file = e?.target?.files?.[0]
      if (!file) return
      cropFile.value = file
      e.target.value = ''
    }

    const onCropped = ({ file, url }) => {
      localAvatarUrl.value = url
      localErrored.value = false
      cropFile.value = null
      emit('pick-avatar', file)
    }

    const profileAvatarUrl = computed(() => {
      const a = (props.profile?.avatar_url || '').trim()
      const b = (props.profile?.image_path || '').trim()
      return a || b
    })


    const showLocalAvatar = computed(() => !!localAvatarUrl.value && !localErrored.value)
    const showProfileAvatar = computed(() => !!profileAvatarUrl.value && !profileErrored.value && !showLocalAvatar.value)

    const onProfileImgError = () => {
      profileErrored.value = true
    }

    const avatarLetter = computed(() => {
      const n = (form.first_name || form.email || 'П')[0] || 'П'
      return String(n).toUpperCase()
    })

    const avatarGradient = computed(() => {
      // стильный фон
      const a = '#8a75e3'
      const b = '#2e2a4a'
      return `linear-gradient(135deg, ${a}, ${b})`
    })

    return {
      form,

      // business
      isBusiness,
      showBizInfo,

      // avatar
      fileInput,
      cropFile,
      localAvatarUrl,
      triggerPick,
      onPick,
      onCropped,
      profileAvatarUrl,
      showLocalAvatar,
      showProfileAvatar,
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
  background: rgba(0,0,0,.35);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 10000;
}

.modal{
  width: min(720px, 92vw);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  box-shadow: 0 18px 60px rgba(0,0,0,.18);
  padding: 14px;
}

.top{
  display:flex;
  align-items:center;
  gap: 12px;
  border-bottom: 1px solid #f2f2f2;
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.title{ margin: 0; font-weight: 900; }
.x{
  margin-left:auto;
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor:pointer;
}

.muted{
  font-size: 13px;
  opacity: .8;
  margin-bottom: 12px;
}

/* ✅ business block */
.biz{
  border: 1px solid rgba(138,117,227,.18);
  background: #fcfcff;
  border-radius: 16px;
  padding: 12px;
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.biz-top{
  display:flex;
  align-items:center;
  gap: 10px;
}
.biz-title{ font-weight: 900; }
.biz-badge{
  margin-left: auto;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(46,125,50,.12);
  border: 1px solid rgba(46,125,50,.22);
  color: #2e7d32;
  font-weight: 900;
}
.biz-badge.off{
  background: rgba(217,83,79,.10);
  border-color: rgba(217,83,79,.22);
  color: #d9534f;
}
.biz-actions{
  display:flex;
  gap: 10px;
  flex-wrap: wrap;
}
.biz-btn{
  border: none;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
  background: #8a75e3;
  color:#fff;
}
.biz-btn.secondary{
  background: #fff;
  color:#14181b;
  border: 1px solid #efefef;
}
.biz-btn.secondary:hover{ background:#fafafa; }

.avatar-row{
  display:flex;
  align-items:center;
  gap: 12px;
  margin: 12px 0;
}
.avatar{
  width: 74px;
  height: 74px;
  border-radius: 999px;
  border: 1px solid #efefef;
  overflow:hidden;
  background:#fff;
  cursor:pointer;
  display:grid;
  place-items:center;
}
.avatar img{ width: 100%; height: 100%; object-fit: cover; display:block; }
.avatar-fallback{
  width: 100%; height: 100%;
  display:grid; place-items:center;
  font-weight: 900;
  color:#fff;
  font-size: 22px;
}
.avatar-hint{ font-size: 13px; opacity: .8; }
.hidden{ display:none; }

.grid{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 720px){
  .grid{ grid-template-columns: 1fr; }
}
.field{ display:grid; gap: 6px; }
.field span{ font-size: 12px; opacity: .75; font-weight: 900; }
.field input, .field select{
  border: 1px solid #efefef;
  border-radius: 12px;
  padding: 10px;
  outline:none;
}
.btns{
  margin-top: 14px;
  display:flex;
  gap: 10px;
  flex-wrap: wrap;
}
.btn{
  border:none;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor:pointer;
  background:#8a75e3;
  color:#fff;
}
.btn:disabled{ opacity:.6; cursor:not-allowed; }
.btn.danger{ background:#d9534f; }

/* ✅ business info modal */
.biz-root{ position: fixed; inset: 0; z-index: 11000; }
.biz-overlay{ position:absolute; inset:0; background: rgba(0,0,0,.38); backdrop-filter: blur(2px); }
.biz-modal{
  position:absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, 92vw);
  background:#fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  box-shadow: 0 18px 60px rgba(0,0,0,.18);
  overflow:hidden;
}
.biz-head{
  padding: 12px 14px;
  border-bottom: 1px solid #f2f2f2;
  display:flex;
  align-items:center;
  gap: 10px;
}
.biz-h-title{ font-weight: 900; }
.biz-close{
  margin-left:auto;
  border: 1px solid #efefef;
  background:#fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor:pointer;
}
.biz-body{ padding: 14px; display:grid; gap: 10px; }
.biz-body p{ margin:0; line-height: 1.35; opacity: .92; }
.biz-foot{
  padding: 14px;
  border-top: 1px solid #f2f2f2;
  display:flex;
  justify-content:flex-end;
}
.biz-ok{
  border:none;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor:pointer;
  background:#8a75e3;
  color:#fff;
}
</style>
