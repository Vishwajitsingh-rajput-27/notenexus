// scripts/seedDemo.js — Run: node scripts/seedDemo.js
// Pre-seeds the demo account before hackathon presentation
require('dotenv').config({ path: '../.env' });

const axios = require('axios');

async function seed() {
  const BASE = process.env.BACKEND_URL || 'http://localhost:5000';

  console.log(`\n🌱 Seeding demo data at ${BASE}...\n`);

  try {
    const r = await axios.post(`${BASE}/api/demo/activate`, {}, { timeout: 30000 });
    console.log('✅ Demo data seeded successfully!');
    console.log('📧 Demo email:   ', process.env.DEMO_EMAIL    || 'demo@notenexus.ai');
    console.log('🔑 Demo password:', process.env.DEMO_PASSWORD || 'Demo@NoteNexus2024!');
    console.log('🎮 Token (first 30 chars):', r.data.token?.slice(0, 30) + '...');
    console.log('\n🚀 Ready for demo! Click "Try Demo Mode" on the sign-in page.\n');
  } catch (e) {
    console.error('❌ Seed failed:', e.response?.data || e.message);
    console.log('\nMake sure the backend is running first: npm run dev\n');
    process.exit(1);
  }

  process.exit(0);
}

seed();
