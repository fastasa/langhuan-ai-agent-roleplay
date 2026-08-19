<template>
  <AppFormDialog
    :open="open"
    :title="title"
    :subtitle="subtitle"
    :title-icon-src="titleIconSrc"
    :title-icon-alt="titleIconAlt"
    :size="size"
    height-preset="tall"
    :z-index="zIndex"
    body-compact
    @cancel="$emit('cancel')"
  >
    <template v-if="$slots['header-actions']" #header-actions>
      <slot name="header-actions" />
    </template>

    <div class="character-profile-dialog">
      <section class="character-profile-section character-profile-section--basic">
        <div class="character-profile-section__header">
          <div class="character-profile-section__title">
            <span class="character-profile-section__index">1</span>
            <span>基本信息</span>
            <span class="character-profile-section__hint">{{ basicHint }}</span>
          </div>
        </div>

        <div class="character-profile-basic-grid" :class="{ 'character-profile-basic-grid--user': !showGroup }">
          <div class="character-profile-avatar-field">
            <label>头像</label>
            <button
              type="button"
              class="character-profile-avatar"
              :class="{
                'character-profile-avatar--filled': avatarValue,
                'character-profile-avatar--empty': !avatarValue
              }"
              @click="$emit('pick-avatar')"
            >
              <img v-if="avatarValue" class="character-profile-avatar__image" :src="avatarValue" alt="">
              <template v-else>
                <img class="character-profile-avatar__placeholder" :src="uploadPlaceholderUrl" alt="">
                <span class="character-profile-avatar__text">点击上传 PNG、JPEG</span>
              </template>
            </button>
            <button
              v-if="avatarValue"
              type="button"
              class="character-profile-avatar__clear"
              @click.stop="$emit('clear-avatar')"
            >
              ×
            </button>
          </div>

          <div ref="emojiPickerRootRef" class="character-profile-emoji-field">
            <label>Emoji</label>
            <button
              type="button"
              class="character-profile-emoji-trigger"
              :aria-expanded="showEmojiPicker"
              aria-haspopup="dialog"
              @click="showEmojiPicker = !showEmojiPicker"
            >
              {{ form.emoji || '👤' }}
            </button>
            <div v-if="showEmojiPicker" class="character-profile-emoji-popover">
              <div v-for="group in emojiGroups" :key="group.label" class="character-profile-emoji-group">
                <div class="character-profile-emoji-group__label">{{ group.label }}</div>
                <div class="character-profile-emoji-grid">
                  <button
                    v-for="emoji in group.items"
                    :key="`${group.label}-${emoji}`"
                    type="button"
                    class="character-profile-emoji-option"
                    :class="{ 'character-profile-emoji-option--active': form.emoji === emoji }"
                    @click="selectEmoji(emoji)"
                  >
                    {{ emoji }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="character-profile-name-field form-group">
            <label>{{ nameLabel }}</label>
            <input v-model="form.name" :placeholder="namePlaceholder">
          </div>

          <div v-if="showDisplayName" class="form-group">
            <label>{{ displayNameLabel }}</label>
            <input v-model.trim="form.displayName" maxlength="40" :placeholder="displayNamePlaceholder">
          </div>

          <div class="form-group">
            <label>性别</label>
            <select v-model="form.gender">
              <option value="">未设</option>
              <option v-for="option in genderOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>年龄</label>
            <input v-model.number="form.age" placeholder="0">
          </div>

          <div v-if="showGroup" class="form-group">
            <label>分组</label>
            <select v-model="form.group">
              <option value="">未分组</option>
              <option v-for="grp in groups" :key="grp.id" :value="grp.id">{{ grp.name }}</option>
            </select>
            <div class="character-profile-field-note">可在设置中管理分组</div>
          </div>
        </div>
      </section>

      <section class="character-profile-section">
        <button
          type="button"
          class="character-profile-section__header character-profile-section__header--button"
          @click="showImpressionSection = !showImpressionSection"
        >
          <span class="character-profile-section__title">
            <span class="character-profile-section__index">2</span>
            <span>{{ impressionTitle }}</span>
            <span class="character-profile-section__hint">{{ impressionHint }}</span>
          </span>
          <span class="character-profile-section__chevron" :class="{ 'character-profile-section__chevron--open': showImpressionSection }">⌄</span>
        </button>
        <div v-show="showImpressionSection" class="character-profile-two-column">
          <div class="form-group character-profile-textarea-field">
            <label>简介</label>
            <textarea v-model="form.desc" rows="3" maxlength="500" :placeholder="descPlaceholder"></textarea>
            <span>{{ String(form.desc || '').length }}/500</span>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>外貌</label>
            <textarea v-model="form.appearance" rows="3" maxlength="500" placeholder="外貌描写..."></textarea>
            <span>{{ String(form.appearance || '').length }}/500</span>
          </div>
          <div v-if="showSpeakingStyle" class="form-group character-profile-textarea-field">
            <label>说话风格</label>
            <textarea v-model="form.speakingStyle" rows="3" maxlength="500" placeholder="口头禅、语气特点..."></textarea>
            <span>{{ String(form.speakingStyle || '').length }}/500</span>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>性格</label>
            <textarea v-model="form.personality" rows="3" maxlength="500" placeholder="性格特点..."></textarea>
            <span>{{ String(form.personality || '').length }}/500</span>
          </div>
        </div>
      </section>

      <section class="character-profile-section character-profile-section--collapsed">
        <button
          type="button"
          class="character-profile-section__header character-profile-section__header--button"
          @click="showBackgroundSection = !showBackgroundSection"
        >
          <span class="character-profile-section__title">
            <span class="character-profile-section__index">3</span>
            <span>背景设定</span>
            <span class="character-profile-section__hint">世界观与成长经历等深度设定</span>
          </span>
          <span class="character-profile-section__chevron" :class="{ 'character-profile-section__chevron--open': showBackgroundSection }">⌄</span>
        </button>
        <div v-if="!showBackgroundSection" class="character-profile-section__summary">
          穿着 · 爱好 · 能力 · 经历 · 世界观 · 背景故事
        </div>
        <div v-show="showBackgroundSection" class="character-profile-two-column character-profile-two-column--padded">
          <div class="form-group character-profile-textarea-field">
            <label>穿着</label>
            <textarea v-model="form.outfit" rows="3" placeholder="日常穿着..."></textarea>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>爱好</label>
            <textarea v-model="form.hobbies" rows="3" placeholder="兴趣爱好..."></textarea>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>能力</label>
            <textarea v-model="form.abilities" rows="3" placeholder="特殊技能..."></textarea>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>经历</label>
            <textarea v-model="form.experience" rows="3" placeholder="重要经历..."></textarea>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>世界观</label>
            <textarea v-model="form.worldview" rows="3" placeholder="所处的世界设定..."></textarea>
          </div>
          <div class="form-group character-profile-textarea-field">
            <label>背景故事</label>
            <textarea v-model="form.background" rows="3" placeholder="详细背景..."></textarea>
          </div>
        </div>
      </section>

      <section v-if="showConfig" class="character-profile-section character-profile-section--collapsed">
        <button
          type="button"
          class="character-profile-section__header character-profile-section__header--button"
          @click="showConfigSection = !showConfigSection"
        >
          <span class="character-profile-section__title">
            <span class="character-profile-section__index">4</span>
            <span>预设配置</span>
            <span class="character-profile-section__hint">模型、链路与称呼别名</span>
          </span>
          <span class="character-profile-section__chevron" :class="{ 'character-profile-section__chevron--open': showConfigSection }">⌄</span>
        </button>
        <div v-if="!showConfigSection" class="character-profile-section__summary">
          预设 · 模型 · 链路 · 参数 · 昵称
        </div>
        <div v-show="showConfigSection" class="character-profile-config-panel">
          <div class="character-profile-three-column">
            <div class="form-group">
              <label>预设</label>
              <select v-model="form.defaultPreset">
                <option value="">跟随全局</option>
                <option :value="langhuanPresetValue">琅嬛预设</option>
                <option v-for="preset in apiPresets" :key="preset.name" :value="preset.name">{{ preset.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>模型</label>
              <div class="character-profile-model-row">
                <select v-model="form.defaultModel" :disabled="presetDisabled">
                  <option value="">{{ presetDisabled ? '跟随琅嬛预设' : '跟随预设' }}</option>
                  <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
                </select>
                <button
                  type="button"
                  class="btn btn-secondary btn-small"
                  :disabled="presetDisabled || !form.defaultPreset || modelLoading"
                  @click="$emit('load-models')"
                >
                  {{ modelLoading ? '加载中...' : '加载模型' }}
                </button>
              </div>
              <input
                v-if="customModelVisible"
                v-model="form.defaultModel"
                placeholder="自定义模型名"
              >
            </div>
            <div class="form-group character-profile-nickname-field">
              <label>昵称</label>
              <div class="character-profile-tags">
                <span v-for="(nick, idx) in nicknames" :key="`${nicknameKeyPrefix}-${idx}`">
                  {{ nick }}
                  <button type="button" @click="$emit('remove-nickname', idx)">×</button>
                </span>
              </div>
              <div class="character-profile-inline-row">
                <input
                  :value="nicknameInput"
                  placeholder="输入昵称，回车添加"
                  @input="$emit('update:nickname-input', ($event.target as HTMLInputElement).value)"
                  @keyup.enter="$emit('add-nickname')"
                >
                <button type="button" class="btn btn-secondary btn-small" @click="$emit('add-nickname')">添加</button>
              </div>
            </div>
          </div>
          <div class="character-profile-param-grid">
            <div class="form-group">
              <label>温度</label>
              <input
                v-model="form.roleTemperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                placeholder="跟随角色消息"
              >
            </div>
            <div class="form-group">
              <label>最大 Token</label>
              <input
                v-model="form.roleMaxTokens"
                type="number"
                min="1"
                max="32768"
                placeholder="跟随角色消息"
              >
            </div>
            <div class="form-group">
              <label>思考过程</label>
              <select v-model="form.roleThinking">
                <option value="">跟随角色消息</option>
                <option value="disabled">不传回</option>
                <option value="enabled">传回</option>
              </select>
            </div>
            <div class="form-group">
              <label>回复链路</label>
              <select v-model="form.replyPipelineModeOverride">
                <option value="follow_session">自动（有模型优先）</option>
                <option value="normal_recall">强制普通召回</option>
                <option value="personality_model">强制人格模型</option>
              </select>
            </div>
          </div>
          <div v-if="showPersonalityModel" ref="personalityModelCardRef" class="character-profile-personality-model">
            <!-- 人格模型轻入口（CD 定稿：小卡片）：只放状态与动作，完整训练流程在独立工作台弹窗 -->
            <div class="character-profile-personality-model__head">
              <span class="character-profile-personality-model__dot" :class="personalityModelUploaded ? 'is-ready' : 'is-empty'"></span>
              <div class="character-profile-personality-model__title-wrap">
                <div class="character-profile-personality-model__title">
                  人格模型
                  <span
                    class="character-profile-personality-model__status"
                    :class="personalityModelUploaded ? 'is-ready' : 'is-empty'"
                  >
                    {{ personalityModelUploaded ? '已安装' : '未配置' }}
                  </span>
                </div>
                <div class="character-profile-personality-model__meta">
                  {{ personalityModelUploaded
                    ? (personalityModelInstalledSummary || '当前模型已进入回复链路')
                    : '训练或上传后，可用于回复计划的排序评审' }}
                </div>
              </div>
              <div v-if="personalityModelUploaded" class="character-profile-personality-model__menu-anchor">
                <button
                  type="button"
                  class="character-profile-personality-model__menu-trigger"
                  :disabled="personalityModelUploading"
                  aria-haspopup="menu"
                  :aria-expanded="showPersonalityModelMenu"
                  @click="showPersonalityModelMenu = !showPersonalityModelMenu"
                >
                  <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>
                <div v-if="showPersonalityModelMenu" class="character-profile-personality-model__menu" role="menu">
                  <button type="button" role="menuitem" @click="emitPersonalityMenu('pick-personality-model')">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path></svg>
                    重新上传模型包
                  </button>
                  <button type="button" role="menuitem" @click="emitPersonalityMenu('open-personality-model-versions')">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l4 2"></path></svg>
                    版本管理
                  </button>
                  <div class="character-profile-personality-model__menu-sep"></div>
                  <button type="button" role="menuitem" class="is-danger" @click="emitPersonalityMenu('delete-personality-model')">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    删除模型
                  </button>
                </div>
              </div>
            </div>
            <div class="character-profile-personality-model__actions">
              <template v-if="!personalityModelUploaded">
                <button
                  type="button"
                  class="btn btn-primary btn-small character-profile-personality-model__primary"
                  :disabled="!personalityModelUploadable || personalityModelUploading"
                  @click="$emit('train-personality-model')"
                >
                  训练模型
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-small"
                  :disabled="!personalityModelUploadable || personalityModelUploading"
                  @click="$emit('pick-personality-model')"
                >
                  {{ personalityModelUploading ? '上传中...' : '上传模型包' }}
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="btn btn-primary btn-small character-profile-personality-model__primary"
                  :disabled="personalityModelUploading"
                  @click="$emit('optimize-personality-model')"
                >
                  优化模型
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-small"
                  :disabled="personalityModelUploading"
                  @click="$emit('open-personality-model-versions')"
                >
                  版本{{ personalityModelVersionCount > 0 ? `（${personalityModelVersionCount}）` : '' }}
                </button>
              </template>
            </div>
            <p v-if="!personalityModelUploadable" class="character-profile-personality-model__note">
              先保存角色，再训练或上传模型包。
            </p>
            <p class="character-profile-personality-model__hint">
              人格模型用于评审「哪个回复计划更像这个角色」，不直接生成回复。
            </p>
          </div>
        </div>
      </section>

      <slot name="after-sections" />
    </div>

    <template #actions>
      <slot name="actions-left" />
      <div class="character-profile-actions-spacer"></div>
      <button type="button" class="btn btn-secondary character-profile-footer-button" @click="$emit('cancel')">{{ cancelText }}</button>
      <button type="button" class="btn btn-primary character-profile-footer-button character-profile-footer-button--primary" @click="$emit('confirm')">{{ confirmText }}</button>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppFormDialog from '../../../common/AppFormDialog.vue'
import uploadPlaceholderUrl from '../../../../assets/illustrations/new-character-upload-placeholder.png'

type ProfileForm = Record<string, any>
type GroupOption = { id: string; name: string }
type PresetOption = { name?: string }

const emojiGroups = [
  { label: '常用', items: ['👤', '😀', '😄', '😊', '🙂', '😉', '😍', '😎', '🤔', '😴', '😭', '😡', '🥰', '😇', '🤩', '😈'] },
  { label: '人物', items: ['👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '🦸', '🦹', '🥷', '👮', '🕵️', '💂', '👷', '👩‍⚕️', '👩‍🎓', '👩‍🏫', '👩‍🎨', '👩‍🚀', '👑'] },
  { label: '动物', items: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐺', '🐴', '🦄', '🐲', '🐉', '🦋', '🐦', '🦉', '🐟', '🐬', '🐳'] },
  { label: '自然', items: ['🌙', '☀️', '⭐', '✨', '⚡', '🔥', '❄️', '🌊', '🌧️', '🌈', '🌸', '🌹', '🌻', '🌿', '🍀', '🍁', '🍄', '🌌', '🏔️', '🏝️'] },
  { label: '食物', items: ['🍎', '🍓', '🍒', '🍑', '🍋', '🍵', '☕', '🍰', '🍩', '🍪', '🍫', '🍬', '🍭', '🍜', '🍙', '🍣', '🥐', '🥞'] },
  { label: '物品', items: ['📚', '📖', '✒️', '🖋️', '🪶', '🎧', '🎵', '🎲', '🎮', '🧸', '🔮', '🪄', '⚔️', '🛡️', '💎', '🗝️', '🕯️', '🏮', '🎀', '💌'] },
  { label: '符号', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💫', '💥', '💢', '💤', '💭', '🌀', '🔆', '🔱', '⚜️', '♟️'] }
]

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  subtitle?: string
  titleIconSrc?: string
  titleIconAlt?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  zIndex?: number | string
  form: ProfileForm
  avatarField?: string
  showGroup?: boolean
  groups?: GroupOption[]
  showConfig?: boolean
  apiPresets?: PresetOption[]
  langhuanPresetValue?: string
  modelOptions?: string[]
  modelLoading?: boolean
  presetDisabled?: boolean
  customModelVisible?: boolean
  nicknames?: string[]
  nicknameInput?: string
  nicknameKeyPrefix?: string
  showSpeakingStyle?: boolean
  showDisplayName?: boolean
  basicHint?: string
  impressionTitle?: string
  impressionHint?: string
  nameLabel?: string
  namePlaceholder?: string
  displayNameLabel?: string
  displayNamePlaceholder?: string
  descPlaceholder?: string
  cancelText?: string
  confirmText?: string
  showPersonalityModel?: boolean
  personalityModelPath?: string
  personalityModelUploading?: boolean
  personalityModelUploadable?: boolean
  personalityModelVersionCount?: number
  personalityModelInstalledSummary?: string
}>(), {
  subtitle: '',
  titleIconSrc: '',
  titleIconAlt: '',
  size: 'xl',
  zIndex: 13000,
  avatarField: 'avatar',
  showGroup: true,
  groups: () => [],
  showConfig: true,
  apiPresets: () => [],
  langhuanPresetValue: '',
  modelOptions: () => [],
  modelLoading: false,
  presetDisabled: false,
  customModelVisible: false,
  nicknames: () => [],
  nicknameInput: '',
  nicknameKeyPrefix: 'profile-nick',
  showSpeakingStyle: true,
  showDisplayName: false,
  basicHint: '角色的基础身份与分类',
  impressionTitle: '角色印象',
  impressionHint: '帮助角色更立体、更自然地表达',
  nameLabel: '名称 *',
  namePlaceholder: '请输入角色名称',
  displayNameLabel: '用户昵称',
  displayNamePlaceholder: '你的昵称',
  descPlaceholder: '角色简介...',
  cancelText: '取消',
  confirmText: '保存',
  showPersonalityModel: false,
  personalityModelPath: '',
  personalityModelUploading: false,
  personalityModelUploadable: true,
  personalityModelVersionCount: 0,
  personalityModelInstalledSummary: ''
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'confirm'): void
  (e: 'pick-avatar'): void
  (e: 'clear-avatar'): void
  (e: 'load-models'): void
  (e: 'add-nickname'): void
  (e: 'remove-nickname', idx: number): void
  (e: 'update:nickname-input', value: string): void
  (e: 'pick-personality-model'): void
  (e: 'delete-personality-model'): void
  (e: 'train-personality-model'): void
  (e: 'optimize-personality-model'): void
  (e: 'open-personality-model-versions'): void
}>()

const personalityModelUploaded = computed(() => Boolean(String(props.personalityModelPath || '').trim()))

const showImpressionSection = ref(true)
const showBackgroundSection = ref(false)
const showConfigSection = ref(false)
const showEmojiPicker = ref(false)
const emojiPickerRootRef = ref<HTMLElement | null>(null)
const showPersonalityModelMenu = ref(false)
const personalityModelCardRef = ref<HTMLElement | null>(null)

function emitPersonalityMenu(event: 'pick-personality-model' | 'delete-personality-model' | 'open-personality-model-versions') {
  showPersonalityModelMenu.value = false
  if (event === 'pick-personality-model') emit('pick-personality-model')
  else if (event === 'delete-personality-model') emit('delete-personality-model')
  else emit('open-personality-model-versions')
}

function handlePersonalityMenuOutsidePointer(event: PointerEvent) {
  if (!showPersonalityModelMenu.value) return
  const root = personalityModelCardRef.value
  if (root && event.target instanceof Node && root.contains(event.target)) return
  showPersonalityModelMenu.value = false
}

const avatarValue = computed(() => String(props.form?.[props.avatarField] || '').trim())
const genderOptions = computed(() => {
  const options = ['男', '女', '其他']
  const currentGender = String(props.form?.gender || '').trim()
  return currentGender && !options.includes(currentGender) ? [currentGender, ...options] : options
})

watch(() => props.open, (open) => {
  if (!open) {
    showEmojiPicker.value = false
    showPersonalityModelMenu.value = false
    return
  }
  showImpressionSection.value = true
  showBackgroundSection.value = false
  showConfigSection.value = false
})

function selectEmoji(emoji: string) {
  props.form.emoji = emoji
  showEmojiPicker.value = false
}

function handleEmojiPickerOutsidePointer(event: PointerEvent) {
  if (!showEmojiPicker.value) return
  const root = emojiPickerRootRef.value
  if (root && event.target instanceof Node && root.contains(event.target)) return
  showEmojiPicker.value = false
}

function handleEmojiPickerEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showEmojiPicker.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleEmojiPickerOutsidePointer)
  document.addEventListener('pointerdown', handlePersonalityMenuOutsidePointer)
  document.addEventListener('keydown', handleEmojiPickerEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleEmojiPickerOutsidePointer)
  document.removeEventListener('pointerdown', handlePersonalityMenuOutsidePointer)
  document.removeEventListener('keydown', handleEmojiPickerEscape)
})
</script>

<style scoped>
.character-profile-dialog {
  --character-profile-card-border: color-mix(in srgb, var(--morandi-border) 96%, transparent);
  --character-profile-card-bg: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  --character-profile-card-bg-collapsed: color-mix(in srgb, var(--morandi-soft-bg) 74%, transparent);
  --character-profile-card-header-border: color-mix(in srgb, var(--morandi-border) 78%, transparent);
  --character-profile-card-header-bg: linear-gradient(90deg, color-mix(in srgb, var(--morandi-card) 92%, transparent), color-mix(in srgb, var(--morandi-card) 86%, transparent));
  --character-profile-accent: #8f9d99;
  --character-profile-accent-strong: #727f7b;
  --character-profile-accent-dark: #58645f;
  --character-profile-accent-soft: rgba(143, 157, 153, 0.14);
  --character-profile-accent-focus: rgba(128, 140, 136, 0.78);
  --character-profile-hint-dot: rgba(134, 139, 135, 0.72);
  display: grid;
  gap: 12px;
  padding-bottom: 4px;
}

.character-profile-section {
  overflow: hidden;
  border: 1px solid var(--character-profile-card-border);
  border-radius: 8px;
  background: var(--character-profile-card-bg);
}

.character-profile-section--basic {
  position: relative;
  z-index: 4;
  overflow: visible;
}

.character-profile-section--collapsed {
  background: var(--character-profile-card-bg-collapsed);
}

.character-profile-section__header {
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 16px;
  border: 0;
  border-bottom: 1px solid var(--character-profile-card-header-border);
  background: var(--character-profile-card-header-bg);
  color: var(--morandi-text, #4f463f);
  text-align: left;
}

.character-profile-section__header--button {
  cursor: pointer;
}

.character-profile-section__header--button:focus {
  outline: none;
}

.character-profile-section__header--button:focus-visible {
  outline: 1px solid var(--character-profile-accent-focus);
  outline-offset: -1px;
}

.character-profile-section__title {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.96rem;
  font-weight: 700;
}

.character-profile-section__index {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--character-profile-accent);
  color: #fff;
  font-size: 0.78rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.character-profile-section__hint {
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.82rem;
  font-weight: 500;
}

.character-profile-section__hint::before {
  content: "·";
  margin-right: 9px;
  color: var(--character-profile-hint-dot);
}

.character-profile-section__chevron {
  color: var(--character-profile-accent-strong);
  font-size: 1rem;
  line-height: 1;
  transition: transform 0.18s ease;
}

.character-profile-section__chevron--open {
  transform: rotate(180deg);
}

.character-profile-section__summary {
  padding: 12px 50px 16px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.86rem;
}

.character-profile-basic-grid {
  display: grid;
  grid-template-columns: 142px 88px minmax(220px, 1fr) minmax(120px, 180px) minmax(120px, 170px) minmax(160px, 210px);
  gap: 14px 18px;
  align-items: start;
  padding: 16px;
}

.character-profile-basic-grid--user {
  grid-template-columns: 142px 88px minmax(220px, 1fr) minmax(120px, 180px) minmax(120px, 170px);
}

.character-profile-name-field {
  grid-column: span 4;
}

.character-profile-basic-grid--user .character-profile-name-field {
  grid-column: span 3;
}

.character-profile-avatar-field,
.character-profile-emoji-field {
  position: relative;
  display: grid;
  gap: 7px;
}

.character-profile-avatar-field label,
.character-profile-emoji-field label,
.character-profile-dialog :deep(.form-group label) {
  margin: 0 0 6px;
  color: var(--morandi-text, #4f4b44);
  font-size: 0.85rem;
  font-weight: 600;
}

.character-profile-avatar {
  position: relative;
  width: 128px;
  height: 138px;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--morandi-text-light, #91988f);
  cursor: pointer;
  overflow: hidden;
}

.character-profile-avatar--filled {
  border-radius: 10px;
}

.character-profile-avatar--empty::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 56%, rgba(255, 255, 255, 0.48) 100%);
  pointer-events: none;
}

.character-profile-avatar__image {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.character-profile-avatar__placeholder {
  position: absolute;
  inset: -50px -50px -40px -50px;
  z-index: 0;
  width: calc(110% + 90px);
  height: calc(110% + 90px);
  object-fit: contain;
  border-radius: 0;
}

.character-profile-avatar__text {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 18px;
  z-index: 2;
  color: #77736b;
  font-size: 0.72rem;
  line-height: 1.25;
  text-align: center;
  pointer-events: none;
}

.character-profile-avatar__clear {
  position: absolute;
  top: 26px;
  right: 8px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: rgba(150, 82, 75, 0.9);
  color: #fff;
  cursor: pointer;
}

.character-profile-emoji-trigger {
  width: 54px;
  height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 86%, transparent);
  font-size: 1.45rem;
  line-height: 1;
  cursor: pointer;
}

.character-profile-emoji-trigger:hover,
.character-profile-emoji-trigger[aria-expanded="true"] {
  border-color: var(--character-profile-accent-focus);
  box-shadow: 0 0 0 2px var(--character-profile-accent-soft);
}

.character-profile-emoji-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: min(360px, calc(100vw - 80px));
  max-height: 260px;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--langhuan-menu-border, rgba(203, 202, 196, 0.62));
  border-radius: var(--langhuan-menu-radius, 0);
  background: color-mix(in srgb, var(--morandi-card) 98%, transparent);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
}

.character-profile-emoji-group + .character-profile-emoji-group {
  margin-top: 10px;
}

.character-profile-emoji-group__label {
  margin-bottom: 6px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.75rem;
  font-weight: 600;
}

.character-profile-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 34px);
  gap: 5px;
}

.character-profile-emoji-option {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font-size: 1.18rem;
  line-height: 1;
  cursor: pointer;
}

.character-profile-emoji-option:hover,
.character-profile-emoji-option--active {
  border-color: var(--character-profile-card-border);
  background: rgba(143, 157, 153, 0.12);
}

.character-profile-field-note {
  margin-top: 6px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.75rem;
}

.character-profile-two-column,
.character-profile-three-column {
  display: grid;
  gap: 12px 18px;
}

.character-profile-two-column {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 16px;
}

.character-profile-two-column--padded {
  padding-top: 14px;
}

.character-profile-three-column {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.character-profile-param-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 18px;
}

.character-profile-config-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.character-profile-personality-model {
  display: grid;
  gap: 9px;
  padding: 12px 14px;
  border: 1px solid var(--character-profile-card-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 70%, transparent);
}

.character-profile-personality-model__head {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.character-profile-personality-model__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-top: 6px;
  border-radius: 50%;
}

.character-profile-personality-model__dot.is-ready {
  background: var(--morandi-accent, #5c8a5c);
}

.character-profile-personality-model__dot.is-empty {
  background: rgba(150, 130, 110, 0.5);
}

.character-profile-personality-model__title-wrap {
  flex: 1;
  min-width: 0;
}

.character-profile-personality-model__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--morandi-text, #4f4b44);
  font-size: 0.88rem;
  font-weight: 600;
}

.character-profile-personality-model__status {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
}

.character-profile-personality-model__status.is-ready {
  background: rgba(105, 145, 133, 0.16);
  color: #4f645e;
}

.character-profile-personality-model__status.is-empty {
  background: rgba(150, 130, 110, 0.14);
  color: #8a7d6f;
}

.character-profile-personality-model__meta {
  margin-top: 3px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.76rem;
  line-height: 1.5;
}

.character-profile-personality-model__menu-anchor {
  position: relative;
  flex-shrink: 0;
}

.character-profile-personality-model__menu-trigger {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #7b746b);
  cursor: pointer;
}

.character-profile-personality-model__menu-trigger:hover {
  background: rgba(139, 115, 85, 0.08);
}

.character-profile-personality-model__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 168px;
  padding: 5px;
  border: 1px solid var(--langhuan-menu-border, rgba(203, 202, 196, 0.62));
  border-radius: var(--langhuan-menu-radius, 0);
  background: color-mix(in srgb, var(--morandi-card) 98%, transparent);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
}

.character-profile-personality-model__menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text, #4f463f);
  font: inherit;
  font-size: 0.84rem;
  text-align: left;
  cursor: pointer;
}

.character-profile-personality-model__menu button:hover,
.character-profile-personality-model__menu button:focus-visible {
  background: rgba(139, 115, 85, 0.08);
  outline: none;
}

.character-profile-personality-model__menu button.is-danger {
  color: #a8554a;
}

.character-profile-personality-model__menu-sep {
  height: 1px;
  margin: 5px 8px;
  background: color-mix(in srgb, var(--morandi-border) 78%, transparent);
}

.character-profile-personality-model__hint {
  margin: 0;
  color: var(--morandi-text-light, #9b958c);
  font-size: 0.72rem;
  line-height: 1.5;
}

.character-profile-personality-model__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.character-profile-personality-model__primary {
  background: var(--character-profile-accent) !important;
  color: #fff !important;
}

.character-profile-personality-model__note {
  margin: 0;
  color: #9a6a63;
  font-size: 0.76rem;
}

.character-profile-textarea-field {
  position: relative;
}

.character-profile-textarea-field span {
  position: absolute;
  right: 10px;
  bottom: 9px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.72rem;
}

.character-profile-model-row,
.character-profile-inline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.character-profile-model-row select,
.character-profile-inline-row input,
.character-profile-inline-row select {
  flex: 1 1 auto;
  min-width: 0;
}

.character-profile-tags {
  min-height: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.character-profile-tags span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--character-profile-accent-soft);
  color: var(--character-profile-accent-dark);
  font-size: 0.8rem;
}

.character-profile-tags button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.character-profile-actions-spacer {
  margin-right: auto;
}

.character-profile-footer-button {
  min-width: 104px;
  height: 42px;
  border-radius: 10px !important;
}

.character-profile-footer-button--primary {
  background: var(--character-profile-accent) !important;
}

.character-profile-dialog :deep(.form-group) {
  margin: 0;
}

.character-profile-dialog :deep(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
.character-profile-dialog :deep(select),
.character-profile-dialog :deep(textarea) {
  width: 100%;
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text, #4f463f);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--morandi-card) 38%, transparent);
}

.character-profile-dialog :deep(input:focus),
.character-profile-dialog :deep(select:focus),
.character-profile-dialog :deep(textarea:focus) {
  border-color: var(--character-profile-accent-focus);
  outline: none;
  box-shadow: 0 0 0 2px var(--character-profile-accent-soft);
}

.character-profile-dialog :deep(textarea) {
  min-height: 92px;
  resize: vertical;
  line-height: 1.55;
}

@media (max-width: 760px) {
  .character-profile-basic-grid,
  .character-profile-basic-grid--user,
  .character-profile-two-column,
  .character-profile-three-column,
  .character-profile-param-grid {
    grid-template-columns: 1fr 1fr;
  }

  .character-profile-name-field,
  .character-profile-basic-grid--user .character-profile-name-field {
    grid-column: span 2;
  }
}

@media (max-width: 640px) {
  .character-profile-section__header {
    align-items: flex-start;
    padding: 11px 12px;
  }

  .character-profile-section__title {
    flex-wrap: wrap;
    gap: 7px;
  }

  .character-profile-section__hint {
    flex-basis: 100%;
  }

  .character-profile-section__hint::before {
    content: "";
    margin: 0;
  }

  .character-profile-basic-grid,
  .character-profile-basic-grid--user,
  .character-profile-two-column,
  .character-profile-three-column,
  .character-profile-param-grid {
    grid-template-columns: 1fr;
  }

  .character-profile-name-field,
  .character-profile-basic-grid--user .character-profile-name-field {
    grid-column: span 1;
  }

  .character-profile-avatar {
    width: 116px;
    height: 126px;
  }

  .character-profile-section__summary {
    padding: 12px 16px 16px;
  }
}
</style>
