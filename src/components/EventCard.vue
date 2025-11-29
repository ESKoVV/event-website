<template>
  <div 
    class="event-card" 
    :class="{ 'no-image': !event.image_path }"
    @click="$emit('select-event', event)"
    :style="cardStyle"
  >
    <div class="event-overlay"></div>
    
    <div class="event-info">
      <h3 class="event-name">{{ event.name }}</h3>
      
      <div class="event-details">
        <div class="detail-item">
          <span class="detail-label">📅</span>
          <span class="detail-value">{{ formattedDateTime }}</span>
        </div>
        
        <div class="detail-item">
          <span class="detail-label">📍</span>
          <span class="detail-value">{{ event.adress }}</span>
        </div>
        
        <div class="detail-item">
          <span class="detail-label">💰</span>
          <span class="detail-value price">{{ formattedPrice }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EventCard',
  props: {
    event: {
      type: Object,
      required: true
    }
  },
  computed: {
    formattedDateTime() {
      if (!this.event.date_time_event) return ''
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
      if (this.event.price === 0 || this.event.price === null) {
        return 'Бесплатно'
      }
      return `${this.event.price} ₽`
    },
    cardStyle() {
      if (this.event.image_path) {
        return {
          backgroundImage: `url(${this.event.image_path})`
        }
      }
      return {}
    }
  }
}
</script>

<style scoped>
.event-card {
  position: relative;
  background: #FFFFFF;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 20px;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  
  /* Квадратный размер */
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: 300px;
  
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.event-card.no-image {
  background: #FFFFFF;
  border: 2px solid #EFEFEF;
}

.event-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.event-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 70%;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.8) 0%,
    rgba(0, 0, 0, 0.6) 50%,
    rgba(0, 0, 0, 0) 100%
  );
  z-index: 1;
}

.event-card.no-image .event-overlay {
  background: linear-gradient(
    to top,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(255, 255, 255, 0) 100%
  );
}

.event-info {
  position: relative;
  z-index: 2;
  padding: 24px;
  width: 100%;
  color: #FFFFFF;
}

.event-card.no-image .event-info {
  color: #14181B;
}

.event-name {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 16px 0;
  line-height: 1.3;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.event-card.no-image .event-name {
  text-shadow: none;
}

.event-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-label {
  font-size: 14px;
  min-width: 20px;
}

.detail-value {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.event-card.no-image .detail-value {
  text-shadow: none;
}

.detail-value.price {
  font-weight: 600;
  color: #8A75E3;
}

.event-card.no-image .detail-value.price {
  color: #8A75E3;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .event-card {
    border-radius: 16px;
    min-height: 250px;
  }
  
  .event-info {
    padding: 20px;
  }
  
  .event-name {
    font-size: 18px;
    margin-bottom: 12px;
  }
  
  .detail-value {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .event-card {
    min-height: 200px;
  }
  
  .event-info {
    padding: 16px;
  }
  
  .event-name {
    font-size: 16px;
    margin-bottom: 10px;
  }
  
  .detail-value {
    font-size: 12px;
  }
}
</style>