<script setup lang="ts">
import type { FormFieldConfig, QuickCommandConfig, QuickCommandAttachment } from "@buildingai/service/consoleapi/ai-agent";
import type { PaginationResult } from "@buildingai/service/models/globals";
import type { AiMessage } from "@buildingai/service/models/message";
import {
    apiChatStream,
    apiGenerateAccessToken,
    apiGetAgentInfo,
    apiGetMessages,
} from "@buildingai/service/webapi/ai-agent-publish";
import { type AiConversation, apiGetChatConfig } from "@buildingai/service/webapi/ai-conversation";
import { extractTextFromMessageContent } from "@buildingai/utils/message-content.utils";
import { uploadFileAdaptive } from "@buildingai/upload";
import { useThrottleFn } from "@vueuse/core";
import { nextTick, onMounted, onUnmounted, shallowRef, watch } from "vue";

import PublicAgentChatsList from "./chats-list.vue";

const AgentAnnotationModal = defineAsyncComponent(
    () => import("../../../console/ai/agent/components/logs/annotation-modal.vue"),
);
const ChatsContextModal = defineAsyncComponent(
    () => import("~/components/ask-assistant-chat/chats-context-modal.vue"),
);
const VariableInput = defineAsyncComponent(
    () => import("../../../console/ai/agent/components/configuration/variable-input.vue"),
);

const props = defineProps<{
    // 扣费模式：creator、user、all
    billingMode: string;
}>();

const { t } = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");
const { params: URLQueryParams } = useRoute();
const publishToken = computed(() => (URLQueryParams as Record<string, string>).id || "");

const userStore = useUserStore();

const toast = useMessage();
const overlay = useOverlay();
const scrollAreaRef = useTemplateRef("scrollAreaRef");
const { height: scrollAreaHeight } = useElementSize(scrollAreaRef);

// 从cookie中获取当前对话ID
const currentConversationCookie = useCookie(`public_agent_conversation_${publishToken.value}`);
const conversationId = shallowRef<string | null>(
    userStore.isLogin ? currentConversationCookie.value || null : null,
);
const isAtBottom = shallowRef(true);
const agentError = shallowRef<string>("");

// 标注模态框相关状态
const currentMessageId = shallowRef<string | null>(null);
const annotationFormData = shallowRef<{
    question: string;
    answer: string;
    enabled: boolean;
}>({
    question: "",
    answer: "",
    enabled: true,
});
const showOpeningStatement = shallowRef(false);

watch(conversationId, (newVal) => {
    if (userStore.isLogin) {
        currentConversationCookie.value = newVal;
    } else {
        currentConversationCookie.value = null;
    }
});

// 分页参数
const queryPaging = reactive({ page: 1, pageSize: 15 });
const hasMore = shallowRef(false);

// 获取或生成访问令牌
const { data: accessTokenData, refresh: _refreshAccessToken } = await useAsyncData(
    `access-token-${publishToken.value}`,
    async () => {
        const cookieKey = `public_agent_token_${publishToken.value}`;
        const existingToken = useCookie(cookieKey);

        if (existingToken.value) {
            return { accessToken: existingToken.value, fromCache: true };
        }

        try {
            const tokenInfo = await apiGenerateAccessToken(publishToken.value);
            existingToken.value = tokenInfo.accessToken;
            return { ...tokenInfo, fromCache: false };
        } catch (error) {
            console.error("生成访问令牌失败:", error);
            throw error;
        }
    },
);

const accessToken = computed(() => accessTokenData.value?.accessToken || "");

// 获取当前对话的消息记录
const { data: messagesData, refresh: refreshMessagesData } = await useAsyncData(
    () => {
        if (!conversationId.value || !accessToken.value) {
            console.log("conversationId.value", conversationId.value);
            return {
                items: [],
                total: 0,
                page: queryPaging.page,
                pageSize: queryPaging.pageSize,
            } as unknown as Promise<PaginationResult<AiMessage>>;
        }
        return apiGetMessages(
            publishToken.value,
            accessToken.value,
            conversationId.value as string,
            queryPaging,
        );
    },
    {
        transform: (data: PaginationResult<AiMessage>) => data,
    },
);

const { data: chatConfig } = await useAsyncData("chat-config", () => apiGetChatConfig());

// 检查智能体是否存在
if (!messagesData.value) {
    agentError.value = "智能体不存在或未发布";
}
if (!messagesData.value?.items?.length) {
    conversationId.value = null;
}

hasMore.value = (messagesData.value?.total as number) > (messagesData.value?.items?.length || 0);

// 根据消息数据生成初始消息
const initialMessages = computed(() => {
    if (!messagesData.value?.items) return [];
    return messagesData.value.items.map((item: AiMessage) => ({
        ...item,
        id: item.id || uuid(),
        avatar: agent.value?.chatAvatar || agent.value?.avatar,
        status: "completed" as const,
        // 只保留助手消息的创建时间，用户消息不需要
        ...(item.role === "assistant" && { createdAt: item.createdAt }),
    }));
});

// 获取智能体信息
const { data: agent, pending: agentLoading } = await useAsyncData(
    `public-agent-${publishToken.value}`,
    () => apiGetAgentInfo(publishToken.value, accessToken.value),
);

// 对话管理方法
const createNewConversation = () => {
    conversationId.value = null;
    queryPaging.page = 1;
    messages.value = [];
    showOpeningStatement.value = true;
    if (agent.value) {
        agent.value.formFieldsInputs = {};
    }
};

const switchConversation = async (conv: AiConversation) => {
    if (conv.id === conversationId.value) return;
    conversationId.value = conv.id as string;
    queryPaging.page = 1;
    refreshMessagesData();
    scrollToBottom();
};

// 优雅的表单字段处理
const syncFormFieldsFromMessages = (messages: AiMessage[]) => {
    if (!agent.value) return;

    const lastUserMessage = messages
        .slice()
        .reverse()
        .find((msg) => msg?.role === "user" && msg.formFieldsInputs);

    console.log("lastUserMessage", lastUserMessage);
    agent.value.formFieldsInputs = lastUserMessage?.formFieldsInputs || {};
};

// 聊天功能
const { messages, input, files, handleSubmit, reload, stop, status, error } = useChat({
    api: apiChatStream,
    initialMessages: [],
    chatConfig: {
        get avatar() {
            return agent.value?.chatAvatar || agent.value?.avatar;
        },
    },
    body: {
        publishToken: publishToken.value,
        accessToken: accessToken.value,
        saveConversation: true,
        get conversationId() {
            return conversationId.value;
        },
        get billingMode() {
            return props.billingMode;
        },
        get formFields() {
            return agent.value?.formFields || [];
        },
        get formFieldsInputs() {
            return agent.value?.formFieldsInputs || {};
        },
    },
    onToolCall() {},
    onResponse(response: Response) {
        if (response.status === 401) {
            const userStore = useUserStore();
            userStore.logout(true);
        }
    },
    onUpdate(chunk) {
        if (chunk.type === "conversation_id") {
            conversationId.value = chunk.data as string;
            refreshNuxtData(
                `public-agent-conversations-${publishToken.value}-${accessToken.value}`,
            );
        }
    },
    onError(err: Error) {
        console.error("聊天错误:", err?.message || "发送失败");
    },
    onFinish(message) {
        console.log("聊天完成:", message);
    },
});

const isLoading = computed(() => status.value === "loading");

watch(
    () => userStore.isLogin,
    (isLogin) => {
        if (isLogin) return;

        useCookie(`public_agent_conversation_${publishToken.value}`, {
            maxAge: -1,
            path: "/",
        }).value = null;
        useCookie(`public_agent_token_${publishToken.value}`, { maxAge: -1, path: "/" }).value =
            null;

        stop();
        messages.value = [];
        conversationId.value = null;
        hasMore.value = false;
        queryPaging.page = 1;
        showOpeningStatement.value = true;
    },
    { immediate: true },
);

// 加载更多消息
const loadMoreMessages = async () => {
    if (!hasMore.value || !conversationId.value || !publishToken.value || !accessToken.value)
        return;

    queryPaging.page++;
    try {
        const data = await apiGetMessages(
            publishToken.value,
            accessToken.value,
            conversationId.value,
            queryPaging,
        );

        const newMessages =
            data.items?.reverse().map((item: AiMessage) => ({
                id: item.id || uuid(),
                role: item.role,
                content: item.content,
                status: "completed" as const,
                mcpToolCalls: item.mcpToolCalls,
                // 只保留助手消息的创建时间，用户消息不需要
                ...(item.role === "assistant" && { createdAt: item.createdAt }),
            })) || [];

        messages.value.unshift(...newMessages);
        hasMore.value = data.total > messages.value.length;
    } catch (err) {
        queryPaging.page--;
        console.error("加载更多消息失败:", err);
        hasMore.value = true;
    }
};

const handleScroll = useThrottleFn((event: Event) => {
    const target = event.target as HTMLElement;
    const threshold = 40;
    isAtBottom.value = target.scrollHeight - (target.scrollTop + target.clientHeight) <= threshold;
}, 100);

const scrollToBottom = async (animate = true) => {
    await nextTick();
    scrollAreaRef.value?.scrollToBottom(animate);
};

/**
 * 验证表单字段是否满足必填要求
 * @returns 验证是否通过，true表示通过，false表示失败
 */
const validateFormFields = (): boolean => {
    if (!agent.value) {
        toast.error("智能体信息未加载");
        return false;
    }

    const formFields = agent.value.formFields || [];
    const formFieldsInputs = agent.value.formFieldsInputs || {};

    if (formFields.length === 0) {
        return true; // 没有表单字段，直接通过
    }

    const validationErrors: string[] = [];

    formFields.forEach((field: FormFieldConfig) => {
        if (field.required) {
            const value = formFieldsInputs[field.name];
            if (!value || (typeof value === "string" && value.trim() === "")) {
                validationErrors.push(`${field.label}是必填字段`);
            }
        }
    });

    if (validationErrors.length > 0) {
        toast.error(`表单验证失败: ${validationErrors.join(", ")}`);
        return false;
    }

    return true;
};

/**
 * 开始对话的处理函数
 */
const handleStartConversation = () => {
    if (!validateFormFields()) {
        return; // 表单验证失败，不关闭表单
    }
    showOpeningStatement.value = false;
};

// 提交消息
const handleSubmitMessage = async (content: string) => {
    if (!content.trim() || isLoading.value) return;
    if (!agent.value) return toast.error("智能体信息未加载");
    if (!accessToken.value) return toast.error("请先生成访问令牌");

    // 验证表单字段
    if (!validateFormFields()) {
        return;
    }

    await handleSubmit(content);
    
    // 发送成功后清理附件状态
    files.value = [];
    uploadedAttachments.value = {};
    activeQuickCommand.value = null;
    
    scrollToBottom();
};

// 处理快捷指令点击
const activeQuickCommand = shallowRef<QuickCommandConfig | null>(null);

// 已上传的附件记录
const uploadedAttachments = ref<Record<string, string>>({});

const handleQuickCommandClick = (item: QuickCommandConfig) => {
    if (item.replyType === 'template') {
        // 检查是否是同一个快捷指令，如果是则切换关闭
        if (activeQuickCommand.value?.name === item.name) {
            // 再次点击，关闭/清除状态
            activeQuickCommand.value = null;
            input.value = '';
            files.value = [];
            uploadedAttachments.value = {};
            return;
        }
        
        // 填入输入框
        input.value = item.content;
        
        // 保存当前激活的快捷指令
        activeQuickCommand.value = item;
        
        // 重置上传记录
        uploadedAttachments.value = {};
        
        // 聚焦输入框
        nextTick(() => {
            const textarea = document.querySelector('.custom-textarea') as HTMLTextAreaElement;
            if (textarea) {
                textarea.focus();
            }
        });
    } else {
        // 原来的逻辑：直接发送
        handleSubmitMessage(item.name);
    }
};

// 检查附件是否已上传
const isAttachmentUploaded = (placeholder: string): boolean => {
    return !!uploadedAttachments.value[placeholder];
};

// 获取附件按钮标签
const getAttachmentButtonLabel = (att: QuickCommandAttachment): string => {
    if (uploadedAttachments.value[att.placeholder]) {
        return uploadedAttachments.value[att.placeholder] as string;
    }
    return att.label || att.placeholder || '附件';
};

// 检查是否有未上传的必填附件
const hasUnfilledRequiredAttachments = computed(() => {
    if (!activeQuickCommand.value?.attachments) return false;
    return activeQuickCommand.value.attachments.some(
        att => att.required && !uploadedAttachments.value[att.placeholder]
    );
});

// 处理附件上传
const handleAttachmentUpload = async (att: QuickCommandAttachment) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = att.maxCount > 1;
    fileInput.accept = att.acceptTypes.join(',');
    
    fileInput.onchange = async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            // 限制文件数量
            const filesToUpload = Array.from(target.files).slice(0, att.maxCount);
            
            // 上传文件并获取真实URL
            const uploadedFiles = [];
            for (const file of filesToUpload) {
                try {
                    const result = await uploadFileAdaptive(
                        { file, description: `Attachment: ${file.name}` },
                        { onProgress: (percent) => console.log(`Uploading ${file.name}: ${percent}%`) }
                    );
                    uploadedFiles.push({
                        type: 'file_url' as const,
                        name: file.name,
                        url: result.url,
                    });
                } catch (error) {
                    toast.error(`上传 ${file.name} 失败`);
                    console.error('Upload failed:', error);
                }
            }
            
            if (uploadedFiles.length === 0) {
                return;
            }
            
            // 构建文件名显示
            const fileNames = uploadedFiles.map(f => `[📎 ${f.name}]`).join(' ');
            
            // 替换输入框中的占位符
            const placeholderRegex = new RegExp(att.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\$&'), 'g');
            input.value = input.value.replace(placeholderRegex, fileNames);
            
            // 记录已上传
            uploadedAttachments.value[att.placeholder] = uploadedFiles.map(f => f.name).join(', ');
            
            // 将文件添加到 files 列表（用于发送时提交）
            files.value = [...files.value, ...uploadedFiles];
            
            toast.success(`已上传 ${uploadedFiles.length} 个文件`);
        }
    };
    fileInput.click();
};

// 删除附件
const removeAttachment = (att: QuickCommandAttachment) => {
    // 从上传记录中删除
    delete uploadedAttachments.value[att.placeholder];
    
    // 清空所有文件（简化处理）
    files.value = [];
    
    // 恢复输入框为原始模板内容
    if (activeQuickCommand.value) {
        input.value = activeQuickCommand.value.content;
    }
    
    toast.info(`已删除 ${att.label || att.placeholder}，请重新上传所需附件`);
};

// 带附件验证的提交
const handleSubmitWithAttachmentCheck = () => {
    // 检查必填附件
    if (hasUnfilledRequiredAttachments.value) {
        const requiredAtts = activeQuickCommand.value?.attachments?.filter(
            att => att.required && !uploadedAttachments.value[att.placeholder]
        );
        const attNames = requiredAtts?.map(att => att.label || att.placeholder).join('、');
        toast.error(`请上传必填附件：${attNames}`);
        return;
    }
    
    // 正常提交
    handleSubmitMessage(input.value);
};

// 监听器
watch(
    initialMessages,
    (newMessages) => {
        if (!newMessages) return;

        messages.value = [...newMessages];
        syncFormFieldsFromMessages(newMessages);

        nextTick(() => {
            if (newMessages.length > 0) {
                scrollToBottom(false);
            } else {
                showOpeningStatement.value = true;
            }
        });
    },
    { immediate: true },
);

watch(
    () => messages.value.at(-1)?.content,
    () => {
        nextTick(() => {
            if (isAtBottom.value) {
                scrollToBottom(false);
            }
        });
    },
    { flush: "post" },
);

const openContextModal = (context: AiMessage[]): void => {
    const modal = overlay.create(ChatsContextModal);

    modal.open({ context });
};

const openAnnotationModal = (annotationId: string, messageId: string | null = null): void => {
    currentMessageId.value = messageId;

    const modal = overlay.create(AgentAnnotationModal);

    modal.open({
        agentId: agent.value?.id as string,
        hiddenStatus: true,
        annotationId,
        messageId,
        isPublic: true,
        publishToken: publishToken.value,
        accessToken: accessToken.value,
        initialData: undefined,
        onResult: (result?: AiMessage) => {
            handleAnnotationModalClose(true, result);
        },
    });
};

const openAnnotationCreateModal = (message: AiMessage, index: number): void => {
    // 获取上一条消息作为用户问题
    const prevMessage = messages.value[index - 1];
    if (!prevMessage || prevMessage.role !== "user") {
        toast.error("找不到对应的用户问题");
        return;
    }

    // 预填充表单数据
    annotationFormData.value = {
        question: extractTextFromMessageContent(prevMessage.content),
        answer: extractTextFromMessageContent(message.content),
        enabled: true,
    };

    currentMessageId.value = message.id || null;

    const modal = overlay.create(AgentAnnotationModal);

    modal.open({
        agentId: agent.value?.id as string,
        annotationId: null,
        messageId: message.id || null,
        isPublic: true,
        publishToken: publishToken.value,
        accessToken: accessToken.value,
        initialData: annotationFormData.value,
        onResult: (result?: AiMessage) => {
            handleAnnotationModalClose(true, result);
        },
    });
};

function handleAnnotationModalClose(refresh?: boolean, result?: AiMessage) {
    // 如果是创建标注成功，更新对应消息的元数据
    if (result?.id && currentMessageId.value) {
        const messageIndex = messages.value.findIndex((msg) => msg.id === currentMessageId.value);
        if (messageIndex >= 0) {
            const message = messages.value[messageIndex];
            if (message && !message.metadata) {
                message.metadata = {};
            }
            if (message?.metadata) {
                message.metadata.annotations = {
                    annotationId: result.id,
                    createdBy: "",
                    question: "",
                    similarity: 1,
                };
            }
        }
    }

    currentMessageId.value = null;
    // 重置表单数据
    annotationFormData.value = {
        question: "",
        answer: "",
        enabled: true,
    };
}

// 生命周期
let mutationObserver: MutationObserver | null = null;

onMounted(async () => {
    scrollToBottom(false);

    const viewportComp = scrollAreaRef.value?.getViewportElement();
    const viewportEl = (viewportComp &&
        (viewportComp as unknown as Record<string, unknown>).viewportElement) as HTMLElement;

    if (viewportEl) {
        viewportEl.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll({ target: viewportEl } as unknown as Event);

        const throttledScrollToBottom = useThrottleFn(() => {
            if (isAtBottom.value) {
                scrollToBottom(false);
            }
        }, 50);

        mutationObserver = new MutationObserver(() => {
            throttledScrollToBottom();
        });
        mutationObserver.observe(viewportEl, {
            childList: true,
            subtree: false,
            characterData: false,
        });
    }
});

onUnmounted(() => {
    const viewportComp = scrollAreaRef.value?.getViewportElement();
    const viewportEl = (viewportComp &&
        (viewportComp as unknown as Record<string, unknown>).viewportElement) as HTMLElement;
    viewportEl?.removeEventListener("scroll", handleScroll);
    mutationObserver?.disconnect();
});

// 页面标题
useHead({
    title: computed(() => (agent.value ? `${agent.value.name} - BuildingAI` : "BuildingAI")),
    link: [
        { rel: "icon", href: computed(() => agent.value?.avatar || "/favicon.ico") },
        { rel: "apple-touch-icon", href: computed(() => agent.value?.avatar || "/favicon.ico") },
    ],
});
</script>

<template>
    <div
        class="ai-chat bg-secondary flex h-full min-h-0 items-center justify-center rounded-l-xl p-2"
        :class="{ 'p-0!': isMobile }"
    >
        <!-- 左侧会话列表 -->
        <div class="bg-secondary h-full flex-none">
            <PublicAgentChatsList
                :agent="agent"
                :publish-token="publishToken"
                :access-token="accessToken"
                v-model="conversationId"
                @new-conversation="createNewConversation"
                @switch-conversation="switchConversation"
            />
        </div>

        <!-- 右侧聊天区域 -->
        <div
            class="bg-background flex h-full min-h-0 w-full flex-col items-center rounded-xl"
            :class="{ 'rounded-none!': isMobile }"
        >
            <!-- 加载状态 -->
            <div v-if="agentLoading" class="flex h-full w-full items-center justify-center">
                <div class="flex items-center gap-3">
                    <UIcon name="i-lucide-loader-2" class="text-primary size-6 animate-spin" />
                    <span class="text-lg">{{ $t("ai-agent.frontend.chat.loadingAgent") }}</span>
                </div>
            </div>

            <!-- 错误状态 -->
            <div v-else-if="agentError" class="flex h-full w-full items-center justify-center">
                <div class="text-center">
                    <UIcon name="i-lucide-alert-circle" class="text-error mx-auto mb-4 size-12" />
                    <h2 class="mb-2 text-xl font-semibold">
                        {{ $t("ai-agent.frontend.chat.loadingFailed") }}
                    </h2>
                    <p class="text-muted-foreground">{{ agentError }}</p>
                </div>
            </div>

            <!-- 聊天界面 -->
            <template v-else-if="agent">
                <div class="flex h-12 w-full items-center justify-center"></div>

                <!-- 聊天内容区域 -->
                <BdScrollArea
                    class="h-full min-h-0 w-full"
                    type="auto"
                    ref="scrollAreaRef"
                    @in-view="scrollToBottom(false)"
                >
                    <BdChatScroll
                        :loading="false"
                        :has-more="hasMore"
                        :threshold="500"
                        content-class="max-w-[800px] w-full space-y-3 p-4 lg:py-4"
                        @load-more="loadMoreMessages"
                    >
                        <!-- 开场白与提问建议 -->
                        <ChatsMessages
                            v-if="
                                messages.length === 0 &&
                                (!showOpeningStatement || !agent.formFields?.length) &&
                                agent.openingStatement?.length &&
                                agent.openingQuestions?.length
                            "
                            :messages="
                                [
                                    {
                                        role: 'assistant',
                                        avatar: agent?.chatAvatar || agent?.avatar,
                                        content: agent?.openingStatement || '',
                                    },
                                ] as AiMessage[]
                            "
                            :scroll-area-height="200"
                            :assistant="{
                                actions: [],
                            }"
                        >
                            <template #content="{ message }">
                                <BdMarkdown
                                    :content="message.content.toString()"
                                    :show-run-button="false"
                                />

                                <div class="flex flex-col gap-2" :class="{ 'ml-4': agent?.avatar }">
                                    <div class="text-muted-foreground text-sm">
                                        {{ $t("ai-agent.frontend.chat.youCanAskMe") }}
                                    </div>

                                    <div
                                        v-for="question in agent?.openingQuestions || []"
                                        :key="question"
                                    >
                                        <UButton
                                            :label="question"
                                            color="primary"
                                            variant="soft"
                                            @click="handleSubmitMessage(question)"
                                        />
                                    </div>
                                </div>
                            </template>
                        </ChatsMessages>

                        <!-- 聊天消息 -->
                        <ChatsMessages
                            v-if="messages.length !== 0"
                            :messages="messages as AiMessage[]"
                            :scroll-area-height="scrollAreaHeight"
                            :error="error as unknown as Error"
                            :assistant="{
                                actions: [
                                    {
                                        label: t('ai-chat.frontend.messages.retry'),
                                        icon: 'i-lucide-rotate-cw-square',
                                        onClick: () => reload(),
                                    },
                                    {
                                        label: t('ai-agent.frontend.chat.chatContext'),
                                        icon: 'i-lucide-file-type',
                                        show: !agent.showContext,
                                        onClick: (message) => {
                                            if (message?.metadata?.context) {
                                                openContextModal(message.metadata.context);
                                            } else {
                                                toast.error(
                                                    t(
                                                        'ai-agent.backend.configuration.noChatContext',
                                                    ),
                                                );
                                            }
                                        },
                                    },
                                    {
                                        label: t('ai-agent.frontend.chat.annotation'),
                                        icon: 'i-lucide-wrap-text',
                                        show: !agent.enableFeedback,
                                        onClick: (message, index) => {
                                            const annotationId =
                                                message.metadata?.annotations?.annotationId;
                                            if (annotationId) {
                                                // 有标注ID，打开编辑弹窗
                                                openAnnotationModal(annotationId, message.id);
                                            } else {
                                                // 没有标注ID，打开创建弹窗
                                                openAnnotationCreateModal(message, index);
                                            }
                                        },
                                    },
                                ],
                            }"
                            :spacing-offset="160"
                        >
                            <template #content="{ message }">
                                <BdMarkdown
                                    v-if="message.content.length"
                                    :content="message.content.toString()"
                                    :show-run-button="false"
                                >
                                    <template #before>
                                        <div
                                            v-if="message.status === 'loading'"
                                            class="flex items-center gap-2"
                                        >
                                            <UIcon name="i-lucide-loader-2" class="animate-spin" />
                                            <span>{{
                                                t("ai-chat.frontend.messages.thinking")
                                            }}</span>
                                        </div>
                                    </template>
                                    <template #after>
                                        <template
                                            v-if="
                                                message.metadata?.references &&
                                                message.metadata.references.length > 0 &&
                                                message.role === 'assistant' &&
                                                !isLoading &&
                                                agent.showReference
                                            "
                                        >
                                            <!-- 知识库引用来源 -->
                                            <div class="my-2 flex items-center gap-1">
                                                <span
                                                    class="text-muted-foreground flex-none text-xs"
                                                >
                                                    {{ t("ai-agent.frontend.chat.reference") }}
                                                </span>
                                                <USeparator
                                                    size="xs"
                                                    type="dashed"
                                                    v-if="
                                                        message.metadata?.references &&
                                                        message.metadata.references.length > 0 &&
                                                        message.role === 'assistant'
                                                    "
                                                />
                                            </div>
                                            <ReferenceKnowledgeFiles
                                                :references="message.metadata.references"
                                            />
                                        </template>
                                    </template>
                                </BdMarkdown>
                            </template>
                            <template #after-tools="{ message: slotMessage, index: slotIndex }">
                                <div
                                    v-if="
                                        slotMessage.metadata?.suggestions &&
                                        messages.length - 1 === slotIndex
                                    "
                                    class="m-2 space-y-2"
                                >
                                    <div
                                        v-for="suggestion in slotMessage.metadata.suggestions"
                                        :key="suggestion"
                                    >
                                        <UButton
                                            :label="suggestion"
                                            color="primary"
                                            variant="soft"
                                            @click="handleSubmitMessage(suggestion)"
                                        />
                                    </div>
                                </div>
                            </template>
                        </ChatsMessages>

                        <!-- 表单变量输入 -->
                        <div
                            v-if="agent.formFields && agent.formFields.length > 0"
                            class="bg-background shadow-default my-6 w-full rounded-2xl"
                        >
                            <div
                                class="text-foreground border-muted/10 text-md flex items-center justify-between border-b p-4 font-medium"
                            >
                                <span class="flex items-center gap-2">
                                    <UIcon
                                        name="i-lucide-bot-message-square"
                                        class="text-primary size-7"
                                    />
                                    {{ t("ai-agent.frontend.chat.newConversationSettings") }}
                                </span>

                                <UButton
                                    v-if="messages.length || !showOpeningStatement"
                                    color="primary"
                                    variant="ghost"
                                    size="sm"
                                    @click="showOpeningStatement = !showOpeningStatement"
                                >
                                    <span>{{
                                        !showOpeningStatement
                                            ? t("console-common.edit")
                                            : t("console-common.close")
                                    }}</span>
                                </UButton>
                            </div>
                            <div v-show="showOpeningStatement">
                                <VariableInput
                                    v-model:inputs="agent.formFieldsInputs as Record<string, any>"
                                    :formFields="agent.formFields as FormFieldConfig[]"
                                    class="w-full bg-transparent pt-0"
                                    formClass="bg-muted hover:bg-muted"
                                />
                            </div>

                            <div
                                class="mt-2 p-4"
                                v-if="messages.length === 0 && showOpeningStatement"
                            >
                                <UButton
                                    color="primary"
                                    class="w-full justify-center"
                                    @click="handleStartConversation"
                                >
                                    <span>{{ t("ai-agent.frontend.chat.startConversation") }}</span>
                                </UButton>
                            </div>
                        </div>
                    </BdChatScroll>
                </BdScrollArea>

                <!-- 输入区域 -->
                <div class="w-full max-w-[800px] p-4 lg:py-2">
                    <!-- 快捷指令 -->
                    <div v-if="agent.quickCommands?.length" class="mb-3">
                        <div class="flex flex-wrap gap-2">
                            <UButton
                                v-for="item in agent.quickCommands"
                                :key="item.name"
                                :color="activeQuickCommand?.name === item.name ? 'primary' : 'neutral'"
                                :variant="activeQuickCommand?.name === item.name ? 'solid' : 'soft'"
                                size="sm"
                                @click.stop.prevent="handleQuickCommandClick(item)"
                            >
                                <NuxtImg v-if="item.avatar" :src="item.avatar" class="h-4 w-4" />
                                <span>{{ item.name }}</span>
                                <UIcon
                                    v-if="item.attachments?.length"
                                    v-for="att in item.attachments"
                                    :key="att.id"
                                    name="i-lucide-paperclip"
                                    class="ml-1"
                                    :class="activeQuickCommand?.name === item.name ? 'text-white' : 'text-primary'"
                                />
                            </UButton>
                        </div>
                    </div>

                    <!-- 多附件上传按钮区域 -->
                    <div
                        v-if="activeQuickCommand?.attachments?.length"
                        class="mb-2 flex flex-wrap items-center gap-2"
                    >
                        <template v-for="att in activeQuickCommand.attachments" :key="att.id">
                            <div class="flex items-center gap-1">
                                <UButton
                                    size="xs"
                                    :color="isAttachmentUploaded(att.placeholder) ? 'success' : 'primary'"
                                    variant="soft"
                                    :disabled="false"
                                    :title="att.description || ''"
                                    @click="handleAttachmentUpload(att)"
                                >
                                    <UIcon name="i-lucide-paperclip" class="mr-1" />
                                    <span v-if="att.required" class="text-error mr-1">*</span>
                                    {{ getAttachmentButtonLabel(att) }}
                                    <UIcon
                                        v-if="isAttachmentUploaded(att.placeholder)"
                                        name="i-lucide-check"
                                        class="ml-1"
                                    />
                                </UButton>
                                <!-- 删除附件按钮 -->
                                <UButton
                                    v-if="isAttachmentUploaded(att.placeholder)"
                                    size="xs"
                                    color="error"
                                    variant="ghost"
                                    icon="i-lucide-x"
                                    @click="removeAttachment(att)"
                                />
                            </div>
                        </template>
                    </div>

                    <!-- 输入框 -->
                    <ChatsPrompt
                        v-model="input"
                        v-model:file-list="files"
                        :needAuth="true"
                        :is-loading="isLoading"
                        :placeholder="t('ai-chat.frontend.and', { name: agent.name })"
                        :attachmentSizeLimit="chatConfig?.attachmentSizeLimit"
                        :model-features="agent.modelFeatures"
                        :agent-create-mode="agent.createMode"
                        :file-upload-config="agent.fileUploadConfig"
                        class="sticky bottom-0 z-10 [view-transition-name:chat-prompt]"
                        :rows="1"
                        @stop="stop"
                        @submit="handleSubmitWithAttachmentCheck"
                    >
                        <template #panel-right-item>
                            <span
                                class="text-muted-foreground text-xs"
                                v-if="(agent.billingConfig?.price ?? 0) > 0"
                            >
                                {{
                                    t("ai-chat.frontend.singleRunConsumption", {
                                        price: agent.billingConfig?.price ?? 0,
                                    })
                                }}
                            </span>
                        </template>
                    </ChatsPrompt>
                </div>
            </template>
        </div>
    </div>
</template>
