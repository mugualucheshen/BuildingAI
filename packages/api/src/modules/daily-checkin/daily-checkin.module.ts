import { Module } from '@nestjs/common';
import { DailyCheckinService } from './daily-checkin.service';
import { DailyCheckinController } from './daily-checkin.controller';

@Module({
    controllers: [DailyCheckinController],
    providers: [DailyCheckinService],
    exports: [DailyCheckinService],
})
export class DailyCheckinModule {}
