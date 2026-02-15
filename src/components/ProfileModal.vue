<template>
  <div class="overlay" @click.self="$emit('close')" @wheel.prevent @touchmove.prevent>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Профиль">
      <div class="top">
        <h3 class="title">Профиль</h3>
        <button class="x" @click="$emit('close')" aria-label="Закрыть">✕</button>
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

      <!-- ✅ INTERESTS -->
      <div class="interests">
        <div class="interests-top">
          <div class="interests-title">Интересы</div>
          <div class="interests-sub">Выбери категории — по ним настроится «Моя лента»</div>
        </div>

        <div v-if="!categories?.length" class="interests-empty">
          Категории не загружены
        </div>

        <div v-else class="chips">
          <button
            v-for="c in categories"
            :key="c.id"
            type="button"
            class="chip"
            :class="{ on: isInterestSelected(c.name) }"
            @click="toggleInterest(c.name)"
            :aria-pressed="isInterestSelected(c.name)"
          >
            {{ c.name }}
          </button>
        </div>
      </div>

      <!-- Аватар -->
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
            <button class="biz-close" @click="showBizInfo = false" aria-label="Закрыть">✕</button>
          </div>

          <div class="biz-body">
            <p><b>Business аккаунт</b> позволяет публиковать мероприятия.</p>
            <p>Стоимость — <b>200 рублей в месяц</b>.</p>
            <p>Для приобретения — напиши администратору.</p>
          </div>

          <div class="biz-foot">
            <button class="biz-ok" @click="showBizInfo = false">Понятно</button>
          </div>
        </div>
      </div>
    </teleport>

    <AvatarCropModal
      v-if="cropFile"
      :file="cropFile"
      @close="cropFile = null"
      @done="onCropped"
    />
  </div>
</template>

<script>
import { reactive, watch, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AvatarCropModal from './AvatarCropModal.vue'

export default {
  name: 'ProfileModal',
  components: { AvatarCropModal },
  emits: ['close', 'save', 'pick-avatar', 'logout', 'open-create-event'],
  props: {
    profile: { type: Object, default: null },
    telegramLink: { type: Object, default: null },
    saving: { type: Boolean, default: false },
    categories: { type: Array, default: () => [] }
  },
  setup(props, { emit }) {
    // ✅ Блокируем скролл страницы, пока открыт профиль
    let prevOverflow = ''
    let prevPaddingRight = ''

    const lockBodyScroll = () => {
      const body = document.body
      prevOverflow = body.style.overflow
      prevPaddingRight = body.style.paddingRight

      // компенсируем исчезновение скроллбара, чтобы не “прыгала” ширина
      const scrollbarW = window.innerWidth - document.documentElement.clientWidth
      if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`

      body.style.overflow = 'hidden'
    }

    const unlockBodyScroll = () => {
      const body = document.body
      body.style.overflow = prevOverflow || ''
      body.style.paddingRight = prevPaddingRight || ''
    }

    onMounted(lockBodyScroll)
    onBeforeUnmount(unlockBodyScroll)

    const form = reactive({
      first_name: '',
      last_name: '',
      birth_day: '',
      phone: '',
      email: '',
      gender: '',
      interests: []
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
        form.interests = Array.isArray(p?.interests) ? [...p.interests] : []
      },
      { immediate: true }
    )

    // interests helpers
    const norm = (s) => String(s || '').trim()
    const isInterestSelected = (name) => form.interests.includes(norm(name))
    const toggleInterest = (name) => {
      const n = norm(name)
      if (!n) return
      const set = new Set(form.interests)
      if (set.has(n)) set.delete(n)
      else set.add(n)
      form.interests = Array.from(set)
    }

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
    const showProfileAvatar = computed(
      () => !!profileAvatarUrl.value && !profileErrored.value && !showLocalAvatar.value
    )

    const onProfileImgError = () => {
      profileErrored.value = true
    }

    const avatarLetter = computed(() => {
      const n = (form.first_name || form.email || 'П')[0] || 'П'
      return String(n).toUpperCase()
    })

    const avatarGradient = computed(() => {
      const a = '#8a75e3'
      const b = '#2e2a4a'
      return `linear-gradient(135deg, ${a}, ${b})`
    })

    return {
      form,
      isBusiness,
      showBizInfo,

      isInterestSelected,
      toggleInterest,

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
/* ✅ Чётче/современнее: контуры, тени, фокус, hover */

.overlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.42);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  z-index: 10000;
}

.modal{
  width: min(760px, 92vw);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border: 1px solid rgba(0,0,0,.10);
  border-radius: 20px;
  box-shadow: 0 22px 70px rgba(0,0,0,.22);
  padding: 16px;
}

.top{
  display:flex;
  align-items:center;
  gap:12px;
  border-bottom: 1px solid rgba(0,0,0,.06);
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.title{ margin:0; font-weight: 900; letter-spacing: .2px; }

.x{
  margin-left:auto;
  border: 1px solid rgba(0,0,0,.10);
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  cursor:pointer;
  transition: transform .12s ease, box-shadow .12s ease;
}
.x:hover{ transform: translateY(-1px); box-shadow: 0 10px 22px rgba(0,0,0,.10); }

.muted{ font-size: 13px; opacity: .82; margin-bottom: 12px; }

.biz{
  border: 1px solid rgba(138,117,227,.22);
  background: linear-gradient(180deg, #ffffff, #fbfbff);
  border-radius: 16px;
  padding: 12px;
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.biz-top{ display:flex; align-items:center; gap:10px; }
.biz-title{ font-weight: 900; }
.biz-badge{
  margin-left:auto;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(46,125,50,.10);
  border: 1px solid rgba(46,125,50,.20);
  color:#2e7d32;
  font-weight: 900;
}
.biz-badge.off{
  background: rgba(217,83,79,.10);
  border-color: rgba(217,83,79,.20);
  color:#d9534f;
}

.biz-actions{ display:flex; gap:10px; flex-wrap: wrap; }

.biz-btn{
  border: none;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
  background:#8a75e3;
  color:#fff;
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.biz-btn:hover{ transform: translateY(-1px); box-shadow: 0 12px 26px rgba(138,117,227,.22); }
.biz-btn:active{ transform: translateY(0px); opacity: .92; }
.biz-btn.secondary{
  background:#fff;
  color:#14181b;
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 10px 22px rgba(0,0,0,.05);
}

.interests{
  border: 1px solid rgba(0,0,0,.10);
  background: #fff;
  border-radius: 16px;
  padding: 12px;
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.interests-title{ font-weight: 900; }
.interests-sub{ font-size: 12px; opacity: .75; margin-top: 2px; }
.interests-empty{ font-size: 13px; opacity: .7; font-weight: 700; }
.chips{ display:flex; gap: 8px; flex-wrap: wrap; }

.chip{
  border: 1px solid rgba(0,0,0,.10);
  background: #fff;
  border-radius: 999px;
  padding: 8px 10px;
  font-weight: 900;
  font-size: 12px;
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
}
.chip:hover{ transform: translateY(-1px); box-shadow: 0 10px 18px rgba(0,0,0,.08); }
.chip.on{
  background: rgba(138,117,227,.14);
  border-color: rgba(138,117,227,.32);
}

.avatar-row{ display:flex; align-items:center; gap:12px; margin:12px 0; }
.avatar{
  width: 74px;
  height: 74px;
  border-radius: 999px;
  border: 2px solid rgba(0,0,0,.10);
  overflow:hidden;
  background:#fff;
  cursor:pointer;
  display:grid;
  place-items:center;
  transition: transform .12s ease, box-shadow .12s ease;
}
.avatar:hover{ transform: translateY(-1px); box-shadow: 0 14px 26px rgba(0,0,0,.12); }
.avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.avatar-fallback{ width:100%; height:100%; display:grid; place-items:center; font-weight:900; color:#fff; font-size:22px; }
.avatar-hint{ font-size:13px; opacity:.82; font-weight: 700; }
.hidden{ display:none; }

.grid{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 720px){ .grid{ grid-template-columns: 1fr; } }

.field{ display:grid; gap: 6px; }
.field span{ font-size: 12px; opacity: .76; font-weight: 900; }

.field input, .field select{
  border: 2px solid rgba(0,0,0,.10);
  border-radius: 14px;
  padding: 10px 12px;
  outline: none;
  font-weight: 700;
  transition: border-color .12s ease, box-shadow .12s ease;
}

.field input:focus, .field select:focus{
  border-color: rgba(138,117,227,.50);
  box-shadow: 0 0 0 4px rgba(138,117,227,.14);
}

.btns{ margin-top: 14px; display:flex; gap:10px; flex-wrap: wrap; }

.btn{
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor:pointer;
  background:#8a75e3;
  color:#fff;
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.btn:hover{ transform: translateY(-1px); box-shadow: 0 14px 30px rgba(138,117,227,.22); }
.btn:active{ transform: translateY(0px); opacity: .92; }
.btn:disabled{ opacity: .6; cursor: not-allowed; box-shadow: none; transform: none; }

.btn.danger{
  background:#d9534f;
}
.btn.danger:hover{ box-shadow: 0 14px 30px rgba(217,83,79,.22); }

/* business info modal — оставил как было, но слегка “подтянул” */
.biz-root{ position:fixed; inset:0; z-index:11000; }
.biz-overlay{ position:absolute; inset:0; background:rgba(0,0,0,.46); backdrop-filter:blur(3px); }
.biz-modal{
  position:absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, 92vw);
  background:#fff;
  border: 1px solid rgba(0,0,0,.10);
  border-radius: 18px;
  box-shadow: 0 22px 70px rgba(0,0,0,.22);
  overflow:hidden;
}
.biz-head{ display:flex; align-items:center; gap:10px; padding: 14px; border-bottom: 1px solid rgba(0,0,0,.06); }
.biz-h-title{ font-weight: 900; }
.biz-close{ margin-left:auto; border: 1px solid rgba(0,0,0,.10); background:#fff; border-radius: 12px; padding: 8px 10px; cursor:pointer; }
.biz-body{ padding: 14px; }
.biz-foot{ padding: 14px; border-top: 1px solid rgba(0,0,0,.06); display:flex; justify-content:flex-end; }
.biz-ok{ border:none; background:#8a75e3; color:#fff; border-radius: 14px; padding: 10px 14px; font-weight: 900; cursor:pointer; }
</style>
