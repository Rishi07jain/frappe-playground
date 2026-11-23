<template>
  <!-- Welcome: the one note a visitor sees, once per browser session. -->
  <Dialog
    :open="welcome"
    size="md"
    title="Welcome to the ERPNext Experience Center"
    @update:open="$emit('update:welcome', $event)"
  >
    <template #actions>
      <div class="w-full text-left text-gray-700 dark:text-gray-300">
        <p class="m-0 text-base leading-6">
          This is a limited version of ERPNext with sample data. Click around anywhere; nothing you do here is saved.
        </p>
        <p class="m-0 mt-3 text-base leading-6">
          Six modules come with guided tours:
          <b class="text-gray-900 dark:text-gray-100">Accounting, Buying, Selling, Stock, Assets</b> and
          <b class="text-gray-900 dark:text-gray-100">Manufacturing</b>. Find them all under
          <b class="text-gray-900 dark:text-gray-100">Guided tours</b> in the top bar.
        </p>
        <div class="mt-5 flex justify-end">
          <Button variant="solid" @click="$emit('update:welcome', false)">Start exploring</Button>
        </div>
      </div>
    </template>
  </Dialog>

  <!-- Feedback: a 1–5 rating and an optional comment. -->
  <Dialog
    :open="feedback"
    size="md"
    title="How is the Experience Center?"
    @update:open="closeFeedback"
  >
    <template #actions>
      <div class="w-full text-left text-gray-700 dark:text-gray-300">
        <template v-if="!sent">
          <p class="m-0 text-sm text-gray-600 dark:text-gray-400">How useful was it for deciding on ERPNext?</p>
          <div class="mt-2 flex gap-2" role="radiogroup" aria-label="Rating from 1 to 5">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              role="radio"
              :aria-checked="rating === n"
              class="h-8 w-9 rounded-md border text-sm transition-colors"
              :class="rating === n
                ? 'border-transparent bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'"
              @click="rating = n"
            >{{ n }}</button>
          </div>
          <textarea
            v-model="comment"
            rows="3"
            class="mt-3 w-full rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            placeholder="What did you like, or what was missing? (optional)"
          />
          <div class="mt-4 flex justify-end gap-2">
            <Button @click="closeFeedback(false)">Cancel</Button>
            <Button variant="solid" :disabled="!rating" @click="send">Send feedback</Button>
          </div>
        </template>
        <template v-else>
          <p class="m-0 text-base">Thanks, that helps.</p>
          <div class="mt-4 flex justify-end">
            <Button variant="solid" @click="closeFeedback(false)">Close</Button>
          </div>
        </template>
      </div>
    </template>
  </Dialog>

  <!-- Reset: starts the sample company over. -->
  <Dialog
    :open="reset"
    size="sm"
    title="Start over?"
    @update:open="$emit('update:reset', $event)"
  >
    <template #actions>
      <div class="w-full text-left text-gray-700 dark:text-gray-300">
        <p class="m-0 text-base leading-6">
          This puts the sample company back the way it started. Anything the tours created is cleared, and setting it up again takes a few minutes.
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <Button @click="$emit('update:reset', false)">Cancel</Button>
          <Button variant="solid" theme="red" @click="$emit('confirm-reset')">Reset</Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref } from 'vue'
import { Button, Dialog } from 'frappe-ui'

defineProps({
  welcome: { type: Boolean, default: false },
  feedback: { type: Boolean, default: false },
  reset: { type: Boolean, default: false },
})
const emit = defineEmits(['update:welcome', 'update:feedback', 'update:reset', 'send-feedback', 'confirm-reset'])

const rating = ref(0)
const comment = ref('')
const sent = ref(false)

function send() {
  emit('send-feedback', { kind: 'general', rating: rating.value, comment: comment.value.trim() })
  sent.value = true
}
function closeFeedback(open) {
  if (open) return
  emit('update:feedback', false)
  setTimeout(() => { rating.value = 0; comment.value = ''; sent.value = false }, 200)
}
</script>
