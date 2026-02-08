<template>
  <div class="panel">
    <div class="head">
      <div class="title">Фильтры</div>
      <button class="reset" @click="$emit('reset')">Сбросить</button>
    </div>

    <!-- Categories -->
    <div class="block">
      <div class="label">Категории</div>

      <div class="tags">
        <button class="tag" :class="{ active: isAllCategoriesActive }" @click="selectAllCategories">
          Все
        </button>

        <button
          v-for="cat in categories"
          :key="cat.id"
          class="tag"
          :class="{ active: selectedCategoryNames.includes(cat.name) }"
          @click="toggleCategory(cat.name)"
        >
          {{ cat.name }}
        </button>
      </div>
    </div>

    <!-- Online -->
    <div class="block inline">
      <label class="check">
        <input type="checkbox" :checked="onlineOnly" @change="onToggleOnline" />
        <span class="ui"></span>
        <span class="text">Только онлайн</span>
      </label>
      <div class="hint">Показывает только мероприятия, где <b>is_online=true</b>.</div>
    </div>

    <div class="grid">
      <!-- PRICE -->
      <div class="card">
        <div class="cardTitle">Цена</div>

        <div class="seg">
          <button class="segBtn" :class="{ active: priceMode === 'all' }" @click="setPriceMode('all')">Любая</button>
          <button class="segBtn" :class="{ active: priceMode === 'free' }" @click="setPriceMode('free')">Бесплатно</button>
          <button class="segBtn" :class="{ active: priceMode === 'custom' }" @click="setPriceMode('custom')">Свой диапазон</button>
        </div>

        <div class="chips">
          <button class="chip" :class="{ active: priceMode === '100_1000' }" @click="setPriceMode('100_1000')">100–1000</button>
          <button class="chip" :class="{ active: priceMode === '1000_3000' }" @click="setPriceMode('1000_3000')">1000–3000</button>
          <button class="chip" :class="{ active: priceMode === '3000_10000' }" @click="setPriceMode('3000_10000')">3000–10000</button>
          <button class="chip" :class="{ active: priceMode === 'gt_10000' }" @click="setPriceMode('gt_10000')">&gt; 10000</button>
        </div>

        <div v-if="priceMode === 'custom'" class="row">
          <div class="field">
            <div class="fieldLabel">от</div>
            <input
              class="input"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="0"
              :value="customPriceMin"
              @input="$emit('update:customPriceMin', $event.target.value)"
            />
          </div>

          <div class="field">
            <div class="fieldLabel">до</div>
            <input
              class="input"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="∞"
              :value="customPriceMax"
              @input="$emit('update:customPriceMax', $event.target.value)"
            />
          </div>
        </div>

        <div class="hint">
          Если <b>is_free=true</b> или <b>price=0</b> — это “Бесплатно”.
        </div>
      </div>

      <!-- DATE -->
      <div class="card">
        <div class="cardTitle">Дата</div>

        <div class="seg">
          <button class="segBtn" :class="{ active: dateMode === 'all' }" @click="setDateMode('all')">Всё время</button>
          <button class="segBtn" :class="{ active: dateMode === 'on' }" @click="setDateMode('on')">На дату</button>
          <button class="segBtn" :class="{ active: dateMode === 'range' }" @click="setDateMode('range')">Диапазон</button>
        </div>

        <div class="chips">
          <button class="chip" :class="{ active: dateMode === 'after' }" @click="setDateMode('after')">После</button>
          <button class="chip" :class="{ active: dateMode === 'before' }" @click="setDateMode('before')">До</button>
          <button class="chip" :class="{ active: dateMode === 'next7' }" @click="setDateMode('next7')">След. 7 дней</button>
          <button class="chip" :class="{ active: dateMode === 'today' }" @click="setDateMode('today')">Сегодня</button>
        </div>

        <div v-if="dateMode === 'on'" class="row">
          <div class="field grow">
            <div class="fieldLabel">Дата</div>
            <input class="input" type="date" :value="dateOn" @input="$emit('update:dateOn', $event.target.value)" />
          </div>
        </div>

        <div v-else-if="dateMode === 'range'" class="row">
          <div class="field grow">
            <div class="fieldLabel">с</div>
            <input class="input" type="date" :value="dateFrom" @input="$emit('update:dateFrom', $event.target.value)" />
          </div>
          <div class="field grow">
            <div class="fieldLabel">по</div>
            <input class="input" type="date" :value="dateTo" @input="$emit('update:dateTo', $event.target.value)" />
          </div>
        </div>

        <div v-else-if="dateMode === 'after'" class="row">
          <div class="field grow">
            <div class="fieldLabel">После</div>
            <input class="input" type="date" :value="datePivot" @input="$emit('update:datePivot', $event.target.value)" />
          </div>
        </div>

        <div v-else-if="dateMode === 'before'" class="row">
          <div class="field grow">
            <div class="fieldLabel">До</div>
            <input class="input" type="date" :value="datePivot" @input="$emit('update:datePivot', $event.target.value)" />
          </div>
        </div>

        <div class="hint">Фильтрация по <b>date_time_event</b>.</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FiltersPanel',
  emits: [
    'reset',
    'update:selectedCategoryNames',
    'update:onlineOnly',
    'update:priceMode',
    'update:customPriceMin',
    'update:customPriceMax',
    'update:dateMode',
    'update:dateOn',
    'update:dateFrom',
    'update:dateTo',
    'update:datePivot'
  ],
  props: {
    categories: { type: Array, default: () => [] },

    selectedCategoryNames: { type: Array, default: () => [] },
    isAllCategoriesActive: { type: Boolean, default: true },

    onlineOnly: { type: Boolean, default: false },

    priceMode: { type: String, default: 'all' },
    customPriceMin: { type: String, default: '' },
    customPriceMax: { type: String, default: '' },

    dateMode: { type: String, default: 'all' },
    dateOn: { type: String, default: '' },
    dateFrom: { type: String, default: '' },
    dateTo: { type: String, default: '' },
    datePivot: { type: String, default: '' }
  },
  methods: {
    selectAllCategories() {
      this.$emit('update:selectedCategoryNames', [])
    },
    toggleCategory(name) {
      const n = String(name || '').trim()
      if (!n) return
      const next = [...this.selectedCategoryNames]
      const idx = next.indexOf(n)
      if (idx >= 0) next.splice(idx, 1)
      else next.push(n)
      this.$emit('update:selectedCategoryNames', next)
    },
    onToggleOnline(e) {
      this.$emit('update:onlineOnly', !!e.target.checked)
    },
    setPriceMode(mode) {
      this.$emit('update:priceMode', mode)
    },
    setDateMode(mode) {
      this.$emit('update:dateMode', mode)
    }
  }
}
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 12px; }

.head { display: flex; align-items: center; gap: 12px; }
.title { font-weight: 900; font-size: 16px; }
.reset {
  margin-left: auto;
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 13px;
}
.reset:hover { background: #f3f3f3; }

.block { border: 1px solid #f2f2f2; border-radius: 16px; padding: 12px; background: #fcfcfc; }
.inline { display: grid; gap: 8px; }

.label { font-weight: 800; font-size: 13px; opacity: .7; margin-bottom: 10px; }

.tags { display: flex; flex-wrap: wrap; gap: 10px; }
.tag {
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.tag.active { background: #8a75e3; border-color: #8a75e3; color: #fff; }

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
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  transition: transform 180ms ease;
}
.check input:checked + .ui { background: rgba(138,117,227,0.85); border-color: rgba(138,117,227,0.55); }
.check input:checked + .ui::after { transform: translateX(18px); }
.text { font-weight: 800; font-size: 13px; }
.hint { font-size: 12px; opacity: .7; line-height: 1.25; }

.grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.card { border: 1px solid #f2f2f2; border-radius: 16px; padding: 12px; background: #fcfcfc; }
.cardTitle { font-weight: 900; margin-bottom: 10px; }

.seg { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.segBtn {
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 13px;
}
.segBtn.active { background: rgba(138,117,227,0.12); border-color: rgba(138,117,227,0.4); }

.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.chip {
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 999px;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 13px;
}
.chip.active { background: #8a75e3; border-color: #8a75e3; color: #fff; }

.row { display: flex; gap: 10px; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 120px; }
.field.grow { flex: 1; min-width: 160px; }

.fieldLabel { font-size: 12px; opacity: .7; font-weight: 700; }
.input {
  border: 1px solid #efefef;
  border-radius: 12px;
  padding: 10px 10px;
  font-size: 14px;
  background: #fff;
  outline: none;
}
.input:focus { border-color: rgba(138,117,227,0.55); box-shadow: 0 0 0 3px rgba(138,117,227,0.12); }
</style>
