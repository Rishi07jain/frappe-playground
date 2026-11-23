<template>
  <header class="ec-bar" role="banner">
    <div class="ec-bar-left">
      <span class="ec-dots" aria-hidden="true"><i /><i /><i /></span>
      <span class="ec-live">Live demo · sample data</span>
    </div>

    <div class="ec-bar-title">Frappe Experience Center</div>

    <div class="ec-bar-right">
      <div ref="menuWrap" class="ec-menu-wrap">
        <button
          type="button"
          class="ec-btn ec-btn-soft"
          :disabled="!ready || tourRunning"
          :aria-expanded="menuOpen"
          aria-haspopup="dialog"
          @click="toggleMenu"
        >
          <Play class="h-3.5 w-3.5" aria-hidden="true" />
          <span>Guided tours</span>
        </button>

        <div v-if="menuOpen" class="ec-menu" role="dialog" aria-label="Guided tours">
          <div class="ec-menu-head">
            <div class="ec-menu-title">Guided tours</div>
            <p class="ec-menu-sub">Pick a tour and watch ERPNext do the work. Each step plays on its own; press Next to move on.</p>
          </div>
          <div class="ec-menu-body">
            <div class="ec-tabs" role="tablist" aria-label="Modules">
              <button
                v-for="m in modules"
                :key="m.key"
                type="button"
                role="tab"
                class="ec-tab"
                :class="{ 'is-on': m.key === tab }"
                :aria-selected="m.key === tab"
                @click.stop="tab = m.key"
              >
                <span>{{ m.label }}</span>
                <small>{{ counts[m.key]?.done || 0 }}/{{ counts[m.key]?.all || 0 }}</small>
              </button>
            </div>
            <ol class="ec-tours">
              <li v-for="(t, i) in toursInTab" :key="t.id" class="ec-tour">
                <span class="ec-tour-n" :class="{ 'is-done': doneTours.includes(t.id) }">
                  <Check v-if="doneTours.includes(t.id)" class="h-3 w-3" aria-hidden="true" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <div class="ec-tour-copy">
                  <div class="ec-tour-title">{{ t.title }}</div>
                  <div class="ec-tour-blurb">{{ t.blurb }}</div>
                </div>
                <button type="button" class="ec-btn ec-btn-soft ec-btn-sm" @click="start(t.id)">
                  Start <Play class="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <button type="button" class="ec-btn ec-btn-ghost" :disabled="!ready || tourRunning" @click="$emit('reset')">
        <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
        <span class="ec-hide-sm">Reset</span>
      </button>
      <button type="button" class="ec-btn ec-btn-ghost" @click="$emit('feedback')">
        <MessageCircle class="h-3.5 w-3.5" aria-hidden="true" />
        <span class="ec-hide-sm">Feedback</span>
      </button>
      <button
        type="button"
        class="ec-btn ec-btn-ghost ec-btn-icon"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="$emit('toggle-theme')"
      >
        <Sun v-if="theme === 'dark'" class="h-3.5 w-3.5" aria-hidden="true" />
        <Moon v-else class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <a class="ec-btn ec-btn-dark" :href="trialUrl" target="_blank" rel="noopener">
        <span>Start free trial</span>
        <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, Check, MessageCircle, Moon, Play, RotateCcw, Sun } from '@lucide/vue'

const props = defineProps({
  ready: { type: Boolean, default: false },
  tourRunning: { type: Boolean, default: false },
  modules: { type: Array, required: true },
  tours: { type: Array, required: true },
  counts: { type: Object, required: true },
  doneTours: { type: Array, required: true },
  theme: { type: String, default: 'light' },
  trialUrl: { type: String, required: true },
})
const emit = defineEmits(['start-tour', 'reset', 'feedback', 'toggle-theme'])

const menuOpen = ref(false)
const menuWrap = ref(null)
const tab = ref(props.modules[0]?.key || '')
const toursInTab = computed(() => props.tours.filter(t => t.module === tab.value))

function toggleMenu() {
  if (props.tourRunning) return
  menuOpen.value = !menuOpen.value
}
function start(id) {
  menuOpen.value = false
  emit('start-tour', id)
}
function onDocClick(e) {
  if (menuOpen.value && menuWrap.value && !e.composedPath().includes(menuWrap.value)) menuOpen.value = false
}
function onKey(e) {
  if (e.key === 'Escape' && menuOpen.value) menuOpen.value = false
}
watch(() => props.tourRunning, running => { if (running) menuOpen.value = false })
onMounted(() => {
  document.addEventListener('pointerdown', onDocClick, true)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocClick, true)
  document.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.ec-bar {
  position: relative; z-index: 40; flex: 0 0 auto;
  height: 54px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
  padding: 0 14px; background: #F3F3F3; border-bottom: 1px solid #E2E2E2; color: #171717;
  font-family: "InterVar", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:global(.dark) .ec-bar { background: #202020; border-bottom-color: #2C2C2C; color: #F2F2F2; }

.ec-bar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.ec-dots { display: flex; gap: 6px; }
.ec-dots i { width: 10px; height: 10px; border-radius: 50%; background: #DADADA; display: block; }
:global(.dark) .ec-dots i { background: #3A3A3A; }
.ec-live { font-size: 12px; color: #7C7C7C; white-space: nowrap; }
@media (max-width: 1100px) { .ec-live { display: none; } }

.ec-bar-title { font-weight: 600; font-size: 16px; letter-spacing: -0.01em; white-space: nowrap; }

.ec-bar-right { display: flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }

.ec-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px;
  font-size: 14px; line-height: 1; border: 0; background: transparent; color: inherit; cursor: pointer;
  text-decoration: none; white-space: nowrap; transition: background .15s;
}
.ec-btn:disabled { opacity: .5; cursor: default; }
.ec-btn:focus-visible { outline: 2px solid #0289F7; outline-offset: 1px; }
.ec-btn-ghost { color: #383838; }
.ec-btn-ghost:hover:not(:disabled) { background: #EBEBEB; }
.ec-btn-soft { background: #FFFFFF; color: #383838; box-shadow: 0 0 0 1px #E2E2E2; }
.ec-btn-soft:hover:not(:disabled) { background: #F8F8F8; }
.ec-btn-dark { background: #171717; color: #FFFFFF; margin-left: 6px; }
.ec-btn-dark:hover { background: #2E2E2E; }
.ec-btn-icon { width: 28px; padding: 0; justify-content: center; }
.ec-btn-sm { height: 26px; font-size: 13px; padding: 0 8px; }
:global(.dark) .ec-btn-ghost { color: #CFCFCF; }
:global(.dark) .ec-btn-ghost:hover:not(:disabled) { background: #2E2E2E; }
:global(.dark) .ec-btn-soft { background: #262626; color: #CFCFCF; box-shadow: 0 0 0 1px #2C2C2C; }
:global(.dark) .ec-btn-soft:hover:not(:disabled) { background: #2E2E2E; }
:global(.dark) .ec-btn-dark { background: #F2F2F2; color: #171717; }
:global(.dark) .ec-btn-dark:hover { background: #D9D9D9; }

.ec-menu-wrap { position: relative; }
.ec-menu {
  position: absolute; right: 0; top: calc(100% + 8px); width: 620px; max-width: calc(100vw - 24px);
  background: #FFFFFF; border: 1px solid #E2E2E2; border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 24px 60px -24px rgba(0,0,0,.25);
}
:global(.dark) .ec-menu { background: #1A1A1A; border-color: #2C2C2C; }
.ec-menu-head { padding: 14px 16px 12px; border-bottom: 1px solid #EDEDED; }
:global(.dark) .ec-menu-head { border-bottom-color: #2C2C2C; }
.ec-menu-title { font-weight: 600; font-size: 14px; }
.ec-menu-sub { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: #7C7C7C; }
.ec-menu-body { display: grid; grid-template-columns: 170px 1fr; min-height: 230px; }
.ec-tabs { display: flex; flex-direction: column; gap: 2px; padding: 8px; background: #F8F8F8; border-right: 1px solid #EDEDED; }
:global(.dark) .ec-tabs { background: #141414; border-right-color: #2C2C2C; }
.ec-tab {
  display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px;
  border: 0; background: transparent; color: #383838; font-size: 14px; text-align: left; cursor: pointer;
}
.ec-tab small { font-size: 11px; color: #999999; }
.ec-tab:hover { background: #EBEBEB; }
.ec-tab.is-on { background: #FFFFFF; color: #171717; font-weight: 500; box-shadow: 0 0 0 1px #E2E2E2; }
:global(.dark) .ec-tab { color: #CFCFCF; }
:global(.dark) .ec-tab:hover { background: #262626; }
:global(.dark) .ec-tab.is-on { background: #262626; color: #F2F2F2; box-shadow: 0 0 0 1px #333333; }
.ec-tours { list-style: none; margin: 0; padding: 6px 12px 10px; }
.ec-tour { display: grid; grid-template-columns: 22px 1fr auto; gap: 12px; align-items: center; padding: 10px 6px; }
.ec-tour + .ec-tour { border-top: 1px solid #F3F3F3; }
:global(.dark) .ec-tour + .ec-tour { border-top-color: #262626; }
.ec-tour-n {
  width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; color: #7C7C7C; box-shadow: 0 0 0 1px #DADADA;
}
.ec-tour-n.is-done { background: #171717; color: #FFFFFF; box-shadow: none; }
:global(.dark) .ec-tour-n.is-done { background: #F2F2F2; color: #171717; }
.ec-tour-title { font-size: 14px; font-weight: 500; }
.ec-tour-blurb { font-size: 13px; color: #7C7C7C; line-height: 1.4; margin-top: 2px; }

@media (max-width: 720px) {
  .ec-bar { grid-template-columns: auto 1fr; }
  .ec-bar-left { display: none; }
  .ec-bar-title { font-size: 14px; }
  .ec-hide-sm { display: none; }
  .ec-menu { position: fixed; left: 12px; right: 12px; top: 62px; width: auto; }
  .ec-menu-body { grid-template-columns: 1fr; }
  .ec-tabs { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid #EDEDED; }
  .ec-tab { flex: 0 0 auto; }
}
</style>
