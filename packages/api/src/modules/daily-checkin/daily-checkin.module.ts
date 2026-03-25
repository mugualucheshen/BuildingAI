import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyCheckinService } from './daily-checkin.service';
import { DailyCheckinController } from './daily-checkin.controller';
import { DailyCheckinConfig, DailyCheckinRecord, User } from '@buildingai/db/entities';

@Module({
    imports: [
        TypeOrmModule.forFeature([DailyCheckinConfig, DailyCheckinRecord, User]),
    ],
    controllers: [DailyCheckinController],
    providers: [DailyCheckinService],
    exports: [DailyCheckinService],
})
export class DailyCheckinModule {}
