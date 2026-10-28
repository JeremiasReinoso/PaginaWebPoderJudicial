/** Inicio local con un solo comando: node scripts/iniciar.js (sin PowerShell ni scripts de shell). */
import { main } from '../backend/cli.js';

const port = process.argv[2] || '4173';
await main(['--init']);
console.log(`Panel de licencias:   http://127.0.0.1:${port}/panel-licencias`);
console.log(`Material de estudio:  http://127.0.0.1:${port}/pages/material-estudio.html`);
await main(['--port', port]);
