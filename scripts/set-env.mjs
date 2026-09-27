import fs from 'node:fs';
import path from 'node:path';

const apiKey = process.env.CARTO_API_KEY || process.env.cartoApiKey;

if (apiKey) {
  const prodEnvPath = path.resolve('src/environments/environment.prod.ts');
  if (fs.existsSync(prodEnvPath)) {
    let content = fs.readFileSync(prodEnvPath, 'utf8');
    content = content.replace(/cartoApiKey:\s*['"`].*?['"`]/, `cartoApiKey: '${apiKey}'`);
    fs.writeFileSync(prodEnvPath, content, 'utf8');
    console.log('[set-env] Injected CARTO_API_KEY into environment.prod.ts');
  }
}
