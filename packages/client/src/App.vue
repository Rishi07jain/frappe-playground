<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { EXPERIENCE_CENTER } from './playground/config.js'
import ExperienceBar from './experience/ExperienceBar.vue'
import ExperienceDialogs from './experience/ExperienceDialogs.vue'
import { useExperience } from './experience/use-experience.js'
import IntroDialog from './components/IntroDialog.vue'
import InfoDialog from './components/InfoDialog.vue'
import AppManagerDialog from './components/AppManagerDialog.vue'
import InstanceManagerDialog from './components/InstanceManagerDialog.vue'
import LoadingScreen from './components/LoadingScreen.vue'
import Dock from './components/Dock.vue'
import { usePlaygroundLifecycle } from './composables/use-playground-lifecycle.js'
import { useInstanceManager } from './composables/use-instance-manager.js'

const {
  ready, booting, bootError, bootSteps, instanceId, instances, showIntroDialog,
  address, frameSrc, iframeRef, syncAddressFromFrame, navigateFrame, reloadFrame,
  showAppManager, availableApps, installedApps, appCatalogLoading, appCatalogError,
  appOperationNotice, appInstallError, installingAppId, uninstallingAppId, openAppManager, retryAppCatalog,
  installApp, uninstallApp, initPlayground, stopPlayground, failPlayground,
} = usePlaygroundLifecycle()
const showInfoDialog = ref(false)
const { instanceManagerRef, showInstanceManager, instanceBusy, instanceError,
  createInstance, selectInstance, renameInstance, resetInstance, deleteInstance,
} = useInstanceManager({ instanceId, instances, initPlayground, stopPlayground, failPlayground })
function reloadPage() { window.location.reload() }

// ERPNext Experience Center (see playground/config.js). The playground's own dock and
// dialogs stay in the code and come back when EXPERIENCE_CENTER.enabled is false.
const ec = EXPERIENCE_CENTER.enabled
const exp = useExperience({ iframeRef })
const showFeedback = ref(false)
const showReset = ref(false)
let tickTimer = 0
watch(ready, isReady => {
  clearInterval(tickTimer)
  if (ec && isReady) tickTimer = setInterval(exp.tick, 500)
}, { immediate: true })
watch(exp.deskReady, isReady => { if (ec && isReady) exp.maybeWelcome() })
onBeforeUnmount(() => clearInterval(tickTimer))
function onFrameLoad() {
  syncAddressFromFrame()
  if (ec) exp.tick()
}
async function confirmReset() {
  showReset.value = false
  exp.resetProgress()
  await resetInstance(instanceId.value)
}

</script>

<template>
  <main class="relative flex h-screen w-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 supports-[height:100dvh]:h-dvh">

    <ExperienceBar
      v-if="ec"
      :ready="ready && exp.deskReady.value"
      :tour-running="exp.tourRunning.value"
      :modules="exp.modules"
      :tours="exp.tours"
      :counts="exp.counts.value"
      :done-tours="exp.doneTours.value"
      :theme="exp.theme.value"
      :trial-url="EXPERIENCE_CENTER.trialUrl"
      @start-tour="exp.startTour"
      @reset="showReset = true"
      @feedback="showFeedback = true"
      @toggle-theme="exp.toggleTheme"
    />

    <LoadingScreen
      v-show="!ready"
      :title="ec ? 'Setting up your ERPNext' : undefined"
      :booting="booting"
      :error="bootError"
      :steps="bootSteps"
      @retry="reloadPage"
    />

    <iframe
      v-if="ready"
      id="frappe-desk"
      ref="iframeRef"
      :src="frameSrc"
      class="flex-1 min-h-0 w-full border-0 bg-transparent dark:bg-gray-900"
      title="Frappe Desk"
      @load="onFrameLoad"
    />

    <ExperienceDialogs
      v-if="ec"
      :welcome="exp.showWelcome.value"
      :feedback="showFeedback"
      :reset="showReset"
      @update:welcome="exp.showWelcome.value = $event"
      @update:feedback="showFeedback = $event"
      @update:reset="showReset = $event"
      @send-feedback="exp.sendFeedback"
      @confirm-reset="confirmReset"
    />

    <Dock
      v-if="!ec"
      v-show="ready"
      v-model:address="address"
      :active-instance-id="instanceId"
      :instances="instances"
      :ready="ready"
      @create-instance="showInstanceManager = true; instanceManagerRef?.startCreating()"
      @manage-instances="showInstanceManager = true"
      @manage-apps="openAppManager"
      @show-info="showInfoDialog = true"
      @navigate="navigateFrame"
      @reload="reloadFrame"
    />

    <IntroDialog v-if="!ec && ready" v-model="showIntroDialog" />
    <InfoDialog v-if="!ec && ready" v-model="showInfoDialog" :boot-steps="bootSteps" />
    <AppManagerDialog
      v-if="!ec && ready"
      v-model="showAppManager"
      :apps="availableApps"
      :installed-apps="installedApps"
      :loading="appCatalogLoading"
      :error="appCatalogError"
      :install-error="appInstallError"
      :operation-notice="appOperationNotice"
      :installing-app-id="installingAppId"
      :uninstalling-app-id="uninstallingAppId"
      @install="installApp"
      @retry="retryAppCatalog"
      @uninstall="uninstallApp"
    />
    <InstanceManagerDialog
      v-if="!ec"
      ref="instanceManagerRef"
      :busy="instanceBusy"
      :error="instanceError"
      v-model="showInstanceManager"
      :active-instance-id="instanceId"
      :instances="instances"
      @create="createInstance"
      @delete="deleteInstance"
      @reset="resetInstance"
      @rename="renameInstance"
      @select="selectInstance"
    />
  </main>
</template>
