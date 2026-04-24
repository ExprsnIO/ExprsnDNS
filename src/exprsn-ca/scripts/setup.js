/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Script - Initialize Exprsn CA
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('../crypto');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function generateJWTKeys() {
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('Generating JWT RSA Keys (4096-bit)...');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const { privateKey, publicKey } = await crypto.generateKeyPair(4096);

  // Base64 encode for .env storage
  const privateKeyB64 = Buffer.from(privateKey).toString('base64');
  const publicKeyB64 = Buffer.from(publicKey).toString('base64');

  console.log('✓ JWT keys generated successfully\n');

  return { privateKeyB64, publicKeyB64 };
}

async function generateSessionSecret() {
  const secret = require('crypto').randomBytes(64).toString('hex');
  console.log('✓ Session secret generated\n');
  return secret;
}

async function createEnvFile(config) {
  const envPath = path.join(__dirname, '../../../.env');

  // Read template
  const templatePath = path.join(__dirname, '../../../.env.example');
  let envContent = await fs.readFile(templatePath, 'utf8');

  // Replace values
  envContent = envContent.replace(/JWT_PRIVATE_KEY=/g, `JWT_PRIVATE_KEY=${config.jwtPrivateKey}`);
  envContent = envContent.replace(/JWT_PUBLIC_KEY=/g, `JWT_PUBLIC_KEY=${config.jwtPublicKey}`);
  envContent = envContent.replace(/SESSION_SECRET=/g, `SESSION_SECRET=${config.sessionSecret}`);

  if (config.dbPassword) {
    envContent = envContent.replace(/DB_PASSWORD=/g, `DB_PASSWORD=${config.dbPassword}`);
  }

  // Write .env file
  await fs.writeFile(envPath, envContent, 'utf8');

  console.log('✓ .env file created successfully\n');
}

async function createDirectories() {
  const dirs = [
    'data/ca',
    'data/ca/certs',
    'data/ca/keys',
    'data/ca/crl',
    'data/ca/ocsp',
    'logs'
  ];

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '../../../', dir);
    await fs.mkdir(dirPath, { recursive: true });
  }

  console.log('✓ Directories created\n');
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                  Exprsn Certificate Authority Setup                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  try {
    // Check if .env already exists
    const envPath = path.join(__dirname, '../../../.env');
    try {
      await fs.access(envPath);
      const overwrite = await question('.env file already exists. Overwrite? (yes/no): ');
      if (overwrite.toLowerCase() !== 'yes') {
        console.log('\nSetup cancelled.');
        rl.close();
        return;
      }
    } catch {
      // File doesn't exist, continue
    }

    console.log('\nGathering configuration...\n');

    const dbPassword = await question('PostgreSQL password (leave blank for none): ');

    console.log('\nGenerating cryptographic keys...\n');

    // Generate JWT keys
    const { privateKeyB64, publicKeyB64 } = await generateJWTKeys();

    // Generate session secret
    const sessionSecret = await generateSessionSecret();

    // Create directories
    console.log('Creating directories...\n');
    await createDirectories();

    // Create .env file
    console.log('Creating .env file...\n');
    await createEnvFile({
      jwtPrivateKey: privateKeyB64,
      jwtPublicKey: publicKeyB64,
      sessionSecret,
      dbPassword
    });

    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║                         Setup Completed!                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

    console.log('Next steps:');
    console.log('1. Review and update .env file with your configuration');
    console.log('2. Set up PostgreSQL database');
    console.log('3. Run: npm start\n');

  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  rl.close();
}

main();
