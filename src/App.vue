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

    <!-- Tags Filter -->
    <div class="tags-container">
      <div class="tags-content">
        <button 
          class="tag-button" 
          :class="{ active: selectedTag === 'all' }"
          @click="selectTag('all')"
        >
          Все
        </button>
        <button 
          v-for="tag in tags" 
          :key="tag.id"
          class="tag-button" 
          :class="{ active: selectedTag === tag.id }"
          @click="selectTag(tag.id)"
        >
          {{ tag.name }}
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
  components: {
    EventCard,
    EventModal
  },
  setup() {
    const { getEvents, searchEvents, getTags, getEventsByTag } = useSupabase()
    
    const events = ref([])
    const tags = ref([])
    const loading = ref(true)
    const searchTerm = ref('')
    const selectedTag = ref('all')
    const selectedEvent = ref(null)
    const showModal = ref(false)

    const sortedEvents = computed(() => {
      return [...events.value].sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at)
      })
    })

    const filteredEvents = computed(() => {
      let result = sortedEvents.value
      
      if (searchTerm.value.trim() !== '') {
        result = result.filter(event => 
          event.name.toLowerCase().includes(searchTerm.value.toLowerCase())
        )
      }
      
      return result
    })

    const loadEvents = async () => {
      loading.value = true
      try {
        const { data, error } = await getEvents()
        if (error) throw error
        events.value = data || []
      } catch (error) {
        console.error('Error loading events:', error)
        events.value = []
      } finally {
        loading.value = false
      }
    }

    const loadTags = async () => {
      try {
        const { data, error } = await getTags()
        if (error) throw error
        tags.value = data || []
      } catch (error) {
        console.error('Error loading tags:', error)
        tags.value = []
      }
    }

    const selectTag = async (tagId) => {
      selectedTag.value = tagId
      loading.value = true
      
      try {
        if (tagId === 'all') {
          await loadEvents()
        } else {
          const { data, error } = await getEventsByTag(tagId)
          if (error) throw error
          events.value = data || []
        }
      } catch (error) {
        console.error('Error loading events by tag:', error)
        events.value = []
      } finally {
        loading.value = false
      }
    }

    const handleSearch = () => {
      // Поиск работает локально через computed свойство
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
      await Promise.all([loadEvents(), loadTags()])
    })

    return {
      filteredEvents,
      tags,
      loading,
      searchTerm,
      selectedTag,
      selectedEvent,
      showModal,
      handleSearch,
      selectTag,
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
  width: 18px;
}

.menu-icon span {
  height: 2px;
  background: #14181B;
  border-radius: 1px;
}

.menu-icon span:nth-child(1) {
  width: 18px;
}

.menu-icon span:nth-child(2) {
  width: 14px;
}

.menu-icon span:nth-child(3) {
  width: 10px;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  border: 2px solid #D0AE7A;
  border-radius: 25px;
  padding: 8px 16px;
  background: #FFFFFF;
  min-width: 250px;
}

.search-icon {
  margin-right: 8px;
  color: #14181B;
}

.search-input {
  border: none;
  outline: none;
  background: transparent;
  color: #14181B;
  font-size: 14px;
  width: 100%;
}

.search-input::placeholder {
  color: #666;
}

.profile-button {
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

.profile-button:hover {
  background: #F5F5F5;
}

.profile-icon {
  font-size: 18px;
  color: #14181B;
}

.tags-container {
  background: #EFEFEF;
  padding: 20px 0;
}

.tags-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  gap: 12px;
  overflow-x: auto;
}

.tag-button {
  background: #FFFFFF;
  border: none;
  border-radius: 20px;
  padding: 10px 20px;
  color: #14181B;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 500;
}

.tag-button:hover {
  background: #F5F5F5;
}

.tag-button.active {
  background: #8A75E3;
  color: #FFFFFF;
}

.main-content {
  padding: 20px;
}

.events-grid {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  padding: 0 20px;
}

.loading, .no-events {
  text-align: center;
  padding: 60px 40px;
  color: #666;
  background: #FFFFFF;
  border-radius: 16px;
  font-size: 18px;
  grid-column: 1 / -1;
}

@media (max-width: 768px) {
  .header-container {
    padding: 12px 16px;
  }
  
  .search-container {
    min-width: 200px;
  }
  
  .tags-content {
    padding: 0 16px;
  }
  
  .tags-container {
    padding: 16px 0;
  }
  
  .main-content {
    padding: 16px;
  }
  
  .events-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
    padding: 0;
  }
}

@media (max-width: 480px) {
  .events-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>