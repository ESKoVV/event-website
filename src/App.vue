<template>
  <div id="app">
    <!-- Header -->
    <header class="header">
      <div class="header-container">
        <div class="header-left">
          <button class="menu-button">
            <div class="menu-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          <div class="search-container">
            <div class="search-icon">🔍</div>
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Поиск"
              class="search-input"
              @input="handleSearch"
            />
          </div>
        </div>

        <button class="profile-button">
          <div class="profile-icon">👤</div>
        </button>
      </div>
    </header>

    <!-- Categories Filter -->
    <div class="tags-container">
      <div class="tags-content">
        <button
          class="tag-button"
          :class="{ active: selectedCategory === 'all' }"
          @click="selectCategory('all')"
        >
          Все
        </button>

        <button
          v-for="cat in categories"
          :key="cat.id"
          class="tag-button"
          :class="{ active: selectedCategory === cat.id }"
          @click="selectCategory(cat.id)"
        >
          {{ cat.name }}
        </button>
      </div>
    </div>

    <!-- Events List -->
    <main class="main-content">
      <div class="events-grid">
        <EventCard
          v-for="event in filteredEvents"
          :key="event.id"
          :event="event"
          @select-event="selectEvent"
        />

        <div v-if="loading" class="loading">
          Загрузка мероприятий...
        </div>

        <div v-if="!loading && filteredEvents.length === 0" class="no-events">
          Мероприятия не найдены
        </div>
      </div>
    </main>

    <!-- Event Modal -->
    <EventModal
      :event="selectedEvent"
      :is-visible="showModal"
      @close="closeModal"
    />
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue'
import EventCard from './components/EventCard.vue'
import EventModal from './components/EventModal.vue'
import { useSupabase } from './composables/useSupabase'

export default {
  name: 'App',
  components: { EventCard, EventModal },
  setup() {
    const { getEvents, getCategories, getEventPhotos } = useSupabase()

    const events = ref([])
    const categories = ref([])
    const categoryMap = ref(new Map())

    const loading = ref(true)
    const searchTerm = ref('')
    const selectedCategory = ref('all')

    const selectedEvent = ref(null)
    const showModal = ref(false)

    const parseSelectCategory = (value) => {
      // поддержка вариантов:
      // - null
      // - число / строка (одна категория)
      // - массив (Postgres array)
      // - JSON-строка "[1,2]"
      if (value == null) return []

      if (Array.isArray(value)) {
        return value
          .map((v) => (typeof v === 'string' ? v.trim() : v))
          .filter((v) => v !== '' && v != null)
      }

      if (typeof value === 'string') {
        const s = value.trim()
        if (!s) return []
        if (s.startsWith('[') && s.endsWith(']')) {
          try {
            const parsed = JSON.parse(s)
            return Array.isArray(parsed) ? parsed : [parsed]
          } catch {
            // если JSON сломан — считаем как одиночное значение
            return [s]
          }
        }
        return [s]
      }

      return [value]
    }

    const buildCategoryMap = (cats) => {
      const m = new Map()
      for (const c of cats || []) m.set(String(c.id), c.name)
      categoryMap.value = m
    }

    const mergePhotosIntoEvents = (rawEvents, photos) => {
      const byEventId = new Map()
      for (const p of photos || []) {
        const key = String(p.event_id)
        if (!byEventId.has(key)) byEventId.set(key, [])
        byEventId.get(key).push(p)
      }

      return (rawEvents || []).map((e) => {
        const idKey = String(e.id)
        const evPhotos = byEventId.get(idKey) || []
        const cover = evPhotos[0]?.photo_url || null

        const categoryIds = parseSelectCategory(e.selectCategory).map((x) => String(x))
        const categoryNames = categoryIds.map((cid) => categoryMap.value.get(cid)).filter(Boolean)

        const priceNum = e.price == null ? null : Number(e.price)
        const computedFree = priceNum === 0

        return {
          ...e,
          // нормализуем, чтобы компоненты не ломались
          title: e.title ?? e.name ?? '',
          address: e.address ?? e.adress ?? '',
          image_url: cover, // главное: фото из event_photos
          category_ids: categoryIds,
          category_names: categoryNames,
          is_online: Boolean(e.is_online),
          is_free: typeof e.is_free === 'boolean' ? e.is_free : computedFree
        }
      })
    }

    const sortedEvents = computed(() => {
      return [...events.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    })

    const filteredEvents = computed(() => {
      let result = sortedEvents.value

      const term = searchTerm.value.trim().toLowerCase()
      if (term) {
        result = result.filter((event) => (event.title || '').toLowerCase().includes(term))
      }

      if (selectedCategory.value !== 'all') {
        const wanted = String(selectedCategory.value)
        result = result.filter((event) => (event.category_ids || []).includes(wanted))
      }

      return result
    })

    const loadCategories = async () => {
      const { data, error } = await getCategories()
      if (error) throw error
      categories.value = data || []
      buildCategoryMap(categories.value)
    }

    const loadEvents = async () => {
      loading.value = true
      try {
        // 1) грузим события
        const { data: ev, error: evErr } = await getEvents()
        if (evErr) throw evErr

        const ids = (ev || []).map((x) => x.id)

        // 2) грузим фото отдельно (работает даже без relation)
        const { data: ph, error: phErr } = await getEventPhotos(ids)
        if (phErr) throw phErr

        // 3) склеиваем
        events.value = mergePhotosIntoEvents(ev || [], ph || [])
      } catch (e) {
        console.error('Error loading events:', e)
        events.value = []
      } finally {
        loading.value = false
      }
    }

    const selectCategory = (categoryId) => {
      selectedCategory.value = categoryId
      // фильтрация локальная — без повторных запросов
    }

    const handleSearch = () => {
      // поиск локальный через computed
    }

    const selectEvent = (event) => {
      selectedEvent.value = event
      showModal.value = true
    }

    const closeModal = () => {
      showModal.value = false
      selectedEvent.value = null
    }

    onMounted(async () => {
      loading.value = true
      try {
        await loadCategories()
        await loadEvents()
      } catch (e) {
        console.error('Init error:', e)
      } finally {
        loading.value = false
      }
    })

    return {
      filteredEvents,
      categories,
      loading,
      searchTerm,
      selectedCategory,
      selectedEvent,
      showModal,
      handleSearch,
      selectCategory,
      selectEvent,
      closeModal
    }
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Arial', sans-serif;
  background-color: #EFEFEF;
  color: #14181B;
}

#app {
  min-height: 100vh;
}

.header {
  background: #FFFFFF;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.menu-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #FFFFFF;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.menu-button:hover {
  background: #F5F5F5;
}

.menu-icon {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.menu-icon span {
  width: 18px;
  height: 2px;
  background: #14181B;
  border-radius: 1px;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  font-size: 14px;
  opacity: 0.6;
}

.search-input {
  width: 300px;
  padding: 10px 12px 10px 36px;
  border: 2px solid #EFEFEF;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.search-input:focus {
  border-color: #8A75E3;
}

.profile-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #FFFFFF;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.profile-button:hover {
  background: #F5F5F5;
}

.profile-icon {
  font-size: 18px;
}

.tags-container {
  background: #FFFFFF;
  border-bottom: 1px solid #EFEFEF;
}

.tags-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.tag-button {
  padding: 8px 16px;
  border: 2px solid #EFEFEF;
  border-radius: 20px;
  background: #FFFFFF;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.tag-button:hover {
  border-color: #8A75E3;
}

.tag-button.active {
  background: #8A75E3;
  border-color: #8A75E3;
  color: #FFFFFF;
}

.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.loading,
.no-events {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 0;
  color: #666;
}

@media (max-width: 768px) {
  .search-input {
    width: 220px;
  }
}
</style>
