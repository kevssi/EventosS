const bcrypt = require('bcryptjs');

async function main() {
  const plain = process.argv[2] || '1234';
  const rounds = Number(process.argv[3] || 10);

  const hash = await bcrypt.hash(plain, rounds);
  const ok = await bcrypt.compare(plain, hash);

  console.log('password:', plain);
  console.log('rounds:', rounds);
  console.log('hash:', hash);
  console.log('compare_ok:', ok);
}

main().catch((error) => {
  console.error('Error generando hash:', error);
  process.exit(1);
});
