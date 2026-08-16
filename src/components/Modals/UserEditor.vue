<template>
  <CharacterProfileDialog
    :open="true"
    title="编辑我的信息"
    size="xl"
    :form="localForm"
    avatar-field="avatarPath"
    :show-group="false"
    :show-config="false"
    :show-speaking-style="false"
    basic-hint="你的基础身份信息"
    impression-title="我的印象"
    impression-hint="用于聊天和总结里的用户资料"
    show-display-name
    display-name-label="用户昵称"
    display-name-placeholder="你的昵称"
    name-label="角色扮演姓名"
    name-placeholder="角色互动时使用的名字"
    desc-placeholder="其他补充..."
    confirm-text="保存"
    cancel-text="关闭"
    @cancel="$emit('close')"
    @confirm="$emit('save', localForm)"
    @pick-avatar="userAvatarInput?.click()"
    @clear-avatar="localForm.avatarPath = ''"
  />

  <input type="file" ref="userAvatarInput" @change="handleAvatarUpload" accept="image/*" style="display: none;">
  <PhotoCropDialog
    :open="photoCropOpen"
    :source="photoCropSource"
    title="裁剪用户头像"
    @cancel="closePhotoCrop"
    @confirm="applyPhotoCrop"
  />
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import CharacterProfileDialog from '../app/modals/character/CharacterProfileDialog.vue'
import PhotoCropDialog from '../common/PhotoCropDialog.vue'
import { readImageInputAsDataUrl } from '../../utils/photoFile'

const props = defineProps<{
  userForm: Record<string, any>
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'save', form: Record<string, any>): void
}>()

const localForm = reactive({ ...props.userForm })
const userAvatarInput = ref<HTMLInputElement | null>(null)
const photoCropOpen = ref(false)
const photoCropSource = ref('')

async function handleAvatarUpload(event: Event) {
  try {
    const source = await readImageInputAsDataUrl(event)
    if (!source) return
    photoCropSource.value = source
    photoCropOpen.value = true
  } catch (error) {
    console.error('读取用户头像失败:', error)
  }
}

function closePhotoCrop() {
  photoCropOpen.value = false
  photoCropSource.value = ''
}

function applyPhotoCrop(dataUrl: string) {
  localForm.avatarPath = dataUrl
  closePhotoCrop()
}

watch(() => props.userForm, (newVal) => {
  Object.assign(localForm, newVal)
}, { deep: true })
</script>
