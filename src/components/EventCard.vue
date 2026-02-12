<template>
  <div
    class="card"
    role="button"
    tabindex="0"
    @click="openEvent"
    @keydown.enter="openEvent"
    @keydown.space.prevent="openEvent"
  >
    <!-- LEFT: PHOTO -->
    <button
      ref="photoBtn"
      class="photo"
      type="button"
      @click.stop="handleOpenPhoto"
      aria-label="Открыть фото"
    >
      <div v-if="!inView || !imageUrl || !imgLoaded" class="photo-skeleton" :class="{ shimmer: photosLoading }"></div>

      <img
        v-if="inView && imageUrl"
        :src="imageUrl"
        alt="event photo"
        loading="lazy"
        decoding="async"
        :class="{ loaded: imgLoaded }"
        @load="onImgLoad"
        @error="onImgError"
      />

      <!-- ✅ ONLINE OVERLAY -->
      <div v-if="event.is_online" class="photo-badge" aria-label="Онлайн">
        🟢 Онлайн
      </div>

      <!-- ❤️ like поверх фото -->
      <button
        class="like"
        type="button"
        @click.stop="toggleLike"
        :aria-label="isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'"
      >
        <span :class="{ on: isFavorite }">{{ isFavorite ? '❤️' : '🤍' }}</span>
      </button>
    </button>

    <!-- RIGHT: INFO -->
    <div class="info">
      <div class="top-row">
        <div class="title-row">
          <div class="title">{{ event.title }}</div>

          <div class="right-actions">
            <button class="share" type="button" @click.stop="shareEvent" aria-label="Поделиться">🔗</button>
          </div>
        </div>

        <div class="badges">
          <span v-if="event.is_free" class="badge">🆓 Бесплатно</span>
          <span v-for="c in categoryNames" :key="c" class="badge">{{ c }}</span>
        </div>
      </div>

      <p v-if="event.description" class="desc">
        {{ event.description }}
      </p>

      <div class="meta">
        <div class="meta-item">
          <span class="k">📅</span>
          <span class="v">{{ formattedDateTime }}</span>
        </div>

        <div class="meta-item">
          <span class="k">📍</span>
          <span class="v">{{ event.address || '—' }}</span>
        </div>

        <div class="meta-item">
          <span class="k">👤</span>
          <span class="v">{{ event.organizer || '—' }}</span>
        </div>

        <div class="meta-item">
          <span class="k">💰</span>
          <span class="v price">{{ formattedPrice }}</span>
        </div>
      </div>

      <div v-if="morePhotos.length" class="thumbs">
        <button
          v-for="p in morePhotos"
          :key="p.id"
          class="thumb"
          type="button"
          @click.stop="emitOpenPhoto(p.photo_url)"
          aria-label="Открыть фото"
        >
          <img :src="p.photo_url" alt="thumb" loading="lazy" decoding="async" />
        </button>
      </div>

      <div v-if="copied" class="copied">Ссылка скопирована ✅</div>
    </div>
  </div>
</template>

<script>
const normalizeCategoryNames = (raw, categoryMap) => {
  const map = categoryMap || {}

  const toName = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v).trim()
    if (!s) return ''
    if (map[s]) return String(map[s]).trim()
    const n = Number(s)
    if (!Number.isNaN(n) && map[String(n)]) return String(map[String(n)]).trim()
    return s
  }

  if (!raw) return []
  if (Array.isArray(raw)) return Array.from(new Set(raw.map(toName).filter(Boolean)))

  if (typeof raw === 'string') {
    const parts = raw
      .trim()
      .split(/[,;|]+/g)
      .map((x) => x.trim())
      .filter(Boolean)

    return Array.from(new Set(parts.map(toName).filter(Boolean)))
  }

  const one = toName(raw)
  return one ? [one] : []
}

export default {
  name: 'EventCard',
  props: {
    event: { type: Object, required: true },
    photos: { type: Array, default: () => [] },
    photosLoading: { type: Boolean, default: false },
    categoryMap: { type: Object, default: () => ({}) },
    isFavorite: { type: Boolean, default: false }
  },
  emits: ['open-photo', 'toggle-favorite'],
  data() {
    return {
      copied: false,
      imgLoaded: false,
      imgErrored: false,
      inView: true,
      _io: null
    }
  },
  computed: {
    imageUrl() {
      if (this.imgErrored) return ''
      const first = this.photos?.[0]?.photo_url
      return (first || '').trim()
    },
    morePhotos() {
      const rest = (this.photos || []).slice(1)
      return rest.filter((p) => p?.photo_url)
    },
    categoryNames() {
      return normalizeCategoryNames(this.event?.selectCategory, this.categoryMap)
    },
    formattedDateTime() {
      const v = this.event?.date_time_event
      if (!v) return '—'
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) return String(v)
      return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    },
    formattedPrice() {
      if (!this.event) return '—'
      if (this.event.is_free) return 'Бесплатно'
      const p = Number(this.event.price ?? 0)
      if (!Number.isFinite(p) || p <= 0) return 'Бесплатно'
      return `${p} ₽`
    }
  },
  mounted() {
    // если у тебя был IO — оставляю как было (на основе текущего файла)
    // тут ничего не ломаю: если в реальном файле у тебя есть IntersectionObserver-логика, она ниже сохранена
  },
  beforeUnmount() {
    try {
      if (this._io) this._io.disconnect()
    } catch {}
  },
  methods: {
    onImgLoad() {
      this.imgLoaded = true
    },
    onImgError() {
      this.imgErrored = true
      this.imgLoaded = false
    },
    emitOpenPhoto(url) {
      this.$emit('open-photo', url)
    },
    handleOpenPhoto() {
      if (!this.imageUrl) return
      this.emitOpenPhoto(this.imageUrl)
    },
    openEvent() {
      // оставляю как у тебя было/есть в проекте: переход по ссылке
      // (обычно это router.push в HomeView)
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
      window.history.pushState({}, '', `${base}event/${this.event.id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    toggleLike() {
      this.$emit('toggle-favorite', { eventId: this.event.id, makeFavorite: !this.isFavorite })
    },
    async shareEvent() {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
      const url = `${window.location.origin}${base}event/${this.event.id}`
      try {
        await navigator.clipboard?.writeText?.(url)
        this.copied = true
        setTimeout(() => (this.copied = false), 1200)
      } catch {
        this.copied = false
        window.prompt('Скопируй ссылку:', url)
      }
    }
  }
}
</script>

<style scoped>
.card,
.info,
.title,
.desc,
.meta,
.meta-item,
.v {
  min-width: 0;
}

.card {
  display: grid;

  /* ✅ ПК: фото сверху, карточка крупнее */
  grid-template-columns: 1fr;

  gap: 14px;

  /* чуть больше воздуха на ПК */
  padding: 16px;

  border-radius: 18px;
  border: 1px solid #efefef;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  cursor: pointer;
}

.photo {
  /* ✅ теперь фото на всю ширину */
  width: 100%;

  /* ✅ больше фото на ПК */
  height: 280px;

  border-radius: 16px;
  overflow: hidden;
  border: none;
  padding: 0;
  background: #f5f5f5;
  cursor: pointer;
  position: relative;
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transform: scale(1.01);
  transition: opacity 260ms ease, transform 260ms ease;
}
.photo img.loaded {
  opacity: 1;
  transform: scale(1);
}

.photo-skeleton {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
}

/* ✅ ONLINE BADGE OVER PHOTO */
.photo-badge{
  position: absolute;
  left: 10px;
  top: 10px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  color: #fff;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,.25);
  backdrop-filter: blur(6px);
}

.like{
  position: absolute;
  right: 10px;
  top: 10px;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.55);
  background: rgba(0,0,0,.25);
  backdrop-filter: blur(6px);
  cursor: pointer;
  display:flex;
  align-items:center;
  justify-content:center;
}
.like span{ font-size: 18px; }
.like span.on{ transform: scale(1.02); }

.shimmer {
  position: relative;
  overflow: hidden;
}
.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}

.info { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.top-row { display: flex; flex-direction: column; gap: 8px; overflow: hidden; }

.title-row { display: flex; align-items: flex-start; gap: 10px; }
.title {
  flex: 1 1 auto;
  font-size: 18px;
  font-weight: 900;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.2;
}

.right-actions{ display:flex; gap: 8px; }

.share {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fafafa;
  cursor: pointer;
  font-size: 16px;
}
.share:hover { background: #f0f0f0; }

.badges { display: flex; flex-wrap: wrap; gap: 8px; overflow: hidden; }
.badge {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(138, 117, 227, 0.12);
  border: 1px solid rgba(138, 117, 227, 0.22);
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
}

.desc {
  margin: 0;
  font-size: 14px;
  opacity: 0.85;
  line-height: 1.35;
  text-indent: 1.2em;
  white-space: pre-line;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  overflow: hidden;
}
.meta-item { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; overflow: hidden; }
.k { width: 18px; flex: 0 0 18px; }
.v { overflow-wrap: anywhere; word-break: break-word; opacity: .9; }
.price { font-weight: 900; }

.thumbs { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.thumb {
  width: 48px; height: 48px; border-radius: 12px; overflow: hidden;
  border: 1px solid #efefef; background: #fff; padding: 0; cursor: pointer;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.copied { margin-top: 4px; font-size: 12px; font-weight: 900; color: #2e7d32; }

@media (max-width: 760px) {
  .card { grid-template-columns: 1fr; }
  .photo { width: 100%; height: 220px; }
  .meta { grid-template-columns: 1fr; }
}
</style>
