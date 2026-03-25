import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@buildingai/db/@nestjs/typeorm';
import { DatabaseModule } from '@core/database/database.module';
import { DailyCheckinService } from './daily-checkin.service';
import { DailyCheckinController } from './daily-checkin.controller';
import { DailyCheckinConfig, DailyCheckinRecord, User } from '@buildingai/db/entities';

@Module({
    imports: [
        forwardRef(() => DatabaseModule),
        TypeOrmModule.forFeature([DailyCheckinConfig, DailyCheckinRecord, User]),
    ],
    controllers: [DailyCheckinController],
    providers: [DailyCheckinService],
    exports: [DailyCheckinService],
})
export class DailyCheckinModule {}
