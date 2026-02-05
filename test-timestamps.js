// Quick test to see what timestamps are being generated
// Run: node test-timestamps.js

// Generate 10 sample timestamps to see the distribution
for (let i = 0; i < 10; i++) {
  const daysAgo = Math.random() * 2;
  const timestamp = Math.floor(Date.now() / 1000) - Math.floor(daysAgo * 86400);
  const date = new Date(timestamp * 1000);

  console.log(`Days ago: ${daysAgo.toFixed(2)}, Timestamp: ${timestamp}, Date: ${date.toISOString()}`);
}

console.log('\n--- Current time for reference ---');
console.log(`Now: ${new Date().toISOString()}`);
console.log(`Epoch: ${Math.floor(Date.now() / 1000)}`);
