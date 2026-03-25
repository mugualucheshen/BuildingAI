import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@buildingai/db/@nestjs/typeorm';
import { Repository, Between } from '@buildingai/db/typeorm';
import { DailyCheckinConfig, DailyCheckinRecord, User } from '@buildingai/db/entities';

@Injectable()
export class DailyCheckinService {
    constructor(
        @InjectRepository(DailyCheckinConfig)
        private configRepository: Repository<DailyCheckinConfig>,
        @InjectRepository(DailyCheckinRecord)
        private recordRepository: Repository<DailyCheckinRecord>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {}

    /**
     * 获取或创建默认配置
     */
    async getConfig(): Promise<DailyCheckinConfig> {
        let config = await this.configRepository.findOne({ where: {} });
        if (!config) {
            config = this.configRepository.create({
                enabled: true,
                pointsType: 'fixed',
                fixedPoints: 10,
                randomMin: 5,
                randomMax: 20,
            });
            await this.configRepository.save(config);
        }
        return config;
    }

    /**
     * 更新配置
     */
    async updateConfig(configData: Partial<DailyCheckinConfig>): Promise<DailyCheckinConfig> {
        const config = await this.getConfig();
        Object.assign(config, configData);
        return this.configRepository.save(config);
    }

    /**
     * 执行签到
     */
    async doCheckin(userId: string): Promise<{ points: number; isNew: boolean }> {
        const config = await this.getConfig();
        
        if (!config.enabled) {
            throw new Error('每日签到功能已关闭');
        }

        const today = new Date().toISOString().split('T')[0];
        
        // 检查今天是否已签到
        const existingRecord = await this.recordRepository.findOne({
            where: { userId, checkinDate: today },
        });

        if (existingRecord) {
            return { points: existingRecord.points, isNew: false };
        }

        // 计算积分
        let points: number;
        if (config.pointsType === 'fixed') {
            points = config.fixedPoints;
        } else {
            points = Math.floor(Math.random() * (config.randomMax - config.randomMin + 1)) + config.randomMin;
        }

        // 创建签到记录
        const record = this.recordRepository.create({
            userId,
            points,
            checkinDate: today,
            checkinTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        });
        await this.recordRepository.save(record);

        // 增加用户积分
        await this.userRepository.increment({ id: userId }, 'power', points);

        return { points, isNew: true };
    }

    /**
     * 检查今日是否已签到
     */
    async hasCheckedInToday(userId: string): Promise<boolean> {
        const today = new Date().toISOString().split('T')[0];
        const record = await this.recordRepository.findOne({
            where: { userId, checkinDate: today },
        });
        return !!record;
    }

    /**
     * 获取签到记录列表
     */
    async getRecords(page: number = 1, limit: number = 20, date?: string) {
        const where: any = {};
        if (date) {
            where.checkinDate = date;
        }

        const [records, total] = await this.recordRepository.findAndCount({
            where,
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            records: records.map(r => ({
                id: r.id,
                userId: r.userId,
                nickname: r.user?.nickname,
                avatar: r.user?.avatar,
                points: r.points,
                checkinDate: r.checkinDate,
                checkinTime: r.checkinTime,
            })),
            total,
            page,
            limit,
        };
    }

    /**
     * 获取签到统计
     */
    async getStats() {
        const today = new Date().toISOString().split('T')[0];
        
        // 今日签到人数
        const todayCount = await this.recordRepository.count({
            where: { checkinDate: today },
        });

        // 今日支出积分
        const todayPointsResult = await this.recordRepository
            .createQueryBuilder('record')
            .select('SUM(record.points)', 'total')
            .where('record.checkinDate = :today', { today })
            .getRawOne();
        const todayPoints = parseInt(todayPointsResult?.total || '0');

        // 本月签到人数
        const currentMonth = today.substring(0, 7);
        const monthCount = await this.recordRepository
            .createQueryBuilder('record')
            .where('record.checkinDate LIKE :month', { month: `${currentMonth}%` })
            .getCount();

        // 本月支出积分
        const monthPointsResult = await this.recordRepository
            .createQueryBuilder('record')
            .select('SUM(record.points)', 'total')
            .where('record.checkinDate LIKE :month', { month: `${currentMonth}%` })
            .getRawOne();
        const monthPoints = parseInt(monthPointsResult?.total || '0');

        return {
            todayCount,
            todayPoints,
            monthCount,
            monthPoints,
        };
    }

    /**
     * 获取用户的签到记录
     */
    async getUserRecords(userId: string, limit: number = 30) {
        const records = await this.recordRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: limit,
        });

        return records.map(r => ({
            id: r.id,
            points: r.points,
            checkinDate: r.checkinDate,
            checkinTime: r.checkinTime,
        }));
    }
}
