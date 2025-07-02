import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createModerator() {
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash('admin123', 10);

        // Create moderator user
        const moderator = await prisma.user.create({
            data: {
                username: 'admin',
                password: hashedPassword,
                role: 'MODERATOR',
            },
        });

        console.log('✅ Moderator user created successfully:');
        console.log(`   Username: ${moderator.username}`);
        console.log(`   Password: admin123`);
        console.log(`   Role: ${moderator.role}`);
        console.log(`   ID: ${moderator.id}`);

    } catch (error) {
        if (error.code === 'P2002') {
            console.log('❌ Username "admin" already exists');
        } else {
            console.error('❌ Error creating moderator:', error);
        }
    } finally {
        await prisma.$disconnect();
    }
}

createModerator();
