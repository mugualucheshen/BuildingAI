import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DailyCheckinService } from './daily-checkin.service';
import { DailyCheckinConfig } from '@buildingai/db/entities';
import { WebController } from '@common/decorators/controller.decorator';
import { Public } from '@buildingai/decorators/public.decorator';
import { Playground } from '@buildingai/decorators/playground.decorator';
import type { UserPlayground } from '@buildingai/db';

@ApiTags('每日签到')
@WebController('daily-checkin')
export class DailyCheckinController {
    constructor(private readonly dailyCheckinService: DailyCheckinService) {}

    /**
     * 获取签到配置
     */
    @Public()
    @Get('config')
    async getConfig(): Promise<DailyCheckinConfig> {
        return this.dailyCheckinService.getConfig();
    }

    /**
     * 更新签到配置（管理员）
     */
    @Post('config')
    async updateConfig(@Body() configData: Partial<DailyCheckinConfig>): Promise<DailyCheckinConfig> {
        return this.dailyCheckinService.updateConfig(configData);
    }

    /**
     * 执行签到
     */
    @Post('do')
    async doCheckin(@Playground() user: UserPlayground) {
        const result = await this.dailyCheckinService.doCheckin(user.id);
        return {
            success: true,
            data: result,
        };
    }

    /**
     * 检查今日是否已签到
     */
    @Public()
    @Get('status')
    async checkStatus(@Playground() user: UserPlayground) {
        const hasCheckedIn = await this.dailyCheckinService.hasCheckedInToday(user.id);
        const config = await this.dailyCheckinService.getConfig();
        return {
            success: true,
            data: {
                hasCheckedIn,
                enabled: config.enabled,
            },
        };
    }

    /**
     * 获取签到记录列表（管理员）
     */
    @Get('records')
    async getRecords(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
        @Query('date') date?: string,
    ) {
        return this.dailyCheckinService.getRecords(page, limit, date);
    }

    /**
     * 获取签到统计（管理员）
     */
    @Get('stats')
    async getStats() {
        const stats = await this.dailyCheckinService.getStats();
        return {
            success: true,
            data: stats,
        };
    }

    /**
     * 获取用户自己的签到记录
     */
    @Get('my-records')
    async getMyRecords(@Playground() user: UserPlayground) {
        const records = await this.dailyCheckinService.getUserRecords(user.id);
        return {
            success: true,
            data: records,
        };
    }
}
