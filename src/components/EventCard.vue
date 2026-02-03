<template>
  <div class="card">
    <!-- LEFT: PHOTO -->
    <button ref="photoBtn" class="photo" @click="handleOpenPhoto" aria-label="Открыть фото">
      <div
        v-if="!inView || !imageUrl || !imgLoaded"
        class="photo-skeleton"
        :class="{ shimmer: photosLoading }"
      ></div>

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
    </button>

    <!-- RIGHT: INFO -->
    <div class="info">
      <div class="top-row">
        <div class="title">{{ event.title }}</div>

        <div class="badges">
          <span v-if="event.is_online" class="badge">🟢 Онлайн</span>
          <span v-if="event.is_free" class="badge">🆓 Бесплатно</span>

          <!-- ✅ категории только по ИМЕНАМ -->
          <span v-for="c in categoryNames" :key="c" class="badge">
            {{ c }}
          </span>
        </div>
      </div>

      <!-- Описание: с абзаца -->
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
          @click="emitOpenPhoto(p.photo_url)"
          aria-label="Открыть фото"
        >
          <img :src="p.photo_url" alt="thumb" loading="lazy" decoding="async" />
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// тот же “нормализатор”: селектКатегори -> имена
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

  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map(toName).filter(Boolean)))
  }

  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    const parts = s
      .split(/[,;|]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .map(toName)
      .filter(Boolean)
    return Array.from(new Set(parts))
  }

  const one = toName(raw)
  return one ? [one] : []
}

export default {
  name: 'EventCard',
  emits: ['open-photo'],
  props: {
    event: { type: Object, required: true },
    photos: { type: Array, default: () => [] },
    photosLoading: { type: Boolean, default: false },
    // если вдруг selectCategory когда-нибудь станет id — мапа спасёт
    categoryMap: { type: Object, default: () => ({}) }
  },
  computed: {
    imageUrl() {
      const first = Array.isArray(this.photos) ? this.photos[0] : null
      return (first?.photo_url || '').trim()
    },
    morePhotos() {
      if (!Array.isArray(this.photos)) return []
      return this.photos.slice(1, 6).filter((p) => p?.photo_url)
    },
    categoryNames() {
      return normalizeCategoryNames(this.event?.selectCategory, this.categoryMap)
    },
    formattedDateTime() {
      if (!this.event?.date_time_event) return '—'
      const d = new Date(this.event.date_time_event)
      if (Number.isNaN(d.getTime())) return String(this.event.date_time_event)
      return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    formattedPrice() {
      if (this.event?.is_free) return 'Бесплатно'
      if (this.event?.price === 0 || this.event?.price === null) return 'Бесплатно'
      return `${this.event.price} ₽`
    }
  },
  data() {
    return {
      inView: false,
      imgLoaded: false,
      io: null
    }
  },
  watch: {
    imageUrl() {
      this.imgLoaded = false
    }
  },
  mounted() {
    const el = this.$refs.photoBtn
    if (!el || typeof window === 'undefined') {
      this.inView = true
      return
    }

    if (!('IntersectionObserver' in window)) {
      this.inView = true
      return
    }

    this.io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          this.inView = true
          if (this.io) {
            this.io.disconnect()
            this.io = null
          }
        }
      },
      { root: null, rootMargin: '250px 0px', threshold: 0.01 }
    )

    this.io.observe(el)
  },
  beforeUnmount() {
    if (this.io) {
      this.io.disconnect()
      this.io = null
    }
  },
  methods: {
    onImgLoad() {
      this.imgLoaded = true
    },
    onImgError() {
      this.imgLoaded = true
    },
    emitOpenPhoto(url) {
      if (!url) return
      this.$emit('open-photo', url)
    },
    handleOpenPhoto() {
      if (!this.imageUrl) return
      this.emitOpenPhoto(this.imageUrl)
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
  grid-template-columns: 220px 1fr;
  gap: 14px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid #efefef;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.photo {
  width: 220px;
  height: 160px;
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

.info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.top-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.title {
  font-size: 18px;
  font-weight: 900;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.2;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow: hidden;
}

.badge {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(138, 117, 227, 0.12);
  border: 1px solid rgba(138, 117, 227, 0.22);
  white-space: normal;
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

.meta-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
  overflow: hidden;
}

.k {
  width: 18px;
  opacity: 0.9;
  flex: 0 0 18px;
}

.v {
  opacity: 0.9;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.price {
  font-weight: 900;
}

.thumbs {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.thumb {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #efefef;
  background: #fff;
  padding: 0;
  cursor: pointer;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@media (max-width: 760px) {
  .card {
    grid-template-columns: 1fr;
  }
  .photo {
    width: 100%;
    height: 200px;
  }
  .meta {
    grid-template-columns: 1fr;
  }
}
</style>