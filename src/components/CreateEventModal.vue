<template>
  <teleport to="body">
    <div v-if="open" class="root" @keydown.esc="close" tabindex="-1">
      <div class="overlay" @click="close"></div>

      <div class="modal" role="dialog" aria-modal="true" aria-label="Добавить мероприятие">
        <div class="head">
          <div class="title">Добавить мероприятие</div>
          <button class="x" @click="close" aria-label="Закрыть">✕</button>
        </div>

        <div class="body">
          <div class="hint">
            Мероприятие создаётся с <b>is_published=false</b> и появится после подтверждения админом.
          </div>

          <div class="grid">
            <div class="field">
              <div class="label">Название *</div>
              <input class="input" v-model="form.title" placeholder="Например: Вечер настолок" />
            </div>

            <div class="field">
              <div class="label">Дата и время *</div>
              <input class="input" type="datetime-local" v-model="form.date_time_event" />
            </div>

            <div class="field">
              <div class="label">Адрес</div>
              <input class="input" v-model="form.address" placeholder="Город, улица, дом / или ссылка" />
            </div>

            <div class="field">
              <div class="label">Организатор</div>
              <input class="input" v-model="form.organizer" placeholder="Имя/проект" />
            </div>

            <div class="field">
              <div class="label">Цена (₽)</div>
              <input class="input" type="number" min="0" inputmode="numeric" v-model="form.price" placeholder="0" />
              <div class="mini"><span class="badge" v-if="isFree">🆓 Бесплатно</span></div>
            </div>

            <div class="field inline">
              <label class="check">
                <input type="checkbox" v-model="form.is_online" />
                <span class="ui"></span>
                <span class="text">Онлайн (is_online)</span>
              </label>
            </div>
          </div>

          <div class="field">
            <div class="label">Категории</div>
            <div class="tags">
              <button
                v-for="c in categories"
                :key="c.id"
                class="tag"
                :class="{ active: selectedCategories.includes(c.name) }"
                @click="toggleCategory(c.name)"
                type="button"
              >
                {{ c.name }}
              </button>
            </div>
            <div class="mini">Можно выбрать несколько.</div>
          </div>

          <!-- ✅ IMAGE -->
          <div class="field">
            <div class="label">Картинка мероприятия</div>

            <div class="image-row">
              <label class="file-btn">
                <input class="file-input" type="file" accept="image/*" @change="onPickFile" />
                📷 Выбрать файл
              </label>

              <button v-if="pickedFile" class="file-clear" type="button" @click="clearFile">
                Убрать
              </button>
            </div>

            <div v-if="pickedFile" class="preview">
              <img :src="previewUrl" alt="preview" />
              <div class="preview-meta">
                <div class="preview-name">{{ pickedFile.name }}</div>
                <div class="preview-sub">{{ prettySize(pickedFile.size) }}</div>
              </div>
            </div>

            <div class="mini">
              Файл загрузится в Storage, а ссылка попадёт в <b>event_photos.photo_url</b>.
            </div>

            <div class="mini" style="margin-top: 8px; opacity:.75;">
              Или можно указать ссылку (необязательно):
            </div>
            <input class="input" v-model="form.photo_url" placeholder="https://..." />
          </div>

          <div class="field">
            <div class="label">Описание *</div>
            <textarea class="textarea" v-model="form.description" placeholder="Опиши, что будет происходить"></textarea>
          </div>

          <div v-if="error" class="error">{{ error }}</div>
        </div>

        <div class="foot">
          <button class="btn secondary" @click="close">Отмена</button>
          <button class="btn primary" :disabled="saving" @click="submit">
            {{ saving ? 'Отправляю…' : 'Отправить' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script>
const trimOrNull = (v) => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

export default {
  name: 'CreateEventModal',
  emits: ['close', 'created'],
  props: {
    open: { type: Boolean, default: false },
    categories: { type: Array, default: () => [] },
    createBusinessEvent: { type: Function, required: true }
  },
  data() {
    return {
      saving: false,
      error: '',
      selectedCategories: [],
      form: {
        title: '',
        description: '',
        date_time_event: '',
        address: '',
        organizer: '',
        price: '0',
        is_online: false,
        photo_url: ''
      },
      pickedFile: null,
      previewUrl: ''
    }
  },
  computed: {
    isFree() {
      const n = Number(this.form.price)
      return Number.isFinite(n) && n <= 0
    }
  },
  watch: {
    open(v) {
      if (!v) {
        this.cleanupPreview()
      }
    }
  },
  methods: {
    close() {
      if (this.saving) return
      this.$emit('close')
    },
    toggleCategory(name) {
      const n = String(name || '').trim()
      if (!n) return
      const idx = this.selectedCategories.indexOf(n)
      if (idx >= 0) this.selectedCategories.splice(idx, 1)
      else this.selectedCategories.push(n)
    },

    prettySize(bytes) {
      const b = Number(bytes || 0)
      if (b < 1024) return `${b} B`
      const kb = b / 1024
      if (kb < 1024) return `${kb.toFixed(1)} KB`
      const mb = kb / 1024
      return `${mb.toFixed(1)} MB`
    },

    onPickFile(e) {
      const file = e?.target?.files?.[0]
      if (!file) return

      if (!String(file.type || '').startsWith('image/')) {
        this.error = 'Нужно выбрать изображение.'
        e.target.value = ''
        return
      }

      // лимит (чтобы не улетали огромные) — можно менять
      const maxMB = 8
      if (file.size > maxMB * 1024 * 1024) {
        this.error = `Слишком большой файл. Максимум ${maxMB}MB.`
        e.target.value = ''
        return
      }

      this.error = ''
      this.pickedFile = file

      this.cleanupPreview()
      this.previewUrl = URL.createObjectURL(file)
    },

    clearFile() {
      this.pickedFile = null
      this.cleanupPreview()
      this.previewUrl = ''
    },

    cleanupPreview() {
      try {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
      } catch {}
    },

    async submit() {
      this.error = ''

      const title = trimOrNull(this.form.title)
      const description = trimOrNull(this.form.description)
      const dt = trimOrNull(this.form.date_time_event)

      if (!title) return (this.error = 'Укажи название.')
      if (!dt) return (this.error = 'Укажи дату и время.')
      if (!description) return (this.error = 'Укажи описание.')

      const priceNum = Number(this.form.price)
      const price = Number.isFinite(priceNum) ? priceNum : 0
      const is_free = price <= 0

      const payload = {
        title,
        description,
        date_time_event: dt,
        address: trimOrNull(this.form.address),
        organizer: trimOrNull(this.form.organizer),
        price,
        is_online: !!this.form.is_online,
        is_free,
        selectCategory: [...this.selectedCategories],

        // ✅ file + url
        photo_file: this.pickedFile || null,
        photo_url: trimOrNull(this.form.photo_url)
      }

      this.saving = true
      try {
        const { data, error } = await this.createBusinessEvent(payload)
        if (error) {
          this.error = String(error.message || error)
          return
        }

        // reset
        this.selectedCategories = []
        this.form = {
          title: '',
          description: '',
          date_time_event: '',
          address: '',
          organizer: '',
          price: '0',
          is_online: false,
          photo_url: ''
        }
        this.clearFile()

        this.$emit('created', data)
        this.$emit('close')
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.root { position: fixed; inset: 0; z-index: 10000; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,.38); backdrop-filter: blur(2px); }

.modal {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(760px, 94vw);
  max-height: 90vh;
  transform: translate(-50%, -50%);
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  box-shadow: 0 18px 60px rgba(0,0,0,.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.head {
  padding: 14px;
  border-bottom: 1px solid #f2f2f2;
  display: flex;
  align-items: center;
  gap: 12px;
}
.title { font-weight: 900; font-size: 16px; }
.x {
  margin-left: auto;
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
}

.body { padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }

.hint {
  background: #fcfcff;
  border: 1px solid rgba(138,117,227,.18);
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 13px;
  opacity: .9;
}

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }

.field { display: flex; flex-direction: column; gap: 6px; }
.field.inline { justify-content: flex-end; }

.label { font-size: 12px; font-weight: 800; opacity: .7; }
.input, .textarea {
  border: 1px solid #efefef;
  border-radius: 12px;
  padding: 10px 10px;
  font-size: 14px;
  background: #fff;
  outline: none;
}
.input:focus, .textarea:focus { border-color: rgba(138,117,227,.55); box-shadow: 0 0 0 3px rgba(138,117,227,.12); }
.textarea { min-height: 120px; resize: vertical; }

.mini { font-size: 12px; opacity: .7; line-height: 1.25; }
.badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(138,117,227,.12);
  border: 1px solid rgba(138,117,227,.22);
  width: fit-content;
}

.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 999px;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 13px;
}
.tag.active { background: #8a75e3; border-color: #8a75e3; color: #fff; }

/* toggle */
.check { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.check input { display: none; }
.ui {
  width: 44px; height: 26px; border-radius: 999px;
  border: 1px solid #e9e9e9; background: #f3f3f3;
  position: relative; transition: background 180ms ease, border-color 180ms ease;
}
.ui::after {
  content: '';
  width: 22px; height: 22px; border-radius: 999px;
  background: #fff; position: absolute; top: 1px; left: 1px;
  box-shadow: 0 2px 10px rgba(0,0,0,.08);
  transition: transform 180ms ease;
}
.check input:checked + .ui { background: rgba(138,117,227,.85); border-color: rgba(138,117,227,.55); }
.check input:checked + .ui::after { transform: translateX(18px); }
.text { font-weight: 800; font-size: 13px; }

.image-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.file-input { display: none; }
.file-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor: pointer;
}
.file-btn:hover { background: #fafafa; }
.file-clear {
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor: pointer;
}
.file-clear:hover { background: #f0f0f0; }

.preview {
  margin-top: 8px;
  border: 1px solid #efefef;
  border-radius: 16px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0;
  background: #fff;
}
.preview img {
  width: 140px;
  height: 110px;
  object-fit: cover;
  display: block;
  background: #f2f2f2;
}
.preview-meta { padding: 10px; display: grid; gap: 6px; align-content: center; }
.preview-name { font-weight: 900; font-size: 13px; word-break: break-word; }
.preview-sub { font-size: 12px; opacity: .7; }

.error { color: #d9534f; font-weight: 800; font-size: 13px; }

.foot {
  padding: 14px;
  border-top: 1px solid #f2f2f2;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn { border-radius: 14px; padding: 12px 16px; font-weight: 900; cursor: pointer; border: none; }
.btn.secondary { background: #efefef; }
.btn.primary { background: #8a75e3; color: #fff; }
.btn:disabled { opacity: .6; cursor: not-allowed; }
</style>
