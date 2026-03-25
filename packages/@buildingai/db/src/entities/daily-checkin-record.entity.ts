import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * 每日签到记录
 */
@Entity('daily_checkin_record')
export class DailyCheckinRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid', comment: '用户ID' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'int', comment: '获得积分' })
    points: number;

    @Column({ type: 'date', comment: '签到日期' })
    checkinDate: string;

    @Column({ type: 'varchar', length: 20, comment: '签到时间' })
    checkinTime: string;

    @CreateDateColumn()
    createdAt: Date;
}
