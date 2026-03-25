<script setup lang="ts">
import { useMessage } from "@/composables/useMessage";

// 统计数据类型
interface CheckinStats {
    todayCount: number;
    todayPoints: number;
    monthCount: number;
    monthPoints: number;
}

// 配置类型
interface CheckinConfig {
    enabled: boolean;
    pointsType: "fixed" | "random";
    fixedPoints: number;
    randomMin: number;
    randomMax: number;
}

// 记录类型
interface CheckinRecord {
    id: string;
    userId: string;
    nickname: string;
    avatar: string;
    points: number;
    checkinDate: string;
    checkinTime: string;
}

const { t } = useI18n();
const message = useMessage();

// 当前日期
const today = new Date().toISOString().split("T")[0];

// 状态
const config = reactive<CheckinConfig>({
    enabled: true,
    pointsType: "fixed",
    fixedPoints: 10,
    randomMin: 5,
    randomMax: 20,
});

const stats = reactive<CheckinStats>({
    todayCount: 0,
    todayPoints: 0,
    monthCount: 0,
    monthPoints: 0,
});

const records = ref<CheckinRecord[]>([]);
const recordTotal = ref(0);
const recordPage = ref(1);
const recordLimit = ref(10);
const recordDate = ref(today);

// 加载状态
const loadingConfig = ref(false);
const loadingStats = ref(false);
const loadingRecords = ref(false);
const saving = ref(false);

/**
 * 获取配置
 */
const fetchConfig = async () => {
    try {
        loadingConfig.value = true;
        const res = await $fetch<CheckinConfig>("/api/daily-checkin/config");
        Object.assign(config, res);
    } catch (error) {
        console.error("获取签到配置失败:", error);
    } finally {
        loadingConfig.value = false;
    }
};

/**
 * 保存配置
 */
const saveConfig = async () => {
    try {
        saving.value = true;
        await $fetch("/api/daily-checkin/config", {
            method: "POST",
            body: config,
        });
        message.success(t("common.saveSuccess"));
    } catch (error) {
        console.error("保存配置失败:", error);
        message.error(t("common.saveFailed"));
    } finally {
        saving.value = false;
    }
};

/**
 * 获取统计数据
 */
const fetchStats = async () => {
    try {
        loadingStats.value = true;
        const res = await $fetch<{ data: CheckinStats }>("/api/daily-checkin/stats");
        Object.assign(stats, res.data);
    } catch (error) {
        console.error("获取统计数据失败:", error);
    } finally {
        loadingStats.value = false;
    }
};

/**
 * 获取签到记录
 */
const fetchRecords = async () => {
    try {
        loadingRecords.value = true;
        const res = await $fetch<{
            records: CheckinRecord[];
            total: number;
        }>("/api/daily-checkin/records", {
            query: {
                page: recordPage.value,
                limit: recordLimit.value,
                date: recordDate.value,
            },
        });
        records.value = res.records;
        recordTotal.value = res.total;
    } catch (error) {
        console.error("获取签到记录失败:", error);
    } finally {
        loadingRecords.value = false;
    }
};

/**
 * 处理分页
 */
const handlePageChange = (page: number) => {
    recordPage.value = page;
    fetchRecords();
};

/**
 * 处理日期筛选
 */
const handleDateChange = () => {
    recordPage.value = 1;
    fetchRecords();
};

// 表格列
const columns = [
    { key: "avatar", label: t("user.fields.avatar"), width: 80 },
    { key: "nickname", label: t("user.fields.nickname"), width: 150 },
    { key: "checkinDate", label: t("checkin.fields.date"), width: 120 },
    { key: "checkinTime", label: t("checkin.fields.time"), width: 100 },
    { key: "points", label: t("checkin.fields.points"), width: 100 },
];

onMounted(() => {
    fetchConfig();
    fetchStats();
    fetchRecords();
});

definePageMeta({
    title: "menu.dailyCheckin",
    inSystem: true,
});
</script>

<template>
    <div class="daily-checkin-container py-8">
        <!-- 统计卡片 -->
        <div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <UCard class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-muted-foreground text-sm">{{ t("checkin.stats.todayCount") }}</p>
                        <p class="text-2xl font-bold text-amber-600">{{ stats.todayCount }}</p>
                    </div>
                    <UIcon name="i-lucide-users" class="text-amber-500 text-3xl" />
                </div>
            </UCard>

            <UCard class="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-muted-foreground text-sm">{{ t("checkin.stats.todayPoints") }}</p>
                        <p class="text-2xl font-bold text-emerald-600">{{ stats.todayPoints }}</p>
                    </div>
                    <UIcon name="i-lucide-coins" class="text-emerald-500 text-3xl" />
                </div>
            </UCard>

            <UCard class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-muted-foreground text-sm">{{ t("checkin.stats.monthCount") }}</p>
                        <p class="text-2xl font-bold text-blue-600">{{ stats.monthCount }}</p>
                    </div>
                    <UIcon name="i-lucide-calendar" class="text-blue-500 text-3xl" />
                </div>
            </UCard>

            <UCard class="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-muted-foreground text-sm">{{ t("checkin.stats.monthPoints") }}</p>
                        <p class="text-2xl font-bold text-purple-600">{{ stats.monthPoints }}</p>
                    </div>
                    <UIcon name="i-lucide-trending-up" class="text-purple-500 text-3xl" />
                </div>
            </UCard>
        </div>

        <!-- 配置表单 -->
        <UCard class="mb-8">
            <template #header>
                <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-settings" />
                    <span class="font-medium">{{ t("checkin.config.title") }}</span>
                </div>
            </template>

            <div class="space-y-6">
                <!-- 开关 -->
                <UFormField :label="t('checkin.config.enabled')">
                    <USwitch v-model="config.enabled" />
                </UFormField>

                <!-- 积分类型 -->
                <UFormField :label="t('checkin.config.pointsType')">
                    <URadioGroup
                        v-model="config.pointsType"
                        orientation="horizontal"
                        :items="[
                            { value: 'fixed', label: t('checkin.config.fixedPoints') },
                            { value: 'random', label: t('checkin.config.randomPoints') },
                        ]"
                    />
                </UFormField>

                <!-- 固定积分 -->
                <UFormField
                    v-if="config.pointsType === 'fixed'"
                    :label="t('checkin.config.fixedPointsValue')"
                >
                    <UInput
                        v-model.number="config.fixedPoints"
                        type="number"
                        min="1"
                        max="1000"
                        :ui="{ root: 'w-32' }"
                    />
                </UFormField>

                <!-- 随机积分 -->
                <div v-if="config.pointsType === 'random'" class="flex gap-4">
                    <UFormField :label="t('checkin.config.randomMin')">
                        <UInput
                            v-model.number="config.randomMin"
                            type="number"
                            min="1"
                            max="1000"
                            :ui="{ root: 'w-32' }"
                        />
                    </UFormField>
                    <UFormField :label="t('checkin.config.randomMax')">
                        <UInput
                            v-model.number="config.randomMax"
                            type="number"
                            min="1"
                            max="1000"
                            :ui="{ root: 'w-32' }"
                        />
                    </UFormField>
                </div>

                <!-- 保存按钮 -->
                <div class="flex gap-3 pt-4">
                    <UButton
                        color="primary"
                        :loading="saving"
                        @click="saveConfig"
                    >
                        {{ t("common.save") }}
                    </UButton>
                    <UButton
                        color="neutral"
                        variant="outline"
                        @click="fetchConfig"
                    >
                        {{ t("common.reset") }}
                    </UButton>
                </div>
            </div>
        </UCard>

        <!-- 签到记录 -->
        <UCard>
            <template #header>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <UIcon name="i-lucide-list" />
                        <span class="font-medium">{{ t("checkin.records.title") }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <UInput
                            v-model="recordDate"
                            type="date"
                            size="sm"
                            @change="handleDateChange"
                        />
                        <UButton
                            size="sm"
                            color="neutral"
                            variant="outline"
                            @click="fetchRecords"
                        >
                            <UIcon name="i-lucide-refresh-cw" />
                        </UButton>
                    </div>
                </div>
            </template>

            <UTable
                :columns="columns"
                :rows="records"
                :loading="loadingRecords"
                :empty-state="{ icon: 'i-lucide-inbox', label: t('common.noData') }"
            >
                <template #avatar-data="{ row }">
                    <UAvatar :src="row.avatar" size="sm" />
                </template>

                <template #points-data="{ row }">
                    <UBadge color="primary" variant="soft">
                        +{{ row.points }}
                    </UBadge>
                </template>
            </UTable>

            <!-- 分页 -->
            <div v-if="recordTotal > recordLimit" class="mt-4 flex justify-end">
                <UPagination
                    v-model="recordPage"
                    :total="recordTotal"
                    :items-per-page="recordLimit"
                    @update:model-value="handlePageChange"
                />
            </div>
        </UCard>
    </div>
</template>
