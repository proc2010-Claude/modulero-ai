// Подключает хуки загрузчика для ядра modulero-next: node --import ./src/engine/register.mjs …
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { engineDir } from './pin.mjs';

register('./hooks.mjs', import.meta.url, { data: { root: pathToFileURL(engineDir()).href } });
