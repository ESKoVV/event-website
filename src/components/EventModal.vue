<template>
  <div v-if="isVisible" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <button class="close-button" @click="close">×</button>

      <div class="event-image" v-if="event?.image_url">
        <img :src="event.image_url" :alt="event?.title || 'event'" />
      </div>

      <div class="top-badges" v-if="hasBadges">
        <span v-if="event.is_online" class="badge">🟢 Онлайн</span>
        <span v-if="event.is_free" class="badge">🆓 Бесплатно</span>
        <span v-for="(c, idx) in event.category_names" :key="idx" class="badge">
          {{ c }}
        </span>
      </div>

      <h2 class="event-title">{{ event?.title }}</h2>

      <div class="event-details">
        <div class="detail-item">
          <span class="detail-label">Дата и время:</span>
          <span class="detail-value">{{ formattedDateTime }}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Адрес:</span>
          <span class="detail-value">{{ safeAddress }}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Организатор:</span>
          <span class="detail-value">{{ event?.organizer }}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Цена:</span>
          <span class="detail-value price">{{ formattedPrice }}</span>
        </div>
      </div>

      <div class="event-description">
        <h3>Описание</h3>
        <p>{{ event?.description }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EventModal',
  props: {
    event: { type: Object, default: null },
    isVisible: { type: Boolean, default: false }
  },
  computed: {
    formattedDateTime() {
      if (!this.event?.date_time_event) return ''
      const date = new Date(this.event.date_time_event)
      return date.toLocaleString('ru-RU', {
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
    },
    safeAddress() {
      return this.event?.address || this.event?.adress || ''
    },
    hasBadges() {
      return Boolean(
        this.event?.is_online ||
          this.event?.is_free ||
          (Array.isArray(this.event?.category_names) && this.event.category_names.length > 0)
      )
    }
  },
  methods: {
    close() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 30px;
  max-width: 650px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.close-button {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #14181B;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.close-button:hover {
  background: #EFEFEF;
}

.event-image {
  width: 100%;
  height: 220px;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
}

.event-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.top-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.badge {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(138, 117, 227, 0.12);
  border: 1px solid rgba(138, 117, 227, 0.22);
  color: #14181B;
}

.event-title {
  color: #14181B;
  margin: 0 0 18px 0;
  font-size: 24px;
  font-weight: 700;
}

.event-details {
  margin-bottom: 24px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #EFEFEF;
  gap: 16px;
}

.detail-label {
  font-weight: 600;
  color: #666;
  flex: 0 0 auto;
}

.detail-value {
  color: #14181B;
  font-weight: 600;
  text-align: right;
}

.detail-value.price {
  color: #8A75E3;
  font-weight: 800;
}

.event-description h3 {
  color: #14181B;
  margin: 0 0 12px 0;
  font-size: 18px;
}

.event-description p {
  color: #14181B;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}
</style>
