<script setup lang="ts">
import type { QuickCommandConfig, QuickCommandAttachment } from "@buildingai/service/consoleapi/ai-agent";
import { object, string } from "yup";

const props = defineProps<{
    modelValue: QuickCommandConfig[];
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: QuickCommandConfig[]): void;
}>();

const command = useVModel(props, "modelValue", emit);

const { t } = useI18n();
const isOpen = shallowRef<boolean>(false);
const isEdit = shallowRef<boolean>(false);
const editingIndex = shallowRef<number>(-1);

// 表单验证规则
const formSchema = object({
    name: string().required(t("ai-agent.backend.configuration.commandNameEmpty")),
    content: string().required(t("ai-agent.backend.configuration.commandContentEmpty")),
    replyType: string().required(t("ai-agent.backend.configuration.commandReplyTypeEmpty")),
});

// 生成唯一ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// 生成占位符
const generatePlaceholder = (index: number) => `{附件${index + 1}}`;

const defaultState: QuickCommandConfig = {
    avatar: "",
    name: "",
    content: "",
    replyType: "model",
    replyContent: "",
    attachments: [],
};

// 表单数据
const state = ref<QuickCommandConfig>({ ...defaultState });

/** 提交表单 */
const submitForm = async () => {
    try {
        // 清理数据，删除可能存在的旧 attachment 字段
        const submitData = { ...state.value };
        if ('attachment' in submitData) {
            delete (submitData as any).attachment;
        }
        
        // 检查字段名是否重复（编辑时排除当前字段）
        const existingField = command.value.find(
            (field, index) => field.name === submitData.name && index !== editingIndex.value,
        );
        if (existingField) {
            useMessage().error(t("ai-agent.backend.configuration.formVariableNameExists"));
            return;
        }

        if (isEdit.value && editingIndex.value >= 0) {
            // 编辑模式：更新现有字段
            command.value[editingIndex.value] = submitData as QuickCommandConfig;
        } else {
            // 新增模式：添加到变量列表
            command.value.push(submitData as QuickCommandConfig);
        }

        modalClose();
    } catch (error) {
        console.error("操作失败:", error);
    }
};

/** 打开新增弹窗 */
const openModal = () => {
    isEdit.value = false;
    editingIndex.value = -1;
    isOpen.value = true;
};

/** 打开编辑弹窗 */
const openEditModal = (index: number) => {
    isEdit.value = true;
    editingIndex.value = index;
    const field = command.value[index];
    if (field) {
        state.value = JSON.parse(JSON.stringify(field));
        // 兼容旧数据，删除旧的 attachment 字段
        if ('attachment' in state.value) {
            delete (state.value as any).attachment;
        }
        // 如果没有attachments则初始化为空数组
        if (!state.value.attachments) {
            state.value.attachments = [];
        }
        isOpen.value = true;
    }
};

/** 重置表单数据 */
const resetState = () => {
    state.value = { ...defaultState };
};

/** 关闭弹窗 */
const modalClose = () => {
    isOpen.value = false;
    isEdit.value = false;
    editingIndex.value = -1;
    resetState();
};

/** 删除变量 */
const removeCommand = (index: number) => {
    command.value.splice(index, 1);
};

// ========== 附件相关方法 ==========

/** 添加附件 */
const addAttachment = () => {
    if (!state.value.attachments) {
        state.value.attachments = [];
    }
    
    const newAttachment: QuickCommandAttachment = {
        id: generateId(),
        placeholder: generatePlaceholder(state.value.attachments.length),
        label: `附件${state.value.attachments.length + 1}`,
        required: false,
        description: "",
        maxCount: 5,
        acceptTypes: [".jpg", ".jpeg", ".png", ".pdf", ".doc", ".docx", ".xlsx", ".csv"],
    };
    
    state.value.attachments.push(newAttachment);
    
    // 自动在内容中插入占位符
    if (state.value.replyType === 'template') {
        state.value.content += newAttachment.placeholder;
    }
};

/** 删除附件 */
const removeAttachment = (index: number) => {
    if (!state.value.attachments) return;
    
    const removed = state.value.attachments[index];
    if (removed) {
        // 从内容中移除占位符
        state.value.content = state.value.content.replace(removed.placeholder, '');
    }
    
    state.value.attachments.splice(index, 1);
    
    // 重新生成剩余附件的占位符
    state.value.attachments.forEach((att, idx) => {
        const oldPlaceholder = att.placeholder;
        att.placeholder = generatePlaceholder(idx);
        att.label = `附件${idx + 1}`;
        // 替换内容中的旧占位符
        state.value.content = state.value.content.replace(oldPlaceholder, att.placeholder);
    });
};

/** 在内容中插入占位符 */
const insertPlaceholder = (placeholder: string) => {
    state.value.content += placeholder;
};

/** 获取文件类型选项 */
const fileTypeOptions = [
    { value: ".jpg", label: "JPG" },
    { value: ".jpeg", label: "JPEG" },
    { value: ".png", label: "PNG" },
    { value: ".gif", label: "GIF" },
    { value: ".pdf", label: "PDF" },
    { value: ".doc", label: "DOC" },
    { value: ".docx", label: "DOCX" },
    { value: ".xlsx", label: "XLSX" },
    { value: ".csv", label: "CSV" },
    { value: ".txt", label: "TXT" },
];

/** 切换文件类型 */
const toggleFileType = (attachment: QuickCommandAttachment, type: string) => {
    const index = attachment.acceptTypes.indexOf(type);
    if (index > -1) {
        attachment.acceptTypes.splice(index, 1);
    } else {
        attachment.acceptTypes.push(type);
    }
};
</script>

<template>
    <div>
        <div class="bg-muted rounded-lg p-3">
            <div class="flex items-center justify-between">
                <div class="text-foreground flex items-center gap-1 text-sm font-medium">
                    {{ $t("ai-agent.backend.configuration.command") }}
                    <UTooltip :delay-duration="0">
                        <UIcon name="i-lucide-circle-help" />
                        <template #content>
                            <div class="text-background text-xs">
                                {{ $t("ai-agent.backend.configuration.commandDesc") }}
                            </div>
                        </template>
                    </UTooltip>
                </div>

                <UButton
                    size="sm"
                    color="primary"
                    variant="ghost"
                    class="flex items-center"
                    @click="openModal"
                >
                    <UIcon name="i-lucide-plus" />
                    <span>{{ $t("console-common.add") }}</span>
                </UButton>
            </div>

            <div class="space-y-3">
                <div
                    v-for="(item, index) in command"
                    :key="item.name"
                    class="group bg-background mt-2 flex items-center gap-2 rounded-lg px-3 py-2"
                >
                    <div class="flex flex-1 items-center gap-2">
                        <div
                            v-if="item.avatar"
                            class="bg-primary-50 border-default flex rounded-lg border border-dashed"
                        >
                            <NuxtImg
                                :src="item?.avatar"
                                alt="avatar"
                                class="size-8 rounded-lg object-contain"
                            />
                        </div>
                        <span class="text-muted-foreground font-mono text-xs">{{ item.name }}</span>
                        <!-- 附件图标 -->
                        <span v-if="item.attachments?.length" class="flex items-center gap-1">
                            <UIcon
                                v-for="att in item.attachments"
                                :key="att.id"
                                name="i-lucide-paperclip"
                                class="text-primary text-xs"
                                :class="{ 'text-error': att.required }"
                            />
                        </span>
                    </div>

                    <div class="block group-hover:hidden">
                        <UBadge v-if="item.replyType" color="neutral" variant="outline" size="sm">
                            {{
                                item.replyType === "custom"
                                    ? $t("ai-agent.backend.configuration.commandReplyTypeCustom")
                                    : item.replyType === "template"
                                      ? "填入输入框"
                                      : $t("ai-agent.backend.configuration.commandReplyTypeModel")
                            }}
                        </UBadge>
                    </div>
                    <div class="hidden items-center group-hover:flex">
                        <UButton
                            size="xs"
                            color="primary"
                            variant="ghost"
                            icon="i-lucide-edit"
                            @click="openEditModal(index)"
                        />
                        <UButton
                            size="xs"
                            color="error"
                            variant="ghost"
                            icon="i-lucide-trash"
                            @click="removeCommand(index)"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- 添加/编辑弹窗 -->
        <BdModal
            v-model:open="isOpen"
            :title="isEdit ? $t('ai-agent.backend.configuration.commandEditTitle') : $t('ai-agent.backend.configuration.commandAddTitle')"
            :ui="{ content: 'max-w-lg' }"
            @close="modalClose"
        >
            <UForm :state="state" :schema="formSchema" class="space-y-4" @submit="submitForm">
                <UFormField
                    :label="$t('ai-agent.backend.configuration.commandUploadIcon')"
                    name="avatar"
                >
                    <BdUploader
                        v-model="state.avatar"
                        class="h-16 w-16"
                        text=" "
                        icon="i-lucide-upload"
                        accept=".jpg,.png,.jpeg,.gif,.webp"
                        :maxCount="1"
                        :single="true"
                        :multiple="false"
                    />
                </UFormField>

                <UFormField
                    :label="$t('ai-agent.backend.configuration.commandName')"
                    name="name"
                    required
                >
                    <UInput
                        v-model="state.name"
                        :placeholder="$t('ai-agent.backend.configuration.commandNamePlaceholder')"
                        :ui="{ root: 'w-full' }"
                    />
                </UFormField>

                <UFormField
                    :label="$t('ai-agent.backend.configuration.commandContent')"
                    name="content"
                    required
                >
                    <UTextarea
                        v-model="state.content"
                        :placeholder="$t('ai-agent.backend.configuration.commandContentPlaceholder')"
                        :ui="{ root: 'w-full' }"
                        :rows="3"
                    />
                </UFormField>

                <UFormField
                    :label="$t('ai-agent.backend.configuration.commandReplyType')"
                    name="type"
                    required
                >
                    <div class="flex flex-wrap items-center gap-2">
                        <UCheckbox
                            :model-value="state.replyType === 'custom'"
                            indicator="end"
                            variant="card"
                            default-value
                            :label="$t('ai-agent.backend.configuration.commandReplyTypeCustom')"
                            @update:model-value="state.replyType = 'custom'"
                        />
                        <UCheckbox
                            :model-value="state.replyType === 'model'"
                            indicator="end"
                            variant="card"
                            default-value
                            :label="$t('ai-agent.backend.configuration.commandReplyTypeModel')"
                            @update:model-value="state.replyType = 'model'"
                        />
                        <UCheckbox
                            :model-value="state.replyType === 'template'"
                            indicator="end"
                            variant="card"
                            default-value
                            label="填入输入框"
                            @update:model-value="state.replyType = 'template'"
                        />
                    </div>
                </UFormField>

                <UFormField
                    v-if="state.replyType === 'template'"
                    label="模板内容提示"
                    class="text-sm text-gray-500"
                >
                    <div class="text-muted-foreground text-xs">
                        选择此选项后，点击快捷指令时会将"指令内容"填入输入框，用户可补充信息后再发送。支持使用占位符如 {附件1}、{附件2} 来标记附件位置。
                    </div>
                </UFormField>

                <!-- 附件配置区域 -->
                <template v-if="state.replyType === 'template'">
                    <USeparator class="my-4" />
                    
                    <div class="bg-muted/50 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2">
                                <UIcon name="i-lucide-paperclip" class="text-primary" />
                                <span class="text-sm font-medium">附件配置</span>
                            </div>
                            <UButton
                                size="xs"
                                color="primary"
                                variant="soft"
                                @click="addAttachment"
                            >
                                <UIcon name="i-lucide-plus" class="mr-1" />
                                插入附件
                            </UButton>
                        </div>

                        <!-- 附件列表 -->
                        <div v-if="state.attachments?.length" class="space-y-3">
                            <div
                                v-for="(att, idx) in state.attachments"
                                :key="att.id"
                                class="bg-background rounded-lg p-3 space-y-2"
                            >
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-primary font-medium">{{ att.placeholder }}</span>
                                        <UButton
                                            size="xs"
                                            color="neutral"
                                            variant="ghost"
                                            @click="insertPlaceholder(att.placeholder)"
                                        >
                                            插入到内容
                                        </UButton>
                                    </div>
                                    <UButton
                                        size="xs"
                                        color="error"
                                        variant="ghost"
                                        icon="i-lucide-trash"
                                        @click="removeAttachment(idx)"
                                    />
                                </div>

                                <!-- 附件配置表单 -->
                                <div class="grid grid-cols-2 gap-2">
                                    <UFormField label="按钮标签" class="col-span-1">
                                        <UInput
                                            v-model="att.label"
                                            size="xs"
                                            placeholder="如：主表格"
                                        />
                                    </UFormField>

                                    <UFormField label="占位符" class="col-span-1">
                                        <UInput
                                            v-model="att.placeholder"
                                            size="xs"
                                            placeholder="如：{附件1}"
                                        />
                                    </UFormField>
                                </div>

                                <div class="flex items-center gap-4">
                                    <UCheckbox
                                        v-model="att.required"
                                        label="必填（未上传时阻止提交）"
                                    />
                                </div>

                                <UFormField label="说明文案（鼠标悬停显示）">
                                    <UInput
                                        v-model="att.description"
                                        size="xs"
                                        placeholder="如：请上传需要分析的主表格文件"
                                    />
                                </UFormField>

                                <UFormField label="允许的文件类型">
                                    <div class="flex flex-wrap gap-1">
                                        <UButton
                                            v-for="type in fileTypeOptions"
                                            :key="type.value"
                                            size="xs"
                                            :color="att.acceptTypes.includes(type.value) ? 'primary' : 'neutral'"
                                            :variant="att.acceptTypes.includes(type.value) ? 'soft' : 'ghost'"
                                            @click="toggleFileType(att, type.value)"
                                        >
                                            {{ type.label }}
                                        </UButton>
                                    </div>
                                </UFormField>
                            </div>
                        </div>

                        <div v-else class="text-muted-foreground text-sm text-center py-4">
                            点击"插入附件"添加附件配置
                        </div>
                    </div>
                </template>

                <UFormField
                    v-if="state.replyType === 'custom'"
                    :label="$t('ai-agent.backend.configuration.commandReplyContent')"
                    name="replyContent"
                    required
                >
                    <BdEditor
                        v-model="state.replyContent"
                        outputFormat="markdown"
                        custom-class="!h-auto min-h-50"
                    />
                </UFormField>

                <div class="mt-6 flex justify-end gap-2">
                    <UButton color="neutral" variant="soft" size="lg" @click="modalClose">
                        {{ $t("console-common.cancel") }}
                    </UButton>
                    <UButton color="primary" size="lg" type="submit">
                        {{ $t("console-common.save") }}
                    </UButton>
                </div>
            </UForm>
        </BdModal>
    </div>
</template>
