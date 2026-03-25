import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 每日签到配置
 */
@Entity('daily_checkin_config')
export class DailyCheckinConfig {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ default: true, comment: '是否开启每日签到' })
    enabled: boolean;

    @Column({ 
        type: 'enum', 
        enum: ['fixed', 'random'], 
        default: 'fixed',
        comment: '积分类型: fixed-固定, random-随机'
    })
    pointsType: 'fixed' | 'random';

    @Column({ type: 'int', default: 10, comment: '固定积分值' })
    fixedPoints: number;

    @Column({ type: 'int', default: 5, comment: '随机积分最小值' })
    randomMin: number;

    @Column({ type: 'int', default: 20, comment: '随机积分最大值' })
    randomMax: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
