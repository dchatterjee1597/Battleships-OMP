import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.dev.vars')) {
  console.log('.dev.vars already exists; kept your local secrets.');
} else {
  writeFileSync(
    '.dev.vars',
    `INVITE_TOKEN=${randomBytes(32).toString('hex')}\nADMIN_PASSPHRASE=${randomBytes(24).toString('base64url')}\n`,
    { mode: 0o600 },
  );
  console.log(
    'Created .dev.vars with random local secrets. Read it locally for your invite token and admin passphrase. Never commit it.',
  );
}
