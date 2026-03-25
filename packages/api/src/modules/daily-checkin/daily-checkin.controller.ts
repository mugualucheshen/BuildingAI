import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DailyCheckinService } from './daily-checkin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DailyCheckinConfig } from '../../entities/daily-checkin-config.entity';

@ApiTags('每日签到')
@Controller('api/daily-checkin')
export class DailyCheckinController {
    constructor(private readonly dailyCheckinService: DailyCheckinService) {}

    /**
     * 获取签到配置
     */
    @Get('config')
    @ApiOperation({ summary: '获取签到配置' })
    async getConfig(): Promise<DailyCheckinConfig> {
        return this.dailyCheckinService.getConfig();
    }

    /**
     * 更新签到配置（管理员）
     */
    @Post('config')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '更新签到配置' })
    async updateConfig(@Body() configData: Partial<DailyCheckinConfig>): Promise<DailyCheckinConfig> {
        return this.dailyCheckinService.updateConfig(configData);
    }

    /**
     * 执行签到
     */
    @Post('do')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '执行每日签到' })
    async doCheckin(@CurrentUser() user: { userId: string }) {
        const result = await this.dailyCheckinService.doCheckin(user.userId);
        return {
            success: true,
            data: result,
        };
    }

    /**
     * 检查今日是否已签到
     */
    @Get('status')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '检查今日签到状态' })
    async checkStatus(@CurrentUser() user: { userId: string }) {
        const hasCheckedIn = await this.dailyCheckinService.hasCheckedInToday(user.userId);
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
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '获取签到记录列表' })
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
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '获取签到统计' })
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
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '获取我的签到记录' })
    async getMyRecords(@CurrentUser() user: { userId: string }) {
        const records = await this.dailyCheckinService.getUserRecords(user.userId);
        return {
            success: true,
            data: records,
        };
    }
}
