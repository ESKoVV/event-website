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
        <!-- ✅ username -->
        <label class="field">
          <span>Username</span>
          <input
            v-model="form.username"
            type="text"
            placeholder="например: koksaralya"
          />
          <small class="help">Только латиница/цифры/_ (3–20 символов)</small>
        </label>

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
  </div>
</template>

<script>
import { reactive, watch, ref, computed } from 'vue'

export default {
  name: 'ProfileModal',
  emits: ['close', 'save', 'pick-avatar', 'logout', 'open-create-event'],
  props: {
    profile: { type: Object, default: null },
    telegramLink: { type: Object, default: null },
    saving: { type: Boolean, default: false },
    categories: { type: Array, default: () => [] }
  },
  setup(props, { emit }) {
    const showBizInfo = ref(false)

    const form = reactive({
      username: '',
      first_name: '',
      last_name: '',
      birth_day: '',
      phone: '',
      email: '',
      gender: '',
      interests: []
    })

    watch(
      () => props.profile,
      (p) => {
        form.username = p?.username || ''
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

    const isBusiness = computed(() => props.profile?.It_business === true)

    // avatar logic (оставлено как было по смыслу)
    const fileInput = ref(null)
    const cropFile = ref(null)

    const localAvatarUrl = ref('')
    const showLocalAvatar = computed(() => !!localAvatarUrl.value)

    const profileImgErrored = ref(false)
    const profileAvatarUrl = computed(() => props.profile?.image_path || '')
    const showProfileAvatar = computed(() => !!profileAvatarUrl.value && !profileImgErrored.value && !showLocalAvatar.value)

    const onProfileImgError = () => (profileImgErrored.value = true)

    const avatarLetter = computed(() => {
      const name = `${form.first_name} ${form.last_name}`.trim() || form.email || 'П'
      return (name[0] || 'П').toUpperCase()
    })

    const avatarGradient = computed(() => 'linear-gradient(135deg, rgba(138,117,227,.95), rgba(33,33,33,.9))')

    const triggerPick = () => {
      fileInput.value?.click()
    }

    const onPick = (e) => {
      const f = e?.target?.files?.[0]
      if (!f) return
      emit('pick-avatar', f)
      localAvatarUrl.value = URL.createObjectURL(f)
    }

    const isInterestSelected = (name) => (form.interests || []).includes(name)

    const toggleInterest = (name) => {
      const set = new Set(form.interests || [])
      if (set.has(name)) set.delete(name)
      else set.add(name)
      form.interests = Array.from(set)
    }

    return {
      showBizInfo,
      isBusiness,

      form,

      // avatar
      fileInput,
      cropFile,
      localAvatarUrl,
      showLocalAvatar,
      profileAvatarUrl,
      showProfileAvatar,
      onProfileImgError,
      avatarLetter,
      avatarGradient,
      triggerPick,
      onPick,

      // interests
      isInterestSelected,
      toggleInterest
    }
  }
}
</script>

<style scoped>
.overlay{ position: fixed; inset:0; background: rgba(0,0,0,.35); display:grid; place-items:center; z-index: 9999; padding: 12px; }
.modal{ width: min(640px, 96vw); background:#fff; border-radius: 18px; border:1px solid #efefef; box-shadow: 0 20px 60px rgba(0,0,0,.22); padding: 14px; }
.top{ display:flex; align-items:center; gap:10px; margin-bottom: 10px; }
.title{ font-size: 18px; font-weight: 900; }
.x{ margin-left:auto; border:1px solid #efefef; background:#fafafa; border-radius: 12px; padding: 8px 10px; cursor:pointer; }

.muted{ font-size: 13px; opacity:.85; margin-bottom: 10px; }

.grid{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
@media (max-width: 520px){ .grid{ grid-template-columns: 1fr; } }

.field{ display:flex; flex-direction:column; gap:6px; }
.field span{ font-size: 12px; font-weight: 900; opacity:.8; }
.field input, .field select{
  border: 1px solid #efefef; border-radius: 14px; padding: 10px 12px; outline: none;
}
.help{ font-size: 11px; opacity:.65; margin-top: -2px; }

.btns{ display:flex; gap: 10px; margin-top: 14px; }
.btn{
  border:none; background:#8a75e3; color:#fff; border-radius: 14px; padding: 12px 14px;
  font-weight: 900; cursor: pointer; flex: 1 1 auto;
}
.btn.danger{ background:#d9534f; }

.avatar-row{ display:flex; align-items:center; gap: 12px; margin-top: 10px; }
.avatar{ width: 56px; height: 56px; border-radius: 999px; border:1px solid #efefef; background:#fff; overflow:hidden; cursor:pointer; display:grid; place-items:center; }
.avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.avatar-fallback{ width:100%; height:100%; display:grid; place-items:center; font-weight: 900; color:#fff; }
.avatar-hint{ font-size: 12px; opacity: .75; }
.hidden{ display:none; }

.biz{ border:1px solid #efefef; border-radius: 16px; padding: 12px; margin: 10px 0; background:#fff; }
.biz-top{ display:flex; align-items:center; gap: 10px; }
.biz-title{ font-weight: 900; }
.biz-badge{ margin-left:auto; font-size: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(0,200,120,.12); border:1px solid rgba(0,200,120,.22); font-weight: 900; }
.biz-badge.off{ background: rgba(200,0,0,.08); border-color: rgba(200,0,0,.12); }
.biz-actions{ display:flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.biz-btn{ border:none; background:#8a75e3; color:#fff; border-radius: 14px; padding: 10px 12px; font-weight: 900; cursor:pointer; }
.biz-btn.secondary{ background:#fafafa; color:#14181b; border:1px solid #efefef; }

.interests{ border:1px solid #efefef; border-radius: 16px; padding: 12px; margin: 10px 0; }
.interests-title{ font-weight: 900; }
.interests-sub{ font-size: 12px; opacity: .75; margin-top: 2px; }
.chips{ display:flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.chip{ border:1px solid #efefef; background:#fff; border-radius: 999px; padding: 8px 10px; cursor: pointer; font-weight: 900; font-size: 12px; }
.chip.on{ background:#8a75e3; border-color:#8a75e3; color:#fff; }

/* biz info modal */
.biz-root{ position: fixed; inset: 0; z-index: 10000; }
.biz-overlay{ position:absolute; inset:0; background: rgba(0,0,0,.35); backdrop-filter: blur(2px); }
.biz-modal{ position:absolute; left:50%; top:50%; transform: translate(-50%,-50%); width: min(520px, 92vw); background:#fff; border-radius: 18px; border:1px solid #efefef; box-shadow: 0 20px 60px rgba(0,0,0,.22); }
.biz-head{ display:flex; align-items:center; gap:10px; padding: 14px; border-bottom:1px solid #f2f2f2; }
.biz-h-title{ font-weight: 900; }
.biz-close{ margin-left:auto; border:1px solid #efefef; background:#fafafa; border-radius: 12px; padding: 8px 10px; cursor:pointer; }
.biz-body{ padding: 14px; display:flex; flex-direction:column; gap: 8px; }
.biz-foot{ padding: 14px; border-top:1px solid #f2f2f2; display:flex; justify-content:flex-end; }
.biz-ok{ border:none; background:#8a75e3; color:#fff; border-radius: 14px; padding: 10px 12px; font-weight: 900; cursor:pointer; }
</style>
