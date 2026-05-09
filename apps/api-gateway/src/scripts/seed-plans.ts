import { prisma } from '../lib/db.js';

const plans = [
    {
        name: 'Starter',
        priceInr: 8299,
        priceUsd: 99,
        agentSlots: 3,
        features: 'Basic agents,Email support,1 workspace',
    },
    {
        name: 'Pro',
        priceInr: 20749,
        priceUsd: 249,
        agentSlots: 10,
        features: 'All agents,Priority support,5 workspaces,Custom integrations',
    },
    {
        name: 'Enterprise',
        priceInr: 0,
        priceUsd: 0,
        agentSlots: 999,
        features: 'Unlimited agents,Dedicated support,Unlimited workspaces,SLA,Custom contract',
    },
];

async function seed() {
    for (const plan of plans) {
        await prisma.plan.upsert({
            where: { id: plan.name.toLowerCase() },
            update: plan,
            create: { id: plan.name.toLowerCase(), ...plan },
        });
        console.log(`Upserted plan: ${plan.name}`);
    }
    console.log('Plans seeded');
    await prisma.$disconnect();
}

seed().catch(console.error);
