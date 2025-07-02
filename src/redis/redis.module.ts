import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
    imports: [
        CacheModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                store: redisStore,
                // Redis connection options
                socket: {
                    host: configService.get('REDIS_HOST', 'localhost'),
                    port: configService.get('REDIS_PORT', 6379),
                },
                password: configService.get('REDIS_PASSWORD'),
                ttl: 60 * 60, // 1 hour default TTL
            }),
            inject: [ConfigService],
            isGlobal: true, // Make cache available globally
        }),
    ],
})
export class RedisModule { }
